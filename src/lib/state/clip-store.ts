import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Clip, UploadProgressEntry } from '../../types';

interface ClipState {
  clips: Record<string, { A: Clip[]; B: Clip[] }>;
  uploads: Record<string, UploadProgressEntry>;
  concatJob: { status: 'idle' | 'loading-ffmpeg' | 'concatenating' | 'done' | 'error'; outputFilename?: string };
  
  getSlotClips: (projectId: string, slot: 'A' | 'B') => Clip[];
  getClipById: (projectId: string, slot: 'A' | 'B', clipId: string) => Clip | undefined;
  addClip: (projectId: string, slot: 'A' | 'B', clip: Clip) => void;
  removeClip: (projectId: string, slot: 'A' | 'B', clipId: string) => Clip | undefined;
  toggleMute: (projectId: string, slot: 'A' | 'B', clipId: string) => void;
  initUpload: (entry: UploadProgressEntry) => void;
  setUploadProgress: (clipId: string, progress: number, status: UploadProgressEntry['status'], error?: string) => void;
  removeUploadProgress: (clipId: string) => void;
  setConcatStatus: (status: ClipState['concatJob']['status'], outputFilename?: string) => void;
  removeProjectData: (projectId: string) => void;
}

export const useClipStore = create<ClipState>()(
  persist(
    (set, get) => ({
      clips: {},
      uploads: {},
      concatJob: { status: 'idle' },

      getSlotClips: (projectId, slot) => {
        const projectClips = get().clips[projectId];
        if (!projectClips) return [];
        return projectClips[slot] || [];
      },

      getClipById: (projectId, slot, clipId) => {
        const clips = get().getSlotClips(projectId, slot);
        return clips.find((c) => c.id === clipId);
      },

      addClip: (projectId, slot, clip) => set((state) => {
        const currentProject = state.clips[projectId] || { A: [], B: [] };
        const updatedSlot = [...currentProject[slot], clip];
        return {
          clips: {
            ...state.clips,
            [projectId]: { ...currentProject, [slot]: updatedSlot }
          }
        };
      }),

      removeClip: (projectId, slot, clipId) => {
        let removed: Clip | undefined;
        set((state) => {
          const currentProject = state.clips[projectId] || { A: [], B: [] };
          removed = currentProject[slot].find((c) => c.id === clipId);
          const updatedSlot = currentProject[slot].filter((c) => c.id !== clipId);
          return {
            clips: {
              ...state.clips,
              [projectId]: { ...currentProject, [slot]: updatedSlot }
            }
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

        return { clips: nextClips, uploads: nextUploads }
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
