import { NextResponse, type NextRequest } from 'next/server'
import { sandboxOperationsTask, waitForRunOutput } from '@/lib/trigger-client'
import { getServerFileContent, setServerFileContent, setServerFiles } from './store-route'
import z from 'zod/v3'

const FileParamsSchema = z.object({
  sandboxId: z.string(),
  path: z.string(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params
  const fileParams = FileParamsSchema.safeParse({
    path: request.nextUrl.searchParams.get('path'),
    sandboxId,
  })

  if (fileParams.success === false) {
    return NextResponse.json(
      { error: 'Invalid parameters. You must pass a `path` as query' },
      { status: 400 }
    )
  }

  try {
    const cachedContent = getServerFileContent(fileParams.data.sandboxId, fileParams.data.path);
    if (cachedContent !== null) {
      return new NextResponse(cachedContent, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-File-Source': 'cache',
        },
      });
    }

    const handle = await sandboxOperationsTask.trigger({
      sandboxId: fileParams.data.sandboxId,
      readFile: {
        path: fileParams.data.path,
      },
    })

    if (!handle || !handle.id) {
      return NextResponse.json(
        { error: 'Failed to trigger file read task' },
        { status: 500 }
      )
    }

    const result = await waitForRunOutput(handle)

    if (!result?.readFileResult) {
      return NextResponse.json(
        { error: 'No read result returned from task' },
        { status: 500 }
      )
    }

    const readResult = result.readFileResult;

    if (!readResult.success) {
      return NextResponse.json(
        { error: readResult.error || 'File not found in the Sandbox' },
        { status: readResult.error === 'File not found' ? 404 : 500 }
      )
    }

    if (!readResult.content) {
      return NextResponse.json(
        { error: 'File content is empty' },
        { status: 404 }
      )
    }

    // Cache the content for future requests
    setServerFileContent(fileParams.data.sandboxId, fileParams.data.path, readResult.content);

    // Return file content as text
    return new NextResponse(readResult.content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-File-Source': readResult.fromCache ? 'cache' : 'sandbox',
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if it's a process isolation error
    if (errorMessage.includes('different Trigger.dev worker process') || 
        errorMessage.includes('not found in cache')) {
      return NextResponse.json(
        { 
          error: `Cannot read file: Sandbox ${fileParams.data.sandboxId} was created in a different worker process and cannot be accessed. ` +
                 `This is a limitation of Trigger.dev's process isolation. ` +
                 `Files can only be read if the sandbox is in the same worker process. ` +
                 `Try refreshing the page or creating a new sandbox.`
        },
        { status: 503 } // Service Unavailable
      )
    }
    
    return NextResponse.json(
      { error: errorMessage || 'Failed to read file' },
      { status: 500 }
    )
  }
}
