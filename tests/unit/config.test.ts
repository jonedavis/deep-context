import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ConfigSchema,
  initProject,
  loadConfig,
  saveConfig,
  findProjectRoot,
  setConfigValue,
  getConfigValue,
  getDcPath,
  DC_DIR,
} from '../../src/config/index.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `dc-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('ConfigSchema', () => {
  it('parses empty object to defaults', () => {
    const config = ConfigSchema.parse({});
    expect(config.version).toBe(1);
    expect(config.model.provider).toBe('ollama');
    expect(config.model.name).toBe('llama3.2');
    expect(config.model.temperature).toBe(0.7);
    expect(config.embeddings.provider).toBe('local');
    expect(config.memory.autoExtract).toBe(true);
    expect(config.privacy.mode).toBe('local');
  });

  it('validates temperature range', () => {
    expect(() => ConfigSchema.parse({
      model: { temperature: 3 },
    })).toThrow();
  });

  it('validates negative maxTokens', () => {
    expect(() => ConfigSchema.parse({
      model: { maxTokens: -1 },
    })).toThrow();
  });

  it('accepts valid overrides', () => {
    const config = ConfigSchema.parse({
      model: { provider: 'openai', name: 'gpt-4o', temperature: 0.5 },
      privacy: { mode: 'cloud' },
    });
    expect(config.model.provider).toBe('openai');
    expect(config.model.name).toBe('gpt-4o');
    expect(config.privacy.mode).toBe('cloud');
  });
});

describe('initProject', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => cleanup(dir));

  it('creates .dc directory with config', () => {
    initProject(dir);
    expect(fs.existsSync(path.join(dir, DC_DIR))).toBe(true);
    expect(fs.existsSync(path.join(dir, DC_DIR, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, DC_DIR, '.gitignore'))).toBe(true);
  });

  it('config is valid JSON with defaults', () => {
    initProject(dir);
    const raw = fs.readFileSync(path.join(dir, DC_DIR, 'config.json'), 'utf-8');
    const config = JSON.parse(raw);
    expect(config.version).toBe(1);
  });

  it('refuses to re-init without force', () => {
    initProject(dir);
    expect(() => initProject(dir)).toThrow('already initialized');
  });

  it('allows re-init with force', () => {
    initProject(dir);
    initProject(dir, true); // should not throw
  });

  it('gitignore excludes database files', () => {
    initProject(dir);
    const gitignore = fs.readFileSync(path.join(dir, DC_DIR, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('memory.db');
    expect(gitignore).toContain('memory.db-wal');
  });
});

describe('loadConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    initProject(dir);
  });
  afterEach(() => cleanup(dir));

  it('loads saved config', () => {
    const config = loadConfig(dir);
    expect(config.version).toBe(1);
  });

  it('returns defaults for corrupt config', () => {
    fs.writeFileSync(path.join(dir, DC_DIR, 'config.json'), 'not json{{{');
    const config = loadConfig(dir);
    expect(config.version).toBe(1); // defaults
  });
});

describe('saveConfig + loadConfig roundtrip', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    initProject(dir);
  });
  afterEach(() => cleanup(dir));

  it('preserves all fields', () => {
    const config = loadConfig(dir);
    config.model.provider = 'openai';
    config.model.name = 'gpt-4o';
    config.model.temperature = 0.3;
    saveConfig(config, dir);

    const loaded = loadConfig(dir);
    expect(loaded.model.provider).toBe('openai');
    expect(loaded.model.name).toBe('gpt-4o');
    expect(loaded.model.temperature).toBe(0.3);
  });
});

describe('setConfigValue / getConfigValue', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    initProject(dir);
  });
  afterEach(() => cleanup(dir));

  it('sets and gets nested values', () => {
    setConfigValue('model.provider', 'anthropic', dir);
    expect(getConfigValue('model.provider', dir)).toBe('anthropic');
  });

  it('coerces number values', () => {
    setConfigValue('model.temperature', '0.5', dir);
    expect(getConfigValue('model.temperature', dir)).toBe(0.5);
  });

  it('coerces boolean values', () => {
    setConfigValue('memory.autoExtract', 'false', dir);
    expect(getConfigValue('memory.autoExtract', dir)).toBe(false);
  });

  it('rejects invalid keys', () => {
    expect(() => setConfigValue('nonexistent.path', 'val', dir)).toThrow();
  });
});

describe('findProjectRoot', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => cleanup(dir));

  it('finds .dc in current directory', () => {
    initProject(dir);
    expect(findProjectRoot(dir)).toBe(dir);
  });

  it('finds .dc in parent directory', () => {
    initProject(dir);
    const child = path.join(dir, 'src', 'components');
    fs.mkdirSync(child, { recursive: true });
    expect(findProjectRoot(child)).toBe(dir);
  });

  it('returns null when no .dc exists', () => {
    expect(findProjectRoot(dir)).toBeNull();
  });
});

describe('getDcPath', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
    initProject(dir);
  });
  afterEach(() => cleanup(dir));

  it('returns correct .dc path', () => {
    expect(getDcPath(dir)).toBe(path.join(dir, DC_DIR));
  });
});
