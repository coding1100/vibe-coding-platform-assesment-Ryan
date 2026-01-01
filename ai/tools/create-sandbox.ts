import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { sandboxOperationsTask, waitForRunOutput } from '../../lib/trigger-client'
import { tasks } from '@trigger.dev/sdk'
import { getRichError } from './get-rich-error'
import { tool } from 'ai'
import description from './create-sandbox.md'
import z from 'zod/v3'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const createSandbox = ({ writer }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      timeout: z
        .number()
        .min(600000)
        .max(2700000)
        .optional()
        .describe(
          'Maximum time in milliseconds the e2b Sandbox will remain active before automatically shutting down. Minimum 600000ms (10 minutes), maximum 2700000ms (45 minutes). Defaults to 600000ms (10 minutes). The sandbox will terminate all running processes when this timeout is reached.'
        ),
      ports: z
        .array(z.number())
        .max(2)
        .optional()
        .describe(
          'Array of network ports to expose and make accessible from outside the e2b Sandbox. These ports allow web servers, APIs, or other services running inside the e2b Sandbox to be reached externally. Common ports include 3000 (Next.js), 8000 (Python servers), 5000 (Flask), etc.'
        ),
      writeFiles: z
        .array(z.object({
          path: z.string(),
          content: z.string(),
        }))
        .optional()
        .describe(
          'Optional: Files to write to the sandbox immediately after creation. This ensures all operations happen in the same execution context, avoiding process isolation issues.'
        ),
      runCommand: z
        .object({
          command: z.string(),
          args: z.array(z.string()).optional(),
          sudo: z.boolean().optional(),
          wait: z.boolean().optional(),
        })
        .optional()
        .describe(
          'Optional: Command to run in the sandbox immediately after creation. This ensures all operations happen in the same execution context, avoiding process isolation issues.'
        ),
    }),
    execute: async ({ timeout, ports, writeFiles, runCommand }, { toolCallId }) => {
      writer.write({
        id: toolCallId,
        type: 'data-create-sandbox',
        data: { status: 'loading' },
      })

      try {
        // Use sandbox-operations task to ensure all operations happen in the same execution context
        // This avoids process isolation issues when writing files or running commands immediately after creation
        
        // Check environment variables
        if (!process.env.E2B_API_KEY) {
          throw new Error('E2B_API_KEY is not configured in production environment')
        }
        
        if (!process.env.TRIGGER_API_KEY) {
          throw new Error('TRIGGER_API_KEY is not configured in production environment')
        }
        
        console.log('[create-sandbox] Triggering sandbox-operations task...')
        console.log('[create-sandbox] Environment check:', {
          hasE2BKey: !!process.env.E2B_API_KEY,
          hasTriggerKey: !!process.env.TRIGGER_API_KEY,
          triggerApiUrl: process.env.TRIGGER_API_URL || 'https://api.trigger.dev',
          nodeEnv: process.env.NODE_ENV,
        })
        
        let handle: any
        try {
          // Try using the SDK's tasks.trigger() API first (recommended for production)
          console.log('[create-sandbox] Attempting to trigger task using tasks.trigger() API...')
          try {
            handle = await tasks.trigger("sandbox-operations", {
              createSandbox: {
                timeout: timeout ?? 600000,
                ports,
              },
              writeFiles,
              runCommand,
            })
            console.log('[create-sandbox] tasks.trigger() succeeded, handle:', {
              exists: !!handle,
              hasId: !!handle?.id,
              id: handle?.id,
              hasToken: !!handle?.publicAccessToken,
            })
          } catch (sdkError) {
            // Fallback to task object method if SDK API fails
            console.log('[create-sandbox] tasks.trigger() failed, trying task.trigger() method:', sdkError instanceof Error ? sdkError.message : String(sdkError))
            handle = await sandboxOperationsTask.trigger({
              createSandbox: {
                timeout: timeout ?? 600000,
                ports,
              },
              writeFiles,
              runCommand,
            })
            console.log('[create-sandbox] task.trigger() succeeded, handle:', {
              exists: !!handle,
              hasId: !!handle?.id,
              id: handle?.id,
              hasToken: !!handle?.publicAccessToken,
            })
          }
        } catch (triggerError) {
          console.error('[create-sandbox] Error triggering task:', triggerError)
          console.error('[create-sandbox] Error details:', {
            message: triggerError instanceof Error ? triggerError.message : String(triggerError),
            name: triggerError instanceof Error ? triggerError.name : undefined,
            stack: triggerError instanceof Error ? triggerError.stack : undefined,
            cause: triggerError instanceof Error ? triggerError.cause : undefined,
          })
          
          // Check if it's a specific error we can handle
          if (triggerError instanceof Error) {
            if (triggerError.message.includes('not found') || triggerError.message.includes('404')) {
              throw new Error(
                `Task 'sandbox-operations' not found. Ensure tasks are deployed: ` +
                `Run 'npx trigger.dev@latest deploy' or check GitHub Actions. ` +
                `Original error: ${triggerError.message}`
              )
            }
            if (triggerError.message.includes('401') || triggerError.message.includes('403') || triggerError.message.includes('unauthorized')) {
              throw new Error(
                `Authentication failed. Check TRIGGER_API_KEY is correct and has proper permissions. ` +
                `Original error: ${triggerError.message}`
              )
            }
          }
          
          throw new Error(
            `Failed to trigger Trigger.dev task: ${triggerError instanceof Error ? triggerError.message : String(triggerError)}. ` +
            `Check that tasks are deployed and TRIGGER_API_KEY is correct.`
          )
        }

        if (!handle) {
          console.error('[create-sandbox] Handle is null or undefined')
          throw new Error('Failed to trigger Trigger.dev task: No handle returned (null/undefined)')
        }
        
        if (!handle.id) {
          console.error('[create-sandbox] Handle exists but has no id:', handle)
          throw new Error('Failed to trigger Trigger.dev task: Handle returned but missing run ID')
        }

        console.log('[create-sandbox] Task triggered successfully, runId:', handle.id, 'hasToken:', !!handle.publicAccessToken)
        
        // Add timeout wrapper for Vercel compatibility
        // Vercel Pro has 60s timeout, so we use 25s to stay safe
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Task execution timeout: Exceeded 25 seconds waiting for Trigger.dev task. The task may still be running - check Trigger.dev dashboard.'))
          }, 25000) // 25 seconds max (within Vercel Pro's 60s limit)
        })
        
        let result: any
        try {
          result = await Promise.race([
            waitForRunOutput(handle),
            timeoutPromise
          ])
          console.log('[create-sandbox] Task completed, result:', result ? 'has result' : 'no result', 'sandboxId:', result?.sandboxId)
        } catch (waitError) {
          console.error('[create-sandbox] Error waiting for task output:', waitError)
          // If we timeout, the task might still be running
          // Provide the runId so user can check status
          throw new Error(
            `Failed to get task result: ${waitError instanceof Error ? waitError.message : String(waitError)}. ` +
            `Task run ID: ${handle.id}. Check Trigger.dev dashboard for task status.`
          )
        }
        const sandboxId = result?.sandboxId

        if (!sandboxId) {
          throw new Error('Failed to create sandbox: No sandboxId returned from Trigger.dev task')
        }

        // Extract file paths and contents from writeFilesResult for UI display and caching
        const filePaths = result?.writeFilesResult?.files || []
        const fileContents = result?.writeFilesResult?.fileContents || []
        
        // Cache file contents on the server side for API route access
        if (fileContents.length > 0) {
          const { setServerFiles } = await import('@/app/api/sandboxes/[sandboxId]/files/store-route')
          setServerFiles(sandboxId, fileContents)
        }
        
        writer.write({
          id: toolCallId,
          type: 'data-create-sandbox',
          data: { 
            sandboxId, 
            status: 'done',
            writeFilesResult: result?.writeFilesResult,
            runCommandResult: result?.runCommandResult,
            // Include file paths for filesystem display
            paths: filePaths,
            // Include file contents for client-side caching
            fileContents: fileContents,
          },
        })

        let response = `Sandbox created with ID: ${sandboxId}.`
        
        if (result?.writeFilesResult) {
          response += `\nSuccessfully wrote ${result.writeFilesResult.filesWritten || 0} file(s).`
        }
        
        if (result?.runCommandResult) {
          const cmdResult = result.runCommandResult
          if (cmdResult.status === 'completed') {
            response += `\nCommand executed with exit code ${cmdResult.exitCode}.`
            if (cmdResult.stdout) {
              response += `\nStdout: ${cmdResult.stdout}`
            }
            if (cmdResult.stderr) {
              response += `\nStderr: ${cmdResult.stderr}`
            }
          } else {
            response += `\nCommand started with ID: ${cmdResult.commandId}.`
          }
        } else {
          response += `\nYou can now upload files, run commands, and access services on the exposed ports.`
        }

        return response
      } catch (error) {
        const richError = getRichError({
          action: 'Creating Sandbox',
          error,
        })

        writer.write({
          id: toolCallId,
          type: 'data-create-sandbox',
          data: {
            error: { message: richError.error.message },
            status: 'error',
          },
        })

        return richError.message
      }
    },
  })
