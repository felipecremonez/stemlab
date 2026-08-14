const ENGINE_DIR = 'demucs-engine/';
const MODEL_FILE = 'htdemucs.onnx';
const MODEL_CACHE = 'demucs-weights-cache';

function engineUrl(file) {
  return new URL(`${ENGINE_DIR}${file}`, document.baseURI).toString();
}

export function hardwareInfo() {
  const webgpu = Boolean(navigator.gpu);
  return {
    webgpu,
    provider: webgpu ? 'WebGPU' : 'WebAssembly / CPU',
    message: webgpu
      ? 'Aceleração por GPU disponível neste navegador.'
      : 'WebGPU não foi detectado. O processamento funcionará pela CPU, mas será bem mais lento.'
  };
}

export async function ensureModelCached(onProgress = () => {}) {
  if (!('caches' in window)) {
    onProgress({ percent: null, message: 'Preparando modelo de IA...' });
    return;
  }

  const url = engineUrl(MODEL_FILE);
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(url);
  if (cached) {
    onProgress({ percent: 100, message: 'Modelo de IA carregado do cache do navegador.' });
    return;
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível baixar o modelo de IA (${response.status}).`);

  const total = Number(response.headers.get('content-length')) || 0;
  const cachePromise = cache.put(url, response.clone());

  if (!response.body) {
    await response.arrayBuffer();
    await cachePromise;
    onProgress({ percent: 100, message: 'Modelo de IA pronto.' });
    return;
  }

  const reader = response.body.getReader();
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    const percent = total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
    onProgress({
      percent,
      loaded,
      total,
      message: percent == null ? 'Baixando modelo de IA...' : `Baixando modelo de IA — ${percent}%`
    });
  }
  await cachePromise;
  onProgress({ percent: 100, message: 'Modelo de IA salvo no cache do navegador.' });
}

export class DemucsBrowserClient {
  constructor() {
    this.worker = null;
    this.splitJobs = new Map();
    this.encodeJobs = new Map();
  }

  init() {
    if (this.worker) return;
    this.worker = new Worker(engineUrl('worker.js'));
    this.worker.addEventListener('message', (event) => this.onMessage(event));
    this.worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Falha no Worker do Demucs.');
      for (const job of this.splitJobs.values()) job.reject(error);
      for (const job of this.encodeJobs.values()) job.reject(error);
      this.splitJobs.clear();
      this.encodeJobs.clear();
    });
  }

  onMessage(event) {
    const data = event.data || {};
    if (data.type === 'split progress') {
      this.splitJobs.get(data.id)?.onProgress?.(data.step, data.total);
      return;
    }
    if (data.type === 'split done') {
      const job = this.splitJobs.get(data.id);
      if (!job) return;
      this.splitJobs.delete(data.id);
      if (data.error) job.reject(toError(data.error));
      else job.resolve(data.tracks);
      return;
    }
    if (data.type === 'encode done') {
      const job = this.encodeJobs.get(data.id);
      if (!job) return;
      this.encodeJobs.delete(data.id);
      if (data.error) job.reject(toError(data.error));
      else job.resolve(new Blob([data.buffer], { type: 'audio/mpeg' }));
    }
  }

  split(rawAudio, fileName, overlap = 0.20, onProgress = () => {}) {
    this.init();
    const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      this.splitJobs.set(id, { resolve, reject, onProgress });
      const transfer = [...new Set(rawAudio.channelData.map((channel) => channel.buffer))];
      this.worker.postMessage({ type: 'split', id, fileName, rawAudio, overlap }, transfer);
    });
  }

  encodeMp3(rawAudio, fileName) {
    this.init();
    const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      this.encodeJobs.set(id, { resolve, reject });
      const transfer = [...new Set(rawAudio.channelData.map((channel) => channel.buffer))];
      this.worker.postMessage({ type: 'mp3 encode', id, fileName, rawAudio }, transfer);
    });
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.splitJobs.clear();
    this.encodeJobs.clear();
  }
}

function toError(value) {
  if (value instanceof Error) return value;
  if (value?.message) return new Error(value.message);
  return new Error(typeof value === 'string' ? value : 'Falha desconhecida no motor de áudio.');
}
