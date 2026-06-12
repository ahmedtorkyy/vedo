import type { VisualAnalysis, VisionCapability, VideoFrame, VisionWorkerMessage, VisionWorkerResponse } from './vision-types'
import { checkVisionCapability } from './detectors'

export class VisionEngine {
  private worker: Worker | null = null
  private pending: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map()
  private seq = 0
  private _capability: VisionCapability | null = null
  private _onProgress: ((p: number, msg: string) => void) | null = null

  get capability(): VisionCapability {
    if (!this._capability) {
      this._capability = checkVisionCapability()
    }
    return this._capability
  }

  onProgress(cb: (progress: number, message: string) => void) {
    this._onProgress = cb
  }

  async load(): Promise<string[]> {
    const cap = this.capability
    if (!cap.webgl) return []

    this.ensureWorker()

    return this.post('load', { modelTypes: ['face', 'object'] }) as Promise<string[]>
  }

  async analyze(
    frames: VideoFrame[],
    duration: number,
    fps: number,
  ): Promise<VisualAnalysis> {
    this.ensureWorker()

    return this.post('analyze', { frames, duration, fps }) as Promise<VisualAnalysis>
  }

  unload() {
    if (this.worker) {
      this.post('unload', undefined).catch(() => { })
      this.worker.terminate()
      this.worker = null
    }
  }

  private ensureWorker() {
    if (this.worker) return

    this.worker = new Worker(
      new URL('../workers/vision.worker.ts', import.meta.url),
      { type: 'module' },
    )

    this.worker.onmessage = (e: MessageEvent<VisionWorkerResponse>) => {
      const msg = e.data

      if (msg.type === 'progress' && this._onProgress) {
        this._onProgress(msg.payload.progress, msg.payload.message)
      }

      if (msg.type === 'model-loaded') {
        const key = `load_${this.seq}`
        const p = this.pending.get(key)
        if (p) {
          p.resolve(msg.payload.models)
          this.pending.delete(key)
        }
        return
      }

      if (msg.type === 'load-error') {
        const key = `load_${this.seq}`
        const p = this.pending.get(key)
        if (p) {
          p.reject(new Error(msg.payload.error))
          this.pending.delete(key)
        }
        return
      }

      if (msg.type === 'result') {
        const key = `analyze_${this.seq}`
        const p = this.pending.get(key)
        if (p) {
          p.resolve(msg.payload)
          this.pending.delete(key)
        }
        return
      }

      if (msg.type === 'error') {
        const key = `analyze_${this.seq}`
        const p = this.pending.get(key)
        if (p) {
          p.reject(new Error(msg.payload.error))
          this.pending.delete(key)
        }
        return
      }

      if (msg.type === 'unloaded') { /* nothing to do — state already cleared */ }
    }
  }

  private post(
    type: VisionWorkerMessage['type'],
    payload: unknown,
  ): Promise<unknown> {
    const seq = ++this.seq
    return new Promise((resolve, reject) => {
      const key = `${type}_${seq}`
      this.pending.set(key, { resolve, reject })

      const msg: VisionWorkerMessage = { type, payload } as VisionWorkerMessage
      this.worker!.postMessage(msg)

      setTimeout(() => {
        if (this.pending.has(key)) {
          this.pending.delete(key)
          reject(new Error(`Vision worker ${type} timed out`))
        }
      }, 60000)
    })
  }
}

let _instance: VisionEngine | null = null

export function getVisionEngine(): VisionEngine {
  if (!_instance) _instance = new VisionEngine()
  return _instance
}
