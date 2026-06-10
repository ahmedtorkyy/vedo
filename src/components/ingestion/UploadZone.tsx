import { useRef, useState } from 'react'

interface UploadZoneProps {
  slotLabel: string
  onFiles: (files: FileList) => void
  disabled?: boolean
}

export function UploadZone({ slotLabel, onFiles, disabled }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    if (e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave() {
    setDragging(false)
  }

  function handleClick() {
    if (!disabled) inputRef.current?.click()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Upload files to ${slotLabel}. Drag and drop or click to browse.`}
      aria-disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
        dragging
          ? 'border-sky-400 bg-sky-400/10'
          : disabled
            ? 'border-gray-600 bg-gray-800/50'
            : 'border-gray-600 bg-gray-800 hover:border-gray-500'
      }`}
    >
      <svg
        className="mb-2 h-8 w-8 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p className="text-sm text-gray-400">
        {disabled ? 'Upload in progress...' : 'Drop files here or click to browse'}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        MP4, WebM, MOV, AVI, MKV, MP3, WAV, PNG, JPG, WebP
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = '' }}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}
