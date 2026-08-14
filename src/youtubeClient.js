const DEFAULT_API_BASE = (import.meta.env.VITE_YOUTUBE_API_BASE || '').trim();

function apiBase() {
  const saved = localStorage.getItem('stemlab-youtube-api-base')?.trim();
  return (saved || DEFAULT_API_BASE).replace(/\/$/, '');
}

export function youtubeApiConfigured() {
  return Boolean(apiBase());
}

export function getYoutubeApiBase() {
  return apiBase();
}

export function setYoutubeApiBase(value) {
  const clean = String(value || '').trim().replace(/\/$/, '');
  if (clean) localStorage.setItem('stemlab-youtube-api-base', clean);
  else localStorage.removeItem('stemlab-youtube-api-base');
  return clean;
}

export function isYoutubeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host);
  } catch {
    return false;
  }
}

export async function importYoutubeAudio(url, { onProgress = () => {} } = {}) {
  if (!isYoutubeUrl(url)) throw new Error('Cole um link válido do YouTube.');
  const base = apiBase();
  if (!base) {
    const error = new Error('O serviço remoto do YouTube ainda não foi configurado neste StemLab.');
    error.code = 'YOUTUBE_API_NOT_CONFIGURED';
    throw error;
  }

  onProgress({ percent: 4, message: 'Solicitando a faixa ao serviço do StemLab…' });
  const endpoint = `${base}/api/youtube/audio?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, { headers: { Accept: 'audio/*,application/octet-stream' } });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error || ''; } catch { detail = await response.text().catch(() => ''); }
    throw new Error(detail || `Não foi possível importar o áudio do YouTube (${response.status}).`);
  }

  const total = Number(response.headers.get('content-length')) || 0;
  const titleHeader = response.headers.get('x-stemlab-title') || response.headers.get('x-video-title') || 'youtube-audio';
  const contentType = response.headers.get('content-type') || 'audio/webm';
  const reader = response.body?.getReader?.();
  let blob;

  if (!reader) {
    blob = await response.blob();
    onProgress({ percent: 100, message: 'Áudio do YouTube recebido.' });
  } else {
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      const percent = total ? Math.min(98, Math.round((loaded / total) * 100)) : null;
      onProgress({ percent, loaded, total, message: percent == null ? 'Recebendo o áudio do YouTube…' : `Recebendo o áudio do YouTube — ${percent}%` });
    }
    blob = new Blob(chunks, { type: contentType });
    onProgress({ percent: 100, message: 'Áudio do YouTube recebido.' });
  }

  const safeTitle = decodeHeader(titleHeader).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'youtube-audio';
  const extension = guessExtension(contentType);
  return new File([blob], `${safeTitle}.${extension}`, { type: contentType || 'application/octet-stream', lastModified: Date.now() });
}

function decodeHeader(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function guessExtension(type) {
  const lower = String(type || '').toLowerCase();
  if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('wav')) return 'wav';
  return 'webm';
}
