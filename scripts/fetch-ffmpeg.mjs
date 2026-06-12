// One-time setup: download a native Windows FFmpeg build and place
// ffmpeg.exe into electron/bin/ so the desktop app can use it.
// Usage: node scripts/fetch-ffmpeg.mjs   (or: pnpm fetch-ffmpeg)

import { mkdirSync, createWriteStream, existsSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIN_DIR = join(ROOT, 'electron', 'bin')
const TARGET = join(BIN_DIR, 'ffmpeg.exe')

const URL_ZIP = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'

async function main() {
  if (existsSync(TARGET)) {
    console.log('ffmpeg.exe already present at', TARGET)
    return
  }

  mkdirSync(BIN_DIR, { recursive: true })
  const work = join(tmpdir(), 'vedo-ffmpeg-dl')
  mkdirSync(work, { recursive: true })
  const zipPath = join(work, 'ffmpeg.zip')

  console.log('Downloading FFmpeg (about 170 MB) ...')
  const res = await fetch(URL_ZIP, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`)
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath))
  console.log('Downloaded', (statSync(zipPath).size / 1e6).toFixed(0), 'MB. Extracting ...')

  const extractDir = join(work, 'extracted')
  rmSync(extractDir, { recursive: true, force: true })
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${extractDir}" -Force`,
    ], { stdio: 'inherit' })
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', extractDir], { stdio: 'inherit' })
  }

  // The zip contains a single folder like ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe
  const topLevel = readdirSync(extractDir).find((d) => d.toLowerCase().startsWith('ffmpeg'))
  if (!topLevel) throw new Error('Unexpected archive layout — ffmpeg folder not found')
  const exe = join(extractDir, topLevel, 'bin', 'ffmpeg.exe')
  if (!existsSync(exe)) throw new Error('ffmpeg.exe not found inside the archive')

  copyFileSync(exe, TARGET)
  console.log('Installed:', TARGET)
  console.log('Cleaning up download ...')
  rmSync(work, { recursive: true, force: true })
  console.log('Done. The desktop app will now use native FFmpeg.')
}

main().catch((err) => {
  console.error('fetch-ffmpeg failed:', err.message)
  process.exit(1)
})
