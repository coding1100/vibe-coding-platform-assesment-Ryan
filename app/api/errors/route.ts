import { Models, DEFAULT_MODEL } from '@/ai/constants'
import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { generateText, Output } from 'ai'
import { linesSchema, resultSchema } from '@/components/error-monitor/schemas'
import { getModelOptions } from '@/ai/gateway'
import prompt from './prompt.md'

export async function POST(req: Request) {
  const checkResult = await checkBotId()
  if (checkResult.isBot) {
    return NextResponse.json({ error: `Bot detected` }, { status: 403 })
  }

  const body = await req.json()
  const parsedBody = linesSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json({ error: `Invalid request` }, { status: 400 })
  }

  // Use DEFAULT_MODEL (gpt-4o) instead of hardcoded GPT-5.2
  // For GPT-5.2 specific features, check if it's available first
  const modelId = DEFAULT_MODEL
  const modelOptions = getModelOptions(modelId, { reasoningEffort: 'low' })
  
  const result = await generateText({
    ...modelOptions,
    system: prompt,
    messages: [{ role: 'user', content: JSON.stringify(parsedBody.data) }],
    output: Output.object({ schema: resultSchema }),
  })

  return NextResponse.json(result.output, {
    status: 200,
  })
}
