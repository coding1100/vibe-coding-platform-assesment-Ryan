import z from 'zod/v3'

export const errorSchema = z.object({
  message: z.string(),
})

export const dataPartSchema = z.object({
  'create-sandbox': z.object({
    sandboxId: z.string().optional(),
    status: z.enum(['loading', 'done', 'error']),
    error: errorSchema.optional(),
    writeFilesResult: z.any().optional(),
    runCommandResult: z.any().optional(),
    paths: z.array(z.string()).optional(),
    fileContents: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })).optional(),
  }),
  'generating-files': z.object({
    paths: z.array(z.string()),
    status: z.enum(['generating', 'uploading', 'uploaded', 'done', 'error']),
    error: errorSchema.optional(),
    sandboxId: z.string().optional(),
    fileContents: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })).optional(),
  }),
  'run-command': z.object({
    sandboxId: z.string(),
    commandId: z.string().optional(),
    command: z.string(),
    args: z.array(z.string()),
    status: z.enum(['executing', 'running', 'waiting', 'done', 'error']),
    exitCode: z.number().optional(),
    error: errorSchema.optional(),
  }),
  'get-sandbox-url': z.object({
    url: z.string().optional(),
    status: z.enum(['loading', 'done', 'error']),
    error: errorSchema.optional(),
  }),
  'report-errors': z.object({
    summary: z.string(),
    paths: z.array(z.string()).optional(),
  }),
})

export type DataPart = z.infer<typeof dataPartSchema>
