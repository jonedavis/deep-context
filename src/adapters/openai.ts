/**
 * OpenAI Model Adapter
 *
 * Supports GPT-4, GPT-3.5, and compatible APIs (Azure, local proxies).
 */

import type {
  ModelAdapter,
  CompletionRequest,
  CompletionResponse,
  ModelInfo,
  OpenAIConfig,
  Message,
} from './types.js';

// Context limits for OpenAI models
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4-turbo-preview': 128000,
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,
  'o1': 128000,
  'o1-mini': 128000,
  'o1-preview': 128000,
};

export class OpenAIAdapter implements ModelAdapter {
  readonly name: string;
  readonly provider = 'openai';
  readonly supportsStreaming = true;

  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.name = `openai:${config.model}`;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: this.formatMessages(request.messages),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stop: request.stopSequences,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(`OpenAI error: ${error.error?.message ?? response.statusText}`);
    }

    const data = await response.json() as OpenAIChatResponse;
    const choice = data.choices[0];

    return {
      content: choice.message.content ?? '',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  async *streamComplete(request: CompletionRequest): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: this.formatMessages(request.messages),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        stop: request.stopSequences,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(`OpenAI error: ${error.error?.message ?? response.statusText}`);
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
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data) as OpenAIStreamChunk;
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              yield content;
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
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to list OpenAI models');
    }

    const data = await response.json() as { data: OpenAIModel[] };

    // Filter to chat models only
    const chatModels = data.data.filter((m) =>
      m.id.startsWith('gpt-') || m.id.startsWith('o1')
    );

    return chatModels.map((model) => ({
      id: model.id,
      name: model.id,
      contextLength: MODEL_CONTEXT_LIMITS[model.id] ?? 8192,
    }));
  }

  getContextLimit(): number {
    // Check exact match
    if (MODEL_CONTEXT_LIMITS[this.model]) {
      return MODEL_CONTEXT_LIMITS[this.model];
    }

    // Check prefix matches
    for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
      if (this.model.startsWith(key)) {
        return limit;
      }
    }

    return 8192;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private formatMessages(messages: Message[]): OpenAIMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  private mapFinishReason(reason: string): CompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}

// OpenAI API types
interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: { content: string | null };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  choices: Array<{
    delta: { content?: string };
    finish_reason: string | null;
  }>;
}

interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}
