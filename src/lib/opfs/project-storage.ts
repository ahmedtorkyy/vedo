export class ProjectStorage {
  private static root: FileSystemDirectoryHandle | null = null;

  private static async getRoot(): Promise<FileSystemDirectoryHandle> {
    if (!this.root) {
      this.root = await navigator.storage.getDirectory();
    }
    return this.root;
  }

  static async getProjectFolder(projectId: string): Promise<FileSystemDirectoryHandle> {
    const root = await this.getRoot();
    return await root.getDirectoryHandle(`project_${projectId}`, { create: true });
  }

  static async saveFile(projectId: string, filename: string, data: ReadableStream | Blob): Promise<string> {
    const folder = await this.getProjectFolder(projectId);
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileHandle = await folder.getFileHandle(safeName, { create: true });
    const writable = await fileHandle.createWritable();

    if (data instanceof ReadableStream) {
      await data.pipeTo(writable);
    } else {
      await writable.write(data);
      await writable.close();
    }

    return `opfs://project_${projectId}/${safeName}`;
  }

  static async saveFileWithProgress(
    projectId: string,
    filename: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<string> {
    const folder = await this.getProjectFolder(projectId);
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileHandle = await folder.getFileHandle(safeName, { create: true });
    const writable = await fileHandle.createWritable();

    const total = file.size;
    let written = 0;
    const reader = file.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      written += value.byteLength;
      onProgress?.(Math.round((written / total) * 100));
    }
    await writable.close();

    return `opfs://project_${projectId}/${safeName}`;
  }

  static async readChunked(
    projectId: string,
    filename: string,
    onChunk: (chunk: Uint8Array, done: boolean) => void | Promise<void>,
  ): Promise<void> {
    const folder = await this.getProjectFolder(projectId);
    const handle = await folder.getFileHandle(filename);
    const file = await handle.getFile();
    const reader = file.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        await onChunk(new Uint8Array(0), true);
        break;
      }
      await onChunk(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), false);
    }
  }

  static async getFile(projectId: string, filename: string): Promise<File> {
    const folder = await this.getProjectFolder(projectId);
    const fileHandle = await folder.getFileHandle(filename);
    return await fileHandle.getFile();
  }

  static async fileExists(projectId: string, filename: string): Promise<boolean> {
    try {
      const folder = await this.getProjectFolder(projectId);
      await folder.getFileHandle(filename);
      return true;
    } catch {
      return false;
    }
  }

  static async deleteFile(projectId: string, filename: string): Promise<void> {
    const folder = await this.getProjectFolder(projectId);
    await folder.removeEntry(filename);
  }

  static async deleteProjectFolder(projectId: string): Promise<void> {
    const root = await this.getRoot();
    try {
      await root.removeEntry(`project_${projectId}`, { recursive: true });
    } catch {
      // no-op
    }
  }

  static async writeMetadata(projectId: string, meta: Record<string, unknown>): Promise<void> {
    const folder = await this.getProjectFolder(projectId);
    const handle = await folder.getFileHandle('project.json', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(meta, null, 2));
    await writable.close();
  }

  static async readMetadata(projectId: string): Promise<Record<string, unknown> | null> {
    try {
      const folder = await this.getProjectFolder(projectId);
      const handle = await folder.getFileHandle('project.json');
      const file = await handle.getFile();
      return JSON.parse(await file.text());
    } catch {
      return null;
    }
  }

  static parseOpfsPath(path: string): { projectId: string; filename: string } | null {
    const match = path.match(/^opfs:\/\/project_([^/]+)\/(.+)$/);
    if (!match) return null;
    return { projectId: match[1], filename: match[2] };
  }
}
