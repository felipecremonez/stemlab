import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cloneRawAudio,
  decodeAudioFile,
  makeInstrumental,
  rawAudioDuration,
  rawAudioToWavBlob,
  safeBaseName,
  sanitizeRawAudio,
  sliceRawAudio
} from './audio.js';
import { DemucsBrowserClient, ensureModelCached, hardwareInfo } from './demucsClient.js';
import { analyzeMusic, transposeChord, transposeNote } from './musicAnalysis.js';
import { StemMixerEngine } from './mixerEngine.js';
import { clearSessions, deleteSession, getSession, listSessions, saveSession } from './storage.js';
import { importYoutubeAudio, isYoutubeUrl, youtubeApiConfigured } from './youtubeClient.js';

const ACCEPT = '.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.webm';
const MAX_MB = 250;
const QUALITY = {
  fast: { label: 'Turbo', overlap: 0.10, detail: 'mais rápido' },
  balanced: { label: 'Equilíbrio', overlap: 0.15, detail: 'recomendado' },
  studio: { label: 'Studio', overlap: 0.25, detail: 'mais precisão' }
};
const TRACK_META = {
  original: { label: 'Original', short: 'MIX', tone: 'original' },
  vocals: { label: 'Voz', short: 'VOX', tone: 'voice' },
  instrumental: { label: 'Instrumental', short: 'INST', tone: 'instrument' },
  drums: { label: 'Bateria', short: 'DRM', tone: 'drums' },
  bass: { label: 'Baixo', short: 'BASS', tone: 'bass' },
  other: { label: 'Outros', short: 'OTH', tone: 'other' }
};
const SECTION_TYPES = ['Intro', 'Verso', 'Pré-refrão', 'Refrão', 'Ponte', 'Solo', 'Outro'];

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></>,
    music: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
    spark: <><path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    vocal: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="m10.3 3.7-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.3l-8-14a2 2 0 0 0-3.4 0Z" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    pause: <><path d="M9 5v14M15 5v14" /></>,
    loop: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
    marker: <><path d="M5 21V4" /><path d="M5 4h12l-3 4 3 4H5" /></>,
    install: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    gauge: <><path d="M4.9 19a9 9 0 1 1 14.2 0" /><path d="m12 12 4-4" /><path d="M12 19h.01" /></>,
    sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
    youtube: <><path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8Z" /><path d="m10 15 5-3-5-3v6Z" /></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${(bytes / 1024).toFixed(0)} KB` : `${mb.toFixed(mb > 10 ? 0 : 1)} MB`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'calculando…';
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.ceil(seconds % 60);
  return `~${min}m ${sec}s`;
}

function Waveform({ file, active = false }) {
  const canvasRef = useRef(null);
  const [duration, setDuration] = useState(null);

  useEffect(() => {
    if (!file || !canvasRef.current) return undefined;
    let disposed = false;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const context = new AudioCtx();
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const audio = await context.decodeAudioData(reader.result.slice(0));
        if (disposed) return;
        setDuration(audio.duration);
        drawWave(canvasRef.current, audio.getChannelData(0));
      } catch {
        setDuration(null);
      }
    };
    reader.readAsArrayBuffer(file);
    return () => {
      disposed = true;
      context.close().catch(() => {});
    };
  }, [file]);

  return (
    <div className={`wave-shell ${active ? 'is-active' : ''}`}>
      <canvas ref={canvasRef} className="wave-canvas" />
      <div className="wave-grid" />
      <span className="wave-duration">{formatDuration(duration)}</span>
    </div>
  );
}

function RawWave({ raw, playhead = 0, duration = 0, loop, onSeek }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (raw?.channelData?.[0]) drawWave(canvasRef.current, raw.channelData[0]);
  }, [raw]);
  const pct = duration ? Math.min(100, Math.max(0, (playhead / duration) * 100)) : 0;
  const loopStart = duration ? (loop.start / duration) * 100 : 0;
  const loopEnd = duration ? (loop.end / duration) * 100 : 100;
  return (
    <div className="raw-wave" onClick={(event) => {
      if (!duration || !onSeek) return;
      const rect = event.currentTarget.getBoundingClientRect();
      onSeek(((event.clientX - rect.left) / rect.width) * duration);
    }}>
      <canvas ref={canvasRef} />
      {loop.enabled && <span className="loop-zone" style={{ left: `${loopStart}%`, width: `${Math.max(0, loopEnd - loopStart)}%` }} />}
      <span className="playhead" style={{ left: `${pct}%` }} />
    </div>
  );
}

function drawWave(canvas, data) {
  if (!canvas || !data?.length) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const bars = Math.max(60, Math.floor(width / 4));
  const step = Math.max(1, Math.floor(data.length / bars));
  const color = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#63f5c6';
  ctx.fillStyle = color;
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    const start = i * step;
    const end = Math.min(data.length, start + step);
    const sampleStep = Math.max(1, Math.floor(step / 70));
    for (let j = start; j < end; j += sampleStep) peak = Math.max(peak, Math.abs(data[j]));
    const h = Math.max(2, peak * height * 0.88);
    const x = i * (width / bars);
    ctx.globalAlpha = 0.2 + (i / bars) * 0.65;
    ctx.fillRect(x, (height - h) / 2, Math.max(1.1, width / bars - 1.5), h);
  }
  ctx.globalAlpha = 1;
}

function ProgressConsole({ process }) {
  const steps = [
    ['Modelo', 10], ['Decodificar', 18], ['IA / Demucs', 30], ['Analisar', 84], ['Exportar', 95]
  ];
  return (
    <section className="processing-panel">
      <div className="processing-head">
        <div>
          <span className="mini-label">PROCESSAMENTO NO SEU NAVEGADOR</span>
          <h2>{process.stage}</h2>
          <p>{process.message}</p>
          <div className="eta-line"><Icon name="gauge" size={14} /> Tempo restante: <strong>{formatEta(process.eta)}</strong></div>
        </div>
        <div className="processing-percent">{process.progress}<small>%</small></div>
      </div>
      <div className="progress-track"><span style={{ width: `${process.progress}%` }} /></div>
      <div className="process-visual">
        <div className="scanner-orb">
          <i className="scanner-orb__a" /><i className="scanner-orb__b" /><i className="scanner-orb__c" />
          <div className="scanner-core"><Icon name="spark" size={28} /></div>
        </div>
        <div className="spectrum-field">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ '--x': i, '--h': `${16 + ((i * 23) % 80)}%` }} />)}</div>
      </div>
      <div className="process-steps">
        {steps.map(([label, threshold], index) => {
          const done = process.progress >= threshold;
          return <div key={label} className={done ? 'done' : ''}><span>{done ? <Icon name="check" size={13} /> : String(index + 1).padStart(2, '0')}</span><p>{label}</p></div>;
        })}
      </div>
    </section>
  );
}

function ChordTimeline({ analysis, pitch, currentTime, onSeek }) {
  if (!analysis?.chords?.length) return <div className="empty-analysis">Não foi possível estimar uma sequência harmônica confiável nesta faixa.</div>;
  const visible = analysis.chords.slice(0, 180);
  return (
    <div className="chord-timeline">
      {visible.map((item, index) => {
        const active = currentTime >= item.start && currentTime < item.end;
        return (
          <button key={`${item.start}-${index}`} className={active ? 'active' : ''} onClick={() => onSeek(item.start)}>
            <small>{formatDuration(item.start)}</small>
            <strong>{transposeChord(item.chord, pitch)}</strong>
            <i style={{ '--confidence': `${Math.round(item.confidence * 100)}%` }} />
          </button>
        );
      })}
    </div>
  );
}

function TrackChannel({ name, asset, raw, state, effectiveVolume, onVolume, onMute, onSolo, onDownload, playhead, duration, loop, onSeek }) {
  const meta = TRACK_META[name];
  if (!asset) return null;
  return (
    <article className={`mixer-channel mixer-channel--${meta.tone}`}>
      <div className="channel-head">
        <span>{meta.short}</span>
        <div><strong>{meta.label}</strong><small>{asset.name || 'faixa'}</small></div>
        <b>{Math.round(effectiveVolume * 100)}%</b>
      </div>
      {raw && <RawWave raw={raw} playhead={playhead} duration={duration} loop={loop} onSeek={onSeek} />}
      <input className="fader" aria-label={`Volume ${meta.label}`} type="range" min="0" max="1.2" step="0.01" value={state.volume} onChange={(e) => onVolume(name, Number(e.target.value))} />
      <div className="channel-actions">
        <button className={state.muted ? 'active danger' : ''} onClick={() => onMute(name)}>MUTE</button>
        <button className={state.solo ? 'active' : ''} onClick={() => onSolo(name)}>SOLO</button>
        <button onClick={() => onDownload(name)}><Icon name="download" size={14} /> DL</button>
      </div>
    </article>
  );
}

function HistoryDrawer({ items, onOpen, onDelete, onClear }) {
  return (
    <section className="history-panel">
      <div className="panel-title-row">
        <div><span className="mini-label">HISTÓRICO LOCAL</span><h3>Últimas separações</h3></div>
        {items.length > 0 && <button onClick={onClear}><Icon name="trash" size={14} /> Limpar</button>}
      </div>
      {items.length === 0 ? <p className="history-empty">As próximas músicas processadas aparecerão aqui. O histórico fica somente neste navegador.</p> : (
        <div className="history-list">
          {items.map((item) => <article key={item.id}>
            <div><strong>{item.originalName}</strong><span>{new Date(item.createdAt).toLocaleString('pt-BR')} · {item.analysis?.bpm ? `${item.analysis.bpm} BPM` : 'BPM —'} · {item.analysis?.key || 'Tom —'}</span></div>
            <span className={item.hasAudio ? 'saved-audio' : 'metadata-only'}>{item.hasAudio ? 'ÁUDIO SALVO' : 'METADADOS'}</span>
            <button disabled={!item.hasAudio} onClick={() => onOpen(item.id)}>Abrir</button>
            <button className="icon-delete" onClick={() => onDelete(item.id)}><Icon name="trash" size={14} /></button>
          </article>)}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('stemlab-theme') || 'dark');
  const [file, setFile] = useState(null);
  const [inputMode, setInputMode] = useState('file');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeImport, setYoutubeImport] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [quality, setQuality] = useState(() => localStorage.getItem('stemlab-quality') || 'balanced');
  const [format, setFormat] = useState(() => localStorage.getItem('stemlab-format') || 'mp3');
  const [outputMode, setOutputMode] = useState(() => localStorage.getItem('stemlab-output-mode') || 'simple');
  const [process, setProcess] = useState(null);
  const [results, setResults] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [loop, setLoop] = useState({ enabled: false, start: 0, end: 0 });
  const [markers, setMarkers] = useState([]);
  const [markerType, setMarkerType] = useState('Verso');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [exportTrack, setExportTrack] = useState('instrumental');
  const [exportStart, setExportStart] = useState(0);
  const [exportEnd, setExportEnd] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [channels, setChannels] = useState(makeChannelState());
  const inputRef = useRef(null);
  const clientRef = useRef(null);
  const mixerRef = useRef(null);
  const rawRef = useRef(null);
  const resultsRef = useRef(null);
  const processStartRef = useRef(0);
  const hw = useMemo(() => hardwareInfo(), []);

  const refreshHistory = useCallback(async () => {
    try { setHistory(await listSessions()); } catch { setHistory([]); }
  }, []);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  useEffect(() => { resultsRef.current = results; }, [results]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('stemlab-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('stemlab-quality', quality);
    localStorage.setItem('stemlab-format', format);
    localStorage.setItem('stemlab-output-mode', outputMode);
  }, [quality, format, outputMode]);

  useEffect(() => {
    const handler = (event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => () => {
    clientRef.current?.destroy();
    mixerRef.current?.dispose();
    revokeResults(resultsRef.current);
  }, []);

  useEffect(() => {
    if (!results) return undefined;
    let cancelled = false;
    const init = async () => {
      try {
        const urls = Object.fromEntries(Object.entries(results.assets).map(([name, asset]) => [name, asset?.previewUrl]).filter(([, url]) => url));
        const mixer = new StemMixerEngine({
          onTime: (time, total) => { if (!cancelled) { setPlayhead(time); setDuration(total || results.duration || 0); } },
          onState: ({ playing: isPlaying, error: mixerError }) => {
            if (cancelled) return;
            setPlaying(Boolean(isPlaying));
            if (mixerError) setError(`O player não conseguiu iniciar o áudio: ${mixerError.message || mixerError}`);
          }
        });
        await mixer.init(urls);
        if (cancelled) return mixer.dispose();
        mixerRef.current = mixer;
        mixer.setSpeed(speed);
        mixer.setPitch(pitch);
        mixer.setLoop(loop.enabled, loop.start, loop.end || results.duration);
        mixer.setVolumes(effectiveVolumes);
      } catch (err) {
        console.warn('Mixer:', err);
      }
    };
    init();
    return () => { cancelled = true; mixerRef.current?.dispose(); mixerRef.current = null; };
  }, [results]);

  useEffect(() => { mixerRef.current?.setSpeed(speed); }, [speed]);
  useEffect(() => { mixerRef.current?.setPitch(pitch); }, [pitch]);
  useEffect(() => { mixerRef.current?.setLoop(loop.enabled, loop.start, loop.end || duration); }, [loop, duration]);

  const effectiveVolumes = useMemo(() => {
    const anySolo = Object.values(channels).some((channel) => channel.solo);
    return Object.fromEntries(Object.entries(channels).map(([name, channel]) => [name, channel.muted || (anySolo && !channel.solo) ? 0 : channel.volume]));
  }, [channels]);

  useEffect(() => { mixerRef.current?.setVolumes(effectiveVolumes); }, [effectiveVolumes, results]);

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      if (target?.matches?.('input, textarea, select')) return;
      if (!results) return;
      if (event.code === 'Space') { event.preventDefault(); mixerRef.current?.toggle(); }
      if (event.key.toLowerCase() === 'l') setLoop((value) => ({ ...value, enabled: !value.enabled }));
      if (event.key === 'ArrowLeft') mixerRef.current?.seek(Math.max(0, playhead - 5));
      if (event.key === 'ArrowRight') mixerRef.current?.seek(Math.min(duration, playhead + 5));
      if (event.key.toLowerCase() === 'v') presetMix('vocals');
      if (event.key.toLowerCase() === 'i') presetMix('instrumental');
      if (event.key.toLowerCase() === 'o') presetMix('original');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [results, playhead, duration]);

  const handleFile = useCallback((candidate) => {
    setError('');
    if (!candidate) return;
    if (candidate.size > MAX_MB * 1024 * 1024) return setError(`O arquivo ultrapassa ${MAX_MB} MB. Escolha uma faixa menor.`);
    revokeResults(results);
    setResults(null);
    setAnalysis(null);
    setProcess(null);
    setFile(candidate);
    setHistoryLoaded(false);
    setMarkers([]);
    rawRef.current = null;
  }, [results]);

  const importFromYoutube = async () => {
    setError('');
    if (!isYoutubeUrl(youtubeUrl)) return setError('Cole um link válido do YouTube.');
    if (!youtubeApiConfigured()) {
      return setError('O serviço do YouTube não está disponível no momento. Atualize a página e tente novamente.');
    }
    try {
      setYoutubeImport({ progress: 0, message: 'Preparando importação…' });
      const imported = await importYoutubeAudio(youtubeUrl, {
        onProgress: ({ percent, message }) => setYoutubeImport({ progress: percent ?? 12, message })
      });
      if (imported.size > MAX_MB * 1024 * 1024) throw new Error(`A faixa importada ultrapassa ${MAX_MB} MB.`);
      handleFile(imported);
      setYoutubeImport({ progress: 100, message: 'Faixa do YouTube pronta para análise.' });
    } catch (err) {
      setError(readableError(err));
      setYoutubeImport(null);
    }
  };

  const updateProcess = (progress, stage, message) => {
    const safe = Math.max(0, Math.min(100, progress));
    const elapsed = Math.max(0.1, (performance.now() - processStartRef.current) / 1000);
    const eta = safe > 4 && safe < 100 ? elapsed * ((100 - safe) / safe) : null;
    setProcess({ status: 'processing', progress: safe, stage, message, eta, elapsed });
  };

  const submit = async () => {
    if (!file) return setError('Escolha uma música primeiro.');
    setError('');
    revokeResults(results);
    setResults(null);
    setAnalysis(null);
    rawRef.current = null;
    processStartRef.current = performance.now();

    try {
      updateProcess(1, 'Preparando o motor', 'Verificando o modelo de separação no cache do navegador.');
      await ensureModelCached(({ percent, message }) => {
        const mapped = percent == null ? 6 : Math.max(2, Math.round(percent * 0.12));
        updateProcess(mapped, 'Preparando a inteligência artificial', message);
      });

      updateProcess(14, 'Decodificando a faixa', 'Convertendo o áudio para estéreo em 44,1 kHz dentro do navegador.');
      const originalRaw = await decodeAudioFile(file);
      const demucsInput = cloneRawAudio(originalRaw);
      const audioDuration = rawAudioDuration(originalRaw);

      updateProcess(20, 'Separando as camadas', hw.webgpu ? 'WebGPU ativa — usando aceleração gráfica.' : 'Executando pela CPU. O processamento pode levar alguns minutos.');
      if (!clientRef.current) clientRef.current = new DemucsBrowserClient();
      const tracks = await clientRef.current.split(demucsInput, file.name, QUALITY[quality].overlap, (step, total) => {
        const ratio = total ? step / total : 0;
        updateProcess(20 + Math.round(ratio * 60), 'Separando as camadas', `Analisando trecho ${step} de ${total} com HTDemucs.`);
      });

      if (!tracks.vocals) throw new Error('O motor não retornou a stem vocal.');
      for (const name of ['vocals', 'drums', 'bass', 'other']) {
        if (!tracks[name]) continue;
        const clean = sanitizeRawAudio(tracks[name]);
        if (clean.silent) throw new Error(`A stem ${TRACK_META[name]?.label || name} foi gerada sem sinal de áudio. Tente o modo Equilíbrio.`);
        tracks[name] = clean;
      }
      const instrumental = sanitizeRawAudio(makeInstrumental(tracks));
      if (instrumental.silent) throw new Error('O instrumental foi gerado sem sinal de áudio. Tente o modo Equilíbrio.');
      updateProcess(82, 'Lendo a harmonia', 'Estimando BPM, tonalidade e progressão de acordes.');
      const musicAnalysis = await analyzeMusic(originalRaw, instrumental, (ratio) => {
        updateProcess(82 + Math.round(ratio * 7), 'Lendo a harmonia', 'Mapeando acordes e centro tonal no instrumental.');
      });
      setAnalysis(musicAnalysis);

      updateProcess(90, 'Criando os decks', 'Preparando as stems para reprodução e download.');
      const base = safeBaseName(file.name);
      const allRawAssets = { original: originalRaw, vocals: tracks.vocals, instrumental, drums: tracks.drums, bass: tracks.bass, other: tracks.other };
      const assets = {};
      const originalUrl = URL.createObjectURL(file);
      assets.original = {
        previewBlob: file,
        previewUrl: originalUrl,
        downloadBlob: file,
        downloadUrl: originalUrl,
        name: file.name,
        rawName: 'original'
      };

      const downloadable = outputMode === 'studio' ? ['vocals', 'instrumental', 'drums', 'bass', 'other'] : ['vocals', 'instrumental'];
      let encoded = 0;
      for (const name of downloadable) {
        const raw = allRawAssets[name];
        if (!raw) continue;
        const previewBlob = rawAudioToWavBlob(raw);
        const previewUrl = URL.createObjectURL(previewBlob);
        let downloadBlob = previewBlob;
        let extension = 'wav';
        if (format === 'mp3') {
          updateProcess(92 + Math.round((encoded / downloadable.length) * 6), `Codificando ${TRACK_META[name].label}`, 'Gerando MP3 para download. A reprodução usa WAV para máxima compatibilidade.');
          downloadBlob = await clientRef.current.encodeMp3(cloneRawAudio(raw), `${base}-${name}`);
          extension = 'mp3';
        }
        const downloadUrl = downloadBlob === previewBlob ? previewUrl : URL.createObjectURL(downloadBlob);
        assets[name] = {
          previewBlob,
          previewUrl,
          downloadBlob,
          downloadUrl,
          name: `${base}-${downloadSuffix(name)}.${extension}`,
          rawName: name
        };
        encoded += 1;
      }

      rawRef.current = outputMode === 'studio'
        ? { original: originalRaw, vocals: tracks.vocals, instrumental, drums: tracks.drums, bass: tracks.bass, other: tracks.other }
        : { original: originalRaw, vocals: tracks.vocals, instrumental };

      const elapsed = (performance.now() - processStartRef.current) / 1000;
      const result = {
        id: crypto.randomUUID?.() || `${Date.now()}`,
        originalName: file.name,
        outputMode,
        format,
        duration: audioDuration,
        assets,
        performance: {
          elapsed,
          realtime: elapsed > 0 ? audioDuration / elapsed : null,
          provider: hw.provider,
          quality: QUALITY[quality].label
        }
      };

      setResults(result);
      setDuration(audioDuration);
      setPlayhead(0);
      setExportStart(0);
      setExportEnd(audioDuration);
      setLoop({ enabled: false, start: 0, end: Math.min(audioDuration, 20) });
      setChannels(makeChannelState(outputMode));
      await persistHistory(result, musicAnalysis);
      await refreshHistory();
      setProcess({ status: 'done', progress: 100, stage: 'Separação concluída', message: 'Stems, análise e mixer estão prontos.', eta: 0, elapsed });
    } catch (err) {
      console.error(err);
      const message = readableError(err);
      setError(message);
      setProcess({ status: 'error', progress: 0, stage: 'O processamento parou', message, eta: null });
    }
  };

  const persistHistory = async (result, musicAnalysis) => {
    try {
      const storedAssets = {};
      let totalBytes = 0;
      for (const [name, asset] of Object.entries(result.assets)) {
        const blob = name === 'original' ? file : asset.downloadBlob;
        totalBytes += blob?.size || 0;
      }
      const canStoreAudio = totalBytes <= 70 * 1024 * 1024;
      if (canStoreAudio) {
        for (const [name, asset] of Object.entries(result.assets)) {
          const blob = name === 'original' ? file : asset.downloadBlob;
          if (blob) storedAssets[name] = { blob, name: asset.name || `${name}.wav`, type: blob.type };
        }
      }
      await saveSession({
        id: result.id,
        createdAt: Date.now(),
        originalName: result.originalName,
        outputMode: result.outputMode,
        format: result.format,
        duration: result.duration,
        analysis: musicAnalysis,
        performance: result.performance,
        hasAudio: canStoreAudio && Object.keys(storedAssets).length >= 2,
        assets: canStoreAudio ? storedAssets : {}
      });
    } catch (err) {
      console.warn('Histórico local:', err);
    }
  };

  const openHistory = async (id) => {
    try {
      const session = await getSession(id);
      if (!session?.hasAudio) return;
      reset(true);
      const assets = {};
      for (const [name, stored] of Object.entries(session.assets || {})) {
        const url = URL.createObjectURL(stored.blob);
        assets[name] = { previewBlob: stored.blob, previewUrl: url, downloadBlob: stored.blob, downloadUrl: url, name: stored.name };
      }
      setResults({
        id: session.id,
        originalName: session.originalName,
        outputMode: session.outputMode,
        format: session.format,
        duration: session.duration,
        performance: session.performance,
        assets
      });
      setAnalysis(session.analysis || null);
      setDuration(session.duration || 0);
      setLoop({ enabled: false, start: 0, end: Math.min(session.duration || 0, 20) });
      setExportEnd(session.duration || 0);
      setChannels(makeChannelState(session.outputMode));
      setHistoryLoaded(true);
      rawRef.current = null;
      window.scrollTo({ top: document.body.scrollHeight * 0.35, behavior: 'smooth' });
    } catch (err) {
      setError(`Não foi possível abrir o item do histórico: ${err.message}`);
    }
  };

  const reset = (clearFile = true) => {
    mixerRef.current?.pause();
    revokeResults(results);
    setResults(null);
    setAnalysis(null);
    setProcess(null);
    setError('');
    setPlaying(false);
    setPlayhead(0);
    setDuration(0);
    setPitch(0);
    setSpeed(1);
    setMarkers([]);
    setHistoryLoaded(false);
    setYoutubeImport(null);
    rawRef.current = null;
    if (clearFile) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const presetMix = (preset) => {
    setChannels((current) => {
      const next = Object.fromEntries(Object.entries(current).map(([name, channel]) => [name, { ...channel, solo: false, muted: false, volume: 0 }]));
      if (preset === 'original' && next.original) next.original.volume = 1;
      if (preset === 'vocals' && next.vocals) next.vocals.volume = 1;
      if (preset === 'instrumental' && next.instrumental) next.instrumental.volume = 1;
      if (preset === 'mix') { if (next.vocals) next.vocals.volume = 1; if (next.instrumental) next.instrumental.volume = 1; }
      if (preset === 'studio') ['vocals', 'drums', 'bass', 'other'].forEach((name) => { if (next[name]) next[name].volume = 0.9; });
      return next;
    });
  };

  const setVolume = (name, volume) => setChannels((current) => ({ ...current, [name]: { ...current[name], volume } }));
  const toggleMute = (name) => setChannels((current) => ({ ...current, [name]: { ...current[name], muted: !current[name].muted } }));
  const toggleSolo = (name) => setChannels((current) => ({ ...current, [name]: { ...current[name], solo: !current[name].solo } }));

  const directDownload = (name) => {
    const asset = results?.assets?.[name];
    if (!asset?.downloadUrl) return setError(`O download de ${TRACK_META[name]?.label || name} não foi gerado nesta sessão.`);
    const anchor = document.createElement('a');
    anchor.href = asset.downloadUrl;
    anchor.download = asset.name || `${name}.${results.format}`;
    anchor.click();
  };

  const exportSegment = async () => {
    if (!results) return;
    setExporting(true);
    setError('');
    try {
      let raw = rawRef.current?.[exportTrack];
      if (!raw) {
        const blob = results.assets?.[exportTrack]?.downloadBlob || results.assets?.[exportTrack]?.previewBlob;
        if (!blob) throw new Error('Essa stem não está disponível para exportação.');
        raw = await decodeAudioFile(blob);
      }
      const segment = sliceRawAudio(raw, exportStart, exportEnd);
      let blob;
      let ext;
      if (format === 'mp3') {
        if (!clientRef.current) clientRef.current = new DemucsBrowserClient();
        blob = await clientRef.current.encodeMp3(cloneRawAudio(segment), 'stemlab-recorte');
        ext = 'mp3';
      } else {
        blob = rawAudioToWavBlob(segment);
        ext = 'wav';
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeBaseName(results.originalName)}-${exportTrack}-${formatDuration(exportStart).replace(':', '-')}-${formatDuration(exportEnd).replace(':', '-')}.${ext}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setExporting(false);
    }
  };

  const addMarker = () => {
    setMarkers((current) => [...current, { id: crypto.randomUUID?.() || `${Date.now()}`, time: playhead, type: markerType }].sort((a, b) => a.time - b.time));
  };

  const installPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  const busy = process?.status === 'processing';
  const headline = useMemo(() => file ? file.name.replace(/\.[^.]+$/, '') : 'Sinal original', [file]);
  const studioTracks = ['vocals', 'drums', 'bass', 'other'];
  const simpleTracks = ['vocals', 'instrumental'];
  const visibleTracks = results?.outputMode === 'studio' ? studioTracks : simpleTracks;
  const shiftedKey = analysis?.key ? `${transposeNote(analysis.key, pitch)} ${analysis.mode === 'minor' ? 'menor' : 'maior'}` : '—';

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" /><div className="ambient ambient--two" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="StemLab"><span className="brand-mark"><i /><i /><i /><i /></span><span><strong>STEM<span>LAB</span></strong><small>NEXO / MUSIC LAB</small></span></a>
        <div className="topbar-right">
          {installPrompt && <button className="install-button" onClick={installPwa}><Icon name="install" size={16} /> Instalar app</button>}
          <span className={`runtime-pill ${hw.webgpu ? 'is-gpu' : 'is-cpu'}`}><i /> {hw.provider.toUpperCase()} <b>LOCAL</b></span>
          <button className="theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span>05</span> MUSIC INTELLIGENCE LAB</div>
            <h1>Separe. Analise.<br /><em>Estude a música.</em></h1>
            <p>Voz, instrumental e stems individuais com <strong>mixer sincronizado</strong>, BPM, tom, acordes, loop e transposição — tudo processado no seu navegador.</p>
            <div className="hero-meta"><span><Icon name="shield" size={15} /> ÁUDIO LOCAL</span><span><Icon name="spark" size={15} /> IA NO NAVEGADOR</span><span><Icon name="sliders" size={15} /> MIXER + ESTUDO</span></div>
          </div>
          <div className="hero-machine" aria-hidden="true">
            <div className="machine-label">SIGNAL / DECOMPOSITION / ANALYSIS</div>
            <div className="machine-core"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" /><div className="core-disc"><span>AI</span><small>HTD</small></div><div className="node node-original">MIX<i /></div><div className="node node-vocal">VOX<i /></div><div className="node node-inst">STEMS<i /></div></div>
            <div className="machine-footer"><span>INPUT</span><i /><span>WEBGPU</span><i /><span>MUSIC LAB</span></div>
          </div>
        </section>

        <section className="engine-notice">
          <div className={`engine-dot ${hw.webgpu ? 'online' : 'fallback'}`} />
          <div><span className="mini-label">STEMLAB COMPUTE ENGINE</span><strong>{hw.webgpu ? 'Aceleração WebGPU disponível' : 'Modo compatibilidade por CPU'}</strong><p>{hw.message}</p></div>
          <div className="engine-badges"><span>HTDEMUCS</span><span>ONNX</span><span>{hw.webgpu ? 'GPU' : 'CPU'}</span><span>PWA</span></div>
        </section>

        <section className="workspace" id="workspace">
          <div className="workspace-heading"><div><span className="section-no">01</span><p>ENTRADA DE SINAL</p></div><h2>Escolha uma faixa para <em>decompor.</em></h2></div>
          <div className="console-layout">
            <div className="console-main">
              {!file ? (
                <div className="input-source-shell">
                  <div className="input-source-tabs">
                    <button className={inputMode === 'file' ? 'active' : ''} onClick={() => setInputMode('file')}><Icon name="upload" size={15} /> Arquivo</button>
                    <button className={inputMode === 'youtube' ? 'active' : ''} onClick={() => setInputMode('youtube')}><Icon name="youtube" size={16} /> YouTube</button>
                  </div>
                  {inputMode === 'file' ? (
                    <button className={`drop-zone ${dragging ? 'is-dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }} type="button">
                      <span className="drop-corners"><i /><i /><i /><i /></span><span className="drop-icon"><Icon name="upload" size={28} /></span><strong>Arraste sua música aqui</strong><p>ou clique para selecionar</p><small>MP3 · WAV · FLAC · M4A · AAC · OGG · OPUS · WEBM / ATÉ {MAX_MB} MB</small>
                    </button>
                  ) : (
                    <div className="youtube-import-panel">
                      <div className="youtube-symbol"><Icon name="youtube" size={34} /></div>
                      <span className="mini-label">IMPORTAR / YOUTUBE</span>
                      <h3>Cole o link da música</h3>
                      <p>O StemLab busca somente o áudio e o entrega ao mesmo motor de separação usado no upload.</p>
                      <div className="youtube-recommendation">
                        <div className="youtube-recommendation-icon"><Icon name="alert" size={18} /></div>
                        <div>
                          <strong>Para melhor desempenho, prefira o arquivo MP3.</strong>
                          <span>A importação pelo YouTube pode apresentar instabilidades e levar mais tempo para preparar a música. Sempre que possível, use a opção <b>Arquivo</b> e envie o MP3 diretamente.</span>
                        </div>
                        <button type="button" onClick={() => setInputMode('file')}><Icon name="upload" size={14} /> USAR ARQUIVO MP3</button>
                      </div>
                      <div className="youtube-url-row"><Icon name="link" size={18} /><input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') importFromYoutube(); }} placeholder="https://www.youtube.com/watch?v=..." /><button disabled={!youtubeUrl || Boolean(youtubeImport && youtubeImport.progress < 100)} onClick={importFromYoutube}>{youtubeImport && youtubeImport.progress < 100 ? 'IMPORTANDO…' : 'IMPORTAR'}</button></div>
                      {youtubeImport && <div className="youtube-progress"><span style={{ width: `${youtubeImport.progress || 8}%` }} /><small>{youtubeImport.message}</small></div>}
                      <small className="youtube-note">Use somente conteúdo que você tenha autorização para processar. A importação depende do serviço remoto configurado no projeto.</small>
                    </div>
                  )}
                </div>
              ) : (
                <div className="loaded-track">
                  <div className="track-head"><div className="track-disc"><Icon name="music" size={20} /><i /></div><div className="track-info"><span className="mini-label">INPUT / ORIGINAL MIX</span><h3 title={file.name}>{headline}</h3><p>{file.name} · {formatBytes(file.size)}</p></div><button disabled={busy} onClick={() => reset()} aria-label="Remover arquivo">×</button></div>
                  <Waveform file={file} active={busy} />
                </div>
              )}
              <input ref={inputRef} hidden type="file" accept={ACCEPT} onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
            <aside className="console-settings">
              <div><span className="setting-title">MODO DE IA</span><div className="segmented">{Object.entries(QUALITY).map(([key, option]) => <button key={key} disabled={busy} className={quality === key ? 'active' : ''} onClick={() => setQuality(key)}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div></div>
              <div><span className="setting-title">SAÍDA</span><div className="segmented segmented--two"><button disabled={busy} className={outputMode === 'simple' ? 'active' : ''} onClick={() => setOutputMode('simple')}><strong>Simples</strong><small>voz + instrumental</small></button><button disabled={busy} className={outputMode === 'studio' ? 'active' : ''} onClick={() => setOutputMode('studio')}><strong>Studio</strong><small>4 stems + instrumental</small></button></div></div>
              <div><span className="setting-title">FORMATO</span><div className="format-row format-row--two">{['mp3', 'wav'].map((value) => <button key={value} disabled={busy} className={format === value ? 'active' : ''} onClick={() => setFormat(value)}>{value.toUpperCase()}</button>)}</div></div>
              <button className="separate-button" disabled={!file || busy} onClick={submit}><span>{busy ? 'PROCESSANDO…' : 'INICIAR ANÁLISE'}</span><span className="button-glyph"><Icon name="spark" size={18} /></span></button>
            </aside>
          </div>
          {error && <div className="error-box"><Icon name="alert" size={17} /><span>{error}</span></div>}
        </section>

        {process?.status === 'processing' && <ProgressConsole process={process} />}

        {results && (
          <section className="lab-section" id="lab">
            <div className="workspace-heading"><div><span className="section-no">02</span><p>MUSIC LAB</p></div><h2>Da separação ao <em>estudo.</em></h2></div>

            <div className="analysis-dashboard">
              <article><span>BPM ESTIMADO</span><strong>{analysis?.bpm || '—'}</strong><small>tempo da faixa</small></article>
              <article><span>TONALIDADE</span><strong>{shiftedKey}</strong><small>{pitch ? `transposto ${pitch > 0 ? '+' : ''}${pitch}` : 'original'}</small></article>
              <article><span>DURAÇÃO</span><strong>{formatDuration(duration || results.duration)}</strong><small>áudio analisado</small></article>
              <article><span>ENGINE</span><strong>{results.performance?.provider || hw.provider}</strong><small>{results.performance?.realtime ? `${results.performance.realtime.toFixed(2)}× realtime` : 'processamento local'}</small></article>
            </div>

            <div className="transport-panel">
              <div className="transport-main">
                <button className="play-main" onClick={() => mixerRef.current?.toggle()}>{playing ? <Icon name="pause" size={22} /> : <Icon name="play" size={22} />}</button>
                <div className="transport-time"><strong>{formatDuration(playhead)}</strong><span>/ {formatDuration(duration)}</span></div>
                <input className="transport-range" type="range" min="0" max={Math.max(0.1, duration)} step="0.01" value={Math.min(playhead, duration || 0)} onChange={(e) => mixerRef.current?.seek(Number(e.target.value))} />
                <button className={loop.enabled ? 'transport-toggle active' : 'transport-toggle'} onClick={() => setLoop((value) => ({ ...value, enabled: !value.enabled }))}><Icon name="loop" size={16} /> LOOP</button>
              </div>
              <div className="study-controls">
                <label><span>VELOCIDADE</span><select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[0.5, 0.65, 0.75, 0.85, 1, 1.1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
                <label className="pitch-control"><span>TRANSPOR TOM</span><button onClick={() => setPitch(Math.max(-12, pitch - 1))}>−</button><strong>{pitch > 0 ? `+${pitch}` : pitch}</strong><button onClick={() => setPitch(Math.min(12, pitch + 1))}>+</button></label>
                <label><span>LOOP INÍCIO</span><input type="number" min="0" max={duration} step="0.1" value={Number(loop.start.toFixed(1))} onChange={(e) => setLoop((value) => ({ ...value, start: Number(e.target.value) }))} /></label>
                <label><span>LOOP FIM</span><input type="number" min="0" max={duration} step="0.1" value={Number(loop.end.toFixed(1))} onChange={(e) => setLoop((value) => ({ ...value, end: Number(e.target.value) }))} /></label>
              </div>
              <div className="preset-row"><span>COMPARAR</span><button onClick={() => presetMix('original')}>Original</button><button onClick={() => presetMix('vocals')}>Voz</button><button onClick={() => presetMix('instrumental')}>Instrumental</button><button onClick={() => presetMix('mix')}>Voz + Inst.</button>{results.outputMode === 'studio' && <button onClick={() => presetMix('studio')}>4 Stems</button>}<span className="preset-spacer" /><button onClick={() => setLoop((value) => ({ ...value, start: playhead }))}>Loop início = cursor</button><button onClick={() => setLoop((value) => ({ ...value, end: Math.max(value.start + .25, playhead) }))}>Loop fim = cursor</button></div>
            </div>

            <section className="mixer-section">
              <div className="panel-title-row"><div><span className="mini-label">MIXER SINCRONIZADO</span><h3>{results.outputMode === 'studio' ? 'StemLab Studio Console' : 'Voz + Instrumental'}</h3></div><span className="shortcut-hint">ESPAÇO play · L loop · V voz · I instrumental · O original</span></div>
              <div className={`mixer-grid ${results.outputMode === 'studio' ? 'mixer-grid--studio' : ''}`}>
                {visibleTracks.map((name) => <TrackChannel key={name} name={name} asset={results.assets[name]} raw={rawRef.current?.[name]} state={channels[name]} effectiveVolume={effectiveVolumes[name]} onVolume={setVolume} onMute={toggleMute} onSolo={toggleSolo} onDownload={directDownload} playhead={playhead} duration={duration} loop={loop} onSeek={(time) => mixerRef.current?.seek(time)} />)}
              </div>
            </section>

            <section className="harmony-section">
              <div className="panel-title-row"><div><span className="mini-label">ANÁLISE HARMÔNICA</span><h3>Linha do tempo de acordes</h3></div><span className="analysis-warning">estimativa automática · pode variar conforme a mixagem</span></div>
              <ChordTimeline analysis={analysis} pitch={pitch} currentTime={playhead} onSeek={(time) => mixerRef.current?.seek(time)} />
            </section>

            <section className="markers-section">
              <div className="panel-title-row"><div><span className="mini-label">MAPA DA MÚSICA</span><h3>Marque intro, versos e refrões</h3></div></div>
              <div className="marker-toolbar"><select value={markerType} onChange={(e) => setMarkerType(e.target.value)}>{SECTION_TYPES.map((type) => <option key={type}>{type}</option>)}</select><button onClick={addMarker}><Icon name="marker" size={15} /> Marcar em {formatDuration(playhead)}</button></div>
              <div className="marker-track">{markers.length === 0 ? <p>Use o player e marque os pontos importantes da estrutura musical.</p> : markers.map((marker) => <button key={marker.id} style={{ left: `${duration ? (marker.time / duration) * 100 : 0}%` }} onClick={() => mixerRef.current?.seek(marker.time)}><i /><strong>{marker.type}</strong><small>{formatDuration(marker.time)}</small></button>)}</div>
            </section>

            <section className="export-section">
              <div className="panel-title-row"><div><span className="mini-label">EXPORT LAB</span><h3>Baixe a faixa inteira ou apenas um trecho</h3></div></div>
              <div className="export-grid">
                <label><span>STEM</span><select value={exportTrack} onChange={(e) => setExportTrack(e.target.value)}>{Object.keys(results.assets).filter((name) => name !== 'original').map((name) => <option key={name} value={name}>{TRACK_META[name]?.label || name}</option>)}</select></label>
                <label><span>INÍCIO (s)</span><input type="number" min="0" max={duration} step="0.1" value={exportStart} onChange={(e) => setExportStart(Number(e.target.value))} /></label>
                <label><span>FIM (s)</span><input type="number" min="0" max={duration} step="0.1" value={exportEnd} onChange={(e) => setExportEnd(Number(e.target.value))} /></label>
                <button disabled={exporting || exportEnd <= exportStart} onClick={exportSegment}><Icon name="download" size={17} /> {exporting ? 'EXPORTANDO…' : `EXPORTAR TRECHO ${format.toUpperCase()}`}</button>
              </div>
              <div className="download-all-row">{Object.keys(results.assets).filter((name) => results.assets[name]?.downloadUrl && name !== 'original').map((name) => <button key={name} onClick={() => directDownload(name)}><Icon name="download" size={14} /> {TRACK_META[name]?.label || name}</button>)}</div>
            </section>

            <section className="performance-panel">
              <div><span>PROCESSAMENTO</span><strong>{results.performance?.elapsed ? `${results.performance.elapsed.toFixed(1)}s` : '—'}</strong></div><div><span>VELOCIDADE RELATIVA</span><strong>{results.performance?.realtime ? `${results.performance.realtime.toFixed(2)}×` : '—'}</strong></div><div><span>MODO</span><strong>{results.performance?.quality || '—'}</strong></div><div><span>PRIVACIDADE</span><strong>LOCAL</strong></div>
              <button onClick={() => reset()}><Icon name="reset" size={16} /> Nova música</button>
            </section>
          </section>
        )}

        <HistoryDrawer items={history} onOpen={openHistory} onDelete={async (id) => { await deleteSession(id); refreshHistory(); }} onClear={async () => { await clearSessions(); refreshHistory(); }} />
      </main>

      <footer><div className="footer-brand"><span className="brand-mark brand-mark--small"><i /><i /><i /><i /></span><strong>STEMLAB</strong></div><p>NEXO AUDIO / MUSIC INTELLIGENCE LAB</p><span>PROCESSAMENTO LOCAL · 2026</span></footer>
    </div>
  );
}

function makeChannelState(mode = 'simple') {
  const state = {};
  for (const name of Object.keys(TRACK_META)) state[name] = { volume: 0, muted: false, solo: false };
  if (mode === 'studio') {
    ['vocals', 'drums', 'bass', 'other'].forEach((name) => { state[name].volume = 0.9; });
  } else {
    state.vocals.volume = 1;
    state.instrumental.volume = 1;
  }
  return state;
}

function downloadSuffix(name) {
  return { vocals: 'voz', instrumental: 'instrumental', drums: 'bateria', bass: 'baixo', other: 'outros' }[name] || name;
}

function revokeResults(results) {
  if (!results?.assets) return;
  const urls = new Set();
  for (const asset of Object.values(results.assets)) {
    if (asset?.previewUrl) urls.add(asset.previewUrl);
    if (asset?.downloadUrl) urls.add(asset.downloadUrl);
  }
  for (const url of urls) if (String(url).startsWith('blob:')) URL.revokeObjectURL(url);
}

function readableError(error) {
  const text = String(error?.message || error || 'Erro desconhecido.');
  if (/memory|allocation|out of memory/i.test(text)) return 'O navegador ficou sem memória para processar esta faixa. Feche outras abas ou teste uma música menor.';
  if (/webgpu|device lost/i.test(text)) return 'A GPU interrompeu o processamento. Recarregue a página ou tente novamente pelo modo CPU/compatibilidade.';
  if (/decode|codec|EncodingError/i.test(text)) return 'O navegador não conseguiu decodificar esse formato de áudio. Tente MP3, WAV ou outro arquivo.';
  if (/YOUTUBE_API_NOT_CONFIGURED|serviço remoto do YouTube/i.test(text)) return 'O serviço do YouTube não está disponível no momento. Atualize a página e tente novamente.';
  return text;
}
