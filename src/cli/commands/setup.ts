/**
 * Interactive setup wizard for Deep Context
 * Guides users through initial configuration with beautiful terminal UI
 */

import * as readline from 'readline';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import {
  box,
  success,
  info,
  header,
  list,
  welcomeBanner,
  divider,
  dim,
  code,
  keyValue
} from '../ui.js';
import { initProject, findProjectRoot, DC_DIR, loadConfig, saveConfig } from '../../config/index.js';

// Types for setup choices
type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'other';
type StylePreference = 'functional' | 'oop' | 'mixed';

interface SetupOptions {
  template?: string;
}

interface SetupAnswers {
  language: Language;
  style: StylePreference;
  projectName?: string;
}

// Template presets
const TEMPLATES: Record<string, SetupAnswers> = {
  'react': {
    language: 'typescript',
    style: 'functional',
  },
  'node-api': {
    language: 'typescript',
    style: 'functional',
  },
  'python-django': {
    language: 'python',
    style: 'oop',
  },
};

// Rules based on language and style choices
const LANGUAGE_RULES: Record<Language, string[]> = {
  typescript: [
    'Always use TypeScript with strict mode enabled',
    'Prefer interfaces over type aliases for object shapes',
    'Use explicit return types for public functions',
    'Leverage discriminated unions for state management',
  ],
  javascript: [
    'Use modern ES6+ syntax (const/let, arrow functions, destructuring)',
    'Add JSDoc comments for function documentation',
    'Use optional chaining and nullish coalescing',
  ],
  python: [
    'Follow PEP 8 style guidelines',
    'Use type hints for function parameters and returns',
    'Prefer dataclasses for data structures',
    'Use f-strings for string formatting',
  ],
  go: [
    'Follow standard Go formatting (gofmt)',
    'Use meaningful variable names, avoid single letters except for loops',
    'Handle errors explicitly, never ignore them',
    'Prefer composition over inheritance',
  ],
  other: [
    'Follow language-specific best practices',
    'Maintain consistent code style throughout the project',
  ],
};

const STYLE_RULES: Record<StylePreference, string[]> = {
  functional: [
    'Prefer pure functions without side effects',
    'Use immutable data structures when possible',
    'Favor composition over inheritance',
    'Use map, filter, reduce over loops when appropriate',
  ],
  oop: [
    'Use classes with clear single responsibility',
    'Prefer composition over deep inheritance hierarchies',
    'Define clear interfaces for dependencies',
    'Encapsulate state within objects',
  ],
  mixed: [
    'Use classes for stateful components and services',
    'Use pure functions for utilities and transformations',
    'Choose the best paradigm for each situation',
  ],
};

const TEMPLATE_RULES: Record<string, string[]> = {
  'react': [
    'Use functional components with hooks',
    'Prefer controlled components over uncontrolled',
    'Keep components small and focused',
    'Use CSS-in-JS or CSS modules for styling',
    'Colocate related files (component, styles, tests)',
  ],
  'node-api': [
    'Use Express.js or Fastify patterns',
    'Structure routes by resource/domain',
    'Validate request inputs at the boundary',
    'Use middleware for cross-cutting concerns',
    'Return consistent error responses',
  ],
  'python-django': [
    'Follow Django project structure conventions',
    'Use Class-Based Views for complex logic',
    'Use serializers for data validation',
    'Keep business logic in model methods or services',
    'Write tests using Django test framework',
  ],
};

/**
 * Create a readline interface for user prompts
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and return the answer
 */
async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => {
      resolve(answer?.trim() ?? '');
    });
    rl.once('close', () => {
      reject(new Error('Input stream closed'));
    });
  });
}

/**
 * Ask a multiple choice question
 */
async function askChoice<T extends string>(
  rl: readline.Interface,
  question: string,
  choices: { value: T; label: string; description?: string }[]
): Promise<T> {
  console.log();
  console.log(chalk.bold(question));
  console.log();

  choices.forEach((choice, index) => {
    const number = chalk.cyan(`  ${index + 1})`);
    const label = chalk.white(choice.label);
    const desc = choice.description ? chalk.gray(` - ${choice.description}`) : '';
    console.log(`${number} ${label}${desc}`);
  });

  console.log();

  while (true) {
    const answer = await ask(rl, chalk.cyan('  Enter your choice (1-' + choices.length + '): '));
    const num = parseInt(answer, 10);

    if (num >= 1 && num <= choices.length) {
      const selected = choices[num - 1];
      console.log(chalk.green(`  ✓ Selected: ${selected.label}`));
      return selected.value;
    }

    console.log(chalk.red('  Please enter a valid number'));
  }
}

/**
 * Save rules to the .dc/rules.md file
 */
function saveRules(rules: string[], projectRoot: string): void {
  const dcPath = path.join(projectRoot, DC_DIR);
  const rulesPath = path.join(dcPath, 'rules.md');

  const content = `# Project Rules

These rules were generated by the Deep Context setup wizard.
Edit this file to customize your project's coding standards.

## Coding Standards

${rules.map(rule => `- ${rule}`).join('\n')}

---
*Generated by \`dc setup\` - feel free to modify!*
`;

  fs.writeFileSync(rulesPath, content);
}

/**
 * Main setup wizard command
 */
export async function setupCommand(options: SetupOptions): Promise<void> {
  const cwd = process.cwd();

  // Show welcome banner
  console.clear();
  console.log(welcomeBanner());

  // Check if using a template
  if (options.template) {
    const template = TEMPLATES[options.template.toLowerCase()];
    if (!template) {
      console.log(chalk.red(`Unknown template: ${options.template}`));
      console.log(chalk.gray('Available templates: ' + Object.keys(TEMPLATES).join(', ')));
      process.exit(1);
    }

    await runTemplateSetup(cwd, options.template.toLowerCase(), template);
    return;
  }

  // Interactive setup
  await runInteractiveSetup(cwd);
}

/**
 * Run setup with a predefined template
 */
async function runTemplateSetup(cwd: string, templateName: string, template: SetupAnswers): Promise<void> {
  console.log(box(
    `Using ${chalk.bold(templateName)} template\n\n` +
    `${keyValue('Language:', template.language)}\n` +
    `${keyValue('Style:', template.style)}`,
    { title: '📦 Template Setup', borderColor: chalk.cyan }
  ));
  console.log();

  // Initialize project
  const existingRoot = findProjectRoot();
  if (!existingRoot) {
    initProject(cwd);
    console.log(success('Initialized Deep Context project'));
  } else {
    console.log(info('Using existing Deep Context project'));
  }

  // Collect rules
  const rules: string[] = [
    ...LANGUAGE_RULES[template.language],
    ...STYLE_RULES[template.style],
    ...(TEMPLATE_RULES[templateName] || []),
  ];

  // Save rules
  saveRules(rules, existingRoot || cwd);
  console.log(success('Created rules.md with template configuration'));
  console.log();

  // Show summary
  showSummary(rules);
}

/**
 * Run interactive setup wizard
 */
async function runInteractiveSetup(cwd: string): Promise<void> {
  const rl = createReadlineInterface();

  try {
    // Welcome message
    console.log(box(
      `Welcome! Let's set up Deep Context for your project.\n` +
      `This wizard will help you configure your coding standards.\n\n` +
      chalk.gray('Press Ctrl+C at any time to cancel.'),
      { title: '🚀 Setup Wizard', borderColor: chalk.cyan }
    ));
    console.log();

    // Initialize project first if needed
    const existingRoot = findProjectRoot();
    if (!existingRoot) {
      console.log(info('Initializing new Deep Context project...'));
      initProject(cwd);
      console.log(success('Created .dc directory'));
    } else {
      console.log(info(`Using existing project at ${chalk.cyan(existingRoot)}`));
    }

    console.log(divider());

    // Ask about language
    const language = await askChoice<Language>(rl, '🔧 What primary language do you use?', [
      { value: 'typescript', label: 'TypeScript', description: 'Type-safe JavaScript' },
      { value: 'javascript', label: 'JavaScript', description: 'ES6+ JavaScript' },
      { value: 'python', label: 'Python', description: 'Python 3.x' },
      { value: 'go', label: 'Go', description: 'Golang' },
      { value: 'other', label: 'Other', description: 'Other language' },
    ]);

    // Ask about style preference
    const style = await askChoice<StylePreference>(rl, '🎨 What coding style do you prefer?', [
      { value: 'functional', label: 'Functional', description: 'Pure functions, immutability' },
      { value: 'oop', label: 'Object-Oriented', description: 'Classes, encapsulation' },
      { value: 'mixed', label: 'Mixed', description: 'Best of both worlds' },
    ]);

    console.log();
    console.log(divider());
    console.log();

    // Collect rules based on answers
    const rules: string[] = [
      ...LANGUAGE_RULES[language],
      ...STYLE_RULES[style],
    ];

    // Save rules
    const projectRoot = existingRoot || cwd;
    saveRules(rules, projectRoot);
    console.log(success('Created .dc/rules.md'));

    // Update config with setup marker
    try {
      const config = loadConfig(projectRoot);
      saveConfig({
        ...config,
        // Mark as set up (could add setup metadata here)
      }, projectRoot);
    } catch {
      // Config operations may fail, that's ok
    }

    console.log();
    showSummary(rules);
    showNextSteps();

  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE' ||
        (error as Error).message === 'Input stream closed') {
      // User pressed Ctrl+C or piped input ended
      console.log('\n' + chalk.yellow('Setup cancelled or input ended'));
      process.exit(0);
    }
    throw error;
  } finally {
    rl.close();
  }
}

/**
 * Show a summary of the configured rules
 */
function showSummary(rules: string[]): void {
  console.log(header('Your Project Rules', '📋'));

  const rulesList = list(rules.map(rule => chalk.white(rule)));
  console.log(rulesList);
  console.log();

  console.log(dim('These rules are saved in .dc/rules.md'));
  console.log(dim('Edit that file to customize your standards.'));
  console.log();
}

/**
 * Show next steps after setup
 */
function showNextSteps(): void {
  console.log(box(
    `${chalk.bold('Next Steps')}\n\n` +
    `${chalk.cyan('1.')} Run ${code('dc install')} to add MCP server to your AI tools\n` +
    `${chalk.cyan('2.')} Run ${code('dc sync')} to update CLAUDE.md / .cursorrules\n` +
    `${chalk.cyan('3.')} Start coding! Deep Context will learn from your corrections`,
    { title: '✨ All Done!', borderColor: chalk.green }
  ));
  console.log();
}
