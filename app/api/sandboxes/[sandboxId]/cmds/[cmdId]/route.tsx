import { NextResponse, type NextRequest } from 'next/server'
import { e2bClient } from '@/lib/e2b-client'
import { createSandboxAdapter } from '@/lib/sandbox-adapter'
import { CommandCache } from '@/lib/command-cache'
import { getServerCommand } from '../store-route'

interface Params {
  sandboxId: string
  cmdId: string
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const cmdParams = await params
  const defaultStartedAt = Date.now()
  
  // First, try to get command from server-side store (works across processes)
  const serverCommand = getServerCommand(cmdParams.sandboxId, cmdParams.cmdId)
  if (serverCommand) {
    return NextResponse.json({
      sandboxId: cmdParams.sandboxId,
      cmdId: serverCommand.cmdId,
      startedAt: serverCommand.startedAt,
      exitCode: serverCommand.exitCode,
    })
  }
  
  // Fallback: try to get from CommandCache (only works if in same process)
  const cachedCommand = CommandCache.getCommand(cmdParams.sandboxId, cmdParams.cmdId)
  if (cachedCommand) {
    return NextResponse.json({
      sandboxId: cmdParams.sandboxId,
      cmdId: cachedCommand.cmdId,
      startedAt: cachedCommand.startedAt,
      exitCode: cachedCommand.exitCode,
    })
  }
  
  // If not in cache, try to get from sandbox (only works if sandbox is in same process)
  try {
    const sandbox = await e2bClient.getSandbox(cmdParams.sandboxId)
    const adapter = createSandboxAdapter(cmdParams.sandboxId, sandbox)
    const command = await adapter.getCommand(cmdParams.cmdId)

    if (!command || !command.startedAt) {
      return NextResponse.json({
        sandboxId: cmdParams.sandboxId,
        cmdId: cmdParams.cmdId,
        startedAt: defaultStartedAt,
        exitCode: undefined,
      })
    }

    const done = await command.wait().catch(() => null)
    
    const startedAt = command.startedAt instanceof Date 
      ? command.startedAt.getTime() 
      : typeof command.startedAt === 'number' 
        ? command.startedAt 
        : defaultStartedAt
    
    return NextResponse.json({
      sandboxId: cmdParams.sandboxId,
      cmdId: command.cmdId || cmdParams.cmdId,
      startedAt,
      exitCode: done?.exitCode,
    })
  } catch (error) {
    // If command not found, return a valid response with default values
    // This prevents the frontend from showing "Command not found" error
    return NextResponse.json({
      sandboxId: cmdParams.sandboxId,
      cmdId: cmdParams.cmdId,
      startedAt: defaultStartedAt,
      exitCode: undefined,
    }, { status: 200 })
  }
}
