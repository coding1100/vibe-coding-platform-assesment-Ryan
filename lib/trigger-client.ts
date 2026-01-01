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
        console.log(`[waitForRunOutput] v1 API returned 404, trying v2 API...`)
        const v2Response = await fetch(`${apiUrl}/v2/runs/${runId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
        
        if (v2Response.ok) {
          response = v2Response
        } else if (v2Response.status === 404 && attempt < 10) {
          // Run might not be available yet, wait a bit more
          console.log(`[waitForRunOutput] Run not found yet (attempt ${attempt + 1}/${maxAttempts}), waiting...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        } else {
          response = v2Response
        }
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
      const status = run.status || run.statusCode || run.state
      console.log(`[waitForRunOutput] Run status (attempt ${attempt + 1}/${maxAttempts}):`, status)
      console.log(`[waitForRunOutput] Run data keys:`, Object.keys(run))
      
      // Check for completion - handle multiple possible status values
      const isCompleted = run.isSuccess || 
                         status === 'COMPLETED' || 
                         status === 'SUCCESS' || 
                         status === 'COMPLETE' ||
                         run.statusCode === 'SUCCESS' ||
                         run.state === 'COMPLETED'
      
      if (isCompleted) {
        console.log('[waitForRunOutput] Run completed successfully')
        
        // Try multiple possible output field locations based on Trigger.dev API response structure
        let output = run.output
        
        // If output is not directly available, try other common locations
        if (!output) {
          output = run.result || run.data || run.payload
        }
        
        // If still no output, check if the run object itself contains the task result
        if (!output && (run.sandboxId || run.sandboxCreated !== undefined)) {
          console.log('[waitForRunOutput] Using run object directly as it contains task result')
          output = run
        }
        
        // Log the extracted output for debugging
        if (output) {
          console.log('[waitForRunOutput] Extracted output:', {
            hasOutput: true,
            hasSandboxId: !!output.sandboxId,
            sandboxId: output.sandboxId,
            sandboxCreated: output.sandboxCreated,
            keys: Object.keys(output),
          })
          
          // Validate that we have the expected structure
          if (output.sandboxId || output.sandboxCreated !== undefined) {
            return output
          }
          
          // Log full structure for debugging if it doesn't match expected format
          console.log('[waitForRunOutput] Output structure (first 1000 chars):', 
            JSON.stringify(output, null, 2).substring(0, 1000))
        } else {
          console.warn('[waitForRunOutput] Completed but no output found in run object')
          console.log('[waitForRunOutput] Full run object (first 1000 chars):', 
            JSON.stringify(run, null, 2).substring(0, 1000))
        }
        
        // Last resort: return the run object even if it doesn't have expected fields
        // This allows the calling code to handle it
        return output || run
      }
      
      // Check for failure - handle multiple possible status values
      const isFailed = run.status === 'FAILED' || 
                      run.status === 'ERROR' || 
                      run.status === 'CANCELED' || 
                      run.statusCode === 'FAILED' ||
                      run.state === 'FAILED' ||
                      run.state === 'ERROR'
      
      if (isFailed) {
        const errorMessage = run.error?.message || 
                           run.output?.error || 
                           run.message || 
                           run.error ||
                           'Task execution failed'
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

