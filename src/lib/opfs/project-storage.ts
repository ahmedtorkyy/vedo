/**
 * Ultra-fast native sandboxing wrapper for Origin Private File System (OPFS).
 * Isolates high-frequency local storage tasks cleanly away from the UI thread.
 */
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

  static async getFile(projectId: string, filename: string): Promise<File> {
    const folder = await this.getProjectFolder(projectId);
    const fileHandle = await folder.getFileHandle(filename);
    return await fileHandle.getFile();
  }

  static async deleteFile(projectId: string, filename: string): Promise<void> {
    const folder = await this.getProjectFolder(projectId);
    await folder.removeEntry(filename);
  }
}
