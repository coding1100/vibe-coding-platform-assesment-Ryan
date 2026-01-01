import { Sandbox } from '@e2b/code-interpreter'
import { e2bClient } from './e2b-client'

/**
 * Adapter layer to bridge e2b APIs with the expected interface
 * This maintains compatibility with the existing UI components
 */

export interface SandboxAdapter {
  sandboxId: string
  runCommand(options: {
    cmd: string
    args?: string[]
    sudo?: boolean
    detached?: boolean
  }): Promise<{
    cmdId: string
    wait(): Promise<{
      exitCode: number
      stdout(): Promise<string>
      stderr(): Promise<string>
    }>
  }>
  writeFiles(files: Array<{ path: string; content: Buffer }>): Promise<void>
  readFile(options: { path: string }): Promise<AsyncIterable<Uint8Array> | null>
  getCommand(cmdId: string): Promise<{
    cmdId: string
    startedAt: Date
    wait(): Promise<{
      exitCode: number
      stdout(): Promise<string>
      stderr(): Promise<string>
    }>
    logs(): AsyncIterable<{
      data: string
      stream: 'stdout' | 'stderr'
    }>
  }>
  domain(port: number): string
}

/**
 * Create a sandbox adapter from e2b sandbox
 */
export function createSandboxAdapter(
  sandboxId: string,
  sandbox: Sandbox
): SandboxAdapter {
  const commands = e2bClient.getCommands(sandboxId)
  let commandCounter = commands.size

  return {
    sandboxId,

    async runCommand(options) {
      const cmdId = `cmd_${commandCounter++}_${Date.now()}`
      
      const commandStr = [options.cmd, ...(options.args || [])].join(' ')
      const startedAt = new Date()
      
      const logBuffer: Array<{ data: string; stream: 'stdout' | 'stderr' }> = []
      let executionResult: any = null
      let executionPromise: Promise<any>
      
      const commandsApi = (sandbox as any).commands
      if (commandsApi && typeof commandsApi.run === 'function') {
        executionPromise = commandsApi.run(commandStr, {
          onStdout: (data: string) => {
            logBuffer.push({ data, stream: 'stdout' })
          },
          onStderr: (data: string) => {
            logBuffer.push({ data, stream: 'stderr' })
          },
        })
      } else if ('exec' in sandbox && typeof (sandbox as any).exec === 'function') {
        executionPromise = (sandbox as any).exec(commandStr)
      } else if ('runCode' in sandbox && typeof sandbox.runCode === 'function') {
        executionPromise = sandbox.runCode(`!${commandStr}`)
      } else {
        throw new Error('No suitable method found to execute shell commands. Check e2b SDK documentation.')
      }
      
      const process = {
        execution: executionPromise,
        result: executionResult,
        logBuffer,
        wait: async () => {
          executionResult = await executionPromise
          return executionResult
        }
      }

      commands.set(cmdId, { cmdId, startedAt, process })

      return {
        cmdId,
        async wait() {
          const result = await process.wait()
          return {
            exitCode: result?.exitCode || 0,
            async stdout() {
              return result?.stdout || result?.text || result?.results?.[0]?.text || result?.output || ''
            },
            async stderr() {
              return result?.stderr || result?.error || result?.results?.[0]?.error || ''
            },
          }
        },
      }
    },

    async writeFiles(files) {
      let filesApi: any = null;
      let usePythonCode = false;
      
      if ((sandbox as any).files && typeof (sandbox as any).files.write === 'function') {
        filesApi = (sandbox as any).files;
      } else if (typeof (sandbox as any).writeFile === 'function') {
        filesApi = { write: (sandbox as any).writeFile.bind(sandbox) };
      } else if (typeof (sandbox as any).write === 'function') {
        filesApi = { write: (sandbox as any).write.bind(sandbox) };
      } else if ((sandbox as any).filesystem && typeof (sandbox as any).filesystem.write === 'function') {
        filesApi = (sandbox as any).filesystem;
      } else if (typeof (sandbox as any).runCode === 'function' || typeof sandbox.runCode === 'function') {
        usePythonCode = true;
      }
      
      if (!filesApi && !usePythonCode) {
        throw new Error('No file write API found on sandbox')
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = new TextDecoder().decode(file.content)
        let path = file.path
        
        if (!path.startsWith('/')) {
          path = `/home/user/${path}`
        } else if (!path.startsWith('/home/user')) {
          path = `/home/user${path}`
        }
        
        try {
          if (usePythonCode) {
            const runCode = (sandbox as any).runCode || sandbox.runCode;
            const base64Content = Buffer.from(content, 'utf-8').toString('base64');
            
            const pythonCode = `
import os
import base64

dir_path = os.path.dirname("${path}")
if dir_path:
    os.makedirs(dir_path, exist_ok=True)

content = base64.b64decode("${base64Content}").decode('utf-8')
with open("${path}", "w", encoding="utf-8") as f:
    f.write(content)
`;
            
            await runCode.call(sandbox, pythonCode);
          } else {
            await filesApi.write(path, content)
          }
        } catch (error) {
          throw new Error(`Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    },

    async readFile(options) {
      try {
        let path = options.path
        
        if (!path.startsWith('/')) {
          path = `/home/user/${path}`
        } else if (!path.startsWith('/home/user')) {
          path = `/home/user${path}`
        }
        
        const filesApi = (sandbox as any).files
        if (!filesApi || typeof filesApi.read !== 'function') {
          throw new Error('files.read is not available on sandbox')
        }

        const content = await filesApi.read(path)
        if (!content) return null

        const contentStr = typeof content === 'string' ? content : new TextDecoder().decode(content)
        const encoder = new TextEncoder()
        const chunks: Uint8Array[] = []
        const chunkSize = 1024
        
        for (let i = 0; i < contentStr.length; i += chunkSize) {
          chunks.push(encoder.encode(contentStr.slice(i, i + chunkSize)))
        }

        return (async function* () {
          for (const chunk of chunks) {
            yield chunk
          }
        })()
      } catch (error) {
        return null
      }
    },

    async getCommand(cmdId) {
      const cmd = commands.get(cmdId)
      if (!cmd) {
        throw new Error(`Command ${cmdId} not found`)
      }

      return {
        cmdId: cmd.cmdId,
        startedAt: cmd.startedAt,
        async wait() {
          const result = await cmd.process.wait()
          return {
            exitCode: result?.exitCode || 0,
            async stdout() {
              return result?.stdout || result?.text || result?.results?.[0]?.text || result?.output || ''
            },
            async stderr() {
              return result?.stderr || result?.error || result?.results?.[0]?.error || ''
            },
          }
        },
        async *logs() {
          try {
            const hadLogBuffer = cmd.process.logBuffer && cmd.process.logBuffer.length > 0
            
            if (hadLogBuffer) {
              let lastIndex = 0
              let isComplete = false
              
              while (!isComplete) {
                if (cmd.process.logBuffer.length > lastIndex) {
                  for (let i = lastIndex; i < cmd.process.logBuffer.length; i++) {
                    yield cmd.process.logBuffer[i]
                  }
                  lastIndex = cmd.process.logBuffer.length
                }
                
                try {
                  await Promise.race([
                    cmd.process.wait().then(() => { isComplete = true }),
                    new Promise(resolve => setTimeout(resolve, 100))
                  ])
                } catch {
                  isComplete = true
                }
              }
              
              await cmd.process.wait()
              return
            }
            
            const result = await cmd.process.wait()
            
            let stdout = ''
            let stderr = ''
            
            if (result) {
              stdout = result.stdout || result.text || result.results?.[0]?.text || result.output || result.results?.[0]?.output || result.results?.[0]?.stdout || ''
              stderr = result.stderr || result.error || result.results?.[0]?.error || result.results?.[0]?.stderr || ''
              
              if (Array.isArray(result.results)) {
                for (const res of result.results) {
                  if (res?.text) stdout += (stdout ? '\n' : '') + res.text
                  if (res?.error) stderr += (stderr ? '\n' : '') + res.error
                  if (res?.output) stdout += (stdout ? '\n' : '') + res.output
                }
              }
            }
            
            if (stdout) {
              const lines = typeof stdout === 'string' ? stdout.split('\n') : [String(stdout)]
              for (const line of lines) {
                const trimmed = line.trim()
                if (trimmed) {
                  yield { data: trimmed, stream: 'stdout' as const }
                }
              }
            }
            if (stderr) {
              const lines = typeof stderr === 'string' ? stderr.split('\n') : [String(stderr)]
              for (const line of lines) {
                const trimmed = line.trim()
                if (trimmed) {
                  yield { data: trimmed, stream: 'stderr' as const }
                }
              }
            }
          } catch (error) {
            yield { 
              data: error instanceof Error ? error.message : String(error), 
              stream: 'stderr' as const 
            }
          }
        },
      }
    },

    domain(port: number) {
      return e2bClient.getHostedUrl(sandboxId, port)
    },
  }
}

