const ROOT_DIR_NAME = 'vedo-projects'

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  let vedoDir: FileSystemDirectoryHandle
  try {
    vedoDir = await root.getDirectoryHandle(ROOT_DIR_NAME)
  } catch {
    vedoDir = await root.getDirectoryHandle(ROOT_DIR_NAME, { create: true })
  }
  return vedoDir
}

export async function createProjectDirectory(projectId: string): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDir()
  let dir: FileSystemDirectoryHandle
  try {
    dir = await root.getDirectoryHandle(projectId)
  } catch {
    dir = await root.getDirectoryHandle(projectId, { create: true })
  }
  return dir
}

export async function getProjectDirectory(projectId: string): Promise<FileSystemDirectoryHandle | null> {
  const root = await getRootDir()
  try {
    return await root.getDirectoryHandle(projectId)
  } catch {
    return null
  }
}

export async function deleteProjectDirectory(projectId: string): Promise<void> {
  const root = await getRootDir()
  try {
    await root.removeEntry(projectId, { recursive: true })
  } catch {
    // directory didn't exist — no-op
  }
}

export async function listProjectFiles(projectId: string): Promise<string[]> {
  const dir = await getProjectDirectory(projectId)
  if (!dir) return []
  const names: string[] = []
  for await (const [name] of dir.entries()) {
    names.push(name)
  }
  return names
}

export async function listAllProjects(): Promise<string[]> {
  const root = await getRootDir()
  const ids: string[] = []
  for await (const [name] of root.entries()) {
    ids.push(name)
  }
  return ids
}
