import chalk from 'chalk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as os from 'os';
import { initProject, findProjectRoot, DC_DIR, loadConfig, saveConfig } from '../../config/index.js';
import { detectProjectType, DetectionResult } from '../../detection/detector.js';
import {
  getTemplateForDetection,
  getTemplateRules,
  Template,
  Rule,
} from '../../templates/index.js';
import * as path from 'path';

// Global registry paths
const GLOBAL_DC_DIR = path.join(os.homedir(), '.deep-context');
const PROJECTS_REGISTRY_PATH = path.join(GLOBAL_DC_DIR, 'projects.json');

/**
 * Project registry entry
 */
interface ProjectEntry {
  path: string;
  lastUsed: string;
  addedAt: string;
  memoryCount: number;
  mcpCalls: number;
}

/**
 * Update project registry entry
 */
function updateProjectRegistry(projectPath: string): void {
  try {
    // Ensure global dir exists
    if (!fs.existsSync(GLOBAL_DC_DIR)) {
      fs.mkdirSync(GLOBAL_DC_DIR, { recursive: true });
    }

    // Load existing registry (object format)
    let registry: Record<string, ProjectEntry> = {};
    if (fs.existsSync(PROJECTS_REGISTRY_PATH)) {
      try {
        registry = JSON.parse(fs.readFileSync(PROJECTS_REGISTRY_PATH, 'utf-8'));
      } catch {
        registry = {};
      }
    }

    const now = new Date().toISOString();

    if (registry[projectPath]) {
      registry[projectPath].lastUsed = now;
    } else {
      registry[projectPath] = {
        path: projectPath,
        lastUsed: now,
        addedAt: now,
        memoryCount: 0,
        mcpCalls: 0,
      };
    }

    fs.writeFileSync(PROJECTS_REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // Silently ignore write errors - tracking is not critical
  }
}

interface InitOptions {
  force?: boolean;
  yes?: boolean; // Auto-accept detected rules
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
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes' || answer === '');
    });
  });
}

/**
 * Display a spinning animation during detection
 */
async function withSpinner<T>(message: string, fn: () => T): Promise<T> {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  const spinner = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(frames[i])} ${message}`);
    i = (i + 1) % frames.length;
  }, 80);

  try {
    const result = fn();
    clearInterval(spinner);
    process.stdout.write(`\r${chalk.green('✓')} ${message}\n`);
    return result;
  } catch (error) {
    clearInterval(spinner);
    process.stdout.write(`\r${chalk.red('✗')} ${message}\n`);
    throw error;
  }
}

/**
 * Display detected technologies in a nice format
 */
function displayDetection(detection: DetectionResult): void {
  console.log();
  console.log(chalk.bold('Project Analysis'));
  console.log(chalk.gray('─'.repeat(50)));

  const { tech } = detection;

  if (tech.languages.length > 0) {
    console.log(chalk.cyan('Languages:    ') + tech.languages.join(', '));
  }
  if (tech.frameworks.length > 0) {
    console.log(chalk.cyan('Frameworks:   ') + tech.frameworks.join(', '));
  }
  if (tech.buildTools.length > 0) {
    console.log(chalk.cyan('Build Tools:  ') + tech.buildTools.join(', '));
  }
  if (tech.testing.length > 0) {
    console.log(chalk.cyan('Testing:      ') + tech.testing.join(', '));
  }
  if (tech.databases.length > 0) {
    console.log(chalk.cyan('Databases:    ') + tech.databases.join(', '));
  }
  if (tech.other.length > 0) {
    console.log(chalk.cyan('Other:        ') + tech.other.join(', '));
  }

  console.log();
  console.log(chalk.gray(`Confidence: ${detection.confidence}`));
  console.log(chalk.gray(`Config files: ${detection.configFiles.join(', ')}`));
}

/**
 * Display rules that will be applied
 */
function displayRules(template: Template, rules: Rule[]): void {
  console.log();
  console.log(chalk.bold(`Template: ${template.name}`));
  console.log(chalk.gray(template.description));
  console.log();
  console.log(chalk.bold(`${rules.length} coding rules will be applied:`));
  console.log(chalk.gray('─'.repeat(50)));

  // Group by category
  const byCategory = new Map<string, Rule[]>();
  for (const rule of rules) {
    if (!byCategory.has(rule.category)) {
      byCategory.set(rule.category, []);
    }
    byCategory.get(rule.category)!.push(rule);
  }

  for (const [category, categoryRules] of byCategory) {
    console.log();
    console.log(chalk.yellow(category.toUpperCase()));
    for (const rule of categoryRules) {
      console.log(chalk.white(`  • ${rule.title}`));
      console.log(chalk.gray(`    ${truncate(rule.description, 70)}`));
    }
  }
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Convert rules to a format suitable for storing in config
 */
function rulesToConfig(rules: Rule[]): Record<string, unknown>[] {
  return rules.map((rule) => ({
    id: rule.id,
    category: rule.category,
    title: rule.title,
    description: rule.description,
    examples: rule.examples,
  }));
}

export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.cwd();

  // Check if already in a project
  const existingRoot = findProjectRoot();
  if (existingRoot && !options.force) {
    console.log(chalk.yellow(`Deep Context already initialized at: ${existingRoot}`));
    console.log(chalk.gray('Use --force to reinitialize'));
    return;
  }

  console.log();
  console.log(chalk.bold.cyan('🔮 Deep Context'));
  console.log(chalk.gray('Intelligent AI context for your codebase'));
  console.log();

  // Run project detection with spinner
  let detection: DetectionResult;
  try {
    detection = await withSpinner('Analyzing your project...', () => detectProjectType(cwd));
  } catch (error) {
    console.error(chalk.red('Failed to analyze project'));
    process.exit(1);
  }

  // Display what we found
  displayDetection(detection);

  // Get matching template and rules
  const template = getTemplateForDetection(detection);
  let rules: Rule[] = [];

  if (template) {
    rules = getTemplateRules(template);
    displayRules(template, rules);
  } else {
    console.log();
    console.log(chalk.yellow('Could not determine project type.'));
    console.log(chalk.gray('Deep Context will be initialized without preset rules.'));
    console.log(chalk.gray('You can add rules manually later with: dc config'));
  }

  console.log();

  // Ask for confirmation unless --yes flag is used
  let proceed = options.yes ?? false;

  if (!proceed) {
    const rl = createReadline();
    try {
      proceed = await confirm(
        rl,
        rules.length > 0
          ? chalk.white('Apply these rules and initialize? ') + chalk.gray('[Y/n] ')
          : chalk.white('Initialize Deep Context? ') + chalk.gray('[Y/n] ')
      );
    } finally {
      rl.close();
    }
  }

  if (!proceed) {
    console.log(chalk.gray('Initialization cancelled.'));
    return;
  }

  try {
    // Initialize the .dc directory
    initProject(cwd, options.force);

    // Track in global registry
    updateProjectRegistry(cwd);

    // If we have rules, save them to config
    if (rules.length > 0 && template) {
      const config = loadConfig(cwd);

      // Add detected project info and rules to config
      const extendedConfig = {
        ...config,
        project: {
          type: template.id,
          detected: {
            languages: detection.tech.languages,
            frameworks: detection.tech.frameworks,
            buildTools: detection.tech.buildTools,
            testing: detection.tech.testing,
            databases: detection.tech.databases,
          },
        },
        rules: rulesToConfig(rules),
      };

      saveConfig(extendedConfig as typeof config, cwd);
    }

    // Success output
    console.log();
    console.log(chalk.green('✓ Deep Context initialized'));
    console.log();
    console.log('Created:');
    console.log(chalk.gray(`  ${path.join(DC_DIR, 'config.json')}  - Configuration${rules.length > 0 ? ` (${rules.length} rules)` : ''}`));
    console.log(chalk.gray(`  ${path.join(DC_DIR, '.gitignore')}   - Git ignore rules`));

    if (template) {
      console.log();
      console.log(chalk.bold('Your AI assistant now understands:'));
      for (const lang of detection.tech.languages.slice(0, 3)) {
        console.log(chalk.cyan(`  ✓ ${lang} best practices`));
      }
      for (const framework of detection.tech.frameworks.slice(0, 3)) {
        console.log(chalk.cyan(`  ✓ ${framework} patterns`));
      }
    }

    console.log();
    console.log('Next steps:');
    console.log(chalk.cyan('  dc config set model.provider ollama'));
    console.log(chalk.cyan('  dc chat'));
    console.log();
    console.log(chalk.gray('Memory database will be created on first use.'));
    console.log(chalk.gray('Rules will be included in AI context automatically.'));
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    } else {
      console.error(chalk.red('An unexpected error occurred'));
    }
    process.exit(1);
  }
}
