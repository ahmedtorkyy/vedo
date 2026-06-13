// One-time setup: download a native Windows whisper.cpp build + a model and
// place them under electron/bin/whisper/ so the desktop app can transcribe
// natively (no browser/WASM memory ceiling — runs the real binary, much
// faster, and large models actually work).
//
// Usage:
//   node scripts/fetch-whisper.mjs                 (default model: large-v3-turbo-q5_0)
//   node scripts/fetch-whisper.mjs small           (smaller/faster download)
//   node scripts/fetch-whisper.mjs large-v3        (full large-v3, ~3 GB)
//   VEDO_WHISPER_MODEL=medium node scripts/fetch-whisper.mjs

import { mkdirSync, createWriteStream, existsSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WHISPER_DIR = join(ROOT, 'electron', 'bin', 'whisper')
const MODELS_DIR = join(WHISPER_DIR, 'models')

// whisper.cpp official Windows x64 CPU build (contains whisper-cli.exe + DLLs).
// Pinned tag so the layout is predictable; bump when whisper.cpp updates.
const WHISPER_TAG = 'v1.8.4'
const BIN_ZIP_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_TAG}/whisper-bin-x64.zip`

// Quantized GGML models from the official Hugging Face repo.
// large-v3-turbo-q5_0 is the sweet spot: near large-v3 quality, fast, ~574 MB,
// strong Arabic + English. Keys map to the canonical filenames.
const MODEL_FILES = {
  'tiny': 'ggml-tiny.bin',
  'base': 'ggml-base.bin',
  'small': 'ggml-small.bin',
  'medium': 'ggml-medium.bin',
  'medium-q5': 'ggml-medium-q5_0.bin',
  'large-v3': 'ggml-large-v3.bin',
  'large-v3-q5': 'ggml-large-v3-q5_0.bin',
  'large-v3-turbo': 'ggml-large-v3-turbo.bin',
  'large-v3-turbo-q5_0': 'ggml-large-v3-turbo-q5_0.bin',
}
const HF_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

const APPROX_MB = {
  'ggml-tiny.bin': 75,
  'ggml-base.bin': 142,
  'ggml-small.bin': 466,
  'ggml-medium.bin': 1500,
  'ggml-medium-q5_0.bin': 514,
  'ggml-large-v3.bin': 3100,
  'ggml-large-v3-q5_0.bin': 1080,
  'ggml-large-v3-turbo.bin': 1620,
  'ggml-large-v3-turbo-q5_0.bin': 574,
}

function resolveModel() {
  const arg = process.argv[2] || process.env.VEDO_WHISPER_MODEL || 'large-v3-turbo-q5_0'
  const file = MODEL_FILES[arg]
  if (!file) {
    console.error(`Unknown model "${arg}". Choose one of: ${Object.keys(MODEL_FILES).join(', ')}`)
    process.exit(1)
  }
  return file
}

async function download(url, dest, label) {
  console.log(`Downloading ${label} ...`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed (${label}): HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  console.log(`  -> ${(statSync(dest).size / 1e6).toFixed(0)} MB`)
}

function extractZip(zipPath, destDir) {
  rmSync(destDir, { recursive: true, force: true })
  mkdirSync(destDir, { recursive: true })
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`,
    ], { stdio: 'inherit' })
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' })
  }
}

// Recursively find the folder containing whisper-cli.exe (or legacy main.exe).
function findBinaryDir(root) {
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory()) stack.push(join(dir, e.name))
      else if (/^(whisper-cli|main)\.exe$/i.test(e.name)) return dir
    }
  }
  return null
}

async function installBinary(work) {
  const cliExists = existsSync(join(WHISPER_DIR, 'whisper-cli.exe')) || existsSync(join(WHISPER_DIR, 'main.exe'))
  if (cliExists) {
    console.log('whisper binary already present at', WHISPER_DIR)
    return
  }
  const zipPath = join(work, 'whisper-bin.zip')
  await download(BIN_ZIP_URL, zipPath, `whisper.cpp ${WHISPER_TAG} Windows binary (~4 MB)`)

  const extractDir = join(work, 'extracted')
  extractZip(zipPath, extractDir)

  const binDir = findBinaryDir(extractDir)
  if (!binDir) throw new Error('whisper-cli.exe not found inside the archive')

  // Copy every file from the binary folder (exe + all required DLLs).
  mkdirSync(WHISPER_DIR, { recursive: true })
  for (const name of readdirSync(binDir)) {
    const src = join(binDir, name)
    if (statSync(src).isFile()) copyFileSync(src, join(WHISPER_DIR, name))
  }
  console.log('Installed whisper binary + DLLs into', WHISPER_DIR)
}

async function installModel(work) {
  const modelFile = resolveModel()
  const target = join(MODELS_DIR, modelFile)
  if (existsSync(target)) {
    console.log('Model already present:', target)
    return
  }
  mkdirSync(MODELS_DIR, { recursive: true })
  const tmp = join(work, modelFile)
  const mb = APPROX_MB[modelFile] ? ` (~${APPROX_MB[modelFile]} MB)` : ''
  await download(`${HF_BASE}/${modelFile}`, tmp, `model ${modelFile}${mb}`)
  copyFileSync(tmp, target)
  console.log('Installed model:', target)
}

async function main() {
  mkdirSync(WHISPER_DIR, { recursive: true })
  const work = join(tmpdir(), 'vedo-whisper-dl')
  mkdirSync(work, { recursive: true })

  await installBinary(work)
  await installModel(work)

  console.log('Cleaning up download ...')
  rmSync(work, { recursive: true, force: true })
  console.log('Done. The desktop app will now transcribe with native Whisper.')
}

main().catch((err) => {
  console.error('fetch-whisper failed:', err.message)
  process.exit(1)
})
