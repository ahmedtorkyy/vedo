import { useProjectStore } from '../../lib/state'
import { ProjectList } from './ProjectList'
import { NewProjectDialog } from './NewProjectDialog'
import { useState } from 'react'

interface SidebarProps {
  onProjectChange: () => void
}

export function Sidebar({ onProjectChange }: SidebarProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const projects = useProjectStore((s) => s.projects)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const createProject = useProjectStore((s) => s.createProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)

  function handleCreate(name: string) {
    createProject(name)
    setDialogOpen(false)
    onProjectChange()
  }

  function handleSelect(id: string) {
    setCurrentProject(id)
    onProjectChange()
  }

  function handleDelete(id: string) {
    deleteProject(id)
    onProjectChange()
  }

  return (
    <aside
      role="region"
      aria-label="Project sidebar"
      className="flex h-full w-72 flex-col border-r border-gray-700 bg-gray-900"
    >
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
        <h1 className="text-base font-bold text-gray-100">vedo</h1>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs text-white hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Create new project"
        >
          + New
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Projects navigation">
        <ProjectList
          projects={projects}
          currentProjectId={currentProjectId}
          onSelect={handleSelect}
          onDelete={handleDelete}
        />
      </nav>
      <NewProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
      />
    </aside>
  )
}
