import { useClipStore } from '../state'

export function computeStitchedOffset(projectId: string, clipId: string): number {
  const clipsA = useClipStore.getState().getSlotClips(projectId, 'A')
  const idx = clipsA.findIndex((c) => c.id === clipId)
  let offset = 0
  for (let i = 0; i < idx; i++) {
    offset += clipsA[i].duration
  }
  return offset
}