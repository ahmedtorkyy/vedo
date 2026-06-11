import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectStore, useClipStore, useHistoryStore } from './lib/state'
import { useFFmpeg } from './hooks/useFFmpeg'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { MainLayout, Sidebar } from './components/layout'
import { SlotA, SlotB } from './components/ingestion'
import { PreviewPlayer } from './components/player'
import { TranscriptionPanel } from './components/transcription'
import { EditingPanel } from './components/editing'
import { DirectorPanel } from './components/director'
import { ExportPanel } from './components/export/ExportPanel'
import { AriaAnnouncerProvider, useAriaAnnouncer } from './components/accessibility/AriaAnnouncer'
import { AudioOrchestrator } from './lib/audio'
import { saveSessionSnapshot, restoreSession } from './lib/session/session-recovery'

type WorkspaceTab = 'slota' | 'slotb' | 'preview' | 'transcription' | 'editing' | 'director' | 'export'
const workspaceRef = { current: null as HTMLDivElement | null }

function Workspace({ onConcatNeeded }: { onConcatNeeded?: (projectId: string) => void }) {
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.currentProjectId))
  const concatJob = useClipStore((s) => s.concatJob)
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot)
  const { announce } = useAriaAnnouncer()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('slota')
  const prevConcatRef = useRef(concatJob.status)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    const prev = prevConcatRef.current
    prevConcatRef.current = concatJob.status

    if (concatJob.status === 'loading-ffmpeg') announce('Loading processing engine')
    else if (concatJob.status === 'concatenating') announce('Timeline re-stitch in progress')
    else if (concatJob.status === 'done' && prev !== 'done') announce('Timeline re-stitch complete')
    else if (concatJob.status === 'error') announce('Timeline re-stitch failed', true)
  }, [concatJob.status, announce])

  useEffect(() => {
    saveSessionSnapshot()
  }, [currentProjectId])

  useEffect(() => {
    if (project && workspaceRef.current) {
      workspaceRef.current.focus()
    }
  }, [project])

  const handleConcatNeeded = useCallback(() => {
    const id = useProjectStore.getState().currentProjectId
    if (id) onConcatNeeded?.(id)
  }, [onConcatNeeded])

  useKeyboardShortcuts(currentProjectId, {
    Escape: () => {},
  })

  if (!currentProjectId || !project) {
    return (
      <div className="flex flex-1 items-center justify-center" tabIndex={-1}>
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
    { key: 'transcription', label: 'Transcription' },
    { key: 'editing', label: 'Editing' },
    { key: 'director', label: 'Director' },
    { key: 'export', label: 'Export' },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden" ref={workspaceRef} tabIndex={-1}>
      <div className="border-b border-gray-700 bg-gray-900 px-4">
        <div className="flex items-center justify-between">
          <h2 className="py-3 text-sm font-semibold text-gray-200" tabIndex={-1}>
            {project.name}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (currentProjectId) pushSnapshot(currentProjectId, useClipStore.getState())
              announce('State snapshot saved')
            }}
            className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            aria-label="Save state snapshot"
          >
            Save State
          </button>
        </div>
        <nav role="tablist" aria-label="Workspace sections" className="-mb-px flex gap-4"
          onKeyDown={(e) => {
            const idx = tabs.findIndex((t) => t.key === activeTab)
            let next: WorkspaceTab | null = null
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault()
              next = tabs[(idx + 1) % tabs.length].key
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault()
              next = tabs[(idx - 1 + tabs.length) % tabs.length].key
            }
            if (next) {
              setActiveTab(next)
              tabRefs.current[next]?.focus()
              announce(`Switched to ${tabs.find((t) => t.key === next)!.label} tab`)
            }
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              ref={(el) => { tabRefs.current[tab.key] = el }}
              role="tab"
              aria-selected={activeTab === tab.key}
              tabIndex={activeTab === tab.key ? 0 : -1}
              aria-controls={`panel-${tab.key}`}
              onClick={() => {
                setActiveTab(tab.key)
                announce(`Switched to ${tab.label} tab`)
              }}
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
        <div role="tabpanel" id="panel-slota" aria-label="Main videos tab panel" hidden={activeTab !== 'slota'}>
          {activeTab === 'slota' && (
            <SlotA projectId={currentProjectId} onConcatNeeded={handleConcatNeeded} />
          )}
        </div>
        <div role="tabpanel" id="panel-slotb" aria-label="Overlays tab panel" hidden={activeTab !== 'slotb'}>
          {activeTab === 'slotb' && <SlotB projectId={currentProjectId} onConcatNeeded={handleConcatNeeded} />}
        </div>
        <div role="tabpanel" id="panel-preview" aria-label="Preview tab panel" hidden={activeTab !== 'preview'}>
          {activeTab === 'preview' && (
            <PreviewPlayer
              projectId={currentProjectId}
              concatReady={concatJob.status === 'done'}
            />
          )}
        </div>
        <div role="tabpanel" id="panel-transcription" aria-label="Transcription tab panel" hidden={activeTab !== 'transcription'}>
          {activeTab === 'transcription' && (
            <TranscriptionPanel projectId={currentProjectId} />
          )}
        </div>
        <div role="tabpanel" id="panel-editing" aria-label="Editing tab panel" hidden={activeTab !== 'editing'}>
          {activeTab === 'editing' && (
            <EditingPanel projectId={currentProjectId} />
          )}
        </div>
        <div role="tabpanel" id="panel-director" aria-label="Director tab panel" hidden={activeTab !== 'director'}>
          {activeTab === 'director' && (
            <DirectorPanel projectId={currentProjectId} />
          )}
        </div>
        <div role="tabpanel" id="panel-export" aria-label="Export tab panel" hidden={activeTab !== 'export'}>
          {activeTab === 'export' && (
            <ExportPanel projectId={currentProjectId} />
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  const { runConcat } = useFFmpeg()

  useEffect(() => {
    restoreSession()
    return () => { AudioOrchestrator.getInstance().dispose() }
  }, [])

  useEffect(() => {
    const id = useProjectStore.getState().currentProjectId
    if (id) {
      const clips = useClipStore.getState().getSlotClips(id, 'A')
      if (clips.length >= 2) runConcat(id)
    }
  }, [runConcat])

  const handleProjectChange = useCallback(() => {
    const id = useProjectStore.getState().currentProjectId
    if (id) {
      const clips = useClipStore.getState().getSlotClips(id, 'A')
      if (clips.length >= 2) runConcat(id)
    }
  }, [runConcat])

  return (
    <AriaAnnouncerProvider>
      <MainLayout sidebar={<Sidebar onProjectChange={handleProjectChange} />}>
        <Workspace onConcatNeeded={runConcat} />
      </MainLayout>
    </AriaAnnouncerProvider>
  )
}

export default App
