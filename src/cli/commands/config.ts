import { Command } from '@commander-js/extra-typings';
import chalk from 'chalk';
import {
  loadConfig,
  setConfigValue,
  getConfigValue,
  findProjectRoot,
} from '../../config/index.js';

export const configCommand = new Command('config')
  .description('Manage Deep Context configuration');

// dc config get [key]
configCommand
  .command('get')
  .argument('[key]', 'Config key (e.g., model.provider)')
  .description('Get configuration value(s)')
  .action((key?: string) => {
    const root = findProjectRoot();
    if (!root) {
      console.error(chalk.red('Not in a Deep Context project. Run `dc init` first.'));
      process.exit(1);
    }

    try {
      if (key) {
        const value = getConfigValue(key);
        if (value === undefined) {
          console.error(chalk.red(`Unknown config key: ${key}`));
          process.exit(1);
        }
        console.log(formatValue(value));
      } else {
        // Show all config
        const config = loadConfig();
        console.log(JSON.stringify(config, null, 2));
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// dc config set <key> <value>
configCommand
  .command('set')
  .argument('<key>', 'Config key (e.g., model.provider)')
  .argument('<value>', 'New value')
  .description('Set a configuration value')
  .action((key: string, value: string) => {
    const root = findProjectRoot();
    if (!root) {
      console.error(chalk.red('Not in a Deep Context project. Run `dc init` first.'));
      process.exit(1);
    }

    try {
      setConfigValue(key, value);
      console.log(chalk.green(`✓ Set ${key} = ${value}`));
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// dc config list
configCommand
  .command('list')
  .description('List all configuration values')
  .action(() => {
    const root = findProjectRoot();
    if (!root) {
      console.error(chalk.red('Not in a Deep Context project. Run `dc init` first.'));
      process.exit(1);
    }

    try {
      const config = loadConfig();
      printConfigTree(config, '');
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// dc config reset
configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (options: { yes?: boolean }) => {
    const root = findProjectRoot();
    if (!root) {
      console.error(chalk.red('Not in a Deep Context project. Run `dc init` first.'));
      process.exit(1);
    }

    if (!options.yes) {
      console.log(chalk.yellow('This will reset all configuration to defaults.'));
      console.log(chalk.gray('Use --yes to skip this confirmation.'));
      return;
    }

    try {
      const { initProject } = await import('../../config/index.js');
      initProject(root, true);
      console.log(chalk.green('✓ Configuration reset to defaults'));
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

function formatValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function printConfigTree(obj: Record<string, unknown>, prefix: string): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      console.log(chalk.bold(`${fullKey}:`));
      printConfigTree(value as Record<string, unknown>, fullKey);
    } else {
      console.log(`  ${chalk.cyan(fullKey)} = ${chalk.white(formatValue(value))}`);
    }
  }
}
