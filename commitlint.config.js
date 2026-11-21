/**
 * commitlint: Conventional Commits with the types of reviewer rule R1 (.claude/agents/reviewer.md).
 * feat/fix change the app and bump the version; the others are tooling, tests, docs or behaviour-neutral.
 * Runs in the check over main..HEAD and in CI over the commits of a pull request.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'build', 'ci', 'test', 'docs', 'refactor', 'style', 'chore']],
    // subjects name things as they are spelled (FM-4, AGENTS.md, SynthBlocks)
    'subject-case': [0],
    'header-max-length': [2, 'always', 120]
  }
};
