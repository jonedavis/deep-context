/**
 * Disable command for Deep Context
 *
 * dc disable - Disable DC for current project
 * Creates a .dcignore marker file so AI tools skip this project
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { success, info } from '../ui.js';

const DCIGNORE_FILE = '.dcignore';

export async function disableCommand(): Promise<void> {
  const cwd = process.cwd();
  const ignorePath = path.join(cwd, DCIGNORE_FILE);

  // Check if already disabled
  if (fs.existsSync(ignorePath)) {
    console.log();
    console.log(info('Deep Context is already disabled for this project.'));
    console.log(chalk.gray(`  ${DCIGNORE_FILE} already exists.`));
    console.log(chalk.gray(`  Run 'dc enable' to re-enable.`));
    console.log();
    return;
  }

  // Create the .dcignore marker file
  fs.writeFileSync(ignorePath, '# Deep Context disabled for this project\n# Remove this file or run `dc enable` to re-enable\n');

  console.log();
  console.log(success(chalk.bold('Deep Context disabled for this project')));
  console.log(chalk.gray(`  Created ${DCIGNORE_FILE}`));
  console.log(chalk.gray('  AI tools will skip this project.'));
  console.log(chalk.gray(`  Run 'dc enable' to re-enable.`));
  console.log();
}
