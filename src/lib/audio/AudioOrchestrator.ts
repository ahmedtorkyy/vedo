/**
 * Lifecycle-Isolated Audio Matrix Engine.
 * Safeguards multi-channel tracks from throwing DOMExceptions during fast microtask state triggers.
 */
export class AudioOrchestrator {
  private static instance: AudioOrchestrator;
  private ctx: AudioContext | null = null;
  private gainNodes: Map<string, GainNode> = new Map();

  private constructor() {}

  static getInstance(): AudioOrchestrator {
    if (!AudioOrchestrator.instance) {
      AudioOrchestrator.instance = new AudioOrchestrator();
    }
    return AudioOrchestrator.instance;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  registerClipChannel(clipId: string) {
    this.init();
    if (!this.ctx || this.gainNodes.has(clipId)) return;

    const gainNode = this.ctx.createGain();
    gainNode.connect(this.ctx.destination);
    this.gainNodes.set(clipId, gainNode);
  }

  setMute(clipId: string, isMuted: boolean) {
    const gainNode = this.gainNodes.get(clipId);
    if (!gainNode) return;
    
    const targetGain = isMuted ? 0 : 1;
    if (this.ctx) {
      gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.01);
    } else {
      gainNode.gain.value = targetGain;
    }
  }

  unregisterClipChannel(clipId: string) {
    const gainNode = this.gainNodes.get(clipId);
    if (gainNode) {
      gainNode.disconnect();
      this.gainNodes.delete(clipId);
    }
  }
}
