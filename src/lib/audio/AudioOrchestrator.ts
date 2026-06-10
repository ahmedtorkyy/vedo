export class AudioOrchestrator {
  private ctx: AudioContext | null = null
  private gains: Map<string, GainNode> = new Map()
  private sources: Map<string, MediaElementAudioSourceNode> = new Map()
  private masterGain: GainNode | null = null

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = 1
      this.masterGain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  registerClip(id: string): GainNode {
    this.ensureContext()
    const gain = this.ctx!.createGain()
    gain.gain.value = 1
    gain.connect(this.masterGain!)
    this.gains.set(id, gain)
    return gain
  }

  attachMediaElement(clipId: string, element: HTMLMediaElement): void {
    this.ensureContext()
    const existing = this.sources.get(clipId)
    if (existing) existing.disconnect()

    const source = this.ctx!.createMediaElementSource(element)
    const gain = this.gains.get(clipId)
    if (gain) {
      source.connect(gain)
    } else {
      source.connect(this.masterGain!)
    }
    this.sources.set(clipId, source)
  }

  setMute(clipId: string, muted: boolean): void {
    const gain = this.gains.get(clipId)
    if (gain) {
      gain.gain.value = muted ? 0 : 1
    }
  }

  setVolume(clipId: string, value: number): void {
    const gain = this.gains.get(clipId)
    if (gain) {
      gain.gain.value = Math.max(0, Math.min(1, value))
    }
  }

  getVolume(clipId: string): number {
    return this.gains.get(clipId)?.gain.value ?? 1
  }

  unregisterClip(clipId: string): void {
    const gain = this.gains.get(clipId)
    if (gain) {
      gain.disconnect()
      this.gains.delete(clipId)
    }
    const source = this.sources.get(clipId)
    if (source) {
      source.disconnect()
      this.sources.delete(clipId)
    }
  }

  setMasterVolume(value: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, value))
    }
  }

  dispose(): void {
    this.gains.forEach((g) => g.disconnect())
    this.sources.forEach((s) => s.disconnect())
    this.gains.clear()
    this.sources.clear()
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.masterGain = null
  }
}

export const audioOrchestrator = new AudioOrchestrator()
