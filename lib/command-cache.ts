/**
 * Command output cache for e2b sandboxes
 * 
 * Since Trigger.dev task executions run in isolated processes, we can't
 * access command data created in other processes. This cache stores command
 * output when commands complete, so we can serve it even when the command
 * isn't accessible from the current process.
 */

interface CommandOutput {
  cmdId: string
  sandboxId: string
  command: string
  args?: string[]
  stdout: string
  stderr: string
  exitCode?: number
  startedAt: number
  completedAt: number
  status: 'completed' | 'running'
}

// Global command cache: sandboxId -> Map<cmdId, CommandOutput>
function getGlobalCommandCache(): Map<string, Map<string, CommandOutput>> {
  if (typeof global !== 'undefined') {
    if (!(global as any).__e2b_command_cache) {
      (global as any).__e2b_command_cache = new Map<string, Map<string, CommandOutput>>()
    }
    return (global as any).__e2b_command_cache
  }
  // Fallback for environments without global
  if (!(globalThis as any).__e2b_command_cache) {
    (globalThis as any).__e2b_command_cache = new Map<string, Map<string, CommandOutput>>()
  }
  return (globalThis as any).__e2b_command_cache
}

export class CommandCache {
  /**
   * Store command output in cache
   */
  static setCommand(output: CommandOutput): void {
    const cache = getGlobalCommandCache()
    if (!cache.has(output.sandboxId)) {
      cache.set(output.sandboxId, new Map<string, CommandOutput>())
    }
    const sandboxCache = cache.get(output.sandboxId)!
    sandboxCache.set(output.cmdId, output)
  }

  /**
   * Get command output from cache
   */
  static getCommand(sandboxId: string, cmdId: string): CommandOutput | null {
    const cache = getGlobalCommandCache()
    const sandboxCache = cache.get(sandboxId)
    if (!sandboxCache) {
      return null
    }
    
    return sandboxCache.get(cmdId) || null
  }

  /**
   * Get all cached commands for a sandbox
   */
  static getCommands(sandboxId: string): CommandOutput[] {
    const cache = getGlobalCommandCache()
    const sandboxCache = cache.get(sandboxId)
    if (!sandboxCache) {
      return []
    }
    return Array.from(sandboxCache.values())
  }

  /**
   * Clear cache for a sandbox
   */
  static clearSandbox(sandboxId: string): void {
    const cache = getGlobalCommandCache()
    cache.delete(sandboxId)
  }
}

