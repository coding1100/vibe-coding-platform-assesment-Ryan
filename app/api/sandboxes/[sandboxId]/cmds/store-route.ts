/**
 * Server-side command output store
 * 
 * This is a simple in-memory store that persists command outputs
 * across API requests in the Next.js server process.
 * 
 * Note: This is separate from the CommandCache in lib/command-cache.ts
 * because API routes run in a different process than Trigger.dev workers.
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

// Global store for command outputs (server-side only)
const serverCommandStore = new Map<string, Map<string, CommandOutput>>()

export function getServerCommandStore(): Map<string, Map<string, CommandOutput>> {
  return serverCommandStore
}

export function setServerCommand(output: CommandOutput): void {
  if (!serverCommandStore.has(output.sandboxId)) {
    serverCommandStore.set(output.sandboxId, new Map<string, CommandOutput>())
  }
  const sandboxCommands = serverCommandStore.get(output.sandboxId)!
  sandboxCommands.set(output.cmdId, output)
}

export function getServerCommand(sandboxId: string, cmdId: string): CommandOutput | null {
  const sandboxCommands = serverCommandStore.get(sandboxId)
  if (!sandboxCommands) return null
  return sandboxCommands.get(cmdId) || null
}

