// Stand-in for src/engine/bus.ts when the engine code runs outside the web app
// (inside the plugin's JavaScript engine, or in parity tests). Same noise buffer
// as bus.ts: 2 s of Math.random() white noise, made once per sample rate.
export function getAudioCtxIfAny(): any {
  return (globalThis as any).__ctx || null;
}
export function getAudioCtx(): any {
  return (globalThis as any).__ctx;
}
let noise: any = null;
export function getSharedNoiseBuffer(ctx: any): any {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}
