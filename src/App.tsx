import { useCallback, useState } from 'react'
import { useProjectStore, useClipStore, useHistoryStore } from './lib/state'
import { useFFmpeg } from './hooks/useFFmpeg'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { MainLayout, Sidebar } from './components/layout'
import { SlotA, SlotB } from './components/ingestion'
import { PreviewPlayer } from './components/player'
import { AriaAnnouncerProvider, useAriaAnnouncer } from './components/accessibility/AriaAnnouncer'

type WorkspaceTab = 'slota' | 'slotb' | 'preview'

function Workspace() {
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.currentProjectId))
  const concatJob = useClipStore((s) => s.concatJob)
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot)
  const { runConcat } = useFFmpeg()
  const { announce } = useAriaAnnouncer()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('slota')

  const handleProjectChange = useCallback(() => {
    const id = useProjectStore.getState().currentProjectId
    if (id) {
      runConcat(id)
    }
  }, [runConcat])

  useKeyboardShortcuts({
    Escape: () => {
      // close any open panels — handled by dialog components
    },
  })

  if (!currentProjectId || !project) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-300">Welcome to vedo</h2>
          <p className="mt-2 text-sm text-gray-500">
            Create a project to start editing your videos.
          </p>
        </div>
      </div>
    )
  }

  const tabs: { key: WorkspaceTab; label: string }[] = [
    { key: 'slota', label: 'Main Videos' },
    { key: 'slotb', label: 'Overlays' },
    { key: 'preview', label: 'Preview' },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-gray-700 bg-gray-900 px-4">
        <div className="flex items-center justify-between">
          <h2 className="py-3 text-sm font-semibold text-gray-200">
            {project.name}
          </h2>
          <button
            type="button"
            onClick={() => {
              const state = useClipStore.getState()
              pushSnapshot(state)
              announce('State snapshot saved')
            }}
            className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            aria-label="Save state snapshot"
          >
            Save State
          </button>
        </div>
        <nav role="tablist" aria-label="Workspace sections" className="-mb-px flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`panel-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-1 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                activeTab === tab.key
                  ? 'border-sky-500 text-sky-300'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div role="tabpanel" id="panel-slota" hidden={activeTab !== 'slota'}>
          {activeTab === 'slota' && <SlotA projectId={currentProjectId} onConcatNeeded={() => runConcat(currentProjectId)} />}
        </div>
        <div role="tabpanel" id="panel-slotb" hidden={activeTab !== 'slotb'}>
          {activeTab === 'slotb' && <SlotB projectId={currentProjectId} />}
        </div>
        <div role="tabpanel" id="panel-preview" hidden={activeTab !== 'preview'}>
          {activeTab === 'preview' && (
            <PreviewPlayer
              projectId={currentProjectId}
              concatReady={concatJob.status === 'done'}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <AriaAnnouncerProvider>
      <MainLayout sidebar={<Sidebar onProjectChange={handleProjectChange} />}>
        <Workspace />
      </MainLayout>
    </AriaAnnouncerProvider>
  )
}

export default App
