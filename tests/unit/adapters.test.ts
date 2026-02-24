import { describe, it, expect } from 'vitest';
import { parseModelString, createAdapterFromString, getDefaultModel } from '../../src/adapters/index.js';
import { OllamaAdapter } from '../../src/adapters/ollama.js';
import { OpenAIAdapter } from '../../src/adapters/openai.js';
import { AnthropicAdapter } from '../../src/adapters/anthropic.js';

describe('parseModelString', () => {
  it('parses provider:model format', () => {
    expect(parseModelString('ollama:llama3.2')).toEqual({ provider: 'ollama', model: 'llama3.2' });
    expect(parseModelString('openai:gpt-4o')).toEqual({ provider: 'openai', model: 'gpt-4o' });
    expect(parseModelString('anthropic:claude-3-opus-20240229')).toEqual({
      provider: 'anthropic', model: 'claude-3-opus-20240229',
    });
  });

  it('defaults to ollama when no provider prefix', () => {
    expect(parseModelString('llama3.2')).toEqual({ provider: 'ollama', model: 'llama3.2' });
  });

  it('handles colons in model name', () => {
    expect(parseModelString('ollama:llama3.2:latest')).toEqual({
      provider: 'ollama', model: 'llama3.2:latest',
    });
  });
});

describe('createAdapterFromString', () => {
  it('creates OllamaAdapter', () => {
    const adapter = createAdapterFromString('ollama:llama3.2');
    expect(adapter).toBeInstanceOf(OllamaAdapter);
    expect(adapter.provider).toBe('ollama');
  });

  it('creates OpenAIAdapter with API key', () => {
    const adapter = createAdapterFromString('openai:gpt-4o', {
      OPENAI_API_KEY: 'sk-test',
    });
    expect(adapter).toBeInstanceOf(OpenAIAdapter);
    expect(adapter.provider).toBe('openai');
  });

  it('creates AnthropicAdapter with API key', () => {
    const adapter = createAdapterFromString('anthropic:claude-3-opus-20240229', {
      ANTHROPIC_API_KEY: 'sk-ant-test',
    });
    expect(adapter).toBeInstanceOf(AnthropicAdapter);
    expect(adapter.provider).toBe('anthropic');
  });

  it('throws without OpenAI API key', () => {
    expect(() => createAdapterFromString('openai:gpt-4o', {}))
      .toThrow('OPENAI_API_KEY');
  });

  it('throws without Anthropic API key', () => {
    expect(() => createAdapterFromString('anthropic:claude-3-opus-20240229', {}))
      .toThrow('ANTHROPIC_API_KEY');
  });

  it('throws for unknown provider', () => {
    expect(() => createAdapterFromString('fake:model', {}))
      .toThrow('Unknown provider');
  });

  it('uses OLLAMA_HOST from env', () => {
    const adapter = createAdapterFromString('ollama:llama3', {
      OLLAMA_HOST: 'http://192.168.1.100:11434',
    });
    expect(adapter).toBeInstanceOf(OllamaAdapter);
  });
});

describe('getDefaultModel', () => {
  it('prefers Anthropic when key is available', () => {
    const model = getDefaultModel({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    expect(model).toContain('anthropic:');
  });

  it('falls back to OpenAI', () => {
    const model = getDefaultModel({ OPENAI_API_KEY: 'sk-test' });
    expect(model).toContain('openai:');
  });

  it('defaults to Ollama when no keys', () => {
    const model = getDefaultModel({});
    expect(model).toContain('ollama:');
  });
});

describe('OllamaAdapter', () => {
  it('has correct metadata', () => {
    const adapter = new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama3.2' });
    expect(adapter.name).toBe('ollama:llama3.2');
    expect(adapter.provider).toBe('ollama');
    expect(adapter.supportsStreaming).toBe(true);
  });

  it('returns reasonable context limits', () => {
    const adapter = new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'llama3.2' });
    expect(adapter.getContextLimit()).toBe(128000);

    const adapter2 = new OllamaAdapter({ baseUrl: 'http://localhost:11434', model: 'unknown-model' });
    expect(adapter2.getContextLimit()).toBe(8192); // default
  });

  it('strips trailing slash from baseUrl', () => {
    const adapter = new OllamaAdapter({ baseUrl: 'http://localhost:11434/', model: 'llama3' });
    // Verify it doesn't crash during construction
    expect(adapter.name).toBe('ollama:llama3');
  });
});

describe('OpenAIAdapter', () => {
  it('has correct metadata', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test', model: 'gpt-4o' });
    expect(adapter.name).toBe('openai:gpt-4o');
    expect(adapter.provider).toBe('openai');
  });

  it('returns known context limits', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test', model: 'gpt-4o' });
    expect(adapter.getContextLimit()).toBe(128000);

    const adapter2 = new OpenAIAdapter({ apiKey: 'test', model: 'gpt-4' });
    expect(adapter2.getContextLimit()).toBe(8192);
  });
});

describe('AnthropicAdapter', () => {
  it('has correct metadata', () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test', model: 'claude-3-opus-20240229' });
    expect(adapter.name).toBe('anthropic:claude-3-opus-20240229');
    expect(adapter.provider).toBe('anthropic');
  });

  it('returns 200k context for claude models', () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test', model: 'claude-3-opus-20240229' });
    expect(adapter.getContextLimit()).toBe(200000);
  });
});
