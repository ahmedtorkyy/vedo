export type DeviceTier = 'low' | 'medium' | 'high'
export type ModelKey = 'whisper-tiny' | 'whisper-base' | 'whisper-small'

const TIER_MODEL: Record<DeviceTier, ModelKey> = {
  low: 'whisper-tiny',
  medium: 'whisper-base',
  high: 'whisper-small',
}

async function supportsWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false
  try {
    const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
}

export async function detectDeviceTier(): Promise<DeviceTier> {
  const cores = navigator.hardwareConcurrency ?? 2
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 2
  const hasGPU = await supportsWebGPU()

  const score =
    (cores >= 8 ? 3 : cores >= 4 ? 2 : 1) +
    (memory >= 8 ? 3 : memory >= 4 ? 2 : 1) +
    (hasGPU ? 2 : 0)

  if (score >= 7) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}

export function detectDeviceTierSync(): DeviceTier {
  const cores = navigator.hardwareConcurrency ?? 2
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 2

  const score = (cores >= 8 ? 3 : cores >= 4 ? 2 : 1) + (memory >= 8 ? 3 : memory >= 4 ? 2 : 1)

  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

export function recommendModel(): ModelKey {
  return TIER_MODEL[detectDeviceTierSync()]
}

export async function recommendModelAsync(): Promise<ModelKey> {
  return TIER_MODEL[await detectDeviceTier()]
}
