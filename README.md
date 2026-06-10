# vedo

AI-powered browser-based video editor. Upload clips, transcribe, detect silence, generate edit plans with an AI Director, and export with FFmpeg.wasm — all in the browser, no server required.

## Features

- **Upload & manage** — Drag-and-drop video upload to two tracks (Slot A: main video, Slot B: overlays)
- **Transcription** — AI speech-to-text using Whisper (tiny/base/small) running locally via ONNX
- **Silence detection** — Analyze audio for silent regions, filler words, and low-energy sections
- **Smart cut** — Remove silence regions automatically
- **AI Director** — Generates an edit plan with zoom, trim, and overlay decisions based on content analysis
- **Preview** — Play back the edited timeline with seek controls
- **Export** — Renders the edit plan through FFmpeg.wasm (trim, zoom, overlay, concat) and downloads the final MP4
- **Accessibility** — Screen-reader-optimized with ARIA live regions, roving tabindex, and keyboard navigation

## Tech stack

- **React 19** + **TypeScript** + **Vite**
- **Zustand** — state management
- **FFmpeg.wasm** — browser-based video processing
- **ONNX Runtime Web** — Whisper transcription in-browser
- **OPFS** (Origin Private File System) — file storage

## Getting started

```bash
npm install
npm run dev
```

### Commands

- `npm run dev` — development server
- `npm run build` — TypeScript check + production build
- `npm run test` — run Vitest tests
- `npm run lint` — ESLint check

## Project structure

```
src/
├── components/
│   ├── ingestion/     — Slot A/B upload zones, clip cards, progress
│   ├── player/        — PreviewPlayer with seek controls
│   ├── transcription/ — Transcription panel and segment rows
│   ├── editing/       — Silence detection, smart cut, timeline visualization
│   ├── director/      — AI Director panel (edit plan generation)
│   ├── export/        — Export panel (render + download)
│   └── accessibility/ — AriaAnnouncer, live region utilities
├── hooks/             — React hooks (useRender, useFileUpload, useEditing, etc.)
├── lib/
│   ├── director/      — Edit planner, store, types
│   ├── ffmpeg/        — render.ts (orchestration), concat.ts (worker commands)
│   ├── workers/       — ffmpeg.worker.ts (FFmpeg.wasm in Web Worker)
│   ├── audio/         — AudioOrchestrator (Web Audio API gain nodes)
│   ├── state/         — Zustand stores (clip-store, project-store)
│   ├── opfs/          — OPFS file I/O utilities
│   └── transcription/ — Whisper model wrapper
├── types/             — TypeScript interfaces
└── App.tsx            — Root component with workspace tabs
```

## Accessibility

vedo is built with accessibility as a hard requirement:

- All interactive elements have ARIA labels
- Tab panels use roving `tabindex` with arrow-key navigation
- Upload and export progress is announced through a live region
- Export progress bar has `role="progressbar"` with `aria-valuenow`
- Silent regions appear as both a visual timeline and a text list read by screen readers
- Focus traps on modals
- High-contrast color scheme
