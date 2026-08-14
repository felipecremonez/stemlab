import Meyda from 'meyda';
import { guess } from 'web-audio-beat-detector';
import { mixToMono, rawAudioDuration, rawAudioToAudioBuffer } from './audio.js';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export async function analyzeMusic(originalRaw, harmonicRaw = originalRaw, onProgress = () => {}) {
  const duration = rawAudioDuration(originalRaw);
  const bpmPromise = detectTempo(originalRaw).catch(() => ({ bpm: null, offset: 0, tempo: null }));
  const harmonic = await analyzeHarmony(harmonicRaw, onProgress);
  const tempo = await bpmPromise;

  return {
    duration,
    bpm: Number.isFinite(tempo?.bpm) ? tempo.bpm : null,
    beatOffset: Number.isFinite(tempo?.offset) ? tempo.offset : 0,
    key: harmonic.key,
    mode: harmonic.mode,
    keyConfidence: harmonic.keyConfidence,
    chords: harmonic.chords
  };
}

async function detectTempo(rawAudio) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const context = new AudioCtx({ sampleRate: rawAudio.sampleRate });
  try {
    const buffer = rawAudioToAudioBuffer(rawAudio, context);
    const duration = Math.min(buffer.duration, 150);
    return await guess(buffer, 0, duration, { minTempo: 55, maxTempo: 200 });
  } finally {
    context.close().catch(() => {});
  }
}

async function analyzeHarmony(rawAudio, onProgress) {
  const mono = mixToMono(rawAudio);
  const sampleRate = rawAudio.sampleRate;
  const duration = rawAudioDuration(rawAudio);
  const frameSize = 4096;
  const stepSeconds = duration > 480 ? 1.5 : duration > 240 ? 1 : 0.75;
  const hop = Math.max(frameSize, Math.floor(sampleRate * stepSeconds));
  const frames = [];
  const average = new Float64Array(12);
  let averageWeight = 0;

  Meyda.sampleRate = sampleRate;
  Meyda.bufferSize = frameSize;
  Meyda.chromaBands = 12;
  Meyda.windowingFunction = 'hanning';

  const total = Math.max(1, Math.floor((mono.length - frameSize) / hop) + 1);
  let frameIndex = 0;

  for (let start = 0; start + frameSize <= mono.length; start += hop) {
    const signal = mono.subarray(start, start + frameSize);
    const features = Meyda.extract(['chroma', 'rms'], signal);
    const chroma = features?.chroma ? Array.from(features.chroma) : null;
    const rms = Number(features?.rms || 0);

    if (chroma?.length === 12 && rms > 0.003) {
      const normalized = normalize(chroma);
      const chord = bestChord(normalized);
      if (chord.score > 0.30) {
        frames.push({
          time: start / sampleRate,
          chord: chord.name,
          root: chord.root,
          quality: chord.quality,
          confidence: chord.score
        });
      }
      const weight = Math.min(1, rms * 8);
      for (let i = 0; i < 12; i++) average[i] += normalized[i] * weight;
      averageWeight += weight;
    }

    frameIndex += 1;
    if (frameIndex % 16 === 0) {
      onProgress(Math.min(1, frameIndex / total));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const avg = averageWeight ? Array.from(average, (v) => v / averageWeight) : new Array(12).fill(0);
  const key = detectKey(avg);
  const chords = consolidateChords(frames, duration, stepSeconds);
  onProgress(1);
  return { ...key, chords };
}

function normalize(values) {
  const sum = values.reduce((acc, value) => acc + Math.max(0, value || 0), 0) || 1;
  return values.map((value) => Math.max(0, value || 0) / sum);
}

function bestChord(chroma) {
  let best = { score: -Infinity, root: 0, quality: 'maj', name: 'C' };
  for (let root = 0; root < 12; root++) {
    for (const quality of ['maj', 'min']) {
      const third = quality === 'maj' ? 4 : 3;
      const template = new Array(12).fill(0.08);
      template[root] = 1;
      template[(root + third) % 12] = 0.72;
      template[(root + 7) % 12] = 0.82;
      template[(root + 2) % 12] = 0.12;
      template[(root + 9) % 12] = 0.10;
      const score = cosine(chroma, template);
      if (score > best.score) {
        best = {
          score,
          root,
          quality,
          name: `${NOTE_NAMES[root]}${quality === 'min' ? 'm' : ''}`
        };
      }
    }
  }
  return best;
}

function detectKey(chroma) {
  let best = { score: -Infinity, root: 0, mode: 'major' };
  for (let root = 0; root < 12; root++) {
    for (const [mode, profile] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]]) {
      const rotated = rotate(profile, root);
      const score = cosine(chroma, rotated);
      if (score > best.score) best = { score, root, mode };
    }
  }
  return {
    key: NOTE_NAMES[best.root],
    mode: best.mode,
    keyConfidence: Math.max(0, Math.min(1, best.score))
  };
}

function rotate(values, root) {
  const out = new Array(12);
  for (let i = 0; i < 12; i++) out[(i + root) % 12] = values[i];
  return out;
}

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb) || 1);
}

function consolidateChords(frames, duration, stepSeconds) {
  if (!frames.length) return [];
  const smoothed = frames.map((frame, index) => {
    const neighbors = frames.slice(Math.max(0, index - 1), index + 2);
    const counts = new Map();
    for (const item of neighbors) counts.set(item.chord, (counts.get(item.chord) || 0) + item.confidence);
    const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || frame.chord;
    return { ...frame, chord: winner };
  });

  const segments = [];
  for (const frame of smoothed) {
    const previous = segments[segments.length - 1];
    if (previous && previous.chord === frame.chord && frame.time - previous.end <= stepSeconds * 1.8) {
      previous.end = frame.time + stepSeconds;
      previous.confidence = Math.max(previous.confidence, frame.confidence);
    } else {
      segments.push({
        start: frame.time,
        end: Math.min(duration, frame.time + stepSeconds),
        chord: frame.chord,
        confidence: frame.confidence
      });
    }
  }

  return segments
    .filter((segment) => segment.end - segment.start >= Math.min(0.7, stepSeconds))
    .map((segment, index, list) => ({
      ...segment,
      end: Math.min(duration, list[index + 1]?.start ?? segment.end)
    }));
}

export function transposeNote(note, semitones = 0) {
  const index = NOTE_NAMES.indexOf(note);
  if (index < 0) return note;
  return NOTE_NAMES[(index + semitones % 12 + 12) % 12];
}

export function transposeChord(chord, semitones = 0) {
  const match = /^([A-G](?:#)?)(.*)$/.exec(chord || '');
  if (!match) return chord;
  return `${transposeNote(match[1], semitones)}${match[2] || ''}`;
}
