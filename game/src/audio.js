// Synthesized sound: no audio files, everything is built from oscillators and
// filtered noise in the Web Audio API. The context is created on the first user
// gesture (browsers forbid audio before one) and stays silent until then.
export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  // A short bass line that loops under the game: A minor, walking down to E.
  const BASSLINE = [55, 0, 55, 65.41, 49, 0, 49, 58.27, 55, 0, 55, 65.41, 82.41, 73.42, 65.41, 49];

  function ensure() {
    if (context) return true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);

      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenLfo = context.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const sirenLfoGain = context.createGain();
      sirenLfoGain.gain.value = 190;
      sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(sirenOsc.frequency);
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
    } catch {
      context = null;
      return false;
    }
    return true;
  }

  function noiseBurst(duration, filterFreq, volume) {
    if (!ensure() || !context) return;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (!ensure() || !context) return;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration + 0.02);
  }

  return {
    unlock() { ensure(); if (context && context.state === 'suspended') context.resume(); },
    setMuted(value) {
      muted = value;
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.05);
    },
    isMuted() { return muted; },
    setEngine(speedRatio, inCar) {
      if (!context || !engineOsc) return;
      const target = inCar ? 0.05 + speedRatio * 0.11 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + speedRatio * 130, context.currentTime, 0.1);
    },
    setSiren(on) {
      if (!context || !sirenGain) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, context.currentTime, 0.2);
    },
    pickup() { tone(660, 0.12, 'sine', 0.25, 990); },
    delivery() {
      tone(523, 0.14, 'triangle', 0.25);
      setTimeout(() => tone(659, 0.14, 'triangle', 0.25), 110);
      setTimeout(() => tone(784, 0.3, 'triangle', 0.3), 220);
    },
    gunshot() { noiseBurst(0.12, 1800, 0.4); },
    punch() { noiseBurst(0.08, 700, 0.3); },
    crash(strength) { noiseBurst(0.25, 500, Math.min(0.6, 0.2 + strength * 0.4)); },
    wantedUp() { tone(440, 0.1, 'square', 0.16); setTimeout(() => tone(440, 0.1, 'square', 0.16), 130); },
    denied() { tone(180, 0.16, 'square', 0.18, 120); },
    startMusic() {
      if (!ensure() || musicTimer) return;
      musicTimer = setInterval(() => {
        if (!context || muted) return;
        const freq = BASSLINE[musicStep % BASSLINE.length];
        musicStep += 1;
        if (freq > 0) tone(freq, 0.42, 'triangle', 0.11);
        if (musicStep % 2 === 0) noiseBurst(0.03, 6000, 0.05);
      }, 268);
    },
    stopMusic() {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },
  };
}
