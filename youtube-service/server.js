import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { Innertube } from 'youtubei.js';

const app = express();
const PORT = Number(process.env.PORT || 10000);
const MAX_DURATION_SECONDS = Number(process.env.MAX_YOUTUBE_DURATION_SECONDS || 15 * 60);
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || 'https://felipecremonez.github.io,http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((item) => item.trim()).filter(Boolean);

app.set('trust proxy', 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origem não autorizada.'));
  },
  exposedHeaders: ['Content-Length', 'Content-Type', 'X-StemLab-Title', 'X-StemLab-Duration']
}));
app.use(rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }));

let innertubePromise;
function youtube() {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({ generate_session_locally: true }).catch((error) => {
      innertubePromise = null;
      throw error;
    });
  }
  return innertubePromise;
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'stemlab-youtube-service' }));

app.get('/api/youtube/audio', async (req, res) => {
  try {
    const input = String(req.query.url || '').trim();
    const videoId = extractVideoId(input);
    if (!videoId) return res.status(400).json({ error: 'Link do YouTube inválido.' });

    const yt = await youtube();
    const info = await yt.getBasicInfo(videoId);
    const title = info?.basic_info?.title || `youtube-${videoId}`;
    const duration = Number(info?.basic_info?.duration || 0);
    if (duration && duration > MAX_DURATION_SECONDS) {
      return res.status(413).json({ error: `Este vídeo ultrapassa o limite de ${Math.floor(MAX_DURATION_SECONDS / 60)} minutos configurado no StemLab.` });
    }

    let stream;
    let contentType = 'audio/webm';
    try {
      stream = await yt.download(videoId, { type: 'audio', quality: 'best', format: 'webm', codec: 'opus' });
    } catch (preferredError) {
      console.warn('Formato WebM/Opus indisponível, tentando áudio disponível:', preferredError?.message || preferredError);
      stream = await yt.download(videoId, { type: 'audio', quality: 'best', format: 'any' });
      contentType = 'application/octet-stream';
    }
    res.status(200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-StemLab-Title', encodeURIComponent(title));
    if (duration) res.setHeader('X-StemLab-Duration', String(duration));

    for await (const chunk of stream) {
      if (res.destroyed) break;
      res.write(Buffer.from(chunk));
    }
    if (!res.destroyed) res.end();
  } catch (error) {
    console.error('YouTube import:', error);
    if (!res.headersSent) res.status(502).json({ error: friendlyYoutubeError(error) });
    else res.destroy(error);
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`StemLab YouTube Service ouvindo na porta ${PORT}`));

function extractVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return validId(url.pathname.split('/').filter(Boolean)[0]);
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return null;
    if (url.pathname === '/watch') return validId(url.searchParams.get('v'));
    const parts = url.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0])) return validId(parts[1]);
    return null;
  } catch {
    return validId(value);
  }
}

function validId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(String(value || '')) ? String(value) : null;
}

function friendlyYoutubeError(error) {
  const text = String(error?.message || error || 'Falha desconhecida.');
  if (/403|non 2xx|forbidden/i.test(text)) return 'O YouTube recusou temporariamente a extração desta faixa. Tente novamente mais tarde ou use o upload do arquivo.';
  if (/private|unavailable|not available/i.test(text)) return 'Este vídeo está privado, indisponível ou não pode ser acessado pelo serviço.';
  return `Não foi possível obter o áudio do YouTube: ${text}`;
}
