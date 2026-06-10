import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { Project } from '../../types'

interface ProjectStore {
  projects: Project[]
  currentProjectId: string | null
  createProject: (name: string) => Project
  deleteProject: (id: string) => void
  renameProject: (id: string, name: string) => void
  setCurrentProject: (id: string | null) => void
  getCurrentProject: () => Project | undefined
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProjectId: null,

  createProject: (name: string) => {
    const project: Project = {
      id: uuid(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({ projects: [...s.projects, project], currentProjectId: project.id }))
    return project
  },

  deleteProject: (id: string) => {
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
}))
