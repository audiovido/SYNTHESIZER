// Browser integration checks. Run with Vite on port 3344.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript({content: `window.__SY1_UI = true; window.__SY1_RATE = 48000; ${readFileSync('native/js/wa-shim.js', 'utf8')}
    window.sent = []; window.__SY1_PLUGIN__ = {send(name,args) { window.sent.push([name,args]); }};`});
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3344/');
  await page.waitForFunction(() => window.SY1 && window.__SY1_PLUGIN__.onCall);
  const state = await page.evaluate(async () => {
    const cc = await import('/src/engine/cc-map.ts');
    cc.mapCcToParam(128, 'cutoff');
    window.sent.length = 0;
    return cc.getMidiPickup();
  });
  assert.equal(state, true);
  const knob = page.locator('.sk[data-param="cutoff"]');
  await page.evaluate(async () => { const P=await import('/src/ui/panel.ts'); P.setPanelPage('filter'); });
  const box = await knob.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 35, {steps:5});
  await page.mouse.up();
  const messages = await page.evaluate(() => window.sent);
  assert.deepEqual(messages.filter(([n]) => n === 'macroGesture').map(([,a]) => a[1]), ['begin','end']);
  const values = messages.filter(([n]) => n === 'macroValue');
  assert.ok(values.length >= 1 && values.every(([,a]) => a[0] === 0 && a[1] >= 0 && a[1] <= 1));
  await page.evaluate(() => { window.sent.length=0; window.__SY1_PLUGIN__.onCall('hostMacro',[0,0.2]); });
  assert.equal(await page.evaluate(() => window.sent.length), 0, 'host playback must not echo');
  await page.evaluate(() => { window.sent.length=0; window.SY1.applyPreset(window.SY1.machineData()[0].presets[1].id); });
  assert.equal(await page.evaluate(() => window.sent.filter(([n]) => n === 'macroValue').length), 0, 'preset must not write host automation');
  const bytes = await page.evaluate(async () => {
    const S = await import('/src/engine/synth.ts');
    const D = await import('/src/engine/drums.ts');
    const E = await import('/src/ui/drum-export.ts');
    S.setMachine('kerman');
    const patterns = Array.from({length:8}, (_,i) => {
      const p=D.emptyPattern(); p.steps[D.DRUM_VOICES[i]][0] = i===1 ? 2 : i===2 ? 3 : 1; return p;
    });
    D.loadBank(patterns);
    const {blob}=E.drumMidiFile(true);
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const b = Buffer.from(bytes);
  assert.equal(b.toString('ascii',0,4),'MThd');
  assert.equal(b.readUInt16BE(12),480);
  let offset=22,tick=0;const notes=[];const offs=[];
  function vlq(){let v=0,x; do{x=b[offset++];v=(v<<7)|(x&127);}while(x&128);return v;}
  while(offset<b.length){tick+=vlq();const status=b[offset++];if(status===255){offset++;const length=vlq();offset+=length;continue;}
    const note=b[offset++],vel=b[offset++];if(status===0x99)notes.push([tick,note,vel]);else if(status===0x89)offs.push([tick,note]);else assert.fail('Unexpected MIDI status');}
  assert.equal(notes.length,8);assert.equal(offs.length,8);
  assert.deepEqual(notes.map(n=>n[1]),[36,38,39,42,46,45,37,56]);
  assert.deepEqual(notes.map(n=>n[0]),Array.from({length:8},(_,i)=>i*1920));
  assert.equal(notes[1][2],127);assert.equal(notes[2][2],38);
  console.log('PASS: plugin knob -> macro/gestures, host playback without echo, presets, all 8 MIDI patterns, GM notes, channel 10, timing, velocity');
} finally { await browser.close(); }
