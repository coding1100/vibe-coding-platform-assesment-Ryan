import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { sandboxOperationsTask, waitForRunOutput } from '../../lib/trigger-client'
import { getContents, type File } from './generate-files/get-contents'
import { getRichError } from './get-rich-error'
import { tool } from 'ai'
import description from './generate-files.md'
import z from 'zod/v3'

interface Params {
  modelId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const generateFiles = ({ writer, modelId }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z.string(),
      paths: z.array(z.string()),
    }),
    execute: async ({ sandboxId, paths }, { toolCallId, messages }) => {
      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: [], status: 'generating' },
      })

      const iterator = getContents({ messages, modelId, paths })
      const uploaded: File[] = []

      try {
        for await (const chunk of iterator) {
          if (chunk.files.length > 0) {
            writer.write({
              id: toolCallId,
              type: 'data-generating-files',
              data: {
                paths: chunk.written.concat(chunk.files.map((file) => file.path)),
                status: 'uploading',
              },
            })

            try {
              // Use sandbox-operations task to ensure same execution context
              // This ensures the sandbox is accessible even if it was created in a different process
              const handle = await sandboxOperationsTask.trigger({
                sandboxId, // Use existing sandbox
                writeFiles: chunk.files.map((file) => ({
                  path: file.path,
                  content: file.content,
                })),
              })

              if (!handle || !handle.id) {
                throw new Error('Failed to trigger sandbox operations task')
              }

              const result = await waitForRunOutput(handle)
              uploaded.push(...chunk.files)

              // Cache file contents on the server side for API route access
              if (result?.writeFilesResult?.fileContents && result.writeFilesResult.fileContents.length > 0) {
                const { setServerFiles } = await import('@/app/api/sandboxes/[sandboxId]/files/store-route')
                setServerFiles(sandboxId, result.writeFilesResult.fileContents)
              }

              writer.write({
                id: toolCallId,
                type: 'data-generating-files',
                data: {
                  sandboxId,
                  paths: chunk.written.concat(chunk.files.map((file) => file.path)),
                  status: 'uploaded',
                  // Include file contents for client-side caching
                  fileContents: result?.writeFilesResult?.fileContents || chunk.files.map(f => ({
                    path: f.path,
                    content: f.content,
                  })),
                },
              })
            } catch (error) {
              const richError = getRichError({
                action: 'write files to sandbox',
                args: { sandboxId, fileCount: chunk.files.length },
                error,
              })

              writer.write({
                id: toolCallId,
                type: 'data-generating-files',
                data: {
                  error: richError.error,
                  status: 'error',
                  paths: chunk.paths,
                },
              })

              return richError.message
            }
          } else {
            writer.write({
              id: toolCallId,
              type: 'data-generating-files',
              data: {
                status: 'generating',
                paths: chunk.paths,
              },
            })
          }
        }
      } catch (error) {
        const richError = getRichError({
          action: 'generate file contents',
          args: { modelId, paths },
          error,
        })

        writer.write({
          id: toolCallId,
          type: 'data-generating-files',
          data: {
            error: richError.error,
            status: 'error',
            paths,
          },
        })

        return richError.message
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: uploaded.map((file) => file.path), status: 'done' },
      })

      return `Successfully generated and uploaded ${
        uploaded.length
      } files. Their paths and contents are as follows:
        ${uploaded
          .map((file) => `Path: ${file.path}\nContent: ${file.content}\n`)
          .join('\n')}`
    },
  })
