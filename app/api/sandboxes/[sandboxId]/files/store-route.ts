/**
 * Server-side file content store
 * 
 * This is a simple in-memory store that persists file contents
 * across API requests in the Next.js server process.
 * 
 * Note: This is separate from the client-side Zustand store
 * because API routes run on the server.
 */

// Global store for file contents (server-side only)
const serverFileStore = new Map<string, Map<string, string>>()

export function getServerFileStore(): Map<string, Map<string, string>> {
  return serverFileStore
}

export function setServerFileContent(sandboxId: string, path: string, content: string): void {
  if (!serverFileStore.has(sandboxId)) {
    serverFileStore.set(sandboxId, new Map<string, string>())
  }
  const sandboxFiles = serverFileStore.get(sandboxId)!
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  sandboxFiles.set(normalizedPath, content)
}

export function getServerFileContent(sandboxId: string, path: string): string | null {
  const sandboxFiles = serverFileStore.get(sandboxId)
  if (!sandboxFiles) return null
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return sandboxFiles.get(normalizedPath) || sandboxFiles.get(path) || null
}

export function setServerFiles(sandboxId: string, files: Array<{ path: string; content: string }>): void {
  for (const file of files) {
    setServerFileContent(sandboxId, file.path, file.content)
  }
}

