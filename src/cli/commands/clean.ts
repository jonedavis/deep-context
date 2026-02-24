/**
 * Clean command for Deep Context
 *
 * dc clean - Clean up old/unused DC data
 * Scans global projects registry for deleted or inactive projects
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import chalk from 'chalk';
import { DC_DIR } from '../../config/index.js';
import { success, warning, info } from '../ui.js';

const GLOBAL_DC_DIR = '.deep-context';
const PROJECTS_FILE = 'projects.json';
const INACTIVE_DAYS = 30;

interface ProjectEntry {
  path: string;
  lastUsed?: string;
  addedAt?: string;
}

interface ProjectsRegistry {
  projects: ProjectEntry[];
}

interface InactiveProject {
  path: string;
  reason: 'deleted' | 'inactive';
  daysInactive?: number;
  size: number;
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
 * Get directory size recursively
 */
function getDirectorySize(dirPath: string): number {
  let size = 0;

  try {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stat.size;
      }
    }
  } catch {
    // Ignore permission errors
  }

  return size;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
 * Get shortened path for display (using ~)
 */
function shortenPath(fullPath: string): string {
  const home = os.homedir();
  if (fullPath.startsWith(home)) {
    return '~' + fullPath.slice(home.length);
  }
  return fullPath;
}

/**
 * Find inactive projects from the registry
 */
function findInactiveProjects(): InactiveProject[] {
  const registry = loadProjectsRegistry();
  const inactive: InactiveProject[] = [];
  const now = new Date();

  for (const project of registry.projects) {
    const projectPath = path.resolve(project.path);
    const dcPath = path.join(projectPath, DC_DIR);

    // Check if project folder still exists
    if (!fs.existsSync(projectPath)) {
      inactive.push({
        path: projectPath,
        reason: 'deleted',
        size: 0, // Can't calculate size if deleted
      });
      continue;
    }

    // Check if .dc/ folder exists
    if (!fs.existsSync(dcPath)) {
      inactive.push({
        path: projectPath,
        reason: 'deleted',
        size: 0,
      });
      continue;
    }

    // Check if inactive (not used in INACTIVE_DAYS days)
    if (project.lastUsed) {
      const lastUsed = new Date(project.lastUsed);
      const daysSinceUse = Math.floor((now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceUse >= INACTIVE_DAYS) {
        inactive.push({
          path: projectPath,
          reason: 'inactive',
          daysInactive: daysSinceUse,
          size: getDirectorySize(dcPath),
        });
      }
    }
  }

  return inactive;
}

interface CleanOptions {
  yes?: boolean;
  dryRun?: boolean;
}

export async function cleanCommand(options: CleanOptions): Promise<void> {
  const registry = loadProjectsRegistry();

  if (registry.projects.length === 0) {
    console.log();
    console.log(info('No projects registered.'));
    console.log(chalk.gray('  Deep Context has not been initialized in any projects yet.'));
    console.log();
    return;
  }

  // Find inactive projects
  const inactive = findInactiveProjects();

  if (inactive.length === 0) {
    console.log();
    console.log(success('All projects are active and healthy.'));
    console.log(chalk.gray(`  ${registry.projects.length} project(s) registered`));
    console.log();
    return;
  }

  // Display inactive projects
  console.log();
  console.log(warning(`Found ${inactive.length} inactive project(s):`));
  console.log();

  let totalSize = 0;
  for (const project of inactive) {
    const shortPath = shortenPath(project.path);
    totalSize += project.size;

    if (project.reason === 'deleted') {
      console.log(`  ${chalk.red(shortPath)} ${chalk.gray('(deleted)')}`);
    } else {
      console.log(`  ${chalk.yellow(shortPath)} ${chalk.gray(`(not used in ${project.daysInactive} days)`)}`);
    }
  }

  console.log();

  if (options.dryRun) {
    console.log(chalk.gray(`Would free: ${formatBytes(totalSize)}`));
    console.log(chalk.gray('Dry run - no changes made.'));
    console.log();
    return;
  }

  // Confirm unless --yes flag is provided
  if (!options.yes) {
    const rl = createReadline();
    try {
      const confirmed = await confirm(
        rl,
        chalk.white('Remove these? ') + chalk.gray('[y/N] ')
      );

      if (!confirmed) {
        console.log();
        console.log(chalk.gray('Cleanup cancelled.'));
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

  // Remove inactive projects
  let removedCount = 0;
  let freedSize = 0;

  for (const project of inactive) {
    try {
      // Delete .dc/ directory if it exists
      const dcPath = path.join(project.path, DC_DIR);
      if (fs.existsSync(dcPath)) {
        deleteDirectory(dcPath);
        freedSize += project.size;
      }

      // Remove from registry
      registry.projects = registry.projects.filter(
        (p) => path.resolve(p.path) !== project.path
      );

      removedCount++;
    } catch {
      // Skip projects we can't remove
    }
  }

  // Save updated registry
  saveProjectsRegistry(registry);

  console.log();
  console.log(success(`Cleaned up ${removedCount} project(s) (${formatBytes(freedSize)} freed)`));
  console.log();
}
