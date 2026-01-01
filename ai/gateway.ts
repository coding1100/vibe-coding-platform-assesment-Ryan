import { createGatewayProvider } from '@ai-sdk/gateway'
import { createOpenAI } from '@ai-sdk/openai'
import { Models } from './constants'
import type { JSONValue } from 'ai'
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

export async function getAvailableModels() {
  try {
    const gateway = gatewayInstance()
    const response = await gateway.getAvailableModels()
    return response.models.map((model) => ({ id: model.id, name: model.name }))
  } catch (error) {
    // If AI Gateway is not configured, fall back to direct OpenAI if API key is available
    const openaiKey = process.env.OPENAI_API_KEY
    if (openaiKey && openaiKey.trim() !== '') {
      console.log('AI Gateway not configured, using direct OpenAI API')
      // Return common OpenAI models that are typically available
      return [
        { id: Models.OpenAIGPT4o, name: 'GPT-4o' },
        { id: Models.OpenAIGPT4Turbo, name: 'GPT-4 Turbo' },
        { id: Models.OpenAIGPT35Turbo, name: 'GPT-3.5 Turbo' },
      ]
    }
    // If no OpenAI API key either, return empty list
    console.error('AI Gateway not configured and no OpenAI API key found.')
    console.error('Error:', error instanceof Error ? error.message : String(error))
    console.error('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY)
    console.error('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0)
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('OPENAI') || k.includes('GATEWAY')))
    return []
  }
}

export interface ModelOptions {
  model: LanguageModelV3
  providerOptions?: Record<string, Record<string, JSONValue>>
  headers?: Record<string, string>
}

export function getModelOptions(
  modelId: string,
  options?: { reasoningEffort?: 'low' | 'medium' | 'high' }
): ModelOptions {
  // Try to use AI Gateway first
  try {
    const gateway = gatewayInstance()
    
    if (modelId === Models.OpenAIGPT52) {
      return {
        model: gateway(modelId),
        providerOptions: {
          openai: {
            include: ['reasoning.encrypted_content'],
            reasoningEffort: options?.reasoningEffort ?? 'low',
            reasoningSummary: 'auto',
            serviceTier: 'priority',
          } satisfies OpenAIResponsesProviderOptions,
        },
      }
    }

    if (
      modelId === Models.AnthropicClaude4Sonnet ||
      modelId === Models.AnthropicClaude45Sonnet
    ) {
      return {
        model: gateway(modelId),
        headers: { 'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14' },
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      }
    }

    return {
      model: gateway(modelId),
    }
  } catch (error) {
    // Fall back to direct OpenAI if gateway is not configured
    if (process.env.OPENAI_API_KEY) {
      const openai = openAIInstance()
      
      // Map gateway model IDs to OpenAI model IDs
      let openaiModelId: string
      if (modelId === Models.OpenAIGPT4o || modelId === Models.OpenAIGPT52) {
        openaiModelId = 'gpt-4o'
      } else if (modelId === Models.OpenAIGPT4Turbo) {
        openaiModelId = 'gpt-4-turbo'
      } else if (modelId === Models.OpenAIGPT35Turbo) {
        openaiModelId = 'gpt-3.5-turbo'
      } else {
        // Default to gpt-4o for unknown models
        openaiModelId = 'gpt-4o'
      }
      
      return {
        model: openai(openaiModelId),
      }
    }
    
    // If neither gateway nor OpenAI is configured, throw error
    throw new Error('Neither AI Gateway nor OpenAI API key is configured')
  }
}

function gatewayInstance() {
  // Check if AI Gateway is configured
  if (process.env.AI_GATEWAY_BASE_URL || process.env.AI_GATEWAY_API_KEY) {
    return createGatewayProvider({
      baseURL: process.env.AI_GATEWAY_BASE_URL,
      apiKey: process.env.AI_GATEWAY_API_KEY,
    })
  }
  // If not configured, throw error so we can fall back to direct OpenAI
  throw new Error('AI Gateway not configured')
}

function openAIInstance() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
}
