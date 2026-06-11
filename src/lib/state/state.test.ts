import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClipStore } from './clip-store'
import { useProjectStore } from './project-store'
import { useHistoryStore } from './history-store'
import { useDirectorStore } from '../director/director-store'

// Mock OPFS ProjectStorage since it depends on browser APIs
vi.mock('../opfs/project-storage', () => ({
  ProjectStorage: {
    writeMetadata: vi.fn(),
    deleteProjectFolder: vi.fn(),
  },
}))

// --- Clip store ---
describe('clip-store', () => {
  const PROJECT = 'test-proj'
  const clipA = { id: 'c1', fileName: 'clip1.mp4', fileSize: 1000, filePath: '/clips/clip1.mp4', opfsFilename: 'c1.mp4', duration: 10, muted: false }
  const clipB = { id: 'c2', fileName: 'clip2.mp4', fileSize: 500, filePath: '/clips/clip2.mp4', opfsFilename: 'c2.mp4', duration: 5, muted: false }

  beforeEach(() => {
    useClipStore.setState({
      clips: {},
      uploads: {},
      concatJob: { status: 'idle' },
      selectedClipId: {},
      pendingSeek: null,
    })
  })

  it('adds clip and auto-selects it as first clip', () => {
    const store = useClipStore.getState()
    store.addClip(PROJECT, 'A', clipA)
    const state = useClipStore.getState()
    const slotClips = state.getSlotClips(PROJECT, 'A')
    expect(slotClips).toHaveLength(1)
    expect(slotClips[0].id).toBe('c1')
    expect(state.selectedClipId[PROJECT]).toBe('c1')
  })

  it('does not auto-select when clips already exist', () => {
    useClipStore.getState().addClip(PROJECT, 'A', clipA)
    useClipStore.getState().addClip(PROJECT, 'A', clipB)
    const state = useClipStore.getState()
    expect(state.getSlotClips(PROJECT, 'A')).toHaveLength(2)
    expect(state.selectedClipId[PROJECT]).toBe('c1')
  })

  it('removes clip and clears selection', () => {
    useClipStore.getState().addClip(PROJECT, 'A', clipA)
    const removed = useClipStore.getState().removeClip(PROJECT, 'A', 'c1')
    expect(removed?.id).toBe('c1')
    const state = useClipStore.getState()
    expect(state.getSlotClips(PROJECT, 'A')).toHaveLength(0)
    expect(state.selectedClipId[PROJECT]).toBeNull()
  })

  it('returns undefined when removing non-existent clip', () => {
    const removed = useClipStore.getState().removeClip(PROJECT, 'A', 'nonexistent')
    expect(removed).toBeUndefined()
  })

  it('toggles mute on a clip', () => {
    useClipStore.getState().addClip(PROJECT, 'A', clipA)
    useClipStore.getState().toggleMute(PROJECT, 'A', 'c1')
    expect(useClipStore.getState().getClipById(PROJECT, 'A', 'c1')?.muted).toBe(true)
    useClipStore.getState().toggleMute(PROJECT, 'A', 'c1')
    expect(useClipStore.getState().getClipById(PROJECT, 'A', 'c1')?.muted).toBe(false)
  })

  it('reorders clip up', () => {
    useClipStore.getState().addClip(PROJECT, 'A', clipA)
    useClipStore.getState().addClip(PROJECT, 'A', clipB)
    useClipStore.getState().reorderClip(PROJECT, 'A', 'c2', 'up')
    const clips = useClipStore.getState().getSlotClips(PROJECT, 'A')
    expect(clips[0].id).toBe('c2')
    expect(clips[1].id).toBe('c1')
  })

  it('reorders clip down', () => {
    useClipStore.getState().addClip(PROJECT, 'A', clipA)
    useClipStore.getState().addClip(PROJECT, 'A', clipB)
    useClipStore.getState().reorderClip(PROJECT, 'A', 'c1', 'down')
    const clips = useClipStore.getState().getSlotClips(PROJECT, 'A')
    expect(clips[0].id).toBe('c2')
    expect(clips[1].id).toBe('c1')
  })

  it('does not reorder first clip up', () => {
    useClipStore.getState().addClip(PROJECT, 'A', clipA)
    useClipStore.getState().addClip(PROJECT, 'A', clipB)
    useClipStore.getState().reorderClip(PROJECT, 'A', 'c1', 'up')
    const clips = useClipStore.getState().getSlotClips(PROJECT, 'A')
    expect(clips[0].id).toBe('c1')
  })

  it('updates clip fields', () => {
    useClipStore.getState().addClip(PROJECT, 'A', clipA)
    useClipStore.getState().updateClip(PROJECT, 'A', 'c1', { muted: true, duration: 15 })
    const updated = useClipStore.getState().getClipById(PROJECT, 'A', 'c1')
    expect(updated?.muted).toBe(true)
    expect(updated?.duration).toBe(15)
  })

  it('tracks upload progress', () => {
    const entry = { clipId: 'up1', fileName: 'test.mp4', progress: 0, status: 'uploading' as const }
    useClipStore.getState().initUpload(entry)
    expect(useClipStore.getState().uploads['up1']).toBeDefined()
    useClipStore.getState().setUploadProgress('up1', 50, 'uploading')
    expect(useClipStore.getState().uploads['up1'].progress).toBe(50)
    useClipStore.getState().removeUploadProgress('up1')
    expect(useClipStore.getState().uploads['up1']).toBeUndefined()
  })

  it('removes project data', () => {
    useClipStore.getState().addClip(PROJECT, 'A', clipA)
    useClipStore.getState().addClip(PROJECT, 'B', { id: 'ov1', fileName: 'overlay.mp4', fileSize: 800, filePath: '/clips/overlay.mp4', opfsFilename: 'ov1.mp4', duration: 8, muted: false })
    useClipStore.getState().removeProjectData(PROJECT)
    const state = useClipStore.getState()
    expect(state.clips[PROJECT]).toBeUndefined()
    expect(state.selectedClipId[PROJECT]).toBeUndefined()
  })
})

// --- Project store ---
describe('project-store', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [], currentProjectId: null })
  })

  it('creates a project', () => {
    const project = useProjectStore.getState().createProject('Test Video')
    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(1)
    expect(project.name).toBe('Test Video')
    expect(state.currentProjectId).toBe(project.id)
  })

  it('renames a project', () => {
    const project = useProjectStore.getState().createProject('Old Name')
    useProjectStore.getState().renameProject(project.id, 'New Name')
    const state = useProjectStore.getState()
    expect(state.projects[0].name).toBe('New Name')
  })

  it('returns current project', () => {
    const project = useProjectStore.getState().createProject('Test')
    const current = useProjectStore.getState().getCurrentProject()
    expect(current?.id).toBe(project.id)
    expect(current?.name).toBe('Test')
  })

  it('returns undefined when no current project', () => {
    const current = useProjectStore.getState().getCurrentProject()
    expect(current).toBeUndefined()
  })

  it('deletes a project', async () => {
    const project = useProjectStore.getState().createProject('To Delete')
    await useProjectStore.getState().deleteProject(project.id)
    const state = useProjectStore.getState()
    expect(state.projects).toHaveLength(0)
    expect(state.currentProjectId).toBeNull()
  })

  it('sets current project', () => {
    const p1 = useProjectStore.getState().createProject('First')
    const p2 = useProjectStore.getState().createProject('Second')
    useProjectStore.getState().setCurrentProject(p1.id)
    expect(useProjectStore.getState().currentProjectId).toBe(p1.id)
    useProjectStore.getState().setCurrentProject(p2.id)
    expect(useProjectStore.getState().currentProjectId).toBe(p2.id)
    useProjectStore.getState().setCurrentProject(null)
    expect(useProjectStore.getState().currentProjectId).toBeNull()
  })
})

// --- History store ---
describe('history-store', () => {
  const PROJECT = 'test-proj'

  beforeEach(() => {
    useHistoryStore.setState({ historyByProject: {} })
  })

  it('pushes a snapshot onto undo stack', () => {
    useHistoryStore.getState().pushSnapshot(PROJECT, { clips: [] })
    const state = useHistoryStore.getState()
    expect(state.historyByProject[PROJECT].undoStack).toHaveLength(1)
    expect(state.historyByProject[PROJECT].redoStack).toHaveLength(0)
  })

  it('undo returns a state and moves entry to redo', () => {
    useHistoryStore.getState().pushSnapshot(PROJECT, 'state1')
    useHistoryStore.getState().pushSnapshot(PROJECT, 'state2')
    const restored = useHistoryStore.getState().undo(PROJECT)
    expect(restored).toBe('"state2"')
    const state = useHistoryStore.getState()
    expect(state.historyByProject[PROJECT].undoStack).toHaveLength(1)
    expect(state.historyByProject[PROJECT].redoStack).toHaveLength(1)
  })

  it('redo restores from redo stack', () => {
    useHistoryStore.getState().pushSnapshot(PROJECT, 's1')
    const previous = useHistoryStore.getState().undo(PROJECT)
    expect(previous).toBe('"s1"')
    const restored = useHistoryStore.getState().redo(PROJECT)
    expect(restored).toBe('"s1"')
  })

  it('undo returns null when stack is empty', () => {
    expect(useHistoryStore.getState().undo(PROJECT)).toBeNull()
  })

  it('redo returns null when stack is empty', () => {
    expect(useHistoryStore.getState().redo(PROJECT)).toBeNull()
  })

  it('clears redo stack on new push', () => {
    useHistoryStore.getState().pushSnapshot(PROJECT, 's1')
    useHistoryStore.getState().pushSnapshot(PROJECT, 's2')
    useHistoryStore.getState().undo(PROJECT)
    expect(useHistoryStore.getState().historyByProject[PROJECT].redoStack).toHaveLength(1)
    useHistoryStore.getState().pushSnapshot(PROJECT, 's3')
    expect(useHistoryStore.getState().historyByProject[PROJECT].redoStack).toHaveLength(0)
  })

  it('removes project history', () => {
    useHistoryStore.getState().pushSnapshot(PROJECT, 'data')
    useHistoryStore.getState().removeProjectHistory(PROJECT)
    expect(useHistoryStore.getState().historyByProject[PROJECT]).toBeUndefined()
  })

  it('clears all history', () => {
    useHistoryStore.getState().pushSnapshot('p1', 'a')
    useHistoryStore.getState().pushSnapshot('p2', 'b')
    useHistoryStore.getState().clear()
    expect(useHistoryStore.getState().historyByProject).toEqual({})
  })
})

// --- Director store ---
describe('director-store', () => {
  const PROJECT = 'test-proj'

  beforeEach(() => {
    useDirectorStore.setState({ state: {} })
  })

  it('sets instructions', () => {
    useDirectorStore.getState().setInstructions(PROJECT, 'dynamic zoom')
    expect(useDirectorStore.getState().state[PROJECT]?.instructions).toBe('dynamic zoom')
  })

  it('sets style', () => {
    useDirectorStore.getState().setStyle(PROJECT, 'gaming')
    expect(useDirectorStore.getState().state[PROJECT]?.selectedStyle).toBe('gaming')
  })

  it('sets status', () => {
    useDirectorStore.getState().setStatus(PROJECT, 'analyzing')
    expect(useDirectorStore.getState().state[PROJECT]?.status).toBe('analyzing')
  })

  it('sets plan and marks ready', () => {
    const plan = {
      projectId: PROJECT, style: 'gaming' as const, instructions: '',
      contentAnalysis: {
        topic: '', category: '', keywords: [],
        structure: { hook: null, setup: null, mainContent: null, conclusion: null },
        importantMoments: [], emotionalMoments: [], keySubjects: [], keyObjects: [],
      },
      decisions: [{
        id: 'overlay-0', type: 'overlay' as const, clipId: 'c1', slot: 'A' as const,
        startTime: 5, endTime: 10, parameters: {}, justification: 'test',
      }],
      estimatedDuration: 30, warnings: [],
    }
    useDirectorStore.getState().setPlan(PROJECT, plan)
    const state = useDirectorStore.getState().state[PROJECT]
    expect(state?.plan?.estimatedDuration).toBe(30)
    expect(state?.status).toBe('ready')
  })

  it('updates overlay decision times', () => {
    const plan = {
      projectId: PROJECT, style: 'gaming' as const, instructions: '',
      contentAnalysis: {
        topic: '', category: '', keywords: [],
        structure: { hook: null, setup: null, mainContent: null, conclusion: null },
        importantMoments: [], emotionalMoments: [], keySubjects: [], keyObjects: [],
      },
      decisions: [{
        id: 'overlay-0', type: 'overlay' as const, clipId: 'c1', slot: 'A' as const,
        startTime: 5, endTime: 10, parameters: { placement: 'pip' }, justification: 'overlay',
      }],
      estimatedDuration: 30, warnings: [],
    }
    useDirectorStore.getState().setPlan(PROJECT, plan)
    useDirectorStore.getState().updateOverlayDecision(PROJECT, 0, 2, 6)
    const overlayDecision = useDirectorStore.getState().state[PROJECT]?.plan?.decisions[0]
    expect(overlayDecision?.startTime).toBe(2)
    expect(overlayDecision?.endTime).toBe(6)
  })

  it('does nothing when updating overlay index out of range', () => {
    const plan = {
      projectId: PROJECT, style: 'gaming' as const, instructions: '',
      contentAnalysis: {
        topic: '', category: '', keywords: [],
        structure: { hook: null, setup: null, mainContent: null, conclusion: null },
        importantMoments: [], emotionalMoments: [], keySubjects: [], keyObjects: [],
      },
      decisions: [{
        id: 'keep-0', type: 'keep' as const, clipId: 'c1', slot: 'A' as const,
        startTime: 0, endTime: 10, parameters: {}, justification: 'keep',
      }],
      estimatedDuration: 30, warnings: [],
    }
    useDirectorStore.getState().setPlan(PROJECT, plan)
    useDirectorStore.getState().updateOverlayDecision(PROJECT, 0, 2, 6)
    const decision = useDirectorStore.getState().state[PROJECT]?.plan?.decisions[0]
    expect(decision?.startTime).toBe(0)
  })

  it('sets suggestions', () => {
    const suggestions = [
      { id: 's1', label: 'Add zoom', description: 'Zoom on hook', selected: false },
      { id: 's2', label: 'Add music', description: 'Background music', selected: true },
    ]
    useDirectorStore.getState().setSuggestions(PROJECT, suggestions)
    expect(useDirectorStore.getState().state[PROJECT]?.suggestions).toHaveLength(2)
  })

  it('toggles suggestion selection', () => {
    useDirectorStore.getState().setSuggestions(PROJECT, [
      { id: 's1', label: 'Zoom', description: 'Zoom', selected: false },
    ])
    useDirectorStore.getState().toggleSuggestion(PROJECT, 's1')
    expect(useDirectorStore.getState().state[PROJECT]?.suggestions[0].selected).toBe(true)
    useDirectorStore.getState().toggleSuggestion(PROJECT, 's1')
    expect(useDirectorStore.getState().state[PROJECT]?.suggestions[0].selected).toBe(false)
  })

  it('sets feedback text', () => {
    useDirectorStore.getState().setFeedbackText(PROJECT, 'looks great')
    expect(useDirectorStore.getState().state[PROJECT]?.feedbackText).toBe('looks great')
  })

  it('sets error', () => {
    useDirectorStore.getState().setError(PROJECT, 'something went wrong')
    const state = useDirectorStore.getState().state[PROJECT]
    expect(state?.status).toBe('error')
    expect(state?.error).toBe('something went wrong')
  })

  it('clears project', () => {
    useDirectorStore.getState().setInstructions(PROJECT, 'test')
    useDirectorStore.getState().clearProject(PROJECT)
    expect(useDirectorStore.getState().state[PROJECT]).toBeUndefined()
  })

  it('clears all projects', () => {
    useDirectorStore.getState().setInstructions('p1', 'a')
    useDirectorStore.getState().setInstructions('p2', 'b')
    useDirectorStore.getState().clearAll()
    expect(useDirectorStore.getState().state).toEqual({})
  })
})
