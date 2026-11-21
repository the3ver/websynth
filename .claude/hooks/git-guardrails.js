#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (Bash): blocks git commands that destroy work or history; exit 2 sends the reason back.
 * Blocked: force push (--force, -f, --force-with-lease, --mirror, +refspec); deleting, force-moving or renaming onto
 * main (push --delete / :main, branch -d/-D/-f/-M main); reset --hard; clean -f; branch -D (--delete --force);
 * checkout/restore of the whole tree (checkout -- ., restore ., restore :/); discarding changes otherwise
 * (checkout -f, switch -f / --discard-changes, stash clear / drop, worktree remove --force). Long options also
 * match as unique prefixes (--har), as git accepts them. Allowed: plain git push of branches and main (the release
 * workflow fast-forwards main), push --delete of other branches, branch -d (refuses unmerged branches).
 * Reads the tool input as JSON on stdin and checks every git call: in chains (&&, ||, ;, |, newline), subshells
 * and backticks, line continuations, and scripts passed to bash/sh -c or eval. Heredoc bodies are data, not calls.
 * Not covered: git aliases (none configured) and commands built at run time ($VAR, $(...) output).
 */
const PROTECTED = new Set(['main', 'master']);
// git options that take a separate value before the subcommand
const VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
const WHOLE_TREE = new Set(['.', './', ':/', ':/.', '*']);
const SHELLS = /^(.*\/)?(ba|z|da|k)?sh$/;

/** Splits a shell command into the argument lists of its git calls (quotes respected, no expansion). */
function gitCalls(command) {
  const calls = [];
  let words = [];
  let word = null;
  let quote = null;
  let redirect = false; // the next word is a redirection target
  const heredocs = []; // tags of heredocs whose bodies start after the current line
  const end = () => {
    if (word !== null && !redirect) words.push(word);
    if (word !== null) redirect = false;
    word = null;
  };
  const flush = () => {
    end();
    redirect = false;
    const shell = words.findIndex((w) => SHELLS.test(w));
    if (shell >= 0 && /^-[a-z]*c[a-z]*$/.test(words[shell + 1] || '') && words[shell + 2])
      calls.push(...gitCalls(words[shell + 2]));
    const ev = words.indexOf('eval');
    if (ev >= 0) calls.push(...gitCalls(words.slice(ev + 1).join(' ')));
    const i = words.findIndex((w) => w === 'git' || w.endsWith('/git'));
    if (i >= 0) calls.push(words.slice(i + 1));
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && command[i + 1] === '\n') i++;
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      word = word ?? '';
    } else if (ch === '\\' && command[i + 1] === '\n') {
      i++; // line continuation
    } else if (ch === '\\' && i + 1 < command.length) {
      word = (word ?? '') + command[++i];
    } else if (ch === '<' && command[i + 1] === '<' && command[i + 2] !== '<') {
      // heredoc: <<TAG, <<-TAG, <<'TAG', <<"TAG"
      end();
      const m = /^<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(command.slice(i));
      if (m) {
        heredocs.push(m[2]);
        i += m[0].length - 1;
      } else i++;
    } else if (ch === '<' || ch === '>') {
      end();
      while (command[i + 1] === '>' || command[i + 1] === '<' || command[i + 1] === '&') i++;
      redirect = true;
    } else if (/\s/.test(ch) && ch !== '\n') {
      end();
    } else if (ch === '\n') {
      flush();
      // skip heredoc bodies that start on the next line, up to their closing tag line
      while (heredocs.length) {
        const tag = heredocs.shift();
        let next = command.indexOf('\n', i + 1);
        while (next !== -1 || i + 1 < command.length) {
          const lineEnd = next === -1 ? command.length : next;
          const line = command.slice(i + 1, lineEnd);
          i = lineEnd;
          if (line.replace(/^\t+/, '') === tag || next === -1) break;
          next = command.indexOf('\n', i + 1);
        }
      }
    } else if (ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')' || ch === '`') {
      flush();
    } else {
      word = (word ?? '') + ch;
    }
  }
  flush();
  return calls;
}

/** [subcommand, ...args] of one git call, without the global options before the subcommand. */
function subcommand(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += VALUE_OPTIONS.has(args[i]) ? 2 : 1;
  return args.slice(i);
}

const shortFlags = (args) => args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join('');
const operands = (args) => args.filter((a) => !a.startsWith('-'));
const branchName = (ref) =>
  ref
    .replace(/^\+/, '')
    .replace(/^.*:/, '')
    .replace(/^refs\/heads\//, '');
/** True if args hold one of the long options, spelled out or as a prefix git would accept (--har for --hard). */
const longOption = (args, ...names) =>
  args.some((a) => {
    const n = a.split('=')[0];
    return n.length >= 3 && n.startsWith('--') && names.some((name) => name.startsWith(n) || n.startsWith(name));
  });

/** Reason the git call is blocked, or null. */
function blocked(args) {
  const [cmd, ...rest] = subcommand(args);
  const flags = shortFlags(rest);
  const has = (...names) => longOption(rest, ...names);
  switch (cmd) {
    case 'push': {
      const refs = operands(rest).slice(1);
      if (has('--force', '--force-with-lease', '--force-if-includes', '--mirror')) return 'force push';
      if (flags.includes('f')) return 'force push (-f)';
      if (refs.some((r) => r.startsWith('+'))) return 'force push (+refspec)';
      const deleting = has('--delete') || flags.includes('d');
      if (refs.some((r) => PROTECTED.has(branchName(r)) && (deleting || /^:/.test(r))))
        return 'deleting the main branch on the remote';
      return null;
    }
    case 'reset':
      return has('--hard') ? 'reset --hard' : null;
    case 'clean':
      return has('--force') || flags.includes('f') ? 'clean -f' : null;
    case 'branch': {
      const names = operands(rest);
      const deleting = has('--delete') || /[dD]/.test(flags);
      const forcing = flags.includes('D') || flags.includes('f') || has('--force');
      if (deleting && names.some((b) => PROTECTED.has(b))) return 'deleting the main branch';
      if (deleting && forcing) return 'branch -D (force delete)';
      if (/[MC]/.test(flags) && PROTECTED.has(names.at(-1))) return 'renaming or copying onto the main branch';
      if (!deleting && forcing && PROTECTED.has(names[0])) return 'force-moving the main branch';
      return null;
    }
    case 'checkout': {
      if (flags.includes('f') || has('--force')) return 'checkout -f (discards changes)';
      const dash = rest.indexOf('--');
      const paths = dash >= 0 ? rest.slice(dash + 1) : operands(rest);
      return paths.some((p) => WHOLE_TREE.has(p)) ? 'checkout of the whole tree' : null;
    }
    case 'switch':
      return flags.includes('f') || has('--force', '--discard-changes') ? 'switch discarding changes' : null;
    case 'restore': {
      const stagedOnly = (has('--staged') || flags.includes('S')) && !(has('--worktree') || flags.includes('W'));
      return !stagedOnly && operands(rest).some((p) => WHOLE_TREE.has(p)) ? 'restore of the whole tree' : null;
    }
    case 'stash':
      return rest[0] === 'clear' || rest[0] === 'drop' ? `stash ${rest[0]}` : null;
    case 'worktree':
      return rest[0] === 'remove' && (flags.includes('f') || has('--force')) ? 'worktree remove --force' : null;
    default:
      return null;
  }
}

function main() {
  let input = '';
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', () => {
    let command = '';
    try {
      command = JSON.parse(input).tool_input?.command ?? '';
    } catch {
      process.exit(0);
    }
    for (const args of gitCalls(command)) {
      const reason = blocked(args);
      if (reason) {
        process.stderr.write(
          `BLOCKED by .claude/hooks/git-guardrails.js: ${reason} in "${command}". ` +
            'Destructive git commands need the user: ask them to run it themselves (! <command>).\n'
        );
        process.exit(2);
      }
    }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { gitCalls, blocked };
