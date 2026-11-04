// Web Audio API for the plugin's embedded JavaScript engine (QuickJS).
// Every node and AudioParam call is forwarded to native/wa (C++) through the
// global `__wa` object that the host installs. Only what SY-1's engine code uses.
(function () {
  const W = globalThis.__wa;
  class AudioParam {
    constructor(node, name) { this._n = node; this._p = name; }
    get value() { return W.paramGet(this._n, this._p); }
    set value(v) { W.paramSet(this._n, this._p, +v); }
    setValueAtTime(v, t) { W.param(this._n, this._p, 0, +v, +t, 0); return this; }
    linearRampToValueAtTime(v, t) { W.param(this._n, this._p, 1, +v, +t, 0); return this; }
    exponentialRampToValueAtTime(v, t) { W.param(this._n, this._p, 2, +v, +t, 0); return this; }
    setTargetAtTime(v, t, c) { W.param(this._n, this._p, 3, +v, +t, +c); return this; }
    cancelScheduledValues(t) { W.param(this._n, this._p, 4, 0, +t, 0); return this; }
  }
  class AudioNode {
    constructor(id) { this._id = id; }
    connect(dest, output, input) {
      if (dest instanceof AudioParam) W.connectParam(this._id, dest._n, dest._p);
      else W.connect(this._id, dest._id, input | 0);
      return dest;
    }
    disconnect() { W.disconnect(this._id); }
  }
  const params = (node, names) => { for (const n of names) node[n] = new AudioParam(node._id, n); return node; };
  class Scheduled extends AudioNode {
    start(when, offset) { W.start(this._id, +(when || 0), +(offset || 0)); }
    stop(when) { W.stop(this._id, +(when || 0)); }
  }
  class AudioBuffer {
    constructor(ch, len, rate) { this.numberOfChannels = ch; this.length = len; this.sampleRate = rate; this.duration = len / rate; this._d = []; for (let i = 0; i < ch; i++) this._d.push(new Float32Array(len)); this._id = 0; }
    getChannelData(i) { return this._d[i]; }
  }
  class Ctx {
    constructor() { this.sampleRate = W.sampleRate; this.state = "running"; this.destination = new AudioNode(0); }
    get currentTime() { return W.time(); }
    createGain() { return params(new AudioNode(W.create("gain")), ["gain"]); }
    createBiquadFilter() {
      const n = params(new AudioNode(W.create("biquad")), ["frequency", "Q", "gain", "detune"]);
      Object.defineProperty(n, "type", { set(v) { W.prop(n._id, "type", String(v)); }, get() { return "lowpass"; } });
      return n;
    }
    createDelay(max) { return params(new AudioNode(W.create("delay", +(max || 1))), ["delayTime"]); }
    createWaveShaper() {
      const n = new AudioNode(W.create("shaper"));
      Object.defineProperty(n, "curve", { set(c) { W.curve(n._id, c ? c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) : null); }, get() { return null; } });
      Object.defineProperty(n, "oversample", { set(v) { W.prop(n._id, "oversample", String(v)); }, get() { return "none"; } });
      return n;
    }
    createDynamicsCompressor() { return params(new AudioNode(W.create("comp")), ["threshold", "knee", "ratio", "attack", "release"]); }
    createStereoPanner() { return params(new AudioNode(W.create("panner")), ["pan"]); }
    createIIRFilter(ff, fb) { return new AudioNode(W.create("iir", Array.from(ff).join(","), Array.from(fb).join(","))); }
    createChannelMerger(n) { return new AudioNode(W.create("merger", +(n || 6))); }
    createAnalyser() { return new AudioNode(W.create("pass")); }
    createOscillator() {
      const n = params(new Scheduled(W.create("osc")), ["frequency", "detune"]);
      Object.defineProperty(n, "type", { set(v) { W.prop(n._id, "type", String(v)); }, get() { return "sine"; } });
      return n;
    }
    createBuffer(ch, len, rate) { return new AudioBuffer(ch, len, rate); }
    createBufferSource() {
      const n = params(new Scheduled(W.create("buffersrc")), ["playbackRate", "detune"]);
      Object.defineProperty(n, "buffer", { set(b) { if (!b._id) { const d = b._d[0]; b._id = W.buffer(d.buffer.slice(0), b.sampleRate); } W.prop(n._id, "buffer", b._id); }, get() { return null; } });
      Object.defineProperty(n, "loop", { set(v) { W.prop(n._id, "loop", v ? 1 : 0); }, get() { return false; } });
      return n;
    }
  }
  globalThis.AudioParam = AudioParam;
  globalThis.__makeCtx = () => new Ctx();
  // timers on the audio clock (the host calls __runTimers every block)
  let timers = [], nextId = 1;
  globalThis.setTimeout = (fn, ms) => { const id = nextId++; timers.push({ id, at: W.time() * 1000 + (+ms || 0), fn }); return id; };
  globalThis.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
  globalThis.setInterval = (fn, ms) => { const id = nextId++; const iv = { id, at: W.time() * 1000 + (+ms || 0), fn, every: Math.max(1, +ms || 1) }; timers.push(iv); return id; };
  globalThis.clearInterval = globalThis.clearTimeout;
  globalThis.__runTimers = () => {
    const now = W.time() * 1000;
    const due = timers.filter((t) => t.at <= now);
    timers = timers.filter((t) => t.at > now || t.every);
    for (const t of due) { if (t.every) t.at = now + t.every; try { t.fn(); } catch (e) {} }
  };
  if (!globalThis.localStorage) {
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
})();
