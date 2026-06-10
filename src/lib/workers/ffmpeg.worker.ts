import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null

const MEMFS_WARN_BYTES = 256 * 1024 * 1024
const MEMFS_LIMIT_BYTES = 1.5 * 1024 * 1024 * 1024

async function getFFmpeg(): Promise<FFmpeg> {
    if (!ffmpeg) {
    ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress }) => {
      self.postMessage({ type: 'concat-progress', progress })
    })
    ffmpeg.on('log', ({ message }) => {
      if (message.toLowerCase().includes('out of memory')) {
        self.postMessage({ type: 'oom-error' })
      }
    })

    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    self.postMessage({ type: 'ffmpeg-loaded' })
  }
  return ffmpeg
}

function purgeMemfs(): void {
  if (ffmpeg) {
    ffmpeg.terminate()
    ffmpeg = null
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === 'concat') {
    try {
      const instance = await getFFmpeg()
      const { clips } = payload as { clips: { name: string; data: ArrayBuffer }[] }

      const totalBytes = clips.reduce((sum, c) => sum + c.data.byteLength, 0)
      if (totalBytes > MEMFS_LIMIT_BYTES) {
        self.postMessage({
          type: 'concat-error',
          error: `Total file size (${(totalBytes / 1e9).toFixed(1)}GB) exceeds MEMFS limit. Please reduce file sizes.`,
        })
        return
      }
      if (totalBytes > MEMFS_WARN_BYTES) {
        self.postMessage({
          type: 'memfs-warning',
          detail: `Files total ${(totalBytes / 1e6).toFixed(0)}MB — close to MEMFS limit.`,
        })
      }

      for (const clip of clips) {
        await instance.writeFile(clip.name, new Uint8Array(clip.data))
      }

      const concatContent = clips.map((c) => `file '${c.name}'`).join('\n')
      const concatName = 'concat.txt'
      await instance.writeFile(concatName, new TextEncoder().encode(concatContent))

      await instance.exec(['-f', 'concat', '-safe', '0', '-i', concatName, '-c', 'copy', 'output.mp4'])

      const raw = await instance.readFile('output.mp4')
      const result = raw as Uint8Array

      await instance.deleteFile(concatName)
      await instance.deleteFile('output.mp4')
      for (const clip of clips) {
        await instance.deleteFile(clip.name)
      }

      const resultBuf = result.buffer.slice(0) as ArrayBuffer
      self.postMessage({ type: 'concat-done', data: resultBuf }, { transfer: [resultBuf] })

      purgeMemfs()
    } catch (err) {
      purgeMemfs()
      self.postMessage({ type: 'concat-error', error: String(err) })
    }
  }

  if (type === 'load') {
    try {
      await getFFmpeg()
    } catch (err) {
      self.postMessage({ type: 'load-error', error: String(err) })
    }
  }

  if (type === 'purge-memfs') {
    purgeMemfs()
    self.postMessage({ type: 'memfs-purged' })
  }
}
