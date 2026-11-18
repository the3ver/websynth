/**
 * Service worker cache rules: one release = one cache, HTML and assets always from the same cache.
 * Loads sw.js into a vm sandbox with stand-ins for self, caches, fetch, Request and Response.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ORIGIN = 'https://example.test';
const BASE = `${ORIGIN}/websynth/`;
const abs = (u) => new URL(u, BASE).href;
const stripSearch = (u) => u.split('?')[0];

class FakeRequest {
  constructor(input, init = {}) {
    this.url = abs(typeof input === 'string' ? input : input.url);
    this.method = init.method || 'GET';
    this.mode = init.mode || 'cors';
    this.cache = init.cache || 'default';
  }
}

class FakeResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status === undefined ? 200 : init.status;
  }

  clone() {
    return new FakeResponse(this.body, { status: this.status });
  }
}

function loadWorker({ network = {} } = {}) {
  const handlers = {};
  const store = new Map(); // cache name -> Map(url -> response)
  const fetches = [];
  const keyOf = (req, opts = {}) => {
    const url = abs(typeof req === 'string' ? req : req.url);
    return opts.ignoreSearch ? stripSearch(url) : url;
  };
  const openCache = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name);
    return {
      entries,
      async match(req, opts) {
        const key = keyOf(req, opts);
        for (const [url, res] of entries) if ((opts && opts.ignoreSearch ? stripSearch(url) : url) === key) return res.clone();
        return undefined;
      },
      async put(req, res) {
        entries.set(keyOf(req), res);
      },
      async addAll(requests) {
        for (const r of requests) {
          const req = typeof r === 'string' ? new FakeRequest(r) : r;
          entries.set(req.url, await sandbox.fetch(req));
        }
      }
    };
  };
  const sandbox = {
    console: { log() {}, warn() {} },
    URL,
    Request: FakeRequest,
    Response: FakeResponse,
    setTimeout: (fn) => 0,
    self: {
      location: { origin: ORIGIN, href: `${BASE}sw.js` },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() }
    },
    caches: {
      open: async (name) => openCache(name),
      keys: async () => [...store.keys()],
      delete: async (name) => store.delete(name),
      match: async (req, opts) => {
        for (const name of store.keys()) {
          const hit = await openCache(name).match(req, opts);
          if (hit) return hit;
        }
        return undefined;
      }
    },
    fetch: async (req) => {
      const r = typeof req === 'string' ? new FakeRequest(req) : req;
      fetches.push(r);
      const body = network[stripSearch(r.url)];
      return body === undefined ? new FakeResponse('', { status: 404 }) : new FakeResponse(body);
    }
  };
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');
  vm.runInNewContext(src, sandbox, { filename: 'sw.js' });
  const shellName = vm.runInNewContext('SHELL_CACHE', sandbox);
  const precache = vm.runInNewContext('PRECACHE_ASSETS', sandbox);

  const dispatch = async (type, extra = {}) => {
    let waited = null;
    let response = null;
    const event = { ...extra, waitUntil: (p) => { waited = p; }, respondWith: (p) => { response = p; } };
    handlers[type](event);
    if (waited) await waited;
    return response ? await response : null;
  };
  return { sandbox, store, fetches, shellName, precache, openCache, dispatch };
}

const navigate = (w, url) => w.dispatch('fetch', { request: new FakeRequest(url, { mode: 'navigate' }) });
const get = (w, url) => w.dispatch('fetch', { request: new FakeRequest(url) });

// Running release A: its cache holds A's shell, the network already serves release B
async function releaseAWithNetworkB() {
  const w = loadWorker({ network: { [abs('./')]: 'html B', [abs('./index.html')]: 'html B', [abs('./js/app.js')]: 'app B' } });
  const cache = await w.openCache(w.shellName);
  await cache.put(abs('./'), new FakeResponse('html A'));
  await cache.put(abs('./index.html'), new FakeResponse('html A'));
  await cache.put(abs('./js/app.js'), new FakeResponse('app A'));
  return { w, cache };
}

test('install precaches every shell file past the browser HTTP cache', async () => {
  const w = loadWorker({ network: {} });
  await w.dispatch('install');
  const shellFetches = w.fetches.filter((r) => w.precache.map(abs).includes(r.url));
  assert.equal(shellFetches.length, w.precache.length);
  assert.ok(shellFetches.every((r) => r.cache === 'reload'), shellFetches.map((r) => `${r.url} ${r.cache}`).join(', '));
});

test('a page load gets the HTML of the running release, not a newer one from the network', async () => {
  const { w } = await releaseAWithNetworkB();
  assert.equal((await navigate(w, `${BASE}?synth=fm`)).body, 'html A');
  assert.equal((await navigate(w, `${BASE}index.html`)).body, 'html A');
  assert.equal((await get(w, `${BASE}js/app.js`)).body, 'app A');
});

test('serving a cached asset does not write a newer network copy into the running release cache', async () => {
  const { w, cache } = await releaseAWithNetworkB();
  await get(w, `${BASE}js/app.js`);
  await navigate(w, BASE);
  await new Promise((r) => setImmediate(r));
  assert.equal(cache.entries.get(abs('./js/app.js')).body, 'app A');
  assert.equal(cache.entries.get(abs('./')).body, 'html A');
});

test('without a cached copy (first visit, missing file) the network answers', async () => {
  const w = loadWorker({ network: { [abs('./')]: 'html B', [abs('./js/new.js')]: 'new B' } });
  assert.equal((await navigate(w, BASE)).body, 'html B');
  assert.equal((await get(w, `${BASE}js/new.js`)).body, 'new B');
});

test('offline without any cache still answers the page request', async () => {
  const w = loadWorker({ network: {} });
  w.sandbox.fetch = async () => { throw new Error('offline'); };
  const res = await navigate(w, BASE);
  assert.ok(res && res.status === 200);
});

test('activate deletes the caches of older releases', async () => {
  const w = loadWorker();
  await w.openCache('retrovox-shell-v0.0.1');
  await w.openCache(w.shellName);
  await w.dispatch('activate');
  assert.deepEqual([...w.store.keys()], [w.shellName]);
});
