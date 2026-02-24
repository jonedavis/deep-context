/**
 * Deep Context Status Command
 *
 * Shows where Deep Context is being used:
 * - Global installation status
 * - Connected AI tools (Claude Code, Cursor, Claude Desktop)
 * - Projects using Deep Context
 * - Current project status
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { findProjectRoot, loadConfig, DC_DIR } from '../../config/index.js';
import { MemoryStore } from '../../memory/store.js';
import { icons } from '../ui.js';

/**
 * Project entry in the global projects.json tracking file
 */
interface ProjectEntry {
  path: string;
  lastUsed: string; // ISO date string
  memoryCount?: number;
  aiCalls?: number;
}

/**
 * Format a relative time string (e.g., "2 hours ago", "yesterday")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffWeeks < 4) {
    return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  } else {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  }
}

/**
 * Shorten a path by replacing home directory with ~
 */
function shortenPath(fullPath: string): string {
  const home = os.homedir();
  if (fullPath.startsWith(home)) {
    return '~' + fullPath.slice(home.length);
  }
  return fullPath;
}

/**
 * Check if Deep Context is installed globally
 */
function isInstalledGlobally(): boolean {
  const globalConfigDir = path.join(os.homedir(), '.deep-context');
  return fs.existsSync(globalConfigDir);
}

/**
 * Check if Claude Code is connected (MCP server registered)
 */
function isClaudeCodeConnected(): boolean {
  try {
    // Check if claude CLI is available
    execSync('claude --version', { stdio: 'ignore' });

    // Try to list MCP servers and check for deep-context
    try {
      const output = execSync('claude mcp list', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      return output.toLowerCase().includes('deep-context');
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Check if Cursor is connected
 */
function isCursorConnected(): boolean {
  // Check global Cursor config
  const cursorConfigPath = path.join(os.homedir(), '.cursor', 'mcp.json');
  if (fs.existsSync(cursorConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(cursorConfigPath, 'utf-8'));
      return config.mcpServers && 'deep-context' in config.mcpServers;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Check if Claude Desktop is connected
 */
function isClaudeDesktopConnected(): boolean {
  const configPath = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json'
  );

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.mcpServers && 'deep-context' in config.mcpServers;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Load projects from the global tracking file
 */
function loadProjects(): ProjectEntry[] {
  const projectsPath = path.join(os.homedir(), '.deep-context', 'projects.json');

  if (!fs.existsSync(projectsPath)) {
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'));

    // Handle both formats: object with paths as keys, or array
    if (Array.isArray(data.projects)) {
      return data.projects;
    } else if (typeof data === 'object' && !Array.isArray(data)) {
      // Convert object format to array
      return Object.values(data).map((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        return {
          path: e.path as string,
          lastUsed: e.lastUsed as string,
          memoryCount: e.memoryCount as number | undefined,
          aiCalls: e.mcpCalls as number | undefined,
        };
      });
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Get memory count for a project
 */
function getProjectMemoryCount(projectPath: string): number {
  try {
    const dbPath = path.join(projectPath, DC_DIR, 'memory.db');
    if (!fs.existsSync(dbPath)) {
      return 0;
    }
    const store = new MemoryStore(dbPath);
    const stats = store.getStats();
    store.close();
    return stats.totalMemories;
  } catch {
    return 0;
  }
}

/**
 * Get rules count for a project
 */
function getProjectRulesCount(projectPath: string): number {
  try {
    const configPath = path.join(projectPath, DC_DIR, 'config.json');
    if (!fs.existsSync(configPath)) {
      return 0;
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (Array.isArray(config.rules)) {
      return config.rules.length;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Main status command
 */
export async function statusCommand(): Promise<void> {
  console.log();
  console.log(chalk.bold.white(`${icons.brain} Deep Context Status`));
  console.log();

  // Section 1: Global Installation
  console.log(chalk.bold.white('Global Installation'));
  console.log(chalk.gray('\u2500'.repeat(35)));

  const isGloballyInstalled = isInstalledGlobally();
  if (isGloballyInstalled) {
    console.log(`  ${chalk.green('\u2713')} Installed globally`);
  } else {
    console.log(`  ${chalk.yellow('\u25CB')} Not installed globally`);
    console.log(chalk.gray('    Run `dc install --global` to install'));
  }

  // Check AI tool connections
  const claudeCode = isClaudeCodeConnected();
  const cursor = isCursorConnected();
  const claudeDesktop = isClaudeDesktopConnected();

  if (claudeCode) {
    console.log(`  ${chalk.green('\u2713')} Claude Code: ${chalk.green('connected')}`);
  } else {
    console.log(`  ${chalk.gray('\u25CB')} Claude Code: ${chalk.gray('not configured')}`);
  }

  if (cursor) {
    console.log(`  ${chalk.green('\u2713')} Cursor: ${chalk.green('connected')}`);
  } else {
    console.log(`  ${chalk.gray('\u25CB')} Cursor: ${chalk.gray('not configured')}`);
  }

  if (claudeDesktop) {
    console.log(`  ${chalk.green('\u2713')} Claude Desktop: ${chalk.green('connected')}`);
  } else {
    console.log(`  ${chalk.gray('\u25CB')} Claude Desktop: ${chalk.gray('not configured')}`);
  }

  console.log();

  // Section 2: Projects Using Deep Context
  const projects = loadProjects();

  // Sort by last used (most recent first)
  const sortedProjects = [...projects].sort((a, b) => {
    return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
  });

  // Filter to only existing projects
  const existingProjects = sortedProjects.filter((p) => {
    const dcPath = path.join(p.path, DC_DIR);
    return fs.existsSync(dcPath);
  });

  const activeCount = existingProjects.length;

  console.log(chalk.bold.white(`Projects${activeCount > 0 ? ` (${activeCount} active)` : ''}`));
  console.log(chalk.gray('\u2500'.repeat(35)));

  if (existingProjects.length === 0) {
    console.log(chalk.gray('  No projects found.'));
    console.log(chalk.gray('  Run `dc init` in a project to get started.'));
  } else {
    for (const project of existingProjects) {
      const shortPath = shortenPath(project.path);
      const lastUsed = formatRelativeTime(new Date(project.lastUsed));

      // Get current memory count (may differ from cached value)
      const memoryCount = getProjectMemoryCount(project.path);
      const aiCalls = project.aiCalls ?? 0;

      console.log(`  ${chalk.cyan(shortPath)}`);
      console.log(`    Last used: ${chalk.white(lastUsed)}`);
      console.log(`    Memories: ${chalk.white(memoryCount.toString())} | AI calls: ${chalk.white(aiCalls.toString())}`);
      console.log();
    }
  }

  // Section 3: Current Project (if in one)
  const projectRoot = findProjectRoot();

  if (projectRoot) {
    const shortPath = shortenPath(projectRoot);
    const rulesCount = getProjectRulesCount(projectRoot);
    const memoryCount = getProjectMemoryCount(projectRoot);

    // Check if project is active or disabled
    let isActive = true;
    try {
      const config = loadConfig(projectRoot);
      // Check if there's a disabled flag in config
      isActive = (config as unknown as { disabled?: boolean }).disabled !== true;
    } catch {
      // Assume active if config can't be read
    }

    console.log(chalk.bold.white(`Current Project: ${chalk.cyan(shortPath)}`));
    console.log(chalk.gray('\u2500'.repeat(35)));
    console.log(`  Rules: ${chalk.white(rulesCount.toString())}${rulesCount > 0 ? chalk.gray(' (auto-detected)') : ''}`);
    console.log(`  Memories: ${chalk.white(memoryCount.toString())}`);
    console.log(`  Status: ${isActive ? chalk.green('Active') : chalk.yellow('Disabled')}`);
    console.log();
  }
}
