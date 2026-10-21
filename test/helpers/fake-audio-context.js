/**
 * Minimal Web Audio API stand-in for unit tests: nodes record connections, params record scheduled events.
 */

class FakeAudioParam {
  constructor(initial = 0) {
    this.value = initial;
    this.events = [];
  }

  setValueAtTime(v, t, tc) {
    this.value = v;
    this.events.push({ type: 'setValueAtTime', value: v, time: t, timeConstant: tc });
    return this;
  }

  setTargetAtTime(v, t, tc) {
    this.value = v;
    this.events.push({ type: 'setTargetAtTime', value: v, time: t, timeConstant: tc });
    return this;
  }

  linearRampToValueAtTime(v, t, tc) {
    this.value = v;
    this.events.push({ type: 'linearRampToValueAtTime', value: v, time: t, timeConstant: tc });
    return this;
  }

  exponentialRampToValueAtTime(v, t, tc) {
    this.value = v;
    this.events.push({ type: 'exponentialRampToValueAtTime', value: v, time: t, timeConstant: tc });
    return this;
  }

  cancelScheduledValues(t) {
    this.events.push({ type: 'cancelScheduledValues', time: t });
    return this;
  }

  cancelAndHoldAtTime(t) {
    this.events.push({ type: 'cancelAndHoldAtTime', time: t });
    return this;
  }

  lastValue(type) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (type === undefined || this.events[i].type === type) {
        return this.events[i].value;
      }
    }
    return undefined;
  }
}

class FakeAudioNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.started = null;
    this.stopped = null;
  }

  connect(target) {
    this.connections.push(target);
    return target;
  }

  disconnect() {
    this.connections = [];
  }

  start(t = 0) {
    this.started = t;
  }

  stop(t = 0) {
    this.stopped = t;
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = new FakeAudioNode('destination');
    this.onstatechange = null;
    this.nodes = [];
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  createGain() {
    const node = new FakeAudioNode('gain');
    node.gain = new FakeAudioParam(1);
    this.nodes.push(node);
    return node;
  }

  createOscillator() {
    const node = new FakeAudioNode('oscillator');
    node.frequency = new FakeAudioParam(440);
    node.detune = new FakeAudioParam(0);
    node.type = 'sine';
    node.periodicWave = null;
    node.setPeriodicWave = function(w) {
      this.periodicWave = w;
    };
    this.nodes.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeAudioNode('biquadFilter');
    node.frequency = new FakeAudioParam(350);
    node.Q = new FakeAudioParam(1);
    node.detune = new FakeAudioParam(0);
    node.gain = new FakeAudioParam(0);
    node.type = 'lowpass';
    this.nodes.push(node);
    return node;
  }

  createWaveShaper() {
    const node = new FakeAudioNode('waveShaper');
    node.curve = null;
    node.oversample = 'none';
    this.nodes.push(node);
    return node;
  }

  createConstantSource() {
    const node = new FakeAudioNode('constantSource');
    node.offset = new FakeAudioParam(1);
    this.nodes.push(node);
    return node;
  }

  createBufferSource() {
    const node = new FakeAudioNode('bufferSource');
    node.playbackRate = new FakeAudioParam(1);
    node.buffer = null;
    node.loop = false;
    this.nodes.push(node);
    return node;
  }

  createDelay(maxDelay = 1) {
    const node = new FakeAudioNode('delay');
    node.delayTime = new FakeAudioParam(0);
    node.maxDelayTime = maxDelay;
    this.nodes.push(node);
    return node;
  }

  createConvolver() {
    const node = new FakeAudioNode('convolver');
    node.buffer = null;
    node.normalize = true;
    this.nodes.push(node);
    return node;
  }

  createDynamicsCompressor() {
    const node = new FakeAudioNode('dynamicsCompressor');
    node.threshold = new FakeAudioParam(-24);
    node.knee = new FakeAudioParam(30);
    node.ratio = new FakeAudioParam(12);
    node.attack = new FakeAudioParam(0.003);
    node.release = new FakeAudioParam(0.25);
    this.nodes.push(node);
    return node;
  }

  createAnalyser() {
    const node = new FakeAudioNode('analyser');
    node.fftSize = 2048;
    node.smoothingTimeConstant = 0.8;
    Object.defineProperty(node, 'frequencyBinCount', {
      get() {
        return this.fftSize / 2;
      },
      configurable: true,
      enumerable: true
    });
    node.getByteTimeDomainData = function(arr) {
      arr.fill(128);
    };
    node.getFloatTimeDomainData = function(arr) {
      arr.fill(0);
    };
    this.nodes.push(node);
    return node;
  }

  createChannelMerger(n = 6) {
    const node = new FakeAudioNode('channelMerger');
    node.channels = n;
    this.nodes.push(node);
    return node;
  }

  createChannelSplitter(n = 6) {
    const node = new FakeAudioNode('channelSplitter');
    node.channels = n;
    this.nodes.push(node);
    return node;
  }

  createStereoPanner() {
    const node = new FakeAudioNode('stereoPanner');
    node.pan = new FakeAudioParam(0);
    this.nodes.push(node);
    return node;
  }

  createBuffer(channels, length, sampleRate) {
    const channelData = [];
    for (let i = 0; i < channels; i++) {
      channelData.push(new Float32Array(length));
    }
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData(c) {
        return channelData[c];
      }
    };
  }

  createPeriodicWave(real, imag, opts) {
    return { real, imag, opts };
  }
}

function nodesOfKind(ctx, kind) {
  return ctx.nodes.filter((node) => node.kind === kind);
}

module.exports = {
  FakeAudioContext,
  FakeAudioNode,
  FakeAudioParam,
  nodesOfKind
};
