import type { Project } from '../../types'

interface ProjectListProps {
  projects: Project[]
  currentProjectId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export function ProjectList({ projects, currentProjectId, onSelect, onDelete }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-gray-500" role="status">
        No projects yet. Create one to get started.
      </p>
    )
  }

  return (
    <ul role="list" aria-label="Your projects" className="space-y-1 px-2">
      {projects.map((project) => (
        <li key={project.id}>
          <button
            type="button"
            onClick={() => onSelect(project.id)}
            aria-current={project.id === currentProjectId ? 'true' : undefined}
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              project.id === currentProjectId
                ? 'bg-sky-700 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <span className="block truncate font-medium">{project.name}</span>
            <span className="block text-xs text-gray-400">
              {new Date(project.updatedAt).toLocaleDateString()}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(project.id) }}
            aria-label={`Delete project ${project.name}`}
            className="ml-1 text-xs text-red-400 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  )
}
