import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

export const ModelConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic']).default('ollama'),
  name: z.string().default('llama3.2'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(4096),
});

export const EmbeddingsConfigSchema = z.object({
  provider: z.enum(['local', 'ollama', 'openai']).default('local'),
  model: z.string().default('all-MiniLM-L6-v2'),
});

export const MemoryConfigSchema = z.object({
  autoExtract: z.boolean().default(true),
  confirmBeforeSave: z.boolean().default(true),
  maxConstraints: z.number().positive().default(20),
  frictionDecayDays: z.number().positive().default(30),
});

export const PrivacyConfigSchema = z.object({
  mode: z.enum(['local', 'cloud', 'hybrid']).default('local'),
  encryptMemory: z.boolean().default(false),
});

export const ConfigSchema = z.object({
  version: z.number().default(1),
  model: ModelConfigSchema.default({}),
  embeddings: EmbeddingsConfigSchema.default({}),
  memory: MemoryConfigSchema.default({}),
  privacy: PrivacyConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type EmbeddingsConfig = z.infer<typeof EmbeddingsConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type PrivacyConfig = z.infer<typeof PrivacyConfigSchema>;

export const DC_DIR = '.dc';
export const CONFIG_FILE = 'config.json';
export const MEMORY_DB = 'memory.db';

export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    const dcPath = path.join(currentDir, DC_DIR);
    if (fs.existsSync(dcPath) && fs.statSync(dcPath).isDirectory()) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

export function getDcPath(projectRoot?: string): string {
  const root = projectRoot ?? findProjectRoot();
  if (!root) {
    throw new Error('Not in a Deep Context project. Run `dc init` first.');
  }
  return path.join(root, DC_DIR);
}

export function getConfigPath(projectRoot?: string): string {
  return path.join(getDcPath(projectRoot), CONFIG_FILE);
}

export function getMemoryDbPath(projectRoot?: string): string {
  return path.join(getDcPath(projectRoot), MEMORY_DB);
}

export function loadConfig(projectRoot?: string): Config {
  const configPath = getConfigPath(projectRoot);

  if (!fs.existsSync(configPath)) {
    return ConfigSchema.parse({});
  }

  try {
    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return ConfigSchema.parse(rawConfig);
  } catch {
    // Corrupt or invalid config - fall back to defaults
    return ConfigSchema.parse({});
  }
}

export function saveConfig(config: Config, projectRoot?: string): void {
  const configPath = getConfigPath(projectRoot);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function initProject(targetDir: string = process.cwd(), force: boolean = false): void {
  const dcPath = path.join(targetDir, DC_DIR);

  if (fs.existsSync(dcPath) && !force) {
    throw new Error('Deep Context already initialized. Use --force to reinitialize.');
  }

  fs.mkdirSync(dcPath, { recursive: true, mode: 0o700 });

  const defaultConfig = ConfigSchema.parse({});
  fs.writeFileSync(
    path.join(dcPath, CONFIG_FILE),
    JSON.stringify(defaultConfig, null, 2),
    { mode: 0o600 }
  );

  const gitignorePath = path.join(dcPath, '.gitignore');
  fs.writeFileSync(gitignorePath, `# Deep Context local files
memory.db
memory.db-journal
memory.db-wal
embeddings/
`);
}

export function setConfigValue(key: string, value: string, projectRoot?: string): void {
  const config = loadConfig(projectRoot);
  const keys = key.split('.');

  let current: Record<string, unknown> = config as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof current[keys[i]] !== 'object' || current[keys[i]] === null) {
      throw new Error(`Invalid config key: ${key}`);
    }
    current = current[keys[i]] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];

  const existingValue = current[lastKey];
  if (typeof existingValue === 'number') {
    current[lastKey] = parseFloat(value);
  } else if (typeof existingValue === 'boolean') {
    current[lastKey] = value === 'true';
  } else {
    current[lastKey] = value;
  }

  const validated = ConfigSchema.parse(config);
  saveConfig(validated, projectRoot);
}

export function getConfigValue(key: string, projectRoot?: string): unknown {
  const config = loadConfig(projectRoot);
  const keys = key.split('.');

  let current: unknown = config;
  for (const k of keys) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[k];
  }

  return current;
}
