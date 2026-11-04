// Web Audio API for the plugin's embedded JavaScript engine (QuickJS).
// Every node and AudioParam call is forwarded to native/wa (C++) through the
// global `__wa` object that the host installs. Only what SY-1's engine code uses.
(function () {
  // In the plugin window (UI mode) the app's own engine runs only for the UI: no audio, a
  // stand-in __wa that keeps ids and a clock, the scope fed from the plugin's output.
  const UI = !!globalThis.__SY1_UI;
  if (UI && !globalThis.__wa) {
    let next = 1;
    const t0 = performance.now();
    const noop = () => {};
    globalThis.__wa = {
      sampleRate: globalThis.__SY1_RATE || 48000,
      time: () => (performance.now() - t0) / 1000,
      create: () => next++, connect: noop, connectParam: noop, disconnect: noop, param: noop,
      paramSet: noop, paramGet: () => 0, prop: noop, curve: noop, buffer: () => next++, start: noop, stop: noop,
      wkParam: noop, wkSnap: noop, wkMsg: noop, wkPath: noop, wave: () => next++
    };
  }
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
    constructor() {
      this.sampleRate = W.sampleRate; this.state = "running"; this.destination = new AudioNode(0);
      this.audioWorklet = { addModule: () => Promise.resolve() };
    }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    getOutputTimestamp() { return { contextTime: this.currentTime, performanceTime: this.currentTime * 1000 }; }
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
    createIIRFilter(ff, fb) {
      const n = new AudioNode(W.create("iir", Array.from(ff).join(","), Array.from(fb).join(",")));
      const b = Array.from(ff, Number), a = Array.from(fb, Number);
      // |H| and phase at each frequency (Chrome evaluates the transfer function in double)
      n.getFrequencyResponse = (freqs, mag, phase) => {
        const nyq = this.sampleRate / 2;
        for (let i = 0; i < freqs.length; i++) {
          const w = Math.PI * (freqs[i] / nyq);
          let nr = 0, ni = 0, dr = 0, di = 0;
          for (let k = 0; k < b.length; k++) { nr += b[k] * Math.cos(-w * k); ni += b[k] * Math.sin(-w * k); }
          for (let k = 0; k < a.length; k++) { dr += a[k] * Math.cos(-w * k); di += a[k] * Math.sin(-w * k); }
          const den = dr * dr + di * di, hr = (nr * dr + ni * di) / den, hi = (ni * dr - nr * di) / den;
          mag[i] = Math.hypot(hr, hi); if (phase) phase[i] = Math.atan2(hi, hr);
        }
      };
      return n;
    }
    createChannelMerger(n) { return new AudioNode(W.create("merger", +(n || 6))); }
    createAnalyser() {
      const n = new AudioNode(W.create("pass"));
      n.fftSize = 2048;
      // the scope reads the plugin's output (pushed into __SY1_SCOPE by the plugin window)
      n.getByteTimeDomainData = (arr) => {
        const src = globalThis.__SY1_SCOPE;
        for (let i = 0; i < arr.length; i++) { const v = src && src.length ? src[(i * src.length / arr.length) | 0] : 0; arr[i] = Math.max(0, Math.min(255, Math.round(128 + v * 128))); }
      };
      n.getFloatTimeDomainData = (arr) => { const src = globalThis.__SY1_SCOPE; for (let i = 0; i < arr.length; i++) arr[i] = src && src.length ? src[(i * src.length / arr.length) | 0] : 0; };
      return n;
    }
    createOscillator() {
      const n = params(new Scheduled(W.create("osc")), ["frequency", "detune"]);
      Object.defineProperty(n, "type", { set(v) { W.prop(n._id, "type", String(v)); }, get() { return "sine"; } });
      n.setPeriodicWave = (w) => { if (w && w._w !== undefined) W.prop(n._id, "wave", w._w); };
      return n;
    }
    createPeriodicWave(real, imag, opts) {
      const f = (a) => { const x = Float32Array.from(a); return x.buffer; };
      return { _w: W.wave(f(real), f(imag), !!(opts && opts.disableNormalization)) };
    }
    createBuffer(ch, len, rate) { return new AudioBuffer(ch, len, rate); }
    createBufferSource() {
      const n = params(new Scheduled(W.create("buffersrc")), ["playbackRate", "detune"]);
      Object.defineProperty(n, "buffer", { set(b) { if (!b._id) { const d = b._d[0]; b._id = W.buffer(d.buffer.slice(0), b.sampleRate); } W.prop(n._id, "buffer", b._id); }, get() { return null; } });
      Object.defineProperty(n, "loop", { set(v) { W.prop(n._id, "loop", v ? 1 : 0); }, get() { return false; } });
      return n;
    }
  }
  class AudioWorkletNode extends AudioNode {
    constructor(ctx, name) {
      super(W.create("worklet", String(name)));
      const id = this._id;
      this.port = {
        onmessage: null,
        postMessage(m) {
          if (!m) return;
          if (globalThis.__wkTransform) m = globalThis.__wkTransform(m);
          if (m.t === "patch") {
            for (const k in m.patch) { const v = m.patch[k]; if (typeof v === "number" || typeof v === "string") W.wkParam(id, k, v); }
            if (typeof m.orbitRateHz === "number") W.wkParam(id, "orbitRateHz", m.orbitRateHz); // the vector engine's extra field
            W.wkSnap(id);
          }
          else if (m.t === "path") {
            if (!Array.isArray(m.pts) || m.pts.length < 2) return;
            const n = Math.min(256, m.pts.length), f = new Float64Array(2 * n);
            for (let i = 0; i < n; i++) { const p = m.pts[i]; f[2 * i] = Number(p?.[0]) || 0.5; f[2 * i + 1] = Number(p?.[1]) || 0.5; }
            W.wkPath(id, f.buffer);
          }
          else if (m.t === "param") { if (typeof m.value === "number" || typeof m.value === "string") W.wkParam(id, String(m.key), m.value); }
          else W.wkMsg(id, String(m.t), m.id | 0, Number(m.midi) || 0, Number(m.cents) || 0, m.vel === undefined ? 1 : Number(m.vel), Number(m.at) || 0, Number(m.from) || 0, Number(m.glide) || 0, Number(m.v) || 0);
        }
      };
    }
  }
  globalThis.AudioWorkletNode = AudioWorkletNode;
  globalThis.AudioParam = AudioParam;
  globalThis.__makeCtx = () => new Ctx();
  // the web app makes its context with `new AudioContext()`: always the one engine context
  if (!UI) globalThis.window = globalThis;
  globalThis.AudioContext = function () { return globalThis.__ctx || (globalThis.__ctx = new Ctx()); };
  globalThis.webkitAudioContext = globalThis.AudioContext;
  globalThis.AudioWorkletNode = AudioWorkletNode;
  if (UI) return; // the browser keeps its own timers, document and storage handling below
  globalThis.performance = { now: () => W.time() * 1000 };
  const noEl = { classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } }, setAttribute() {}, style: {} };
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, hidden: false, body: noEl };
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
    // plugin state = this storage (the app saves machines, patches, banks and settings here)
    globalThis.__dumpStorage = () => JSON.stringify(Object.fromEntries(m));
    globalThis.__loadStorage = (json) => { m.clear(); try { const o = JSON.parse(json || "{}"); for (const k in o) m.set(k, String(o[k])); } catch (e) {} };
  }
})();
