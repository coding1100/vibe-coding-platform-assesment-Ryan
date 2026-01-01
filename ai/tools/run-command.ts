import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { sandboxOperationsTask, waitForRunOutput } from '../../lib/trigger-client'
import { getRichError } from './get-rich-error'
import { tool } from 'ai'
import description from './run-command.md'
import z from 'zod/v3'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const runCommand = ({ writer }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z
        .string()
        .describe('The ID of the e2b Sandbox to run the command in'),
      command: z
        .string()
        .describe(
          "The base command to run (e.g., 'npm', 'node', 'python', 'ls', 'cat'). Do NOT include arguments here. IMPORTANT: Each command runs independently in a fresh shell session - there is no persistent state between commands. You cannot use 'cd' to change directories for subsequent commands."
        ),
      args: z
        .array(z.string())
        .optional()
        .describe(
          "Array of arguments for the command. Each argument should be a separate string (e.g., ['install', '--verbose'] for npm install --verbose, or ['src/index.js'] to run a file, or ['-la', './src'] to list files). IMPORTANT: Use relative paths (e.g., 'src/file.js') or absolute paths instead of trying to change directories with 'cd' first, since each command runs in a fresh shell session."
        ),
      sudo: z
        .boolean()
        .optional()
        .describe('Whether to run the command with sudo'),
      wait: z
        .boolean()
        .describe(
          'Whether to wait for the command to finish before returning. If true, the command will block until it completes, and you will receive its output.'
        ),
    }),
    execute: async (
      { sandboxId, command, sudo, wait, args = [] },
      { toolCallId }
    ) => {
      writer.write({
        id: toolCallId,
        type: 'data-run-command',
        data: { sandboxId, command, args, status: 'executing' },
      })

      try {
        // Use sandbox-operations task to ensure same execution context
        // This ensures the sandbox is accessible even if it was created in a different process
        // Use invoke() for synchronous execution instead of trigger() + waitForRunOutput()
        let result: any
        try {
          result = await sandboxOperationsTask.invoke({
            sandboxId, // Use existing sandbox
            runCommand: {
              command,
              args,
              sudo,
              wait,
            },
          })
        } catch (invokeError) {
          const handle = await sandboxOperationsTask.trigger({
            sandboxId, // Use existing sandbox
            runCommand: {
              command,
              args,
              sudo,
              wait,
            },
          })

          if (!handle || !handle.id) {
            throw new Error('Failed to trigger Trigger.dev task: No handle returned')
          }

          result = await waitForRunOutput(handle)
        }
        const commandId = result?.runCommandResult?.commandId

        if (!commandId && result?.runCommandResult?.status !== 'completed') {
          throw new Error('Failed to run command: No commandId returned from Trigger.dev task')
        }
        
        // If commandId is not in runCommandResult, try to get it from the result
        const finalCommandId = commandId || result?.runCommandResult?.commandId

        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: {
            sandboxId,
            commandId: finalCommandId || 'unknown',
            command,
            args,
            status: wait ? 'waiting' : 'running',
          },
        })

        if (!wait) {
          return `The command \`${command} ${args.join(
            ' '
          )}\` has been started in the background in the sandbox with ID \`${sandboxId}\` with the commandId ${finalCommandId || 'unknown'}.`
        }

        if (result?.runCommandResult?.status === 'completed') {
          const cmdResult = result.runCommandResult
          const commandId = finalCommandId || cmdResult.commandId
          
          // Store command output in server-side store so it's accessible from API routes
          const { setServerCommand } = await import('@/app/api/sandboxes/[sandboxId]/cmds/store-route')
          setServerCommand({
            cmdId: commandId,
            sandboxId,
            command,
            args,
            stdout: cmdResult.stdout || '',
            stderr: cmdResult.stderr || '',
            exitCode: cmdResult.exitCode,
            startedAt: Date.now() - 5000, // Approximate start time
            completedAt: Date.now(),
            status: 'completed',
          })
          
          writer.write({
            id: toolCallId,
            type: 'data-run-command',
            data: {
              sandboxId,
              commandId,
              command,
              args,
              exitCode: cmdResult.exitCode,
              status: 'done',
            },
          })

          return (
            `The command \`${command} ${args.join(
              ' '
            )}\` has finished with exit code ${cmdResult.exitCode}.` +
            (cmdResult.stdout ? `\nStdout of the command was: \n\`\`\`\n${cmdResult.stdout}\n\`\`\`` : '') +
            (cmdResult.stderr ? `\nStderr of the command was: \n\`\`\`\n${cmdResult.stderr}\n\`\`\`` : '')
          )
        }

        return `The command \`${command} ${args.join(' ')}\` has been executed.`
      } catch (error) {
        const richError = getRichError({
          action: 'run command via Trigger.dev',
          args: { sandboxId, command },
          error,
        })

        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: {
            sandboxId,
            command,
            args,
            error: richError.error,
            status: 'error',
          },
        })

        return richError.message
      }
    },
  })
