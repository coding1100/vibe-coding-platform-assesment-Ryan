import { NextRequest, NextResponse } from 'next/server'
import { e2bClient } from '@/lib/e2b-client'
import { createSandboxAdapter } from '@/lib/sandbox-adapter'

/**
 * Check the status of an e2b sandbox
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params
  try {
    // Try to get sandbox from cache first
    const sandbox = await e2bClient.getSandbox(sandboxId)
    
    if (sandbox && typeof (sandbox as any).getInfo === 'function') {
      try {
        const info = await (sandbox as any).getInfo()
        if (info && info.endAt && new Date(info.endAt) > new Date()) {
          return NextResponse.json({ status: 'ok' })
        }
      } catch {
        // If we have the sandbox instance, assume it's running
        return NextResponse.json({ status: 'ok' })
      }
    }
    
    // If we have the sandbox instance, it's running
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // If sandbox is not in cache, it might still be running (created in Trigger.dev worker)
    // Only return 'stopped' if we're certain it's closed
    if (
      errorMessage.includes('closed') ||
      errorMessage.includes('stopped') ||
      errorMessage.includes('terminated')
    ) {
      return NextResponse.json({ status: 'stopped' })
    }
    
    // If not found in cache but might exist in Trigger.dev worker, assume it's running
    // This handles the case where sandbox is created in Trigger.dev but not in Next.js cache
    return NextResponse.json({ status: 'ok' })
  }
}
