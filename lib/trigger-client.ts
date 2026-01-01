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
 * 
 * Note: In Vercel serverless functions, this has timeout constraints:
 * - Hobby: 10 seconds
 * - Pro: 60 seconds
 * - Enterprise: Custom
 * 
 * This function uses a maximum of 25 seconds (50 attempts × 500ms) to stay within Pro plan limits
 */
export async function waitForRunOutput(handle: { id: string; publicAccessToken?: string }): Promise<any> {
  const runId = handle.id
  console.log('[waitForRunOutput] Starting to wait for run:', runId)
  
  // Fallback: Use API with publicAccessToken or TRIGGER_API_KEY
  const token = handle.publicAccessToken || process.env.TRIGGER_API_KEY
  if (!token) {
    console.error('[waitForRunOutput] No access token available. publicAccessToken:', !!handle.publicAccessToken, 'TRIGGER_API_KEY:', !!process.env.TRIGGER_API_KEY)
    throw new Error('No access token available to retrieve run output. Ensure TRIGGER_API_KEY is set in environment variables.')
  }
  
  // Reduced attempts for Vercel compatibility (25 seconds max = 50 attempts × 500ms)
  // This ensures we stay within Vercel Pro's 60s timeout with buffer
  const maxAttempts = 50
  const delayMs = 500
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Try v1 API first, then v2
      const apiUrl = process.env.TRIGGER_API_URL || 'https://api.trigger.dev'
      let response = await fetch(`${apiUrl}/v1/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      
      if (response.status === 404) {
        // Try v2 API
        response = await fetch(`${apiUrl}/v2/runs/${runId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      }
      
      if (!response.ok) {
        if (response.status === 404 && attempt < 10) {
          // Run might not be available yet, wait a bit more
          console.log(`[waitForRunOutput] Run not found yet (attempt ${attempt + 1}/${maxAttempts}), waiting...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        const errorText = await response.text().catch(() => 'Unable to read error response')
        console.error(`[waitForRunOutput] API error (attempt ${attempt + 1}/${maxAttempts}): ${response.status} ${response.statusText}`, errorText.substring(0, 200))
        
        // If unauthorized, throw immediately
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed: ${response.status} ${response.statusText}. Check TRIGGER_API_KEY.`)
        }
        
        if (attempt >= 10) {
          throw new Error(`Failed to fetch run: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`)
        }
        
        // Wait before retry for other errors
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }
      
      const run = await response.json()
      console.log(`[waitForRunOutput] Run status (attempt ${attempt + 1}/${maxAttempts}):`, run.status || run.statusCode)
      
      if (run.isSuccess || run.status === 'COMPLETED' || run.status === 'SUCCESS' || run.statusCode === 'SUCCESS') {
        console.log('[waitForRunOutput] Run completed successfully')
        return run.output
      }
      
      if (run.status === 'FAILED' || run.status === 'ERROR' || run.status === 'CANCELED' || run.statusCode === 'FAILED') {
        const errorMessage = run.error?.message || run.output?.error || run.message || 'Task execution failed'
        console.error('[waitForRunOutput] Run failed:', errorMessage)
        throw new Error(errorMessage)
      }
      
      // Run is still in progress, wait and retry
      if (attempt < maxAttempts - 1) {
        if (attempt % 10 === 0) {
          console.log(`[waitForRunOutput] Run in progress, waiting... (${attempt + 1}/${maxAttempts})`)
        }
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    } catch (error) {
      // If it's a network error and we've tried enough times, throw
      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
          if (attempt >= 5) {
            console.error('[waitForRunOutput] Network error after multiple attempts:', error.message)
            throw error
          }
        } else if (!error.message.includes('not found') && !error.message.includes('404')) {
          // For non-404 errors, throw immediately if we've tried a few times
          if (attempt >= 5) {
            throw error
          }
        }
      }
      
      // On last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        console.error('[waitForRunOutput] Max attempts reached, throwing error')
        throw new Error(`Task did not complete within timeout (${maxAttempts * delayMs / 1000}s): ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  console.error('[waitForRunOutput] Exited loop without completing')
  throw new Error(`Task did not complete within timeout (${maxAttempts * delayMs / 1000} seconds)`)
}

