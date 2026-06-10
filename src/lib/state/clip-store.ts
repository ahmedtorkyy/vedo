import { create } from 'zustand';
import type { Clip, UploadProgressEntry } from '../../types';

interface ClipState {
  clips: Record<string, { A: Clip[]; B: Clip[] }>;
  uploads: Record<string, UploadProgressEntry>;
  concatJob: { status: 'idle' | 'loading-ffmpeg' | 'concatenating' | 'done' | 'error' };
  
  getSlotClips: (projectId: string, slot: 'A' | 'B') => Clip[];
  addClip: (projectId: string, slot: 'A' | 'B', clip: Clip) => void;
  removeClip: (projectId: string, slot: 'A' | 'B', clipId: string) => void;
  toggleMute: (projectId: string, slot: 'A' | 'B', clipId: string) => void;
  initUpload: (entry: UploadProgressEntry) => void;
  setUploadProgress: (clipId: string, progress: number, status: UploadProgressEntry['status'], error?: string) => void;
  setConcatStatus: (status: ClipState['concatJob']['status']) => void;
}

export const useClipStore = create<ClipState>((set, get) => ({
  clips: {},
  uploads: {},
  concatJob: { status: 'idle' },

  getSlotClips: (projectId, slot) => {
    const projectClips = get().clips[projectId];
    if (!projectClips) return [];
    return projectClips[slot] || [];
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

  removeClip: (projectId, slot, clipId) => set((state) => {
    const currentProject = state.clips[projectId] || { A: [], B: [] };
    const updatedSlot = currentProject[slot].filter((c) => c.id !== clipId);
    return {
      clips: {
        ...state.clips,
        [projectId]: { ...currentProject, [slot]: updatedSlot }
      }
    };
  }),

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

  setConcatStatus: (status) => set({ concatJob: { status } })
}));
