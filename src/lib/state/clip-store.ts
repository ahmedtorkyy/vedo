import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Clip, UploadProgressEntry } from '../../types';

const EMPTY_CLIPS: readonly Clip[] = []

interface ClipState {
  clips: Record<string, { A: Clip[]; B: Clip[] }>;
  uploads: Record<string, UploadProgressEntry>;
  concatJob: { status: 'idle' | 'loading-ffmpeg' | 'concatenating' | 'done' | 'error'; outputFilename?: string };
  
  getSlotClips: (projectId: string, slot: 'A' | 'B') => Clip[];
  getClipById: (projectId: string, slot: 'A' | 'B', clipId: string) => Clip | undefined;
  addClip: (projectId: string, slot: 'A' | 'B', clip: Clip) => void;
  insertClipAt: (projectId: string, slot: 'A' | 'B', index: number, clip: Clip) => void;
  removeClip: (projectId: string, slot: 'A' | 'B', clipId: string) => Clip | undefined;
  toggleMute: (projectId: string, slot: 'A' | 'B', clipId: string) => void;
  reorderClip: (projectId: string, slot: 'A' | 'B', clipId: string, direction: 'up' | 'down') => void;
  updateClip: (projectId: string, slot: 'A' | 'B', clipId: string, updates: Partial<Clip>) => void;
  initUpload: (entry: UploadProgressEntry) => void;
  setUploadProgress: (clipId: string, progress: number, status: UploadProgressEntry['status'], error?: string) => void;
  removeUploadProgress: (clipId: string) => void;
  setConcatStatus: (status: ClipState['concatJob']['status'], outputFilename?: string) => void;
  selectedClipId: Record<string, string | null>;
  setSelectedClipId: (projectId: string, clipId: string | null) => void;
  pendingSeek: number | null;
  setPendingSeek: (time: number) => void;
  clearPendingSeek: () => void;
  removeProjectData: (projectId: string) => void;
}

export const useClipStore = create<ClipState>()(
  persist(
    (set, get) => ({
      clips: {},
      uploads: {},
      concatJob: { status: 'idle' },
      selectedClipId: {},
      pendingSeek: null,

      getSlotClips: (projectId, slot) => {
        const projectClips = get().clips[projectId];
        if (!projectClips) return EMPTY_CLIPS as Clip[];
        return projectClips[slot] || (EMPTY_CLIPS as Clip[]);
      },

      getClipById: (projectId, slot, clipId) => {
        const clips = get().getSlotClips(projectId, slot);
        return clips.find((c) => c.id === clipId);
      },

      addClip: (projectId, slot, clip) => set((state) => {
        const currentProject = state.clips[projectId] || { A: [], B: [] };
        const updatedSlot = [...currentProject[slot], clip];
        const totalClips = updatedSlot.length + (slot === 'A' ? currentProject.B.length : currentProject.A.length);
        const newSelected = { ...state.selectedClipId };
        if (totalClips === 1) {
          newSelected[projectId] = clip.id;
        }
        return {
          clips: {
            ...state.clips,
            [projectId]: { ...currentProject, [slot]: updatedSlot }
          },
          selectedClipId: newSelected,
        };
      }),

      insertClipAt: (projectId, slot, index, clip) => set((state) => {
        const currentProject = state.clips[projectId] || { A: [], B: [] };
        const arr = [...currentProject[slot]];
        arr.splice(index, 0, clip);
        return {
          clips: {
            ...state.clips,
            [projectId]: { ...currentProject, [slot]: arr }
          }
        };
      }),

      removeClip: (projectId, slot, clipId) => {
        let removed: Clip | undefined;
        set((state) => {
          const currentProject = state.clips[projectId] || { A: [], B: [] };
          removed = currentProject[slot].find((c) => c.id === clipId);
          const updatedSlot = currentProject[slot].filter((c) => c.id !== clipId);
          const newSelected = { ...state.selectedClipId };
          if (newSelected[projectId] === clipId) {
            newSelected[projectId] = null;
          }
          return {
            clips: {
              ...state.clips,
              [projectId]: { ...currentProject, [slot]: updatedSlot }
            },
            selectedClipId: newSelected,
          };
        });
        return removed;
      },

      toggleMute: (projectId, slot, clipId) => set((state) => {
        const currentProject = state.clips[projectId] || { A: [], B: [] };
        const updatedSlot = currentProject[slot].map((c) => 
          c.id === clipId ? { ...c, muted: !c.muted } : c
        );
        return {
          clips: {
            ...state.clips,
            [projectId]: { ...currentProject, [slot]: updatedSlot }
          }
        };
      }),

      reorderClip: (projectId, slot, clipId, direction) => set((state) => {
        const currentProject = state.clips[projectId] || { A: [], B: [] };
        const arr = [...currentProject[slot]];
        const idx = arr.findIndex((c) => c.id === clipId);
        if (idx === -1) return {};
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= arr.length) return {};
        [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
        return {
          clips: {
            ...state.clips,
            [projectId]: { ...currentProject, [slot]: arr }
          }
        };
      }),

      updateClip: (projectId, slot, clipId, updates) => set((state) => {
        const currentProject = state.clips[projectId];
        if (!currentProject) return {};
        const updatedSlot = currentProject[slot].map((c) =>
          c.id === clipId ? { ...c, ...updates } : c
        );
        return {
          clips: {
            ...state.clips,
            [projectId]: { ...currentProject, [slot]: updatedSlot }
          }
        };
      }),

      initUpload: (entry) => set((state) => ({
        uploads: { ...state.uploads, [entry.clipId]: entry }
      })),

      setUploadProgress: (clipId, progress, status, error) => set((state) => {
        if (!state.uploads[clipId]) return {};
        return {
          uploads: {
            ...state.uploads,
            [clipId]: { ...state.uploads[clipId], progress, status, error }
          }
        };
      }),

      removeUploadProgress: (clipId) => set((state) => {
        const next = { ...state.uploads };
        delete next[clipId];
        return { uploads: next };
      }),

      setConcatStatus: (status, outputFilename) => set({ concatJob: { status, outputFilename } }),
      setSelectedClipId: (projectId, clipId) => set((state) => ({
        selectedClipId: { ...state.selectedClipId, [projectId]: clipId }
      })),
      setPendingSeek: (time) => set({ pendingSeek: time }),
      clearPendingSeek: () => set({ pendingSeek: null }),

      removeProjectData: (projectId) => set((state) => {
        const nextClips = { ...state.clips }
        const projectClips = nextClips[projectId]
        delete nextClips[projectId]

        const nextUploads = { ...state.uploads }
        if (projectClips) {
          for (const slot of ['A', 'B'] as const) {
            for (const clip of projectClips[slot]) {
              delete nextUploads[clip.id]
            }
          }
        }

        const nextSelectedClipId = { ...state.selectedClipId }
        delete nextSelectedClipId[projectId]

        return { clips: nextClips, uploads: nextUploads, selectedClipId: nextSelectedClipId }
      }),
    }),
    {
      name: 'vedo-clips',
      partialize: (state) => ({
        clips: state.clips,
      }),
    }
  )
);
