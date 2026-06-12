import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectStore, useClipStore, useHistoryStore } from './lib/state'
import { useFFmpeg } from './hooks/useFFmpeg'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { backgroundLoadModel } from './lib/transcription/model-loader'
import { MainLayout, Sidebar } from './components/layout'
import { SlotA, SlotB } from './components/ingestion'
import { PreviewPlayer } from './components/player'
import { TranscriptionPanel } from './components/transcription'
import { EditingPanel } from './components/editing'
import { DirectorPanel } from './components/director'
import { ExportPanel } from './components/export/ExportPanel'
import { TimelineEditor } from './components/timeline/TimelineEditor'
import { useTimelineStore } from './lib/timeline/timeline-store'
import { AriaAnnouncerProvider, useAriaAnnouncer } from './components/accessibility/AriaAnnouncer'
import { AudioOrchestrator } from './lib/audio'
import { saveSessionSnapshot, restoreSession } from './lib/session/session-recovery'
import { backfillClipMetadata } from './lib/state/clip-backfill'
import { initNativeFFmpeg } from './lib/ffmpeg/native'

type WorkspaceTab = 'slota' | 'slotb' | 'preview' | 'transcription' | 'editing' | 'director' | 'timeline' | 'export'
const workspaceRef = { current: null as HTMLDivElement | null }

function Workspace({ onConcatNeeded }: { onConcatNeeded?: (projectId: string) => void }) {
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const project = useProjectStore((s) => s.projects.find((p) => p.id === s.currentProjectId))
  const concatJob = useClipStore((s) => s.concatJob)
  const pushSnapshot = useHistoryStore((s) => s.pushSnapshot)
  const { announce } = useAriaAnnouncer()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('slota')
  const [pendingTab, setPendingTab] = useState<WorkspaceTab | null>(null)
  const prevConcatRef = useRef(concatJob.status)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const dialogRef = useRef<HTMLDivElement | null>(null)

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

  // Re-measure metadata for clips whose duration could not be read at upload
  // time (hidden-tab uploads fall back to duration 0, which disables planning).
  // Runs on project open and again whenever the tab becomes visible.
  useEffect(() => {
    if (!currentProjectId) return
    let cancelled = false

    const runBackfill = async () => {
      const updated = await backfillClipMetadata(currentProjectId)
      if (!cancelled && updated > 0) {
        announce(`Clip information updated for ${updated} clip${updated > 1 ? 's' : ''}`)
      }
    }

    runBackfill()

    const onVisible = () => {
      if (document.visibilityState === 'visible') runBackfill()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [currentProjectId, announce])

  useEffect(() => {
    if (project && workspaceRef.current) {
      workspaceRef.current.focus()
    }
  }, [project])

  const handleConcatNeeded = useCallback(() => {
    const id = useProjectStore.getState().currentProjectId
    if (id) onConcatNeeded?.(id)
  }, [onConcatNeeded])

  useEffect(() => {
    if (pendingTab && dialogRef.current) {
      const heading = dialogRef.current.querySelector('h3') as HTMLHeadingElement | null
      heading?.focus()
    }
  }, [pendingTab])

  useEffect(() => {
    if (!pendingTab) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingTab(null)
        announce('Cancelled, staying on timeline')
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [pendingTab, announce])

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
    { key: 'timeline', label: 'Timeline' },
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
              if (activeTab === 'timeline' && next !== 'timeline' && useTimelineStore.getState().hasDirty(currentProjectId)) {
                setPendingTab(next)
                return
              }
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
                if (activeTab === 'timeline' && tab.key !== 'timeline' && useTimelineStore.getState().hasDirty(currentProjectId)) {
                  setPendingTab(tab.key)
                  return
                }
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
            <EditingPanel projectId={currentProjectId} onConcatNeeded={handleConcatNeeded} />
          )}
        </div>
        <div role="tabpanel" id="panel-director" aria-label="Director tab panel" hidden={activeTab !== 'director'}>
          {activeTab === 'director' && (
            <DirectorPanel projectId={currentProjectId} />
          )}
        </div>
        <div role="tabpanel" id="panel-timeline" aria-label="Timeline tab panel" hidden={activeTab !== 'timeline'}>
          {activeTab === 'timeline' && (
            <TimelineEditor projectId={currentProjectId} onConcatNeeded={handleConcatNeeded} />
          )}
        </div>
        <div role="tabpanel" id="panel-export" aria-label="Export tab panel" hidden={activeTab !== 'export'}>
          {activeTab === 'export' && (
            <ExportPanel projectId={currentProjectId} />
          )}
        </div>
      </div>

      {pendingTab && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm navigation"
        >
          <div className="mx-4 w-full max-w-sm rounded-lg bg-gray-800 p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-200" tabIndex={-1}>Discard timeline changes?</h3>
            <p className="mt-1 text-xs text-gray-400">
              Returning to the Director will discard any unsaved timeline adjustments. Are you sure?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingTab(null)}
                className="rounded-md bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                aria-label="Cancel, stay on timeline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab(pendingTab)
                  setPendingTab(null)
                  tabRefs.current[pendingTab]?.focus()
                  announce(`Switched to ${tabs.find((t) => t.key === pendingTab)!.label} tab`)
                }}
                className="rounded-md bg-rose-700 px-3 py-1.5 text-xs text-white hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500"
                aria-label="Discard changes and switch to director"
              >
                Discard &amp; Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  const { runConcat } = useFFmpeg()

  useEffect(() => {
    restoreSession()
    backgroundLoadModel()
    initNativeFFmpeg()
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
