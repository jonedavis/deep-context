/**
 * Type definitions for model adapters
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface CompletionResponse {
  content: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  description?: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

/**
 * Abstract model adapter interface
 */
export interface ModelAdapter {
  readonly name: string;
  readonly provider: string;
  readonly supportsStreaming: boolean;

  /**
   * Complete a chat request
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Stream a chat completion
   */
  streamComplete(request: CompletionRequest): AsyncGenerator<string, void, unknown>;

  /**
   * List available models
   */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Get the context window size for the current model
   */
  getContextLimit(): number;

  /**
   * Check if the adapter is properly configured and reachable
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Configuration for different providers
 */
export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export type AdapterConfig =
  | { provider: 'ollama'; config: OllamaConfig }
  | { provider: 'openai'; config: OpenAIConfig }
  | { provider: 'anthropic'; config: AnthropicConfig };
