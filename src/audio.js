export const TARGET_SAMPLE_RATE = 44100;

export async function decodeAudioFile(file) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Seu navegador não possui AudioContext para decodificar a música.');

  let context;
  try {
    context = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    context = new AudioCtx();
  }

  try {
    const audioBuffer = await context.decodeAudioData(await file.arrayBuffer());
    let channels = [];
    if (audioBuffer.numberOfChannels === 1) {
      const mono = Float32Array.from(audioBuffer.getChannelData(0));
      channels = [mono, Float32Array.from(mono)];
    } else {
      channels = [
        Float32Array.from(audioBuffer.getChannelData(0)),
        Float32Array.from(audioBuffer.getChannelData(1))
      ];
    }

    if (audioBuffer.sampleRate !== TARGET_SAMPLE_RATE) {
      channels = channels.map((channel) => resampleLinear(channel, audioBuffer.sampleRate, TARGET_SAMPLE_RATE));
    }

    return { channelData: channels, sampleRate: TARGET_SAMPLE_RATE };
  } finally {
    context.close().catch(() => {});
  }
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return Float32Array.from(input);
  const ratio = fromRate / toRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const mix = position - left;
    output[i] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

export function makeInstrumental(tracks) {
  const sourceNames = ['drums', 'bass', 'other'];
  const first = tracks[sourceNames.find((name) => tracks[name])];
  if (!first) throw new Error('O motor não retornou as stems necessárias para criar o instrumental.');

  const channelData = first.channelData.map((_, channelIndex) => {
    const length = first.channelData[channelIndex].length;
    const output = new Float32Array(length);
    for (const source of sourceNames) {
      const channel = tracks[source]?.channelData?.[channelIndex];
      if (!channel) continue;
      for (let i = 0; i < length; i++) output[i] += channel[i] || 0;
    }
    return output;
  });

  return { channelData, sampleRate: first.sampleRate };
}

export function cloneRawAudio(rawAudio) {
  return {
    sampleRate: rawAudio.sampleRate,
    channelData: rawAudio.channelData.map((channel) => Float32Array.from(channel))
  };
}

export function rawAudioDuration(rawAudio) {
  return (rawAudio?.channelData?.[0]?.length || 0) / (rawAudio?.sampleRate || TARGET_SAMPLE_RATE);
}

export function rawAudioToAudioBuffer(rawAudio, context) {
  const buffer = context.createBuffer(rawAudio.channelData.length, rawAudio.channelData[0].length, rawAudio.sampleRate);
  rawAudio.channelData.forEach((channel, index) => buffer.copyToChannel(channel, index));
  return buffer;
}

export function sliceRawAudio(rawAudio, startSeconds, endSeconds) {
  const duration = rawAudioDuration(rawAudio);
  const start = Math.max(0, Math.min(duration, Number(startSeconds) || 0));
  const end = Math.max(start + 0.02, Math.min(duration, Number(endSeconds) || duration));
  const from = Math.floor(start * rawAudio.sampleRate);
  const to = Math.ceil(end * rawAudio.sampleRate);
  return {
    sampleRate: rawAudio.sampleRate,
    channelData: rawAudio.channelData.map((channel) => Float32Array.from(channel.subarray(from, to)))
  };
}

export function mixToMono(rawAudio) {
  const channels = rawAudio.channelData;
  if (!channels?.length) return new Float32Array();
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] || 0;
    mono[i] = sum / channels.length;
  }
  return mono;
}

export function rawAudioToWavBlob(rawAudio) {
  const channels = rawAudio.channelData;
  const sampleRate = rawAudio.sampleRate;
  const channelCount = channels.length;
  const samples = channels[0]?.length || 0;
  const bytesPerSample = 2;
  const dataLength = samples * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let channel = 0; channel < channelCount; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

export function safeBaseName(name) {
  return (name || 'musica')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim() || 'musica';
}

export function sanitizeRawAudio(rawAudio, { maxPeak = 0.98 } = {}) {
  if (!rawAudio?.channelData?.length) throw new Error('A stem retornou sem canais de áudio.');
  let peak = 0;
  const channelData = rawAudio.channelData.map((channel) => {
    const output = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      let value = Number(channel[i]);
      if (!Number.isFinite(value)) value = 0;
      peak = Math.max(peak, Math.abs(value));
      output[i] = value;
    }
    return output;
  });

  if (peak < 1e-7) {
    return { channelData, sampleRate: rawAudio.sampleRate, silent: true, peak };
  }

  if (peak > 1 && maxPeak > 0) {
    const gain = maxPeak / peak;
    for (const channel of channelData) {
      for (let i = 0; i < channel.length; i++) channel[i] *= gain;
    }
    peak = maxPeak;
  }

  return { channelData, sampleRate: rawAudio.sampleRate, silent: false, peak };
}
