/**
 * Remove command for Deep Context
 *
 * dc remove - Completely remove DC from current project
 * Deletes .dc/ folder and removes from global registry
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import chalk from 'chalk';
import { findProjectRoot, DC_DIR } from '../../config/index.js';
import { success, error, warning } from '../ui.js';

const GLOBAL_DC_DIR = '.deep-context';
const PROJECTS_FILE = 'projects.json';

interface RemoveOptions {
  yes?: boolean;
}

interface ProjectEntry {
  path: string;
  lastUsed?: string;
  addedAt?: string;
}

interface ProjectsRegistry {
  projects: ProjectEntry[];
}

/**
 * Create a readline interface for user input
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for confirmation
 */
async function confirm(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Recursively delete a directory
 */
function deleteDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Get the path to the global projects registry
 */
function getProjectsRegistryPath(): string {
  return path.join(os.homedir(), GLOBAL_DC_DIR, PROJECTS_FILE);
}

/**
 * Load the global projects registry
 * Handles both array format { projects: [...] } and object format { "/path": {...} }
 */
function loadProjectsRegistry(): ProjectsRegistry {
  const registryPath = getProjectsRegistryPath();

  if (!fs.existsSync(registryPath)) {
    return { projects: [] };
  }

  try {
    const content = fs.readFileSync(registryPath, 'utf-8');
    const data = JSON.parse(content);

    // Handle array format
    if (data.projects && Array.isArray(data.projects)) {
      return data as ProjectsRegistry;
    }

    // Handle object format (paths as keys)
    if (typeof data === 'object' && !Array.isArray(data)) {
      const projects: ProjectEntry[] = Object.values(data).map((entry: unknown) => {
        const e = entry as Record<string, unknown>;
        return {
          path: e.path as string,
          lastUsed: e.lastUsed as string | undefined,
          addedAt: e.addedAt as string | undefined,
        };
      });
      return { projects };
    }

    return { projects: [] };
  } catch {
    return { projects: [] };
  }
}

/**
 * Save the global projects registry in object format (path as key)
 * This matches the format used by the MCP server
 */
function saveProjectsRegistry(registry: ProjectsRegistry): void {
  const registryPath = getProjectsRegistryPath();
  const registryDir = path.dirname(registryPath);

  if (!fs.existsSync(registryDir)) {
    fs.mkdirSync(registryDir, { recursive: true });
  }

  // Convert array to object format (path as key)
  const objectFormat: Record<string, ProjectEntry> = {};
  for (const project of registry.projects) {
    objectFormat[project.path] = project;
  }

  fs.writeFileSync(registryPath, JSON.stringify(objectFormat, null, 2));
}

/**
 * Remove a project from the global registry
 */
function removeFromRegistry(projectPath: string): boolean {
  const registry = loadProjectsRegistry();
  const normalizedPath = path.resolve(projectPath);

  const initialLength = registry.projects.length;
  registry.projects = registry.projects.filter(
    (p) => path.resolve(p.path) !== normalizedPath
  );

  if (registry.projects.length !== initialLength) {
    saveProjectsRegistry(registry);
    return true;
  }

  return false;
}

export async function removeCommand(options: RemoveOptions): Promise<void> {
  const cwd = process.cwd();
  const projectRoot = findProjectRoot(cwd);

  // Check if we're in a DC project
  if (!projectRoot) {
    console.log();
    console.log(error('Not in a Deep Context project.'));
    console.log(chalk.gray('  No .dc/ directory found in this directory or any parent.'));
    console.log();
    return;
  }

  const dcPath = path.join(projectRoot, DC_DIR);

  // Confirm unless --yes flag is provided
  if (!options.yes) {
    console.log();
    console.log(warning(chalk.bold('This will permanently remove Deep Context from this project.')));
    console.log();
    console.log(chalk.gray('  The following will be deleted:'));
    console.log(chalk.gray(`    - ${dcPath}`));
    console.log(chalk.gray('    - All memories and configuration'));
    console.log();

    const rl = createReadline();
    try {
      const confirmed = await confirm(
        rl,
        chalk.white('Are you sure? ') + chalk.gray('[y/N] ')
      );

      if (!confirmed) {
        console.log();
        console.log(chalk.gray('Removal cancelled.'));
        console.log();
        rl.close();
        return;
      }
      rl.close();
    } catch {
      rl.close();
      return;
    }
  }

  // Delete the .dc/ directory
  try {
    deleteDirectory(dcPath);
  } catch (err) {
    console.log();
    console.log(error(`Failed to delete .dc/ directory: ${err instanceof Error ? err.message : 'Unknown error'}`));
    console.log();
    process.exit(1);
  }

  // Remove from global registry
  const removedFromRegistry = removeFromRegistry(projectRoot);

  console.log();
  console.log(success(chalk.bold('Deep Context removed')));
  console.log(chalk.gray('  Deleted .dc/ folder'));
  if (removedFromRegistry) {
    console.log(chalk.gray('  Removed from global registry'));
  }
  console.log();
}
