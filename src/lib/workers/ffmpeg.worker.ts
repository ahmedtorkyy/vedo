import { FFmpeg } from '@ffmpeg/ffmpeg'

let ffmpeg: FFmpeg | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress }) => {
      self.postMessage({ type: 'concat-progress', progress })
    })
    await ffmpeg.load()
    self.postMessage({ type: 'ffmpeg-loaded' })
  }
  return ffmpeg
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === 'concat') {
    try {
      const instance = await getFFmpeg()
      const { clips } = payload as { clips: { name: string; data: Uint8Array }[] }

      for (const clip of clips) {
        await instance.writeFile(clip.name, clip.data)
      }

      const concatContent = clips.map((c) => `file '${c.name}'`).join('\n')
      const concatName = 'concat.txt'
      await instance.writeFile(concatName, new TextEncoder().encode(concatContent))

      await instance.exec(['-f', 'concat', '-safe', '0', '-i', concatName, '-c', 'copy', 'output.mp4'])

      const data = await instance.readFile('output.mp4')
      const result = data as Uint8Array

      for (const clip of clips) {
        await instance.deleteFile(clip.name)
      }
      await instance.deleteFile(concatName)
      await instance.deleteFile('output.mp4')

      self.postMessage({ type: 'concat-done', data: result.buffer }, [result.buffer])
    } catch (err) {
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
}
