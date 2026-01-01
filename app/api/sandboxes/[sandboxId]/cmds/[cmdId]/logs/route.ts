import { NextResponse, type NextRequest } from 'next/server'
import { e2bClient } from '@/lib/e2b-client'
import { createSandboxAdapter } from '@/lib/sandbox-adapter'
import { CommandCache } from '@/lib/command-cache'
import { getServerCommand } from '../../store-route'

interface Params {
  sandboxId: string
  cmdId: string
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const logParams = await params
  const encoder = new TextEncoder()
  
  let cachedCommand = getServerCommand(logParams.sandboxId, logParams.cmdId)
  if (!cachedCommand) {
    cachedCommand = CommandCache.getCommand(logParams.sandboxId, logParams.cmdId)
  }
  
  if (cachedCommand && cachedCommand.status === 'completed') {
    return new NextResponse(
      new ReadableStream({
        start(controller) {
          // Stream stdout - handle newlines properly
          if (cachedCommand.stdout) {
            // Split by newline, but preserve the content
            const lines = cachedCommand.stdout.split('\n')
            // Filter out empty lines (usually from trailing newline)
            const nonEmptyLines = lines.filter(line => line.trim() !== '')
            
            for (const line of nonEmptyLines) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    data: line,
                    stream: 'stdout',
                    timestamp: cachedCommand.completedAt,
                  }) + '\n'
                )
              )
            }
          }
          
          // Stream stderr
          if (cachedCommand.stderr) {
            const lines = cachedCommand.stderr.split('\n')
            const nonEmptyLines = lines.filter(line => line.trim() !== '')
            
            for (const line of nonEmptyLines) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    data: line,
                    stream: 'stderr',
                    timestamp: cachedCommand.completedAt,
                  }) + '\n'
                )
              )
            }
          }
          
          controller.close()
        },
      }),
      { headers: { 'Content-Type': 'application/x-ndjson' } }
    )
  }
  
  // If not in cache, try to get from sandbox (only works if sandbox is in same process)
  try {
    const sandbox = await e2bClient.getSandbox(logParams.sandboxId)
    const adapter = createSandboxAdapter(logParams.sandboxId, sandbox)
    const command = await adapter.getCommand(logParams.cmdId)

    return new NextResponse(
      new ReadableStream({
        async pull(controller) {
          try {
            for await (const logline of command.logs()) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    data: logline.data,
                    stream: logline.stream,
                    timestamp: Date.now(),
                  }) + '\n'
                )
              )
            }
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  data: error instanceof Error ? error.message : String(error),
                  stream: 'stderr',
                  timestamp: Date.now(),
                }) + '\n'
              )
            )
          }
          controller.close()
        },
      }),
      { headers: { 'Content-Type': 'application/x-ndjson' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    return new NextResponse(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                data: errorMessage,
                stream: 'stderr',
                timestamp: Date.now(),
              }) + '\n'
            )
          )
          controller.close()
        },
      }),
      { 
        headers: { 'Content-Type': 'application/x-ndjson' },
        status: 200
      }
    )
  }
}
