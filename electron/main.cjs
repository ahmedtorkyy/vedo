// Vedo desktop shell — Stage 1.
// Serves the built web app over a privileged custom protocol (app://) so that
// absolute-path fetches (/fonts/..., /ffmpeg/...) keep working, the page runs
// in a secure context (OPFS, workers, wasm all behave exactly as in Chrome),
// and NVDA accessibility is inherited from Chromium unchanged.

const { app, BrowserWindow, protocol, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const SCHEME = 'app'
const DIST = path.join(__dirname, '..', 'dist')

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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
