import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';

export class StemMixerEngine {
  constructor({ onTime = () => {}, onState = () => {} } = {}) {
    this.context = null;
    this.tracks = new Map();
    this.onTime = onTime;
    this.onState = onState;
    this.timer = null;
    this.speed = 1;
    this.pitch = 0;
    this.loop = { enabled: false, start: 0, end: 0 };
    this.isPlaying = false;
    this.ready = false;
  }

  async init(urls) {
    await this.dispose();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioCtx();
    await SoundTouchNode.register(this.context, processorUrl);

    const entries = Object.entries(urls).filter(([, url]) => Boolean(url));
    for (const [name, url] of entries) await this.addTrack(name, url);
    if (!this.tracks.has('original')) throw new Error('A faixa original não está disponível para o mixer.');

    this.ready = true;
    this.timer = window.setInterval(() => this.tick(), 80);
    this.onState({ ready: true, playing: false });
  }

  async addTrack(name, url) {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    audio.preservesPitch = false;
    await waitPlayable(audio);

    const source = this.context.createMediaElementSource(audio);
    const shifter = new SoundTouchNode({ context: this.context });
    const gain = this.context.createGain();
    gain.gain.value = name === 'original' ? 1 : 0;
    source.connect(shifter);
    shifter.connect(gain);
    gain.connect(this.context.destination);
    shifter.playbackRate.value = 1;
    shifter.pitchSemitones.value = 0;

    this.tracks.set(name, { audio, source, shifter, gain, volume: gain.gain.value });
  }

  async play() {
    if (!this.ready) return;
    await this.context.resume();
    const masterTime = this.currentTime();
    for (const track of this.tracks.values()) {
      if (Math.abs(track.audio.currentTime - masterTime) > 0.03) track.audio.currentTime = masterTime;
      track.audio.playbackRate = this.speed;
      track.shifter.playbackRate.value = this.speed;
      track.shifter.pitchSemitones.value = this.pitch;
    }
    const attempts = await Promise.allSettled([...this.tracks.values()].map(({ audio }) => audio.play()));
    const started = [...this.tracks.values()].some(({ audio }) => !audio.paused && !audio.ended);
    if (!started) {
      this.isPlaying = false;
      this.onState({ ready: true, playing: false, error: attempts.find((item) => item.status === 'rejected')?.reason || new Error('O navegador não iniciou a reprodução.') });
      return false;
    }
    this.isPlaying = true;
    this.onState({ ready: true, playing: true });
    return true;
  }

  pause() {
    for (const track of this.tracks.values()) track.audio.pause();
    this.isPlaying = false;
    this.onState({ ready: true, playing: false });
  }

  toggle() {
    return this.isPlaying ? this.pause() : this.play();
  }

  seek(seconds) {
    const target = Math.max(0, Math.min(this.duration(), Number(seconds) || 0));
    for (const track of this.tracks.values()) {
      try { track.audio.currentTime = target; } catch {}
    }
    this.onTime(target, this.duration());
  }

  setSpeed(value) {
    this.speed = Math.max(0.5, Math.min(1.5, Number(value) || 1));
    for (const track of this.tracks.values()) {
      track.audio.playbackRate = this.speed;
      track.shifter.playbackRate.value = this.speed;
    }
  }

  setPitch(semitones) {
    this.pitch = Math.max(-12, Math.min(12, Math.round(Number(semitones) || 0)));
    for (const track of this.tracks.values()) track.shifter.pitchSemitones.value = this.pitch;
  }

  setVolume(name, value) {
    const track = this.tracks.get(name);
    if (!track || !this.context) return;
    const volume = Math.max(0, Math.min(1.2, Number(value) || 0));
    track.volume = volume;
    track.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.015);
  }

  setVolumes(volumes) {
    for (const [name, value] of Object.entries(volumes || {})) this.setVolume(name, value);
  }

  setLoop(enabled, start, end) {
    const duration = this.duration();
    const safeStart = Math.max(0, Math.min(duration, Number(start) || 0));
    const safeEnd = Math.max(safeStart + 0.25, Math.min(duration, Number(end) || duration));
    this.loop = { enabled: Boolean(enabled), start: safeStart, end: safeEnd };
  }

  currentTime() {
    return this.tracks.get('original')?.audio?.currentTime || 0;
  }

  duration() {
    return this.tracks.get('original')?.audio?.duration || 0;
  }

  tick() {
    if (!this.ready) return;
    let time = this.currentTime();
    const duration = this.duration();

    if (this.isPlaying && this.loop.enabled && time >= this.loop.end - 0.025) {
      this.seek(this.loop.start);
      time = this.loop.start;
    }

    if (this.isPlaying) {
      const master = time;
      for (const [name, track] of this.tracks.entries()) {
        if (name === 'original') continue;
        if (Math.abs(track.audio.currentTime - master) > 0.08) {
          try { track.audio.currentTime = master; } catch {}
        }
      }
    }

    this.onTime(time, duration);
    const masterAudio = this.tracks.get('original')?.audio;
    if (this.isPlaying && masterAudio?.ended && !this.loop.enabled) {
      this.isPlaying = false;
      this.onState({ ready: true, playing: false });
    }
  }

  async dispose() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    for (const track of this.tracks.values()) {
      try { track.audio.pause(); } catch {}
      try { track.audio.removeAttribute('src'); track.audio.load(); } catch {}
      try { track.source.disconnect(); } catch {}
      try { track.shifter.disconnect(); } catch {}
      try { track.gain.disconnect(); } catch {}
    }
    this.tracks.clear();
    if (this.context) await this.context.close().catch(() => {});
    this.context = null;
    this.ready = false;
    this.isPlaying = false;
  }
}

function waitPlayable(audio) {
  return new Promise((resolve, reject) => {
    if (audio.readyState >= 3) return resolve();
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Não foi possível carregar uma das stems no mixer.')); };
    const cleanup = () => {
      audio.removeEventListener('canplay', done);
      audio.removeEventListener('loadeddata', done);
      audio.removeEventListener('error', fail);
    };
    audio.addEventListener('canplay', done, { once: true });
    audio.addEventListener('loadeddata', done, { once: true });
    audio.addEventListener('error', fail, { once: true });
    audio.load();
  });
}
