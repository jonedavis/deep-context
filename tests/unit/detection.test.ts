import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectProjectType, getPrimaryProjectType } from '../../src/detection/detector.js';

function tmpDir(): string {
  const dir = path.join(os.tmpdir(), `dc-detect-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('detectProjectType', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => cleanup(dir));

  it('detects TypeScript project', () => {
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{}}');

    const result = detectProjectType(dir);
    expect(result.tech.languages).toContain('typescript');
    expect(result.configFiles).toContain('tsconfig.json');
  });

  it('detects JavaScript without TypeScript', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{}}');

    const result = detectProjectType(dir);
    expect(result.tech.languages).toContain('javascript');
    expect(result.tech.languages).not.toContain('typescript');
  });

  it('detects React from package.json', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
    }));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');

    const result = detectProjectType(dir);
    expect(result.tech.frameworks).toContain('react');
  });

  it('detects Next.js', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0', next: '^14.0.0' },
    }));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');

    const result = detectProjectType(dir);
    expect(result.tech.frameworks).toContain('next.js');
  });

  it('detects Express backend', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.0' },
    }));

    const result = detectProjectType(dir);
    expect(result.tech.frameworks).toContain('express');
  });

  it('detects Python project from requirements.txt', () => {
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask==3.0\n');

    const result = detectProjectType(dir);
    expect(result.tech.languages).toContain('python');
  });

  it('detects Python project from pyproject.toml', () => {
    fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[project]\nname = "myapp"\n');

    const result = detectProjectType(dir);
    expect(result.tech.languages).toContain('python');
  });

  it('detects Go project', () => {
    fs.writeFileSync(path.join(dir, 'go.mod'), 'module example.com/app\n');

    const result = detectProjectType(dir);
    expect(result.tech.languages).toContain('go');
  });

  it('detects Rust project', () => {
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "myapp"\n');

    const result = detectProjectType(dir);
    expect(result.tech.languages).toContain('rust');
  });

  it('detects Java project from pom.xml', () => {
    fs.writeFileSync(path.join(dir, 'pom.xml'), '<project></project>');

    const result = detectProjectType(dir);
    expect(result.tech.languages).toContain('java');
  });

  it('detects testing frameworks', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      devDependencies: { vitest: '^1.0.0', '@playwright/test': '^1.40.0' },
    }));

    const result = detectProjectType(dir);
    expect(result.tech.testing).toContain('vitest');
    expect(result.tech.testing).toContain('playwright');
  });

  it('detects database tools', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { '@prisma/client': '^5.0.0', redis: '^4.0.0' },
    }));

    const result = detectProjectType(dir);
    expect(result.tech.databases).toContain('prisma');
    expect(result.tech.databases).toContain('redis');
  });

  it('detects Docker', () => {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:20\n');

    const result = detectProjectType(dir);
    expect(result.tech.other).toContain('docker');
  });

  it('detects monorepo tools', () => {
    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{}}');

    const result = detectProjectType(dir);
    expect(result.tech.buildTools).toContain('pnpm-workspaces');
  });

  it('returns low confidence for empty directory', () => {
    const result = detectProjectType(dir);
    expect(result.confidence).toBe('low');
    expect(result.tech.languages).toHaveLength(0);
  });

  it('deduplicates detected items', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.0.0' },
      devDependencies: { express: '^4.0.0' }, // duplicate
    }));

    const result = detectProjectType(dir);
    const expressCount = result.tech.frameworks.filter(f => f === 'express').length;
    expect(expressCount).toBe(1);
  });
});

describe('getPrimaryProjectType', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => cleanup(dir));

  it('returns nextjs for React + Next.js', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0', next: '^14.0.0' },
    }));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');

    const result = detectProjectType(dir);
    expect(getPrimaryProjectType(result)).toBe('nextjs');
  });

  it('returns react for standalone React', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
    }));

    const result = detectProjectType(dir);
    expect(getPrimaryProjectType(result)).toBe('react');
  });

  it('returns node-api for Express', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.0.0' },
    }));

    const result = detectProjectType(dir);
    expect(getPrimaryProjectType(result)).toBe('node-api');
  });

  it('returns generic for empty project', () => {
    const result = detectProjectType(dir);
    expect(getPrimaryProjectType(result)).toBe('generic');
  });

  it('returns python for Python-only project', () => {
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'requests\n');

    const result = detectProjectType(dir);
    expect(getPrimaryProjectType(result)).toBe('python');
  });

  it('returns go for Go project', () => {
    fs.writeFileSync(path.join(dir, 'go.mod'), 'module example.com/app\n');

    const result = detectProjectType(dir);
    expect(getPrimaryProjectType(result)).toBe('go');
  });
});
