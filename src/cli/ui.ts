/**
 * Visual formatting helpers for beautiful terminal output
 */

import chalk from 'chalk';

/**
 * Icons for different memory types and actions
 */
export const icons = {
  // Memory types
  rule: '\u{1F6A7}',      // construction sign - rules/constraints
  choice: '\u{1F4CD}',    // pushpin - pinned decisions
  preference: '\u{2728}', // sparkles - preferences/heuristics

  // Actions
  checkmark: '\u{2705}',  // green check
  cross: '\u{274C}',      // red X
  warn: '\u{26A0}\u{FE0F}',     // warning sign
  lightbulb: '\u{1F4A1}', // lightbulb
  search: '\u{1F50D}',    // magnifying glass
  brain: '\u{1F9E0}',     // brain - learning
  memo: '\u{1F4DD}',      // memo/note
  speech: '\u{1F4AC}',    // speech bubble

  // UI elements
  arrow: '\u{279C}',      // right arrow
  dot: '\u{2022}',        // bullet point
  star: '\u{2B50}',       // star
  folder: '\u{1F4C1}',    // folder
};

/**
 * Type color map
 */
export const typeColors = {
  constraint: chalk.red,
  decision: chalk.blue,
  heuristic: chalk.yellow,
  // Friendly aliases
  rule: chalk.red,
  choice: chalk.blue,
  preference: chalk.yellow,
};

/**
 * Get icon for memory type
 */
export function getTypeIcon(type: string): string {
  switch (type) {
    case 'constraint':
    case 'rule':
      return icons.rule;
    case 'decision':
    case 'choice':
      return icons.choice;
    case 'heuristic':
    case 'preference':
      return icons.preference;
    default:
      return icons.dot;
  }
}

/**
 * Get friendly name for memory type
 */
export function getFriendlyTypeName(type: string): string {
  switch (type) {
    case 'constraint':
      return 'Rule';
    case 'decision':
      return 'Choice';
    case 'heuristic':
      return 'Preference';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

/**
 * Format a memory item for display
 */
export function formatMemory(memory: {
  type: string;
  content: string;
  id?: string;
  rationale?: string;
  context?: string;
}): string {
  const icon = getTypeIcon(memory.type);
  const colorFn = typeColors[memory.type as keyof typeof typeColors] || chalk.white;
  const typeName = getFriendlyTypeName(memory.type);

  let output = `${icon} ${colorFn(`[${typeName}]`)} ${chalk.white(memory.content)}`;

  if (memory.rationale) {
    output += `\n   ${chalk.gray(`${icons.speech} Why: ${memory.rationale}`)}`;
  }

  if (memory.context) {
    output += `\n   ${chalk.gray(`${icons.memo} Context: ${memory.context}`)}`;
  }

  if (memory.id) {
    output += `\n   ${chalk.dim(`ID: ${memory.id}`)}`;
  }

  return output;
}

/**
 * Format a search result with relevance
 */
export function formatSearchResult(result: {
  memory: {
    type: string;
    content: string;
    id?: string;
    rationale?: string;
    context?: string;
  };
  adjustedScore: number;
}): string {
  const { memory, adjustedScore } = result;
  const percentage = Math.round(adjustedScore * 100);

  const icon = getTypeIcon(memory.type);
  const colorFn = typeColors[memory.type as keyof typeof typeColors] || chalk.white;
  const typeName = getFriendlyTypeName(memory.type);

  // Color the percentage based on relevance
  let percentColor = chalk.red;
  if (percentage >= 80) percentColor = chalk.green;
  else if (percentage >= 60) percentColor = chalk.yellow;
  else if (percentage >= 40) percentColor = chalk.cyan;

  let output = `${icon} ${colorFn(`[${typeName}]`)} ${chalk.white(memory.content)}`;
  output += `\n   ${percentColor(`${percentage}% match`)}`;

  if (memory.rationale) {
    output += ` ${chalk.gray(`| Why: ${memory.rationale}`)}`;
  }

  return output;
}

/**
 * Print grouped memories by type
 */
export function printGroupedMemories(memories: Array<{
  type: string;
  content: string;
  id: string;
  rationale?: string;
  context?: string;
}>): void {
  const grouped = {
    constraint: memories.filter(m => m.type === 'constraint'),
    decision: memories.filter(m => m.type === 'decision'),
    heuristic: memories.filter(m => m.type === 'heuristic'),
  };

  // Rules
  if (grouped.constraint.length > 0) {
    console.log();
    console.log(`${icons.rule} ${chalk.bold.red('Rules')} ${chalk.gray(`(${grouped.constraint.length})`)}`);
    console.log(chalk.red('\u2500'.repeat(30)));
    for (const memory of grouped.constraint) {
      console.log(`   ${chalk.white(memory.content)}`);
      if (memory.context) {
        console.log(`   ${chalk.dim(memory.context)}`);
      }
    }
  }

  // Choices
  if (grouped.decision.length > 0) {
    console.log();
    console.log(`${icons.choice} ${chalk.bold.blue('Choices')} ${chalk.gray(`(${grouped.decision.length})`)}`);
    console.log(chalk.blue('\u2500'.repeat(30)));
    for (const memory of grouped.decision) {
      console.log(`   ${chalk.white(memory.content)}`);
      if (memory.rationale) {
        console.log(`   ${chalk.dim(`\u2192 ${memory.rationale}`)}`);
      }
    }
  }

  // Preferences
  if (grouped.heuristic.length > 0) {
    console.log();
    console.log(`${icons.preference} ${chalk.bold.yellow('Preferences')} ${chalk.gray(`(${grouped.heuristic.length})`)}`);
    console.log(chalk.yellow('\u2500'.repeat(30)));
    for (const memory of grouped.heuristic) {
      console.log(`   ${chalk.white(memory.content)}`);
    }
  }

  console.log();
}

/**
 * Print an empty state message
 */
export function emptyState(message: string, hint?: string): void {
  console.log();
  console.log(chalk.gray(`   ${message}`));
  if (hint) {
    console.log(chalk.gray.dim(`   ${hint}`));
  }
  console.log();
}

/**
 * Draw a box around text with optional title
 */
export function box(content: string, options?: { title?: string; padding?: number; borderColor?: typeof chalk }): string {
  const borderColor = options?.borderColor ?? chalk.cyan;
  const padding = options?.padding ?? 1;
  const title = options?.title ?? '';

  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(l => stripAnsi(l).length), stripAnsi(title).length + 2);
  const paddedWidth = maxLength + padding * 2;

  const horizontalLine = '─'.repeat(paddedWidth);
  const emptyLine = ' '.repeat(paddedWidth);

  const paddingLines = Array(padding).fill('').map(() =>
    borderColor('│') + emptyLine + borderColor('│')
  );

  // Build top border with optional title
  let topBorder: string;
  if (title) {
    const titlePart = ` ${title} `;
    const remainingWidth = paddedWidth - titlePart.length;
    const leftWidth = Math.floor(remainingWidth / 2);
    const rightWidth = remainingWidth - leftWidth;
    topBorder = borderColor('╭') + borderColor('─'.repeat(leftWidth)) + chalk.bold(titlePart) + borderColor('─'.repeat(rightWidth)) + borderColor('╮');
  } else {
    topBorder = borderColor('╭') + borderColor(horizontalLine) + borderColor('╮');
  }

  const bottomBorder = borderColor('╰') + borderColor(horizontalLine) + borderColor('╯');

  const contentLines = lines.map(line => {
    const stripped = stripAnsi(line);
    const paddingLeft = ' '.repeat(padding);
    const paddingRight = ' '.repeat(maxLength - stripped.length + padding);
    return borderColor('│') + paddingLeft + line + paddingRight + borderColor('│');
  });

  return [
    topBorder,
    ...paddingLines,
    ...contentLines,
    ...paddingLines,
    bottomBorder
  ].join('\n');
}

/**
 * Strip ANSI codes for length calculation
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Success message with green checkmark
 */
export function success(message: string): string {
  return chalk.green('✓') + ' ' + message;
}

/**
 * Error message with red X
 */
export function error(message: string): string {
  return chalk.red('✗') + ' ' + message;
}

/**
 * Warning message with yellow warning sign
 */
export function warning(message: string): string {
  return chalk.yellow('⚠') + ' ' + message;
}

/**
 * Info message with blue info icon
 */
export function info(message: string): string {
  return chalk.blue('ℹ') + ' ' + message;
}

/**
 * Styled header with decorative elements
 */
export function header(text: string, emoji?: string): string {
  const decoration = chalk.gray('─'.repeat(40));
  const prefix = emoji ? emoji + ' ' : '';
  return `\n${decoration}\n${prefix}${chalk.bold.cyan(text)}\n${decoration}\n`;
}

/**
 * Render a bullet list
 */
export function list(items: string[], options?: { bullet?: string; indent?: number }): string {
  const bullet = options?.bullet ?? chalk.cyan('•');
  const indent = ' '.repeat(options?.indent ?? 2);
  return items.map(item => `${indent}${bullet} ${item}`).join('\n');
}

/**
 * Render a numbered list
 */
export function numberedList(items: string[], options?: { indent?: number; highlight?: number }): string {
  const indent = ' '.repeat(options?.indent ?? 2);
  return items.map((item, i) => {
    const num = chalk.cyan(`${i + 1}.`);
    const text = options?.highlight === i ? chalk.bold(item) : item;
    return `${indent}${num} ${text}`;
  }).join('\n');
}

/**
 * Progress indicator
 */
export function progress(current: number, total: number, label?: string): string {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round(percentage / 5);
  const empty = 20 - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  const labelText = label ? `${label} ` : '';
  return `${labelText}[${bar}] ${percentage}%`;
}

/**
 * Spinner frames for animations
 */
export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Dim text for secondary information
 */
export function dim(text: string): string {
  return chalk.gray(text);
}

/**
 * Highlight important text
 */
export function highlight(text: string): string {
  return chalk.bold.white(text);
}

/**
 * Code/command display
 */
export function code(text: string): string {
  return chalk.bgGray.white(` ${text} `);
}

/**
 * Key-value pair display
 */
export function keyValue(key: string, value: string, keyWidth?: number): string {
  const width = keyWidth ?? 15;
  const paddedKey = key.padEnd(width);
  return `${chalk.cyan(paddedKey)} ${value}`;
}

/**
 * Section divider
 */
export function divider(char: string = '─'): string {
  return chalk.gray(char.repeat(50));
}

/**
 * Welcome banner for the setup wizard
 */
export function welcomeBanner(): string {
  const logo = `
${chalk.cyan('    ____                    ______            __            __ ')}
${chalk.cyan('   / __ \\___  ___  ____    / ____/___  ____  / /____  _  __/ /_')}
${chalk.cyan('  / / / / _ \\/ _ \\/ __ \\  / /   / __ \\/ __ \\/ __/ _ \\| |/_/ __/')}
${chalk.cyan(' / /_/ /  __/  __/ /_/ / / /___/ /_/ / / / / /_/  __/>  </ /_  ')}
${chalk.cyan('/_____/\\___/\\___/ .___/  \\____/\\____/_/ /_/\\__/\\___/_/|_|\\__/  ')}
${chalk.cyan('               /_/                                              ')}
`;

  return logo + '\n' + chalk.gray.italic('  AI that learns and remembers your coding style\n');
}
