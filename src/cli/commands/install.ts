/**
 * Auto-install Deep Context MCP server for various LLM clients
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { findProjectRoot } from '../../config/index.js';

// Global config directory
const GLOBAL_DC_DIR = path.join(os.homedir(), '.deep-context');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_DC_DIR, 'config.json');

interface InstallOptions {
  claude?: boolean;
  cursor?: boolean;
  desktop?: boolean;
  global?: boolean;
}

/**
 * Global configuration schema
 */
interface GlobalConfig {
  installedAt: string;
  lastUpdated: string;
  clients: string[];
}

/**
 * Load or create global config
 */
function loadGlobalConfig(): GlobalConfig {
  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // Ignore errors
  }
  return {
    installedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    clients: [],
  };
}

/**
 * Save global config
 */
function saveGlobalConfig(config: GlobalConfig): void {
  if (!fs.existsSync(GLOBAL_DC_DIR)) {
    fs.mkdirSync(GLOBAL_DC_DIR, { recursive: true });
  }
  fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function installCommand(options: InstallOptions): Promise<void> {
  const projectRoot = findProjectRoot();
  const isGlobal = options.global ?? false;

  // Get the path to dc-mcp executable
  const serverPath = getServerPath();

  console.log(chalk.bold('\nDeep Context MCP Server Installation\n'));
  console.log(chalk.gray(`Server path: ${serverPath}`));
  if (isGlobal) {
    console.log(chalk.cyan('Mode: Global (not project-scoped)'));
  } else if (projectRoot) {
    console.log(chalk.gray(`Project: ${projectRoot}`));
  } else {
    console.log(chalk.gray('Mode: Global (no project detected)'));
  }
  console.log();

  let installed = false;
  const installedClients: string[] = [];

  // Auto-detect if no specific flags
  const autoDetect = !options.claude && !options.cursor && !options.desktop;

  // Install for Claude Code
  if (options.claude || autoDetect) {
    if (await installForClaudeCode(serverPath, isGlobal ? null : projectRoot, isGlobal)) {
      installed = true;
      installedClients.push('claude-code');
    }
  }

  // Install for Cursor
  if (options.cursor || autoDetect) {
    if (await installForCursor(serverPath, isGlobal ? null : projectRoot, isGlobal)) {
      installed = true;
      installedClients.push('cursor');
    }
  }

  // Install for Claude Desktop
  if (options.desktop || autoDetect) {
    if (await installForClaudeDesktop(serverPath)) {
      installed = true;
      installedClients.push('claude-desktop');
    }
  }

  // Save global config if installing globally
  if (isGlobal && installed) {
    const config = loadGlobalConfig();
    config.lastUpdated = new Date().toISOString();
    config.clients = [...new Set([...config.clients, ...installedClients])];
    saveGlobalConfig(config);
    console.log(chalk.gray(`Global config saved to: ${GLOBAL_CONFIG_PATH}`));
  }

  if (!installed) {
    console.log(chalk.yellow('No supported LLM clients detected.'));
    console.log(chalk.gray('\nSupported clients:'));
    console.log(chalk.gray('  - Claude Code (claude CLI)'));
    console.log(chalk.gray('  - Cursor'));
    console.log(chalk.gray('  - Claude Desktop'));
  }

  console.log();
}

/**
 * Get the path to the MCP server executable
 */
function getServerPath(): string {
  // Check if installed globally via npm (scoped or unscoped)
  try {
    const globalPath = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    const candidates = [
      path.join(globalPath, '@jondavis23', 'deep-context', 'bin', 'dc-mcp.js'),
      path.join(globalPath, 'deep-context', 'bin', 'dc-mcp.js'),
    ];
    for (const dcMcpPath of candidates) {
      if (fs.existsSync(dcMcpPath)) {
        return dcMcpPath;
      }
    }
  } catch {
    // Not installed globally
  }

  // Use local path relative to current module
  const localPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../../bin/dc-mcp.js'
  );

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  throw new Error('Could not find dc-mcp.js. Make sure deep-context is properly installed.');
}

/**
 * Install for Claude Code using the claude CLI
 */
async function installForClaudeCode(serverPath: string, projectRoot: string | null, forceGlobal: boolean = false): Promise<boolean> {
  // Check if claude CLI is available
  try {
    execSync('claude --version', { stdio: 'ignore' });
  } catch {
    return false;
  }

  console.log(chalk.cyan('Installing for Claude Code...'));

  try {
    // Remove existing if present (try both scopes)
    try {
      execSync('claude mcp remove deep-context', { stdio: 'ignore' });
    } catch {
      // Ignore if not present
    }
    try {
      execSync('claude mcp remove --scope user deep-context', { stdio: 'ignore' });
    } catch {
      // Ignore if not present
    }

    // Add the MCP server
    // If --global flag is set, install user-scoped (global)
    // Otherwise, if in a project, install project-scoped
    let scope = '';
    if (forceGlobal) {
      scope = '--scope user';
    } else if (projectRoot) {
      scope = '--scope project';
    }
    const cmd = `claude mcp add ${scope} deep-context -- node "${serverPath}"`.trim();

    execSync(cmd, { stdio: 'inherit' });

    console.log(chalk.green('✓ Installed for Claude Code'));
    if (forceGlobal) {
      console.log(chalk.gray('  Installed globally - will auto-initialize projects on first use.'));
    } else {
      console.log(chalk.gray('  The deep-context tools are now available in Claude Code.'));
    }
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Failed to install for Claude Code'));
    if (error instanceof Error) {
      console.log(chalk.gray(`  ${error.message}`));
    }
    return false;
  }
}

/**
 * Install for Cursor
 */
async function installForCursor(serverPath: string, projectRoot: string | null, forceGlobal: boolean = false): Promise<boolean> {
  // Cursor config locations - prioritize global if forceGlobal is set
  const configLocations = forceGlobal
    ? [path.join(os.homedir(), '.cursor', 'mcp.json')]
    : [
        projectRoot ? path.join(projectRoot, '.cursor', 'mcp.json') : null,
        path.join(os.homedir(), '.cursor', 'mcp.json'),
      ].filter(Boolean) as string[];

  // Check if any Cursor config directory exists
  const existingConfig = configLocations.find((p) => {
    const dir = path.dirname(p);
    return fs.existsSync(dir);
  });

  if (!existingConfig) {
    // Check if Cursor is installed
    const cursorAppPath = '/Applications/Cursor.app';
    if (!fs.existsSync(cursorAppPath)) {
      return false;
    }
  }

  console.log(chalk.cyan('Installing for Cursor...'));

  try {
    const configPath = existingConfig || configLocations[0];
    const configDir = path.dirname(configPath);

    // Create directory if needed
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or create new
    let config: { mcpServers?: Record<string, unknown> } = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    // Add/update deep-context
    config.mcpServers = config.mcpServers || {};
    config.mcpServers['deep-context'] = {
      command: 'node',
      args: [serverPath],
    };

    // Write config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(chalk.green('✓ Installed for Cursor'));
    console.log(chalk.gray(`  Config: ${configPath}`));
    if (forceGlobal) {
      console.log(chalk.gray('  Installed globally - will auto-initialize projects on first use.'));
    } else {
      console.log(chalk.gray('  Restart Cursor to activate.'));
    }
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Failed to install for Cursor'));
    if (error instanceof Error) {
      console.log(chalk.gray(`  ${error.message}`));
    }
    return false;
  }
}

/**
 * Install for Claude Desktop
 */
async function installForClaudeDesktop(serverPath: string): Promise<boolean> {
  // Claude Desktop config location
  const configPath = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json'
  );

  const appPath = '/Applications/Claude.app';

  // Check if Claude Desktop is installed
  if (!fs.existsSync(appPath) && !fs.existsSync(path.dirname(configPath))) {
    return false;
  }

  console.log(chalk.cyan('Installing for Claude Desktop...'));

  try {
    const configDir = path.dirname(configPath);

    // Create directory if needed
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or create new
    let config: { mcpServers?: Record<string, unknown> } = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    // Add/update deep-context
    config.mcpServers = config.mcpServers || {};
    config.mcpServers['deep-context'] = {
      command: 'node',
      args: [serverPath],
    };

    // Write config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(chalk.green('✓ Installed for Claude Desktop'));
    console.log(chalk.gray(`  Config: ${configPath}`));
    console.log(chalk.gray('  Restart Claude Desktop to activate.'));
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Failed to install for Claude Desktop'));
    if (error instanceof Error) {
      console.log(chalk.gray(`  ${error.message}`));
    }
    return false;
  }
}
