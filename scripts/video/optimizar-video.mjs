#!/usr/bin/env node
/**
 * Optimiza el vídeo de un evento para la web: genera la versión MP4 H.264
 * (siempre) y la versión AV1 (opcional en la web, se genera siempre aquí),
 * eligiendo la calidad con mediciones VMAF en lugar de a ojo.
 *
 *   node scripts/video/optimizar-video.mjs /ruta/al/video_final.mp4
 *
 * Deja junto al original:
 *   <nombre>_h264.mp4     versión que se sube SIEMPRE
 *   <nombre>_av1.mp4      versión AV1 (el informe dice si compensa subirla)
 *   <nombre>_informe.md   mediciones, decisiones y siguiente paso
 * (<nombre> es el del original sin el sufijo «_final», si lo tiene.)
 *
 * Guía completa: docs/eventos-video/00-optimizacion-automatica.md
 *
 * Reglas que no son evidentes y que este script encarna (medidas el 28/09/2026,
 * ver docs/eventos-video/01-optimizar-video-ubuntu.md):
 *   · El color se etiqueta con `setparams`, NUNCA con `-colorspace/-color_*`
 *     como opciones de salida: con un original sin etiquetar, esas opciones
 *     CONVIERTEN los colores (luma a 22 dB de PSNR frente al original).
 *   · Las dos entradas de cada medición llevan la misma etiqueta; si no,
 *     ffmpeg convierte una antes de comparar y el VMAF sale falso.
 *   · VMAF no ve un desplazamiento de color (puntuaba 100 un vídeo con el color
 *     alterado): por eso se mide también la PSNR de luma y se aborta si cae.
 *   · El audio se copia si ya es AAC: es música, no se recomprime.
 *
 * Sin dependencias: solo Node y un ffmpeg con libx264, libsvtav1 y libvmaf
 * (el estático de BtbN en ~/opt, ver la guía). Se ejecuta en el equipo, no en
 * Docker. Reanudable: si se interrumpe, al relanzarlo reutiliza lo ya medido y
 * lo ya codificado.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// --------------------------------------------------------------------------
// Parámetros del proceso
// --------------------------------------------------------------------------
const TAG = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
const H264_PRESET = 'slow';
const H264_CRFS = [22, 20, 18, 16];      // de menos a más calidad: se elige el primero que cumple
const H264_MAXRATE = '8M';
const H264_BUFSIZE = '16M';
const AV1_PRESET = 4;
const AV1_CRF_START = 30;
const AV1_CRF_MIN = 22;
const AV1_CRF_MAX = 36;
const AV1_CRF_STEP = 2;
const WINDOW_SECONDS = 30;               // duración de cada fragmento de prueba
const VMAF_MIN_MEAN = 95;                // «prácticamente indistinguible»
const VMAF_MIN_P1 = 90;                  // el 1 % de fotogramas peor tratados
const PSNR_COLOR_GUARD = 35;             // por debajo, algo ha alterado el color
const AV1_MAX_VMAF_DROP = 1;             // AV1 «a igual calidad» que el H.264
const AV1_MIN_SAVINGS = 0.25;            // por debajo, no compensa subirlo
const AUDIO_FALLBACK_BITRATE = '256k';   // solo si el original no trae AAC
const MAX_HEIGHT = 1080;
const NICE = 10;                         // el escritorio sigue respondiendo

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const positional = args.filter((a) => !a.startsWith('--'));

const HELP = `Uso: node scripts/video/optimizar-video.mjs <video> [opciones]

Opciones:
  --sin-av1     No genera la versión AV1.
  --rapido      Omite la medición VMAF del archivo completo (más rápido).
  --forzar      Vuelve a codificar aunque las salidas ya existan.
  --conservar   No borra la carpeta de trabajo al terminar.
  --ayuda       Muestra esta ayuda.

Guía: docs/eventos-video/00-optimizacion-automatica.md`;

if (flag('--ayuda') || flag('-h') || positional.length !== 1) {
  console.log(HELP);
  process.exit(positional.length === 1 || flag('--ayuda') ? 0 : 1);
}

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const step = (n, text) => console.log(`\n${c.bold(`[${n}] ${text}`)}`);
const info = (text) => console.log(`    ${text}`);
const ok = (text) => console.log(`    ${c.green('✓')} ${text}`);
const warnings = [];
const warn = (text) => { warnings.push(text); console.log(`    ${c.yellow('⚠')} ${text}`); };
const fail = (text) => { console.error(`\n${c.red('✗ ' + text)}\n`); process.exit(1); };
const fmtMB = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const fmtDuration = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m > 0 ? `${m} min ${r} s` : `${r} s`;
};
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Ejecuta un proceso. `live` muestra su stderr (progreso de ffmpeg) en pantalla. */
function run(bin, argv, { live = false, env = {}, niced = false } = {}) {
  return new Promise((resolve, reject) => {
    const [cmd, cmdArgs] = niced ? ['nice', ['-n', String(NICE), bin, ...argv]] : [bin, argv];
    const child = spawn(cmd, cmdArgs, {
      stdio: ['ignore', 'pipe', live ? 'inherit' : 'pipe'],
      env: { ...process.env, ...env },
    });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    if (!live) child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code !== 0) {
        reject(new Error(`${path.basename(bin)} terminó con código ${code}\n${stderr.slice(-2000)}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// --------------------------------------------------------------------------
// ffmpeg: localizar y comprobar
// --------------------------------------------------------------------------
async function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_DIR,
    path.join(os.homedir(), 'opt', 'ffmpeg-master-latest-linux64-gpl', 'bin'),
    ...String(process.env.PATH || '').split(':'),
  ].filter(Boolean);
  for (const dir of candidates) {
    const ffmpeg = path.join(dir, 'ffmpeg');
    const ffprobe = path.join(dir, 'ffprobe');
    if (!fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe)) continue;
    try {
      const enc = (await run(ffmpeg, ['-hide_banner', '-encoders'])).stdout;
      const fil = (await run(ffmpeg, ['-hide_banner', '-filters'])).stdout;
      if (/libx264/.test(enc) && /libsvtav1/.test(enc) && /libvmaf/.test(fil)) {
        const version = (await run(ffmpeg, ['-hide_banner', '-version'])).stdout.split('\n')[0];
        return { ffmpeg, ffprobe, version };
      }
    } catch { /* candidato inservible: se prueba el siguiente */ }
  }
  return null;
}

// --------------------------------------------------------------------------
// MP4: ¿está el índice (moov) antes que los datos (mdat)?
// --------------------------------------------------------------------------
function moovBeforeMdat(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const header = Buffer.alloc(16);
    let pos = 0;
    while (pos + 8 <= size) {
      fs.readSync(fd, header, 0, 16, pos);
      let boxSize = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (boxSize === 1) boxSize = Number(header.readBigUInt64BE(8));
      else if (boxSize === 0) return false;
      if (boxSize < 8) return false;
      pos += boxSize;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

// --------------------------------------------------------------------------
// Preparación
// --------------------------------------------------------------------------
const input = path.resolve(positional[0]);
if (!fs.existsSync(input)) fail(`No existe el archivo: ${input}`);
const dir = path.dirname(input);
const base = path.basename(input, path.extname(input)).replace(/[_-]final$/i, '');
const outH264 = path.join(dir, `${base}_h264.mp4`);
const outAv1 = path.join(dir, `${base}_av1.mp4`);
const outReport = path.join(dir, `${base}_informe.md`);
const workDir = path.join(dir, `.${base}-optimizacion`);
const vmafTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'optvid-'));
const withAv1 = !flag('--sin-av1');
const threads = os.cpus().length;
const t0 = Date.now();

console.log(c.bold(`Optimización de vídeo para eventos — ${path.basename(input)}`));

step(1, 'Herramientas');
const tools = await findFfmpeg();
if (!tools) {
  fail(`No encuentro un ffmpeg con libx264, libsvtav1 y libvmaf.
  Instálalo (una sola vez):
    mkdir -p ~/opt && cd ~/opt
    wget https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz
    tar xf ffmpeg-master-latest-linux64-gpl.tar.xz`);
}
const { ffmpeg, ffprobe } = tools;
tools.version = tools.version.replace(/\s+Copyright.*$/, '');
ok(tools.version);
ok(`${threads} hilos · prioridad baja (nice ${NICE}) para no bloquear el escritorio`);

// Carpeta de trabajo, invalidada si el original cambia
const sourceStat = fs.statSync(input);
const fingerprint = { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs };
const fpFile = path.join(workDir, 'fuente.json');
if (fs.existsSync(fpFile)) {
  const prev = JSON.parse(fs.readFileSync(fpFile, 'utf8'));
  if (prev.size !== fingerprint.size || prev.mtimeMs !== fingerprint.mtimeMs) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
fs.mkdirSync(path.join(workDir, 'pruebas'), { recursive: true });
fs.writeFileSync(fpFile, JSON.stringify(fingerprint));

const freeBytes = (() => {
  try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch { return null; }
})();
if (freeBytes !== null) {
  if (freeBytes < sourceStat.size) fail(`Espacio insuficiente en ${dir}: ${fmtMB(freeBytes)} libres, hacen falta al menos ${fmtMB(sourceStat.size)}.`);
  ok(`${fmtMB(freeBytes)} libres en disco`);
}

// --------------------------------------------------------------------------
step(2, 'Inspección del original');
const probe = JSON.parse((await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input])).stdout);
const vs = probe.streams.find((s) => s.codec_type === 'video');
const as = probe.streams.find((s) => s.codec_type === 'audio');
if (!vs) fail('El archivo no tiene pista de vídeo.');
const duration = Number(probe.format.duration);
const [fpsNum, fpsDen] = String(vs.avg_frame_rate || vs.r_frame_rate).split('/').map(Number);
const fps = fpsDen ? fpsNum / fpsDen : fpsNum;
const gop = Math.round(fps * 2);
const keyintMin = Math.round(fps);
const unknownOr = (v, ...ok) => !v || v === 'unknown' || v === 'unspecified' || ok.includes(v);

info(`${vs.codec_name} ${vs.profile || ''} · ${vs.width}×${vs.height} · ${round(fps, 3)} fps · ${vs.pix_fmt} · ${fmtDuration(duration)}`);
info(`color: primaries=${vs.color_primaries || '—'} trc=${vs.color_transfer || '—'} matrix=${vs.color_space || '—'} range=${vs.color_range || '—'}`);
info(as ? `audio: ${as.codec_name} · ${as.sample_rate} Hz · ${as.channels} canales · ${Math.round(Number(as.bit_rate || 0) / 1000)} kb/s` : 'sin audio');

if (vs.field_order && !['progressive', 'unknown'].includes(vs.field_order)) {
  fail(`Vídeo entrelazado (${vs.field_order}). Exporta una versión progresiva desde el editor.`);
}
if (['smpte2084', 'arib-std-b67'].includes(vs.color_transfer) || vs.color_primaries === 'bt2020') {
  fail('El original es HDR (PQ/HLG o BT.2020). Exporta desde el editor una versión SDR Rec.709: convertir HDR a SDR exige un mapeo de tonos que este proceso no hace.');
}
if (!unknownOr(vs.color_primaries, 'bt709') || !unknownOr(vs.color_transfer, 'bt709') || !unknownOr(vs.color_space, 'bt709')) {
  fail('El original declara un espacio de color distinto de BT.709. Exporta desde el editor en Rec.709.');
}
if (vs.color_range === 'pc') {
  fail('El original declara rango completo (pc). Exporta desde el editor con rango de vídeo (limitado).');
}
if (unknownOr(vs.color_primaries) && unknownOr(vs.color_transfer) && unknownOr(vs.color_space)) {
  ok('color sin etiquetar: se etiqueta BT.709 sin alterar los píxeles (setparams)');
} else {
  ok('color BT.709');
}
const scaleDown = Number(vs.height) > MAX_HEIGHT;
const vfBase = scaleDown ? `${TAG},scale=-2:${MAX_HEIGHT}:flags=lanczos` : TAG;
if (scaleDown) warn(`El original mide ${vs.height} px de alto: se reduce a ${MAX_HEIGHT} px (tamaño máximo razonable para un pase web).`);
const outHeight = scaleDown ? MAX_HEIGHT : Number(vs.height);
const h264Level = outHeight <= 1080 && fps <= 30.01 ? '4.1' : outHeight <= 1080 && fps <= 60.01 ? '4.2' : null;

let audioArgs;
if (!as) {
  audioArgs = ['-an'];
} else if (as.codec_name === 'aac') {
  audioArgs = ['-map', '0:a:0', '-c:a', 'copy'];
  ok('audio AAC: se copia sin recomprimir');
} else {
  audioArgs = ['-map', '0:a:0', '-c:a', 'aac', '-b:a', AUDIO_FALLBACK_BITRATE];
  warn(`El audio es ${as.codec_name}, que un MP4 web no admite bien: se convierte a AAC ${AUDIO_FALLBACK_BITRATE}.`);
}
info(moovBeforeMdat(input) ? 'índice (moov) al principio' : 'índice (moov) al final: las salidas lo llevarán al principio');

// --------------------------------------------------------------------------
step(3, 'Análisis del contenido (complejidad y luminosidad por minuto)');
const analysisFile = path.join(workDir, 'analisis.json');
let analysis;
if (fs.existsSync(analysisFile)) {
  analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
  ok('reutilizado de una ejecución anterior');
} else {
  info('Pasada rápida a 360p: los bits que necesita cada minuto miden lo difícil que es de comprimir…');
  const crc = (await run(ffmpeg, ['-hide_banner', '-v', 'error', '-i', input, '-an', '-vf', 'scale=640:-2',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-g', String(gop), '-f', 'framecrc', '-'], { niced: true })).stdout;
  let tbNum = 1; let tbDen = 1;
  const bits = {};
  for (const line of crc.split('\n')) {
    const tb = line.match(/^#tb 0: (\d+)\/(\d+)/);
    if (tb) { tbNum = Number(tb[1]); tbDen = Number(tb[2]); continue; }
    if (!/^0,/.test(line)) continue;
    const p = line.split(',').map((s) => s.trim());
    const t = (Number(p[2]) * tbNum) / tbDen;
    const minute = Math.floor(t / 60);
    bits[minute] = (bits[minute] || 0) + Number(p[4]) * 8;
  }
  info('Luminosidad media de los fotogramas clave…');
  const lumaFile = path.join(vmafTmp, 'luma.txt');
  await run(ffmpeg, ['-hide_banner', '-v', 'error', '-skip_frame', 'nokey', '-i', input,
    '-vf', `signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${lumaFile}`, '-an', '-f', 'null', '-'], { niced: true });
  const luma = {};
  let t = null;
  for (const line of fs.readFileSync(lumaFile, 'utf8').split('\n')) {
    const mt = line.match(/pts_time:([\d.]+)/);
    if (mt) { t = Number(mt[1]); continue; }
    const my = line.match(/YAVG=([\d.]+)/);
    if (my && t !== null) (luma[Math.floor(t / 60)] ||= []).push(Number(my[1]));
  }
  const minutes = Object.keys(bits).map(Number).sort((a, b) => a - b)
    .filter((m) => duration - m * 60 >= WINDOW_SECONDS + 5)       // el minuto debe contener un fragmento entero
    .map((m) => ({
      minute: m,
      complexity: Math.round(bits[m] / Math.min(60, duration - m * 60) / 1000),
      luma: luma[m] ? round(luma[m].reduce((a, b) => a + b, 0) / luma[m].length, 1) : null,
    }));
  analysis = { minutes };
  fs.writeFileSync(analysisFile, JSON.stringify(analysis, null, 2));
  ok(`${minutes.length} minutos analizados`);
}

// Elección de fragmentos: el más complejo, el más oscuro con contenido real
// (no un fundido a negro) y uno típico.
function chooseWindows(minutes) {
  if (minutes.length === 0) {
    const len = Math.min(WINDOW_SECONDS, Math.floor(duration));
    return [{ kind: 'único', start: Math.max(0, Math.floor(duration / 2 - len / 2)), len }];
  }
  const byComplexity = [...minutes].sort((a, b) => a.complexity - b.complexity);
  const q = (p) => byComplexity[Math.min(byComplexity.length - 1, Math.floor(p * byComplexity.length))].complexity;
  const chosen = [];
  const add = (m, kind) => { if (m && !chosen.some((w) => w.minute === m.minute)) chosen.push({ ...m, kind }); };
  add(byComplexity[byComplexity.length - 1], 'compleja');
  const lit = minutes.filter((m) => m.luma !== null && m.complexity >= q(0.25));
  add([...lit].sort((a, b) => a.luma - b.luma)[0], 'oscura');
  const median = q(0.5);
  add([...minutes].filter((m) => !chosen.some((w) => w.minute === m.minute))
    .sort((a, b) => Math.abs(a.complexity - median) - Math.abs(b.complexity - median))[0], 'típica');
  return chosen.map((m) => ({ ...m, start: m.minute * 60 + Math.floor((60 - WINDOW_SECONDS) / 2), len: WINDOW_SECONDS }));
}
const windows = chooseWindows(analysis.minutes);
for (const w of windows) {
  info(`fragmento ${w.kind.padEnd(8)} · ${fmtClock(w.start)}–${fmtClock(w.start + w.len)}` +
    (w.complexity !== undefined ? ` · complejidad ${w.complexity} kb/s@360p · luma ${w.luma ?? '—'}` : ''));
}
function fmtClock(s) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

// --------------------------------------------------------------------------
// Medición
// --------------------------------------------------------------------------
async function measure(distorted, refArgs, { subsample = 1 } = {}) {
  const log = path.join(vmafTmp, `vmaf-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const lavfi = `[0:v]${TAG},format=yuv420p10le,setpts=PTS-STARTPTS[d];` +
    `[1:v]${vfBase},format=yuv420p10le,setpts=PTS-STARTPTS[r];` +
    `[d][r]libvmaf=n_threads=${threads}${subsample > 1 ? `:n_subsample=${subsample}` : ''}:feature=name=psnr:log_fmt=json:log_path=${log}`;
  await run(ffmpeg, ['-hide_banner', '-v', 'error', ...(subsample > 1 ? ['-stats'] : []),
    '-i', distorted, ...refArgs, '-lavfi', lavfi, '-an', '-f', 'null', '-'], { niced: true, live: subsample > 1 });
  const j = JSON.parse(fs.readFileSync(log, 'utf8'));
  fs.rmSync(log, { force: true });
  const v = j.frames.map((f) => f.metrics.vmaf).sort((a, b) => a - b);
  return {
    mean: round(j.pooled_metrics.vmaf.mean),
    p1: round(v[Math.floor(v.length / 100)]),
    min: round(j.pooled_metrics.vmaf.min),
    psnr: round(j.pooled_metrics.psnr_y.mean, 1),
  };
}

function h264VideoArgs(crf) {
  return ['-vf', vfBase, '-c:v', 'libx264', '-preset', H264_PRESET, '-crf', String(crf), '-profile:v', 'high',
    ...(h264Level ? ['-level', h264Level] : []), '-maxrate', H264_MAXRATE, '-bufsize', H264_BUFSIZE,
    '-pix_fmt', 'yuv420p', '-g', String(gop), '-keyint_min', String(keyintMin)];
}
function av1VideoArgs(crf) {
  return ['-vf', `${vfBase},format=yuv420p10le`, '-c:v', 'libsvtav1', '-preset', String(AV1_PRESET),
    '-crf', String(crf), '-g', String(gop)];
}
const SVT_ENV = { SVT_LOG: '2' };   // sin las líneas Svt[info]

const speed = { h264: null, av1: null };   // fotogramas por segundo medidos en las pruebas

async function testWindow(codec, crf, w) {
  const cacheFile = path.join(workDir, 'pruebas', `${codec}_crf${crf}_${w.start}.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const out = path.join(workDir, 'pruebas', `${codec}_crf${crf}_${w.start}.mp4`);
  const seek = ['-ss', String(w.start), '-t', String(w.len)];
  const tStart = Date.now();
  await run(ffmpeg, ['-hide_banner', '-v', 'error', '-y', ...seek, '-i', input, '-map', '0:v:0', '-an',
    ...(codec === 'h264' ? h264VideoArgs(crf) : av1VideoArgs(crf)), out],
  { niced: true, env: codec === 'av1' ? SVT_ENV : {} });
  const seconds = (Date.now() - tStart) / 1000;
  const kbps = Math.round(Number(JSON.parse((await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', out])).stdout).format.bit_rate) / 1000);
  const q = await measure(out, [...seek, '-i', input]);
  fs.rmSync(out, { force: true });
  const result = { codec, crf, start: w.start, kind: w.kind, kbps, ...q, fps: round((w.len * fps) / seconds, 1) };
  fs.writeFileSync(cacheFile, JSON.stringify(result));
  return result;
}

const allTests = [];
function printTest(r) {
  const flags = [];
  if (r.psnr < PSNR_COLOR_GUARD) flags.push(c.red('COLOR'));
  info(`${r.codec.toUpperCase().padEnd(4)} CRF ${String(r.crf).padEnd(2)} · ${r.kind.padEnd(8)} · ${String(r.kbps).padStart(5)} kb/s · ` +
    `VMAF ${r.mean.toFixed(2)} · p1 ${r.p1.toFixed(2)} · PSNR-Y ${r.psnr.toFixed(1)} dB ${flags.join(' ')}`);
}
function colorGuard(results) {
  const bad = results.find((r) => r.psnr < PSNR_COLOR_GUARD);
  if (bad) fail(`PSNR-Y de ${bad.psnr} dB en ${bad.codec} CRF ${bad.crf}: algo está alterando el color. No se continúa.`);
}
async function testAll(codec, crf) {
  const results = [];
  for (const w of windows) {
    const r = await testWindow(codec, crf, w);
    results.push(r); allTests.push(r); printTest(r);
  }
  colorGuard(results);
  const fpsList = results.map((r) => r.fps).filter(Boolean);
  if (fpsList.length) speed[codec] = Math.min(...fpsList);
  return results;
}

// --------------------------------------------------------------------------
step(4, `H.264: elegir la calidad (VMAF media ≥ ${VMAF_MIN_MEAN} y p1 ≥ ${VMAF_MIN_P1} en todos los fragmentos)`);
let h264Crf = null;
let h264Results = null;
let h264Fallback = false;
for (const crf of H264_CRFS) {
  const results = await testAll('h264', crf);
  if (results.every((r) => r.mean >= VMAF_MIN_MEAN && r.p1 >= VMAF_MIN_P1)) {
    h264Crf = crf; h264Results = results; break;
  }
  h264Results = results;
}
if (h264Crf === null) {
  h264Crf = H264_CRFS[H264_CRFS.length - 1];
  h264Fallback = true;
  const capKbps = parseInt(H264_MAXRATE, 10) * 1000;
  const capped = h264Results.some((r) => r.kbps >= capKbps * 0.9);
  warn(`Ningún CRF alcanzó el umbral; se usa ${h264Crf}, el de más calidad probado.` + (capped
    ? ` El bitrate roza el tope de ${H264_MAXRATE}b/s en algún fragmento: es el tope, no el CRF, lo que limita la calidad (contenido con mucho ruido o movimiento).`
    : ' Suele indicar un original con mucho ruido.'));
} else {
  ok(`CRF elegido: ${h264Crf}`);
}

// --------------------------------------------------------------------------
async function encodeFinal(codec, crf, out) {
  if (fs.existsSync(out) && !flag('--forzar')) {
    ok(`${path.basename(out)} ya existe: se reutiliza (usa --forzar para rehacerlo)`);
    return;
  }
  const partial = out.replace(/\.mp4$/, '.partial.mp4');
  if (speed[codec]) info(`Tiempo estimado: ~${fmtDuration((duration * fps) / speed[codec])}`);
  await run(ffmpeg, ['-hide_banner', '-v', 'error', '-stats', '-y', '-i', input, '-map', '0:v:0', ...audioArgs,
    ...(codec === 'h264' ? h264VideoArgs(crf) : av1VideoArgs(crf)), '-movflags', '+faststart', partial],
  { niced: true, live: true, env: codec === 'av1' ? SVT_ENV : {} });
  fs.renameSync(partial, out);
  ok(`${path.basename(out)} · ${fmtMB(fs.statSync(out).size)}`);
}

step(5, `H.264: codificación final (CRF ${h264Crf})`);
await encodeFinal('h264', h264Crf, outH264);

// --------------------------------------------------------------------------
let av1Crf = null;
let av1Results = null;
if (withAv1) {
  step(6, `AV1: elegir la calidad (a ±${AV1_MAX_VMAF_DROP} punto VMAF del H.264 en cada fragmento, con el mínimo peso)`);
  const target = Object.fromEntries(h264Results.map((r) => [r.start, r]));
  const passes = (results) => results.every((r) => r.mean >= target[r.start].mean - AV1_MAX_VMAF_DROP && r.p1 >= VMAF_MIN_P1);
  const tried = new Map();
  const tryCrf = async (crf) => { if (!tried.has(crf)) tried.set(crf, await testAll('av1', crf)); return tried.get(crf); };

  let crf = AV1_CRF_START;
  if (passes(await tryCrf(crf))) {
    av1Crf = crf;
    while (crf + AV1_CRF_STEP <= AV1_CRF_MAX && passes(await tryCrf(crf + AV1_CRF_STEP))) { crf += AV1_CRF_STEP; av1Crf = crf; }
  } else {
    while (crf - AV1_CRF_STEP >= AV1_CRF_MIN) {
      crf -= AV1_CRF_STEP;
      if (passes(await tryCrf(crf))) { av1Crf = crf; break; }
    }
    if (av1Crf === null) {
      av1Crf = AV1_CRF_MIN;
      warn(`Ningún CRF de AV1 igualó al H.264; se usa ${av1Crf}.`);
    }
  }
  av1Results = tried.get(av1Crf);
  ok(`CRF elegido: ${av1Crf}`);

  step(7, `AV1: codificación final (CRF ${av1Crf}, preset ${AV1_PRESET})`);
  await encodeFinal('av1', av1Crf, outAv1);
}

// --------------------------------------------------------------------------
step(withAv1 ? 8 : 6, 'Verificación de los archivos');
const checks = [];
async function verify(file, codec) {
  const p = JSON.parse((await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])).stdout);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  const name = path.basename(file);
  const check = (cond, text) => { checks.push({ ok: !!cond, text: `${name}: ${text}` }); (cond ? ok : warn)(`${name}: ${text}`); };
  if (codec === 'h264') {
    check(v.codec_name === 'h264' && v.profile === 'High', `H.264 High (nivel ${v.level / 10})`);
  } else {
    check(v.codec_name === 'av1' && v.profile === 'Main' && v.pix_fmt === 'yuv420p10le', `AV1 Main 10 bits (nivel ${v.level})`);
    check(v.level === 8, v.level === 8
      ? 'nivel 8 (4.0): coincide con el que la web comprueba (av01.0.08M.10)'
      : `nivel ${v.level}, distinto del 8 que la web comprueba (av01.0.08M.10): avisa antes de subirlo`);
  }
  check(v.color_primaries === 'bt709' && v.color_transfer === 'bt709' && v.color_space === 'bt709' && v.color_range === 'tv', 'color BT.709 etiquetado (rango limitado)');
  check(moovBeforeMdat(file), 'índice (moov) al principio');
  const dDiff = Math.abs(Number(p.format.duration) - duration);
  check(dDiff <= 0.5, `duración ${fmtDuration(Number(p.format.duration))} (diferencia ${round(dDiff, 2)} s)`);
  if (as) check(a && a.codec_name === 'aac' && Number(a.sample_rate) === Number(as.sample_rate) && a.channels === as.channels, `audio ${a?.codec_name} ${a?.sample_rate} Hz ${a?.channels} canales`);
  return { size: Number(p.format.size), vkbps: Math.round(Number(v.bit_rate) / 1000) };
}
const finals = { h264: await verify(outH264, 'h264') };
if (withAv1) finals.av1 = await verify(outAv1, 'av1');

// --------------------------------------------------------------------------
let full = null;
if (!flag('--rapido')) {
  step(withAv1 ? 9 : 7, 'Calidad del archivo completo frente al original (1 de cada 5 fotogramas)');
  full = {};
  for (const [codec, file] of Object.entries(withAv1 ? { h264: outH264, av1: outAv1 } : { h264: outH264 })) {
    const cacheFile = path.join(workDir, `completo_${codec}.json`);
    const fileStat = fs.statSync(file);
    const cached = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : null;
    if (cached && cached.size === fileStat.size && cached.mtimeMs === fileStat.mtimeMs) {
      full[codec] = cached.q;
    } else {
      info(`Midiendo ${path.basename(file)}…`);
      full[codec] = await measure(file, ['-i', input], { subsample: 5 });
      fs.writeFileSync(cacheFile, JSON.stringify({ size: fileStat.size, mtimeMs: fileStat.mtimeMs, q: full[codec] }));
    }
    ok(`${path.basename(file)} · VMAF ${full[codec].mean} · p1 ${full[codec].p1} · PSNR-Y ${full[codec].psnr} dB`);
    if (full[codec].psnr < PSNR_COLOR_GUARD) fail(`PSNR-Y del archivo completo por debajo de ${PSNR_COLOR_GUARD} dB: color alterado. No subas este archivo.`);
  }
}

// --------------------------------------------------------------------------
// Decisión sobre el AV1 e informe
// --------------------------------------------------------------------------
let av1Verdict = null;
if (withAv1) {
  const savings = 1 - finals.av1.size / finals.h264.size;
  const qualityOk = full ? full.av1.mean >= full.h264.mean - AV1_MAX_VMAF_DROP : true;
  const use = savings >= AV1_MIN_SAVINGS && qualityOk;
  av1Verdict = {
    savings, qualityOk, use,
    text: use
      ? `**Súbelo.** Pesa un ${(savings * 100).toFixed(1)} % menos que el H.264 con la misma calidad.`
      : !qualityOk
        ? `**No lo subas.** Su calidad queda más de ${AV1_MAX_VMAF_DROP} punto VMAF por debajo del H.264.`
        : `**No compensa.** Solo pesa un ${(savings * 100).toFixed(1)} % menos que el H.264 (el mínimo es ${AV1_MIN_SAVINGS * 100} %). Sube solo el MP4 y deja vacío el campo AV1.`,
  };
}

const folder = base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
const suggestedMinutes = Math.ceil(duration / 60) + 10;
const elapsed = (Date.now() - t0) / 1000;
const row = (label, file, q, size, vkbps) =>
  `| ${label} | \`${path.basename(file)}\` | ${fmtMB(size)} | ${vkbps} kb/s | ${q ? q.mean : '—'} | ${q ? q.p1 : '—'} | ${q ? q.psnr + ' dB' : '—'} |`;
const testRows = allTests.map((r) =>
  `| ${r.codec.toUpperCase()} | ${r.crf} | ${r.kind} (${fmtClock(r.start)}) | ${r.kbps} kb/s | ${r.mean} | ${r.p1} | ${r.psnr} dB |`).join('\n');

const report = `# Informe de optimización · ${base}

Generado el ${new Date().toLocaleString('es-ES')} por \`scripts/video/optimizar-video.mjs\` en ${fmtDuration(elapsed)}.
${tools.version}.

## Original

| | |
|---|---|
| Archivo | \`${path.basename(input)}\` (${fmtMB(sourceStat.size)}) |
| Vídeo | ${vs.codec_name} ${vs.profile || ''}, ${vs.width}×${vs.height}, ${round(fps, 3)} fps, ${vs.pix_fmt}, ${Math.round(Number(vs.bit_rate || probe.format.bit_rate) / 1000)} kb/s |
| Duración | ${fmtDuration(duration)} |
| Color | primaries=${vs.color_primaries || '—'}, trc=${vs.color_transfer || '—'}, matrix=${vs.color_space || '—'}, range=${vs.color_range || '—'} |
| Audio | ${as ? `${as.codec_name}, ${as.sample_rate} Hz, ${as.channels} canales, ${Math.round(Number(as.bit_rate || 0) / 1000)} kb/s → ${as.codec_name === 'aac' ? 'copiado sin recomprimir' : `convertido a AAC ${AUDIO_FALLBACK_BITRATE}`}` : 'sin audio'} |

## Fragmentos de prueba

| Tipo | Tramo | Complejidad (kb/s a 360p) | Luminosidad media |
|---|---|---|---|
${windows.map((w) => `| ${w.kind} | ${fmtClock(w.start)}–${fmtClock(w.start + w.len)} | ${w.complexity ?? '—'} | ${w.luma ?? '—'} |`).join('\n')}

## Pruebas

| Códec | CRF | Fragmento | Bitrate | VMAF media | VMAF p1 | PSNR-Y |
|---|---|---|---|---|---|---|
${testRows}

- **H.264: CRF ${h264Crf}**, ${h264Fallback ? `el de más calidad probado: ninguno cumplió VMAF media ≥ ${VMAF_MIN_MEAN} y p1 ≥ ${VMAF_MIN_P1} en todos los fragmentos (ver avisos).` : `el de menos peso que cumple VMAF media ≥ ${VMAF_MIN_MEAN} y p1 ≥ ${VMAF_MIN_P1} en todos los fragmentos.`}
${withAv1 ? `- **AV1: CRF ${av1Crf}**, el de menos peso que queda a ±${AV1_MAX_VMAF_DROP} punto VMAF del H.264 en cada fragmento (p1 ≥ ${VMAF_MIN_P1}).\n` : ''}
## Resultado

| Versión | Archivo | Tamaño | Vídeo | VMAF media | VMAF p1 | PSNR-Y |
|---|---|---|---|---|---|---|
| Original | \`${path.basename(input)}\` | ${fmtMB(sourceStat.size)} | ${Math.round(Number(vs.bit_rate || 0) / 1000)} kb/s | — | — | — |
${row('H.264', outH264, full?.h264, finals.h264.size, finals.h264.vkbps)}
${withAv1 ? row('AV1', outAv1, full?.av1, finals.av1.size, finals.av1.vkbps) : ''}

- Ahorro H.264 frente al original: **${((1 - finals.h264.size / sourceStat.size) * 100).toFixed(1)} %**
${withAv1 ? `- Ahorro AV1 frente al original: **${((1 - finals.av1.size / sourceStat.size) * 100).toFixed(1)} %**
- Ahorro AV1 frente al H.264: **${(av1Verdict.savings * 100).toFixed(1)} %**

**Versión AV1:** ${av1Verdict.text}
` : ''}${full ? '' : '\n_Medición del archivo completo omitida (`--rapido`)._\n'}
## Verificaciones

${checks.map((k) => `- ${k.ok ? '✓' : '⚠'} ${k.text}`).join('\n')}
${warnings.length ? `\n## Avisos\n\n${warnings.map((w) => `- ⚠ ${w}`).join('\n')}\n` : ''}
## Siguiente paso

1. Sube a S3, carpeta \`eventos-video/${folder}/\` (guía \`docs/eventos-video/03-configurar-aws.md\`, paso 8):
   - \`${path.basename(outH264)}\`${withAv1 && av1Verdict.use ? `\n   - \`${path.basename(outAv1)}\`` : ''}
2. En el evento (formato «Vídeo pregrabado», origen «URL del vídeo»):
   - **URL del vídeo (MP4 H.264):** \`https://cdn.140d.art/eventos-video/${folder}/${path.basename(outH264)}\`
   - **URL de la versión AV1:** ${withAv1 && av1Verdict.use ? `\`https://cdn.140d.art/eventos-video/${folder}/${path.basename(outAv1)}\`` : '_vacía_'}
   - **Duración (minutos):** \`${suggestedMinutes}\` (el vídeo dura ${fmtDuration(duration)}; el margen evita que la firma caduque antes del final).
`;
fs.writeFileSync(outReport, report);

if (!flag('--conservar')) fs.rmSync(workDir, { recursive: true, force: true });
fs.rmSync(vmafTmp, { recursive: true, force: true });

console.log(`\n${c.bold('Hecho')} en ${fmtDuration(elapsed)}.`);
info(`${path.basename(outH264)} · ${fmtMB(finals.h264.size)}${full ? ` · VMAF ${full.h264.mean}` : ''}`);
if (withAv1) {
  info(`${path.basename(outAv1)} · ${fmtMB(finals.av1.size)}${full ? ` · VMAF ${full.av1.mean}` : ''} · ${(av1Verdict.savings * 100).toFixed(1)} % menos que el H.264`);
  info(`AV1: ${av1Verdict.text.replace(/\*\*/g, '')}`);
}
info(`Informe: ${outReport}`);
if (warnings.length) console.log(c.yellow(`    ${warnings.length} aviso(s): revisa el informe.`));
