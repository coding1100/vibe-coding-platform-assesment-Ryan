/**
 * Trigger.dev client and task exports
 * Tasks are defined in trigger/workflows/ directory
 */

export { runCommandTask } from '../trigger/workflows/run-command';
export { createSandboxTask } from '../trigger/workflows/create-sandbox';
export { writeFilesTask } from '../trigger/workflows/write-files';
export { sandboxOperationsTask } from '../trigger/workflows/sandbox-operations';

/**
 * Types for Trigger.dev workflows
 */
export interface RunCommandPayload {
  sandboxId: string
  command: string
  args?: string[]
  sudo?: boolean
  wait?: boolean
}

export interface RunCommandResult {
  commandId: string
  exitCode?: number
  stdout?: string
  stderr?: string
  status: 'running' | 'completed' | 'error'
}

export interface FileOperationPayload {
  sandboxId: string
  operation: 'write' | 'read' | 'list'
  files?: Array<{ path: string; content: string }>
  path?: string
}

/**
 * Helper function to wait for a Trigger.dev run and get its output
 */
export async function waitForRunOutput(handle: { id: string; publicAccessToken?: string }): Promise<any> {
  const runId = handle.id
  
  // Try to use SDK's runs.retrieve() method first
  try {
    const { runs } = await import('@trigger.dev/sdk')
    
    if (runs && typeof (runs as any).retrieve === 'function') {
      const maxAttempts = 60
      const delayMs = 500
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const run = await (runs as any).retrieve(runId)
          
          if (run?.isSuccess || run?.status === 'COMPLETED' || run?.status === 'SUCCESS') {
            return run.output
          }
          
          if (run?.status === 'FAILED' || run?.status === 'ERROR' || run?.status === 'CANCELED') {
            const errorMessage = run.error?.message || run.output?.error || 'Task execution failed'
            throw new Error(errorMessage)
          }
          
          // Run is still in progress, wait and retry
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs))
          }
        } catch (error) {
          if (error instanceof Error && !error.message.includes('not found') && !error.message.includes('404')) {
            throw error
          }
          
          // Wait before retry
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs))
          }
        }
      }
      
      throw new Error('Task did not complete within timeout')
    }
  } catch (sdkError) {
    // Fallback to API if SDK method doesn't work
  }
  
  // Fallback: Use API with publicAccessToken
  const token = handle.publicAccessToken
  if (!token) {
    throw new Error('No access token available to retrieve run output')
  }
  
  const maxAttempts = 60
  const delayMs = 500
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Try v1 API first, then v2
      let response = await fetch(`https://api.trigger.dev/v1/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.status === 404) {
        // Try v2 API
        response = await fetch(`https://api.trigger.dev/v2/runs/${runId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
      }
      
      if (!response.ok) {
        if (response.status === 404 && attempt < 10) {
          // Run might not be available yet, wait a bit more
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        throw new Error(`Failed to fetch run: ${response.status} ${response.statusText}`)
      }
      
      const run = await response.json()
      
      if (run.isSuccess || run.status === 'COMPLETED' || run.status === 'SUCCESS') {
        return run.output
      }
      
      if (run.status === 'FAILED' || run.status === 'ERROR' || run.status === 'CANCELED') {
        const errorMessage = run.error?.message || run.output?.error || 'Task execution failed'
        throw new Error(errorMessage)
      }
      
      // Run is still in progress, wait and retry
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch run') && attempt >= 10) {
        throw error
      }
      
      // On last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw new Error(`Task did not complete: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  throw new Error('Task did not complete within timeout')
}

