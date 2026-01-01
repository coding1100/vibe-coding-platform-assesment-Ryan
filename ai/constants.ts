import { type GatewayModelId } from '@ai-sdk/gateway'

export enum Models {
  AmazonNovaPro = 'amazon/nova-pro',
  AnthropicClaude4Sonnet = 'anthropic/claude-4-sonnet',
  AnthropicClaude45Sonnet = 'anthropic/claude-sonnet-4.5',
  GoogleGeminiFlash = 'google/gemini-2.5-flash',
  MoonshotKimiK2 = 'moonshotai/kimi-k2',
  OpenAIGPT52 = 'openai/gpt-5.2',
  OpenAIGPT4o = 'openai/gpt-4o',
  OpenAIGPT4Turbo = 'openai/gpt-4-turbo',
  OpenAIGPT35Turbo = 'openai/gpt-3.5-turbo',
  XaiGrok3Fast = 'xai/grok-3-fast',
}

// Use a more commonly available model as default
// Falls back to first available model if this one isn't available
export const DEFAULT_MODEL = Models.OpenAIGPT4o

export const SUPPORTED_MODELS: GatewayModelId[] = [
  Models.OpenAIGPT4o,
  Models.OpenAIGPT4Turbo,
  Models.OpenAIGPT35Turbo,
  Models.OpenAIGPT52,
  Models.AmazonNovaPro,
  Models.AnthropicClaude4Sonnet,
  Models.AnthropicClaude45Sonnet,
  Models.GoogleGeminiFlash,
  Models.MoonshotKimiK2,
  Models.XaiGrok3Fast,
]

export const TEST_PROMPTS = [
  'Generate a Next.js app that allows to list and search Pokemons',
  'Create a `golang` server that responds with "Hello World" to any request',
]
