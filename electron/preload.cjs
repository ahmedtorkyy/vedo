// Vedo preload — exposes the minimal native bridge for stage 2 (native ffmpeg).
// Runs sandboxed; only contextBridge + ipcRenderer are used.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vedoNative', {
  ffmpegAvailable: () => ipcRenderer.invoke('vedo:ffmpeg-available'),

  tempWrite: (name, data) =>
    ipcRenderer.invoke('vedo:temp-write', name, Buffer.from(new Uint8Array(data))),

  tempRead: async (name) => {
    const buf = await ipcRenderer.invoke('vedo:temp-read', name)
    // Return a plain ArrayBuffer for the renderer.
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  },

  tempCleanup: () => ipcRenderer.invoke('vedo:temp-cleanup'),

  ffmpegRun: (args, totalDurationSec) =>
    ipcRenderer.invoke('vedo:ffmpeg-run', args, totalDurationSec ?? null),

  onFfmpegProgress: (cb) => {
    const handler = (_event, pct) => cb(pct)
    ipcRenderer.on('vedo:ffmpeg-progress', handler)
    return () => ipcRenderer.removeListener('vedo:ffmpeg-progress', handler)
  },

  // --- Native whisper transcription ---

  whisperAvailable: () => ipcRenderer.invoke('vedo:whisper-available'),

  // wavName is a file previously written via tempWrite; opts: { language?, wordTimestamps? }
  whisperRun: (wavName, opts) => ipcRenderer.invoke('vedo:whisper-run', wavName, opts ?? {}),

  onWhisperProgress: (cb) => {
    const handler = (_event, pct) => cb(pct)
    ipcRenderer.on('vedo:whisper-progress', handler)
    return () => ipcRenderer.removeListener('vedo:whisper-progress', handler)
  },
})
