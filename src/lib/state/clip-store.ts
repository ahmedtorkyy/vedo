import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { Clip, SlotType, ConcatJob, UploadProgressEntry } from '../../types'

interface ClipStore {
  clips: Record<string, Clip[]>
  concatJob: ConcatJob
  uploads: Record<string, UploadProgressEntry>

  addClip: (projectId: string, slot: SlotType, meta: Omit<Clip, 'id' | 'projectId' | 'slot' | 'order' | 'createdAt'>) => Clip
  removeClip: (projectId: string, slot: SlotType, clipId: string) => void
  toggleMute: (projectId: string, slot: SlotType, clipId: string) => void
  reorderClips: (projectId: string, slot: SlotType, from: number, to: number) => void
  clearSlot: (projectId: string, slot: SlotType) => void
  getSlotClips: (projectId: string, slot: SlotType) => Clip[]

  setConcatJob: (job: Partial<ConcatJob>) => void
  resetConcatJob: () => void

  setUploadProgress: (id: string, entry: Partial<UploadProgressEntry>) => void
  removeUploadProgress: (id: string) => void
}

export const useClipStore = create<ClipStore>((set, get) => ({
  clips: {},
  concatJob: { status: 'idle', progress: 0 },
  uploads: {},

  addClip: (projectId, slot, meta) => {
    const clip: Clip = {
      ...meta,
      id: uuid(),
      projectId,
      slot,
      order: 0,
      createdAt: Date.now(),
    }
    set((s) => {
      const key = `${projectId}-${slot}`
      const existing = s.clips[key] ?? []
      clip.order = existing.length
      return {
        clips: { ...s.clips, [key]: [...existing, clip] },
      }
    })
    return clip
  },

  removeClip: (projectId, slot, clipId) => {
    set((s) => {
      const key = `${projectId}-${slot}`
      const existing = s.clips[key] ?? []
      const filtered = existing
        .filter((c) => c.id !== clipId)
        .map((c, i) => ({ ...c, order: i }))
      return {
        clips: { ...s.clips, [key]: filtered },
      }
    })
  },

  toggleMute: (projectId, slot, clipId) => {
    set((s) => {
      const key = `${projectId}-${slot}`
      const existing = s.clips[key] ?? []
      return {
        clips: {
          ...s.clips,
          [key]: existing.map((c) =>
            c.id === clipId ? { ...c, muted: !c.muted } : c
          ),
        },
      }
    })
  },

  reorderClips: (projectId, slot, from, to) => {
    set((s) => {
      const key = `${projectId}-${slot}`
      const existing = [...(s.clips[key] ?? [])]
      const [moved] = existing.splice(from, 1)
      existing.splice(to, 0, moved)
      return {
        clips: {
          ...s.clips,
          [key]: existing.map((c, i) => ({ ...c, order: i })),
        },
      }
    })
  },

  clearSlot: (projectId, slot) => {
    set((s) => {
      const key = `${projectId}-${slot}`
      const next = { ...s.clips }
      delete next[key]
      return { clips: next }
    })
  },

  getSlotClips: (projectId, slot) => {
    const key = `${projectId}-${slot}`
    return (get().clips[key] ?? []).sort((a, b) => a.order - b.order)
  },

  setConcatJob: (job) => {
    set((s) => ({ concatJob: { ...s.concatJob, ...job } }))
  },

  resetConcatJob: () => {
    set({ concatJob: { status: 'idle', progress: 0 } })
  },

  setUploadProgress: (id, entry) => {
    set((s) => ({
      uploads: {
        ...s.uploads,
        [id]: { ...(s.uploads[id] ?? { clipId: id, fileName: '', progress: 0, status: 'queued' }), ...entry },
      },
    }))
  },

  removeUploadProgress: (id) => {
    set((s) => {
      const next = { ...s.uploads }
      delete next[id]
      return { uploads: next }
    })
  },
}))
