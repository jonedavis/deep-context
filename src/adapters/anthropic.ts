/**
 * Anthropic Model Adapter
 *
 * Supports Claude models (claude-3-opus, claude-3-sonnet, claude-3-haiku, etc.)
 */

import type {
  ModelAdapter,
  CompletionRequest,
  CompletionResponse,
  ModelInfo,
  AnthropicConfig,
  Message,
} from './types.js';

// Context limits for Anthropic models
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-5-20251101': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
};

const ANTHROPIC_API_VERSION = '2023-06-01';

export class AnthropicAdapter implements ModelAdapter {
  readonly name: string;
  readonly provider = 'anthropic';
  readonly supportsStreaming = true;

  private apiKey: string;
  private model: string;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.name = `anthropic:${config.model}`;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { systemPrompt, messages } = this.splitSystemPrompt(request.messages);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: request.maxTokens ?? 4096,
        system: systemPrompt,
        messages: this.formatMessages(messages),
        temperature: request.temperature ?? 0.7,
        stop_sequences: request.stopSequences,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(`Anthropic error: ${error.error?.message ?? response.statusText}`);
    }

    const data = await response.json() as AnthropicResponse;

    // Extract text content
    const textContent = data.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return {
      content: textContent,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      finishReason: this.mapStopReason(data.stop_reason),
    };
  }

  async *streamComplete(request: CompletionRequest): AsyncGenerator<string, void, unknown> {
    const { systemPrompt, messages } = this.splitSystemPrompt(request.messages);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: request.maxTokens ?? 4096,
        system: systemPrompt,
        messages: this.formatMessages(messages),
        temperature: request.temperature ?? 0.7,
        stop_sequences: request.stopSequences,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(`Anthropic error: ${error.error?.message ?? response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data) as AnthropicStreamEvent;

            if (event.type === 'content_block_delta' && event.delta) {
              const delta = event.delta;
              if (delta.type === 'text_delta' && delta.text) {
                yield delta.text;
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // Anthropic doesn't have a models endpoint, return known models
    return Object.entries(MODEL_CONTEXT_LIMITS).map(([id, contextLength]) => ({
      id,
      name: this.formatModelName(id),
      contextLength,
    }));
  }

  getContextLimit(): number {
    // Check exact match
    if (MODEL_CONTEXT_LIMITS[this.model]) {
      return MODEL_CONTEXT_LIMITS[this.model];
    }

    // Default for Claude models
    return 200000;
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Make a minimal request to check API key validity
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        signal: AbortSignal.timeout(10000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Split system prompt from messages (Anthropic uses separate system param)
   */
  private splitSystemPrompt(messages: Message[]): {
    systemPrompt: string | undefined;
    messages: Message[];
  } {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    return {
      systemPrompt: systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n\n')
        : undefined,
      messages: nonSystemMessages,
    };
  }

  private formatMessages(messages: Message[]): AnthropicMessage[] {
    return messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  }

  private mapStopReason(reason: string | null): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }

  private formatModelName(id: string): string {
    // Convert claude-3-opus-20240229 to Claude 3 Opus
    return id
      .replace(/-\d{8}$/, '') // Remove date suffix
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

// Anthropic API types
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type: string;
    text?: string;
  };
}
