import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { sandboxOperationsTask, waitForRunOutput } from '../../lib/trigger-client'
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
        // Use invoke() for synchronous execution instead of trigger() + waitForRunOutput()
        let result: any
        try {
          result = await sandboxOperationsTask.invoke({
            createSandbox: {
              timeout: timeout ?? 600000,
              ports,
            },
            writeFiles,
            runCommand,
          })
        } catch (invokeError) {
          const handle = await sandboxOperationsTask.trigger({
            createSandbox: {
              timeout: timeout ?? 600000,
              ports,
            },
            writeFiles,
            runCommand,
          })

          if (!handle || !handle.id) {
            throw new Error('Failed to trigger Trigger.dev task: No handle returned')
          }

          result = await waitForRunOutput(handle)
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
