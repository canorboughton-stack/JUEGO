// Procedural sound: no assets, one tiny WebAudio graph. Every sound is
// synthesized — thunks are filtered noise bursts, howls are gliding sines,
// the Red Moon is a low detuned drone. Volume stays low: atmosphere, not alarm.
let ctx = null;
let master = null;
let windGain = null;
let droneNodes = null;
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  _startWind();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function _noiseBuffer(dur) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// a shaped noise burst through a filter — the workhorse for impacts
function _thump(freq, dur, vol, type = 'lowpass', q = 1) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = _noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

// a pitched blip/tone with a glide — stings, howls, whooshes
function _tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type;
  const t = ctx.currentTime + delay;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.04, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

// constant faint wind so the world is never dead silent
function _startWind() {
  const src = ctx.createBufferSource();
  src.buffer = _noiseBuffer(2.0);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 0.4;
  windGain = ctx.createGain();
  windGain.gain.value = 0.028;
  src.connect(f); f.connect(windGain); windGain.connect(master);
  src.start();
  // slow organic swell
  setInterval(() => {
    if (!ctx || muted) return;
    windGain.gain.linearRampToValueAtTime(0.018 + Math.random() * 0.025,
      ctx.currentTime + 2.5);
  }, 3000);
}

// the Red Moon drone: two detuned lows that beat against each other
export function setRedMoonDrone(on) {
  if (!ctx) return;
  if (on && !droneNodes) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 4);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 56.8;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start();
    droneNodes = { o1, o2, g };
  } else if (!on && droneNodes) {
    droneNodes.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3);
    const d = droneNodes; droneNodes = null;
    setTimeout(() => { d.o1.stop(); d.o2.stop(); }, 3500);
  }
}

// the public one-shot vocabulary — call sfx('name') from anywhere
export function sfx(name) {
  if (!ctx || muted) return;
  switch (name) {
    case 'swing':  _thump(1400, 0.09, 0.10, 'highpass'); break;
    case 'hit':    _thump(700, 0.10, 0.28); _tone(180, 90, 0.08, 0.12, 'square'); break;
    case 'hurt':   _thump(400, 0.16, 0.30); _tone(140, 70, 0.18, 0.10, 'sawtooth'); break;
    case 'block':  _tone(900, 500, 0.07, 0.14, 'square'); break;
    case 'chop':   _thump(900, 0.12, 0.30); _tone(120, 80, 0.06, 0.08, 'triangle'); break;
    case 'mine':   _thump(2400, 0.08, 0.22, 'highpass', 3); _tone(300, 240, 0.05, 0.06, 'square'); break;
    case 'gather': _thump(1800, 0.10, 0.10, 'highpass'); break;
    case 'hammer': _thump(1100, 0.09, 0.20); _tone(500, 350, 0.05, 0.06, 'square'); break;
    case 'eat':    _thump(500, 0.09, 0.10); _tone(300, 220, 0.09, 0.05, 'triangle'); break;
    case 'craft':  _tone(520, 780, 0.12, 0.10, 'triangle'); _tone(780, 1040, 0.10, 0.08, 'triangle', 0.12); break;
    case 'build':  _thump(800, 0.25, 0.20); _tone(240, 160, 0.22, 0.08, 'triangle'); break;
    case 'arrow':  _tone(1800, 500, 0.14, 0.10, 'sawtooth'); break;
    case 'pickup': _tone(660, 990, 0.09, 0.09, 'sine'); break;
    case 'cook':   _thump(3500, 0.35, 0.06, 'highpass', 2); break;
    case 'sting':  _tone(220, 110, 0.7, 0.10, 'triangle'); _tone(330, 165, 0.7, 0.06, 'sine', 0.05); break;
    case 'death':  _tone(300, 60, 1.4, 0.16, 'sawtooth'); _thump(200, 0.9, 0.18); break;
    case 'howl':   _tone(400, 700, 0.9, 0.07, 'sine'); _tone(700, 300, 1.2, 0.06, 'sine', 0.9); break;
    case 'horn':   _tone(160, 158, 1.1, 0.14, 'sawtooth'); _tone(240, 238, 1.0, 0.08, 'sawtooth', 0.12); break;
    case 'ghost':  _tone(1200, 400, 1.1, 0.045, 'sine'); break;
    case 'splash': _thump(1200, 0.25, 0.16, 'bandpass', 1.5); break;
    case 'levelup': _tone(392, 523, 0.16, 0.1, 'triangle'); _tone(523, 659, 0.16, 0.1, 'triangle', 0.15);
                    _tone(659, 784, 0.3, 0.12, 'triangle', 0.3); break;
  }
}
