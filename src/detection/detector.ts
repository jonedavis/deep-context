import * as fs from 'fs';
import * as path from 'path';

export interface DetectedTech {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  testing: string[];
  databases: string[];
  other: string[];
}

export interface DetectionResult {
  tech: DetectedTech;
  configFiles: string[];
  summary: string;
  confidence: 'high' | 'medium' | 'low';
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fileExists(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function hasAnyFile(dir: string, files: string[]): string | null {
  for (const file of files) {
    if (fileExists(path.join(dir, file))) return file;
  }
  return null;
}

function detectTypeScript(dir: string) {
  const configFile = hasAnyFile(dir, ['tsconfig.json', 'tsconfig.base.json', 'tsconfig.build.json']);
  return { found: configFile !== null, configFile };
}

function detectPython(dir: string) {
  const pythonFiles = [
    'requirements.txt', 'setup.py', 'pyproject.toml',
    'Pipfile', 'poetry.lock', 'setup.cfg', 'tox.ini',
  ];
  const foundFiles = pythonFiles.filter((file) => fileExists(path.join(dir, file)));
  return { found: foundFiles.length > 0, configFiles: foundFiles };
}

function detectGo(dir: string) {
  const configFile = hasAnyFile(dir, ['go.mod', 'go.sum']);
  return { found: configFile !== null, configFile };
}

function detectRust(dir: string) {
  const configFile = hasAnyFile(dir, ['Cargo.toml', 'Cargo.lock']);
  return { found: configFile !== null, configFile };
}

function detectJava(dir: string) {
  const javaFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'gradlew'];
  const foundFiles = javaFiles.filter((file) => fileExists(path.join(dir, file)));
  return { found: foundFiles.length > 0, configFiles: foundFiles };
}

function analyzePackageJson(dir: string) {
  const result = {
    frameworks: [] as string[],
    buildTools: [] as string[],
    testing: [] as string[],
    databases: [] as string[],
    other: [] as string[],
  };

  const pkg = readJsonFile(path.join(dir, 'package.json'));
  if (!pkg) return result;

  const allDeps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  };

  const deps = Object.keys(allDeps);

  // Frameworks
  if (deps.includes('react') || deps.includes('react-dom')) {
    result.frameworks.push('react');
    if (deps.includes('next')) result.frameworks.push('next.js');
    if (deps.includes('gatsby')) result.frameworks.push('gatsby');
    if (deps.includes('@remix-run/react')) result.frameworks.push('remix');
  }
  if (deps.includes('vue')) {
    result.frameworks.push('vue');
    if (deps.includes('nuxt')) result.frameworks.push('nuxt');
  }
  if (deps.includes('@angular/core')) result.frameworks.push('angular');
  if (deps.includes('svelte')) result.frameworks.push('svelte');
  if (deps.includes('solid-js')) result.frameworks.push('solid');
  if (deps.includes('express')) result.frameworks.push('express');
  if (deps.includes('fastify')) result.frameworks.push('fastify');
  if (deps.includes('@nestjs/core')) result.frameworks.push('nestjs');
  if (deps.includes('koa')) result.frameworks.push('koa');
  if (deps.includes('hono')) result.frameworks.push('hono');
  if (deps.includes('@hapi/hapi')) result.frameworks.push('hapi');
  if (deps.includes('@trpc/server') || deps.includes('@trpc/client')) {
    result.frameworks.push('trpc');
  }
  if (deps.includes('graphql')) result.frameworks.push('graphql');

  // Build tools
  if (deps.includes('vite')) result.buildTools.push('vite');
  if (deps.includes('webpack')) result.buildTools.push('webpack');
  if (deps.includes('esbuild')) result.buildTools.push('esbuild');
  if (deps.includes('rollup')) result.buildTools.push('rollup');
  if (deps.includes('parcel')) result.buildTools.push('parcel');
  if (deps.includes('turbo')) result.buildTools.push('turborepo');
  if (deps.includes('nx')) result.buildTools.push('nx');
  if (deps.includes('tsup')) result.buildTools.push('tsup');

  // Testing
  if (deps.includes('jest')) result.testing.push('jest');
  if (deps.includes('vitest')) result.testing.push('vitest');
  if (deps.includes('mocha')) result.testing.push('mocha');
  if (deps.includes('@testing-library/react')) result.testing.push('testing-library');
  if (deps.includes('cypress')) result.testing.push('cypress');
  if (deps.includes('playwright') || deps.includes('@playwright/test')) {
    result.testing.push('playwright');
  }

  // Databases / ORMs
  if (deps.includes('prisma') || deps.includes('@prisma/client')) result.databases.push('prisma');
  if (deps.includes('drizzle-orm')) result.databases.push('drizzle');
  if (deps.includes('typeorm')) result.databases.push('typeorm');
  if (deps.includes('sequelize')) result.databases.push('sequelize');
  if (deps.includes('mongoose')) result.databases.push('mongoose');
  if (deps.includes('pg')) result.databases.push('postgresql');
  if (deps.includes('mysql2') || deps.includes('mysql')) result.databases.push('mysql');
  if (deps.includes('better-sqlite3') || deps.includes('sqlite3')) result.databases.push('sqlite');
  if (deps.includes('redis') || deps.includes('ioredis')) result.databases.push('redis');

  // Other
  if (deps.includes('redux') || deps.includes('@reduxjs/toolkit')) result.other.push('redux');
  if (deps.includes('zustand')) result.other.push('zustand');
  if (deps.includes('mobx')) result.other.push('mobx');
  if (deps.includes('jotai')) result.other.push('jotai');
  if (deps.includes('recoil')) result.other.push('recoil');
  if (deps.includes('zod')) result.other.push('zod');
  if (deps.includes('tailwindcss')) result.other.push('tailwind');
  if (deps.includes('styled-components')) result.other.push('styled-components');
  if (deps.includes('@emotion/react')) result.other.push('emotion');

  return result;
}

function detectDocker(dir: string): boolean {
  return fileExists(path.join(dir, 'Dockerfile')) ||
         fileExists(path.join(dir, 'docker-compose.yml')) ||
         fileExists(path.join(dir, 'docker-compose.yaml'));
}

function detectMonorepo(dir: string): string | null {
  if (fileExists(path.join(dir, 'pnpm-workspace.yaml'))) return 'pnpm-workspaces';
  if (fileExists(path.join(dir, 'lerna.json'))) return 'lerna';
  if (fileExists(path.join(dir, 'nx.json'))) return 'nx';
  if (fileExists(path.join(dir, 'turbo.json'))) return 'turborepo';

  const pkg = readJsonFile(path.join(dir, 'package.json'));
  if (pkg?.workspaces) return 'npm-workspaces';

  return null;
}

export function detectProjectType(dir: string = process.cwd()): DetectionResult {
  const tech: DetectedTech = {
    languages: [],
    frameworks: [],
    buildTools: [],
    testing: [],
    databases: [],
    other: [],
  };
  const configFiles: string[] = [];

  const ts = detectTypeScript(dir);
  if (ts.found) {
    tech.languages.push('typescript');
    if (ts.configFile) configFiles.push(ts.configFile);
  }

  if (fileExists(path.join(dir, 'package.json'))) {
    configFiles.push('package.json');
    if (!ts.found) tech.languages.push('javascript');

    const pkgAnalysis = analyzePackageJson(dir);
    tech.frameworks.push(...pkgAnalysis.frameworks);
    tech.buildTools.push(...pkgAnalysis.buildTools);
    tech.testing.push(...pkgAnalysis.testing);
    tech.databases.push(...pkgAnalysis.databases);
    tech.other.push(...pkgAnalysis.other);
  }

  const python = detectPython(dir);
  if (python.found) {
    tech.languages.push('python');
    configFiles.push(...python.configFiles);

    if (fileExists(path.join(dir, 'manage.py'))) tech.frameworks.push('django');
    const pyprojectPath = path.join(dir, 'pyproject.toml');
    if (fileExists(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        if (content.includes('fastapi')) tech.frameworks.push('fastapi');
        if (content.includes('flask')) tech.frameworks.push('flask');
        if (content.includes('pytest')) tech.testing.push('pytest');
      } catch { /* ignore */ }
    }
  }

  const go = detectGo(dir);
  if (go.found) {
    tech.languages.push('go');
    if (go.configFile) configFiles.push(go.configFile);
  }

  const rust = detectRust(dir);
  if (rust.found) {
    tech.languages.push('rust');
    if (rust.configFile) configFiles.push(rust.configFile);
  }

  const java = detectJava(dir);
  if (java.found) {
    tech.languages.push('java');
    configFiles.push(...java.configFiles);
    if (java.configFiles.some((f) => f.includes('.kts'))) tech.languages.push('kotlin');
  }

  if (detectDocker(dir)) tech.other.push('docker');

  const monorepo = detectMonorepo(dir);
  if (monorepo) tech.buildTools.push(monorepo);

  if (hasAnyFile(dir, ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js'])) {
    tech.other.push('eslint');
  }
  if (hasAnyFile(dir, ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js'])) {
    tech.other.push('prettier');
  }

  // Deduplicate
  for (const key of Object.keys(tech) as (keyof DetectedTech)[]) {
    tech[key] = [...new Set(tech[key])];
  }

  return {
    tech,
    configFiles,
    summary: generateSummary(tech),
    confidence: calculateConfidence(tech, configFiles),
  };
}

function generateSummary(tech: DetectedTech): string {
  const parts: string[] = [];
  if (tech.languages.length > 0) parts.push(tech.languages.join('/') + ' project');
  if (tech.frameworks.length > 0) parts.push(`using ${tech.frameworks.join(', ')}`);
  if (tech.testing.length > 0) parts.push(`with ${tech.testing.join(', ')} for testing`);
  return parts.length === 0 ? 'Unknown project type' : parts.join(' ');
}

function calculateConfidence(tech: DetectedTech, configFiles: string[]): 'high' | 'medium' | 'low' {
  const total = tech.languages.length + tech.frameworks.length +
    tech.buildTools.length + tech.testing.length;
  if (total >= 4 && configFiles.length >= 2) return 'high';
  if (total >= 2) return 'medium';
  return 'low';
}

export function getPrimaryProjectType(detection: DetectionResult): string {
  const { languages, frameworks } = detection.tech;

  if (frameworks.includes('react')) {
    if (frameworks.includes('next.js')) return 'nextjs';
    return 'react';
  }
  if (frameworks.includes('vue')) {
    if (frameworks.includes('nuxt')) return 'nuxt';
    return 'vue';
  }
  if (frameworks.includes('angular')) return 'angular';
  if (frameworks.includes('express') || frameworks.includes('fastify') || frameworks.includes('nestjs')) {
    return 'node-api';
  }
  if (frameworks.includes('fastapi') || frameworks.includes('flask') || frameworks.includes('django')) {
    return 'python-api';
  }

  if (languages.includes('typescript')) return 'typescript';
  if (languages.includes('javascript')) return 'javascript';
  if (languages.includes('python')) return 'python';
  if (languages.includes('go')) return 'go';
  if (languages.includes('rust')) return 'rust';
  if (languages.includes('java')) return 'java';

  return 'generic';
}
