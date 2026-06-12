// Vedo desktop shell — Stage 1.
// Serves the built web app over a privileged custom protocol (app://) so that
// absolute-path fetches (/fonts/..., /ffmpeg/...) keep working, the page runs
// in a secure context (OPFS, workers, wasm all behave exactly as in Chrome),
// and NVDA accessibility is inherited from Chromium unchanged.

const { app, BrowserWindow, protocol, shell, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

const SCHEME = 'app'
const DIST = path.join(__dirname, '..', 'dist')

// --- Native ffmpeg (stage 2) ---

function ffmpegBinaryPath() {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', name)
    : path.join(__dirname, 'bin', name)
}

function jobDir() {
  const dir = path.join(app.getPath('temp'), 'vedo-jobs')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeJobFile(name) {
  const base = path.basename(String(name))
  if (!base || base === '.' || base === '..') throw new Error('Invalid temp file name')
  return path.join(jobDir(), base)
}

function parseProgress(line, totalSec) {
  // ffmpeg stderr: "... time=00:01:23.45 ..."
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!m || !totalSec || totalSec <= 0) return null
  const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  return Math.max(0, Math.min(100, Math.round((sec / totalSec) * 100)))
}

function registerIpc() {
  ipcMain.handle('vedo:ffmpeg-available', () => {
    try {
      return fs.existsSync(ffmpegBinaryPath())
    } catch {
      return false
    }
  })

  ipcMain.handle('vedo:temp-write', async (_e, name, data) => {
    const target = safeJobFile(name)
    await fs.promises.writeFile(target, Buffer.from(data))
    return target
  })

  ipcMain.handle('vedo:temp-read', async (_e, name) => {
    return fs.promises.readFile(safeJobFile(name))
  })

  ipcMain.handle('vedo:temp-cleanup', async () => {
    const dir = jobDir()
    const entries = await fs.promises.readdir(dir).catch(() => [])
    await Promise.all(
      entries.map((f) => fs.promises.unlink(path.join(dir, f)).catch(() => {})),
    )
  })

  ipcMain.handle('vedo:ffmpeg-run', (event, args, totalDurationSec) => {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
        reject(new Error('Invalid ffmpeg arguments'))
        return
      }
      const bin = ffmpegBinaryPath()
      if (!fs.existsSync(bin)) {
        reject(new Error('ffmpeg binary not found — run: pnpm fetch-ffmpeg'))
        return
      }

      const child = spawn(bin, args, { cwd: jobDir(), windowsHide: true })
      let stderrTail = ''

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString()
        stderrTail = (stderrTail + text).slice(-4000)
        const pct = parseProgress(text, totalDurationSec)
        if (pct !== null && !event.sender.isDestroyed()) {
          event.sender.send('vedo:ffmpeg-progress', pct)
        }
      })

      child.on('error', (err) => reject(err))
      child.on('close', (code) => resolve({ code: code ?? -1, stderrTail }))
    })
  })
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.onnx': 'application/octet-stream',
}

function resolveDistFile(urlPath) {
  // Map app://bundle/<path> onto dist/<path>; fall back to index.html for
  // SPA-style paths, and refuse anything that escapes the dist directory.
  const decoded = decodeURIComponent(urlPath)
  const relative = decoded.replace(/^\/+/, '')
  const target = path.normalize(path.join(DIST, relative))
  if (!target.startsWith(DIST)) return null
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target
  return path.join(DIST, 'index.html')
}

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    const file = resolveDistFile(url.pathname)
    if (!file) {
      return new Response('Not found', { status: 404 })
    }
    const ext = path.extname(file).toLowerCase()
    const mime = MIME[ext] ?? 'application/octet-stream'
    const data = await fs.promises.readFile(file)
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': mime },
    })
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'Vedo — AI Video Editor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  // External links open in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.loadURL(`${SCHEME}://bundle/index.html`)
  return win
}

app.whenReady().then(() => {
  registerAppProtocol()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
