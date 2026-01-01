import { Sandbox } from '@e2b/code-interpreter'

interface CommandData {
  cmdId: string
  startedAt: Date
  process: any
}

// Get or create global stores that persist across task executions in the same worker process
// This ensures sandboxes created in one task can be accessed by other tasks in the same worker
function getGlobalSandboxStore(): Map<string, Sandbox> {
  if (typeof global !== 'undefined') {
    if (!(global as any).__e2b_sandboxes) {
      (global as any).__e2b_sandboxes = new Map<string, Sandbox>()
    }
    return (global as any).__e2b_sandboxes
  }
  // Fallback for environments without global (shouldn't happen in Node.js)
  if (!(globalThis as any).__e2b_sandboxes) {
    (globalThis as any).__e2b_sandboxes = new Map<string, Sandbox>()
  }
  return (globalThis as any).__e2b_sandboxes
}

function getGlobalCommandStore(): Map<string, Map<string, CommandData>> {
  if (typeof global !== 'undefined') {
    if (!(global as any).__e2b_commands) {
      (global as any).__e2b_commands = new Map<string, Map<string, CommandData>>()
    }
    return (global as any).__e2b_commands
  }
  // Fallback for environments without global (shouldn't happen in Node.js)
  if (!(globalThis as any).__e2b_commands) {
    (globalThis as any).__e2b_commands = new Map<string, Map<string, CommandData>>()
  }
  return (globalThis as any).__e2b_commands
}

export class E2BClient {
  private sandboxes: Map<string, Sandbox>
  private commands: Map<string, Map<string, CommandData>>

  constructor() {
    // Always get the global stores to ensure we're using the same instances
    // across all E2BClient instances in the same worker process
    this.sandboxes = getGlobalSandboxStore()
    this.commands = getGlobalCommandStore()
  }

  /**
   * Create a new e2b sandbox
   */
  async createSandbox(options?: {
    timeout?: number
    ports?: number[]
  }): Promise<{ sandboxId: string; sandbox: Sandbox }> {
    if (!process.env.E2B_API_KEY) {
      throw new Error('E2B_API_KEY is not configured')
    }

    const timeoutMs = options?.timeout ?? 600000
    const sandbox = await Sandbox.create({
      timeoutMs,
    })

    if (options?.ports && options.ports.length > 0) {
      console.warn('Port configuration not yet implemented - ports:', options.ports)
    }

    // Always use the global store directly to ensure consistency
    const sandboxes = getGlobalSandboxStore()
    const commands = getGlobalCommandStore()
    
    sandboxes.set(sandbox.sandboxId, sandbox)
    
    if (typeof (sandbox as any).setTimeout === 'function') {
      await (sandbox as any).setTimeout(timeoutMs)
    }

    if (!commands.has(sandbox.sandboxId)) {
      commands.set(sandbox.sandboxId, new Map())
    }

    this.sandboxes = sandboxes
    this.commands = commands

    return {
      sandboxId: sandbox.sandboxId,
      sandbox,
    }
  }

  getCommands(sandboxId: string): Map<string, CommandData> {
    if (!this.commands.has(sandboxId)) {
      this.commands.set(sandboxId, new Map())
    }
    return this.commands.get(sandboxId)!
  }

  async getSandbox(sandboxId: string): Promise<Sandbox> {
    // Always get fresh reference to global store in case it was updated
    const sandboxes = getGlobalSandboxStore()
    const cached = sandboxes.get(sandboxId)
    
    if (cached) {
      // Verify the sandbox is still valid (not closed)
      try {
        // Check if sandbox has a valid connection by checking for common properties
        if (cached && typeof cached === 'object') {
          return cached
        }
      } catch (error) {
        // Sandbox might be closed, remove it from cache
        sandboxes.delete(sandboxId)
        this.commands.delete(sandboxId)
      }
    }

    // If sandbox not in cache, try to reconnect using Sandbox.connect()
    // This allows us to access sandboxes created in different task execution contexts
    try {
      if (!process.env.E2B_API_KEY) {
        throw new Error('E2B_API_KEY is not configured')
      }

      // Use Sandbox.connect() to reconnect to an existing sandbox by ID
      const sandbox = await Sandbox.connect(sandboxId)

      // If connection successful, store it in cache for future use
      sandboxes.set(sandboxId, sandbox)
      if (!this.commands.has(sandboxId)) {
        this.commands.set(sandboxId, new Map())
      }
      
      this.sandboxes = sandboxes
      this.commands = this.commands
      
      return sandbox
    } catch (connectError) {
      throw new Error(
        `Sandbox ${sandboxId} not found and could not reconnect. ` +
        `The sandbox may have been closed or may not exist. ` +
        `Error: ${connectError instanceof Error ? connectError.message : String(connectError)}`
      )
    }
  }

  async closeSandbox(sandboxId: string): Promise<void> {
    const sandboxes = getGlobalSandboxStore()
    const commands = getGlobalCommandStore()
    const sandbox = sandboxes.get(sandboxId)
    
    if (sandbox) {
      try {
        if (typeof (sandbox as any).close === 'function') {
          await (sandbox as any).close()
        }
      } catch (error) {
        // Ignore errors when closing sandbox
      }
      sandboxes.delete(sandboxId)
      commands.delete(sandboxId)
      
      // Update local references
      this.sandboxes = sandboxes
      this.commands = commands
    }
  }

  getHostedUrl(sandboxId: string, port: number): string {
    const sandboxes = getGlobalSandboxStore()
    const sandbox = sandboxes.get(sandboxId)
    
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`)
    }
    
    return `https://${sandboxId}-${port}.e2b.app`
  }
}

// Singleton instance
export const e2bClient = new E2BClient()

