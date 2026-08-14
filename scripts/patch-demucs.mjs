import fs from 'node:fs';

const file = process.argv[2] || 'vendor/demucs-js/web/worker.ts';
let source = fs.readFileSync(file, 'utf8');

const edits = [
  ["let { id, fileName, rawAudio } = e.data;", "let { id, fileName, rawAudio, overlap = 0.25 } = e.data;"],
  ["let tracks = await split(rawAudio, progress);", "let tracks = await split(rawAudio, progress, overlap);"],
  ["async function split(rawAudio: RawAudio, progress: ProgressCallback) {", "async function split(rawAudio: RawAudio, progress: ProgressCallback, overlap = 0.25) {"],
  ["return await separateTracks(model, rawAudio, progress);", "return await separateTracks(model, rawAudio, progress, overlap);"]
];

for (const [from, to] of edits) {
  if (!source.includes(from)) {
    throw new Error(`Não foi possível aplicar patch do Demucs. Trecho não encontrado: ${from}`);
  }
  source = source.replace(from, to);
}

fs.writeFileSync(file, source);
console.log('Demucs web worker ajustado para receber overlap configurável.');
