import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import type { Project } from '../../types'
import { ProjectStorage } from '../opfs'
import { useClipStore } from './clip-store'
import { useHistoryStore } from './history-store'
import { useTranscriptionStore } from '../transcription/transcription-store'
import { useEditingStore } from '../editing/editing-store'

interface ProjectStore {
  projects: Project[]
  currentProjectId: string | null
  createProject: (name: string) => Project
  deleteProject: (id: string) => Promise<void>
  renameProject: (id: string, name: string) => void
  setCurrentProject: (id: string | null) => void
  getCurrentProject: () => Project | undefined
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,

      createProject: (name: string) => {
        const project: Project = {
          id: uuid(),
          name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set({ projects: [...get().projects, project], currentProjectId: project.id })

        ProjectStorage.writeMetadata(project.id, {
          name: project.name,
          id: project.id,
          createdAt: project.createdAt,
          modifiedAt: project.updatedAt,
          version: 1,
        })

        return project
      },

      deleteProject: async (id: string) => {
        await ProjectStorage.deleteProjectFolder(id)

        useClipStore.getState().removeProjectData(id)
        useClipStore.getState().setConcatStatus('idle')

        useTranscriptionStore.getState().removeProjectData(id)

        useEditingStore.getState().removeProjectData(id)

        useHistoryStore.getState().clear()

        try { sessionStorage.removeItem('vedo-session') } catch { /* sessionStorage may be unavailable */ }

        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
        }))
      },

      renameProject: (id: string, name: string) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, name, updatedAt: Date.now() } : p
          ),
        }))
      },

      setCurrentProject: (id: string | null) => {
        set({ currentProjectId: id })
      },

      getCurrentProject: () => {
        const { projects, currentProjectId } = get()
        return projects.find((p) => p.id === currentProjectId)
      },
    }),
    { name: 'vedo-projects' }
  )
)
