const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngineContext, FM_SCRIPTS } = require('./helpers/synth-engine');

const context = loadEngineContext('presets.js', ...FM_SCRIPTS, 'patch-randomizer.js', 'synth-registry.js');
const { PatchRandomizer, SynthRegistry, FmAlgorithms } = context;
const plain = (v) => JSON.parse(JSON.stringify(v));

// Deterministic rng (mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Leaf paths of a nested state
const leaves = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

for (const synth of Object.values(SynthRegistry.definitions)) {
  test(`${synth.id}: a random patch sets every patch parameter except performance`, () => {
    const state = synth.presets.random(seeded(1));
    const expected = leaves(plain(synth.presets.init.state))
      .filter((p) => !p.startsWith('performance.'))
      .sort();
    assert.deepEqual(leaves(plain(state)).sort(), expected);
  });

  test(`${synth.id}: 200 random patches load and read back unchanged (all values inside the setter ranges)`, () => {
    const rng = seeded(42);
    for (let i = 0; i < 200; i++) {
      const state = plain(synth.presets.random(rng));
      const engine = synth.createEngine();
      engine.loadPresetState(state);
      const back = plain(engine.getPresetState());
      delete back.performance;
      assert.deepEqual(back, state, `patch ${i}`);
    }
  });

  test(`${synth.id}: the same seed gives the same patch, different seeds differ`, () => {
    assert.deepEqual(plain(synth.presets.random(seeded(7))), plain(synth.presets.random(seeded(7))));
    assert.notDeepEqual(plain(synth.presets.random(seeded(7))), plain(synth.presets.random(seeded(8))));
  });

  test(`${synth.id}: loading a random patch keeps the octave and glide`, () => {
    const engine = synth.createEngine();
    engine.setOctaveShift(-1);
    engine.setGlide(true);
    engine.loadPresetState(synth.presets.random(seeded(3)));
    assert.equal(engine.octaveShift, -1);
    assert.equal(engine.glideEnabled, true);
  });
}

test('sub1: random patches stay playable (audible oscillator, open enough filter, sustained or decaying amp)', () => {
  const rng = seeded(11);
  for (let i = 0; i < 300; i++) {
    const s = PatchRandomizer.sub1(rng);
    assert.ok(s.mixer.vco1Level >= 0.55, 'vco1 audible');
    assert.ok(s.vcf.cutoff >= 250 && s.vcf.cutoff <= 9000, `cutoff ${s.vcf.cutoff}`);
    assert.ok(s.ampEnv.sustain >= 0.3, 'amp sustain');
    assert.ok(s.ampEnv.attack <= 1.2, 'attack');
  }
});

test('fm: ratios come from the operator group lists, every output operator is audible', () => {
  const rng = seeded(5);
  const { ALGORITHMS, C_RATIOS, A_RATIOS, B_RATIOS } = FmAlgorithms;
  const algorithms = new Set();
  for (let i = 0; i < 300; i++) {
    const s = PatchRandomizer.fm(rng);
    algorithms.add(s.algorithm);
    assert.ok(C_RATIOS.includes(s.op1.ratio), `C ${s.op1.ratio}`);
    assert.ok(A_RATIOS.includes(s.op2.ratio), `A ${s.op2.ratio}`);
    assert.ok(B_RATIOS.includes(s.op3.ratio) && B_RATIOS.includes(s.op4.ratio), 'B');
    const alg = ALGORITHMS[s.algorithm];
    for (const n of [...alg.x, ...alg.y]) assert.ok(s[`op${n}`].level >= 0.55, `alg ${s.algorithm} op${n} level`);
  }
  assert.equal(algorithms.size, 8, 'all algorithms show up');
});

test('the RANDOM preset is marked transient so it is never saved as a factory or user entry', () => {
  const p = PatchRandomizer.preset({ a: 1 });
  assert.equal(p.transient, true);
  assert.equal(p.category, 'RANDOM');
  assert.deepEqual(plain(p.state), { a: 1 });
});
