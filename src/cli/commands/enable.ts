/**
 * Enable command for Deep Context
 *
 * dc enable - Re-enable DC for current project
 * Removes .dcignore file and runs auto-init if needed
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { findProjectRoot, DC_DIR } from '../../config/index.js';
import { initCommand } from './init.js';
import { success, info } from '../ui.js';

const DCIGNORE_FILE = '.dcignore';

interface EnableOptions {
  yes?: boolean;
}

export async function enableCommand(options: EnableOptions): Promise<void> {
  const cwd = process.cwd();
  const ignorePath = path.join(cwd, DCIGNORE_FILE);
  const dcPath = path.join(cwd, DC_DIR);

  // Check if .dcignore exists
  const wasDisabled = fs.existsSync(ignorePath);

  // Remove .dcignore if it exists
  if (wasDisabled) {
    fs.unlinkSync(ignorePath);
  }

  // Check if .dc/ exists
  const projectRoot = findProjectRoot(cwd);
  const needsInit = !projectRoot || projectRoot !== cwd;

  if (wasDisabled && !needsInit) {
    // Was disabled, now enabled - no init needed
    console.log();
    console.log(success(chalk.bold('Deep Context re-enabled for this project')));
    console.log(chalk.gray(`  Removed ${DCIGNORE_FILE}`));
    console.log(chalk.gray('  AI tools will now use Deep Context here.'));
    console.log();
    return;
  }

  if (!wasDisabled && !needsInit) {
    // Already enabled
    console.log();
    console.log(info('Deep Context is already enabled for this project.'));
    console.log(chalk.gray(`  .dc/ directory exists at: ${dcPath}`));
    console.log();
    return;
  }

  // Needs initialization
  if (wasDisabled) {
    console.log();
    console.log(chalk.gray(`Removed ${DCIGNORE_FILE}`));
  }

  console.log(chalk.gray('Initializing Deep Context...'));
  console.log();

  // Run init with the provided options
  await initCommand({ yes: options.yes });
}
