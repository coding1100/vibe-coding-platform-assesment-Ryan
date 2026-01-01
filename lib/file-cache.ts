/**
 * File content cache for e2b sandboxes
 * 
 * Since Trigger.dev task executions run in isolated processes, we can't
 * access sandboxes created in other processes. This cache stores file contents
 * when they're written, so we can serve them even when the sandbox isn't accessible.
 */

// Global file cache: sandboxId -> Map<path, content>
function getGlobalFileCache(): Map<string, Map<string, string>> {
  if (typeof global !== 'undefined') {
    if (!(global as any).__e2b_file_cache) {
      (global as any).__e2b_file_cache = new Map<string, Map<string, string>>()
    }
    return (global as any).__e2b_file_cache
  }
  // Fallback for environments without global
  if (!(globalThis as any).__e2b_file_cache) {
    (globalThis as any).__e2b_file_cache = new Map<string, Map<string, string>>()
  }
  return (globalThis as any).__e2b_file_cache
}

export class FileCache {
  /**
   * Store file content in cache
   */
  static setFile(sandboxId: string, path: string, content: string): void {
    const cache = getGlobalFileCache()
    if (!cache.has(sandboxId)) {
      cache.set(sandboxId, new Map<string, string>())
    }
    const sandboxCache = cache.get(sandboxId)!
    
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    sandboxCache.set(normalizedPath, content)
  }

  /**
   * Store multiple files in cache
   */
  static setFiles(sandboxId: string, files: Array<{ path: string; content: string }>): void {
    for (const file of files) {
      this.setFile(sandboxId, file.path, file.content)
    }
  }

  /**
   * Get file content from cache
   */
  static getFile(sandboxId: string, path: string): string | null {
    const cache = getGlobalFileCache()
    const sandboxCache = cache.get(sandboxId)
    if (!sandboxCache) {
      return null
    }
    
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return sandboxCache.get(normalizedPath) || sandboxCache.get(path) || null
  }

  /**
   * Get all cached file paths for a sandbox
   */
  static getFilePaths(sandboxId: string): string[] {
    const cache = getGlobalFileCache()
    const sandboxCache = cache.get(sandboxId)
    if (!sandboxCache) {
      return []
    }
    return Array.from(sandboxCache.keys())
  }

  /**
   * Get all cached files for a sandbox as an array
   */
  static getFiles(sandboxId: string): Array<{ path: string; content: string }> | null {
    const cache = getGlobalFileCache()
    const sandboxCache = cache.get(sandboxId)
    if (!sandboxCache || sandboxCache.size === 0) {
      return null
    }
    
    const files: Array<{ path: string; content: string }> = []
    for (const [path, content] of sandboxCache.entries()) {
      files.push({ path, content })
    }
    return files
  }

  /**
   * Clear cache for a sandbox
   */
  static clearSandbox(sandboxId: string): void {
    const cache = getGlobalFileCache()
    cache.delete(sandboxId)
  }
}

