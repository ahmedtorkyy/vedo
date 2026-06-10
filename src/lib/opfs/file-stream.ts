const CHUNK_SIZE = 4 * 1024 * 1024

export async function streamFileToOPFS(
  dir: FileSystemDirectoryHandle,
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<FileSystemFileHandle> {
  let fileHandle: FileSystemFileHandle
  try {
    fileHandle = await dir.getFileHandle(file.name)
    await dir.removeEntry(file.name)
    fileHandle = await dir.getFileHandle(file.name, { create: true })
  } catch {
    fileHandle = await dir.getFileHandle(file.name, { create: true })
  }

  const writable = await fileHandle.createWritable({ keepExistingData: false })
  const total = file.size
  let loaded = 0

  const reader = file.stream().getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      loaded += value.length
      onProgress?.(loaded, total)
    }
  } finally {
    reader.releaseLock()
  }

  await writable.close()
  return fileHandle
}

export async function readFileStream(
  dir: FileSystemDirectoryHandle,
  fileName: string
): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const fileHandle = await dir.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return file.stream()
  } catch {
    return null
  }
}

export async function getFileHandle(
  dir: FileSystemDirectoryHandle,
  fileName: string
): Promise<FileSystemFileHandle | null> {
  try {
    return await dir.getFileHandle(fileName)
  } catch {
    return null
  }
}

export async function getFileUrl(
  dir: FileSystemDirectoryHandle,
  fileName: string
): Promise<string | null> {
  try {
    const fileHandle = await dir.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return URL.createObjectURL(file)
  } catch {
    return null
  }
}

export async function deleteFile(
  dir: FileSystemDirectoryHandle,
  fileName: string
): Promise<void> {
  try {
    await dir.removeEntry(fileName)
  } catch {
    // file didn't exist — no-op
  }
}

export async function getFileSize(
  dir: FileSystemDirectoryHandle,
  fileName: string
): Promise<number | null> {
  try {
    const fileHandle = await dir.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return file.size
  } catch {
    return null
  }
}
