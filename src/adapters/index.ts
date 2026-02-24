/**
 * Model Adapters
 *
 * Unified interface for multiple LLM providers.
 */

export * from './types.js';
export * from './ollama.js';
export * from './openai.js';
export * from './anthropic.js';

import type { ModelAdapter, AdapterConfig } from './types.js';
import { OllamaAdapter } from './ollama.js';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';

/**
 * Parse a model string like "ollama:llama3.2" or "openai:gpt-4o"
 */
export function parseModelString(modelString: string): {
  provider: string;
  model: string;
} {
  const colonIndex = modelString.indexOf(':');

  if (colonIndex === -1) {
    // No provider prefix, default to ollama
    return { provider: 'ollama', model: modelString };
  }

  return {
    provider: modelString.slice(0, colonIndex),
    model: modelString.slice(colonIndex + 1),
  };
}

/**
 * Create a model adapter from configuration
 */
export function createAdapter(config: AdapterConfig): ModelAdapter {
  switch (config.provider) {
    case 'ollama':
      return new OllamaAdapter(config.config);

    case 'openai':
      return new OpenAIAdapter(config.config);

    case 'anthropic':
      return new AnthropicAdapter(config.config);

    default:
      throw new Error(`Unknown provider: ${(config as { provider: string }).provider}`);
  }
}

/**
 * Create a model adapter from a model string and environment
 */
export function createAdapterFromString(
  modelString: string,
  env: {
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    OLLAMA_HOST?: string;
  } = process.env as Record<string, string | undefined>
): ModelAdapter {
  const { provider, model } = parseModelString(modelString);

  switch (provider) {
    case 'ollama':
      return new OllamaAdapter({
        baseUrl: env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
        model,
      });

    case 'openai':
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable required for OpenAI models');
      }
      return new OpenAIAdapter({
        apiKey: env.OPENAI_API_KEY,
        model,
      });

    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY environment variable required for Anthropic models');
      }
      return new AnthropicAdapter({
        apiKey: env.ANTHROPIC_API_KEY,
        model,
      });

    default:
      throw new Error(`Unknown provider: ${provider}. Use ollama:, openai:, or anthropic:`);
  }
}

/**
 * Get default model string based on available configuration
 */
export function getDefaultModel(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): string {
  // Check for API keys and suggest appropriate model
  if (env.ANTHROPIC_API_KEY) {
    return 'anthropic:claude-sonnet-4-20250514';
  }

  if (env.OPENAI_API_KEY) {
    return 'openai:gpt-4o';
  }

  // Default to Ollama (local)
  return 'ollama:llama3.2';
}
