// Bridge surface exposed by the Electron preload script (electron/preload.cjs).
// Present only when Vedo runs as a desktop app; absent in the browser build.

export interface VedoNativeApi {
  /** True when a native ffmpeg binary is bundled and runnable. */
  ffmpegAvailable: () => Promise<boolean>
  /** Write bytes into the per-session temp job directory. Returns absolute path. */
  tempWrite: (name: string, data: ArrayBuffer) => Promise<string>
  /** Read a file from the temp job directory. */
  tempRead: (name: string) => Promise<ArrayBuffer>
  /** Delete temp job files (best effort). */
  tempCleanup: () => Promise<void>
  /**
   * Run the bundled ffmpeg with the given argv (no leading binary name).
   * Resolves with the exit code; rejects on spawn failure.
   * totalDurationSec enables progress parsing from stderr.
   */
  ffmpegRun: (args: string[], totalDurationSec?: number) => Promise<{ code: number; stderrTail: string }>
  /** Subscribe to ffmpeg progress (0-100). Returns unsubscribe. */
  onFfmpegProgress: (cb: (pct: number) => void) => () => void
}

declare global {
  interface Window {
    vedoNative?: VedoNativeApi
  }
}

export {}
