/**
 * Interactive learn command for Deep Context
 *
 * Natural language input with auto-detection:
 * - dc learn → starts interactive prompt
 * - Asks "What should AI remember?"
 * - Auto-detects if it's a rule, choice, or preference
 * - Loops until user presses enter with empty input
 */

import * as readline from 'readline';
import { Command } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { findProjectRoot, getMemoryDbPath, loadConfig } from '../../config/index.js';
import { MemoryStore } from '../../memory/store.js';
import { MemoryRetriever } from '../../memory/retriever.js';
import { createEmbedder } from '../../memory/embeddings.js';
import type { MemoryType } from '../../memory/types.js';
import { icons, success, error, getTypeIcon, getFriendlyTypeName, typeColors } from '../ui.js';

/**
 * Get memory store and retriever
 */
async function getMemorySystem(): Promise<{
  store: MemoryStore;
  retriever: MemoryRetriever;
}> {
  const root = findProjectRoot();
  if (!root) {
    throw new Error('Not in a Deep Context project. Run `dc init` first.');
  }

  const dbPath = getMemoryDbPath(root);
  const config = loadConfig(root);

  const store = new MemoryStore(dbPath);
  const embedder = await createEmbedder({
    provider: config.embeddings.provider as 'local' | 'simple' | 'ollama' | 'openai',
  });

  const retriever = new MemoryRetriever(store, embedder);

  return { store, retriever };
}

/**
 * Auto-detect memory type from natural language input
 */
function detectMemoryType(input: string): {
  type: MemoryType;
  content: string;
  rationale?: string;
  confidence: 'high' | 'medium' | 'low';
} {
  const lowerInput = input.toLowerCase().trim();

  // Check for explicit type prefixes
  if (lowerInput.startsWith('rule:') || lowerInput.startsWith('constraint:')) {
    return {
      type: 'constraint',
      content: input.replace(/^(rule|constraint):\s*/i, ''),
      confidence: 'high',
    };
  }
  if (lowerInput.startsWith('choice:') || lowerInput.startsWith('decision:')) {
    return {
      type: 'decision',
      content: input.replace(/^(choice|decision):\s*/i, ''),
      confidence: 'high',
    };
  }
  if (lowerInput.startsWith('preference:') || lowerInput.startsWith('pref:')) {
    return {
      type: 'heuristic',
      content: input.replace(/^(preference|pref):\s*/i, ''),
      confidence: 'high',
    };
  }

  // Extract rationale if present
  let content = input;
  let rationale: string | undefined;

  // Check for "because" or "since" patterns
  const becauseMatch = input.match(/(.+?)\s+(?:because|since)\s+(.+)/i);
  if (becauseMatch) {
    content = becauseMatch[1].trim();
    rationale = becauseMatch[2].trim();
  }

  // Detect rules (strict constraints)
  const rulePatterns = [
    /^(never|always|must|don't|do not|cannot|can't|forbidden|required|mandatory)/i,
    /\b(never|always|must not|must)\b/i,
    /^no\s+\w+ing\b/i, // "no committing", "no using"
  ];

  for (const pattern of rulePatterns) {
    if (pattern.test(content)) {
      return { type: 'constraint', content, confidence: 'high' };
    }
  }

  // Detect decisions (choices with rationale)
  const decisionPatterns = [
    /^(we use|using|chose|chosen|decided|picked|selected|went with)/i,
    /^(use|switch to|migrate to|adopt|implement)/i,
    /\b(instead of|over|rather than)\b/i,
    /\b(because|since|due to|for|as it)\b/i,
  ];

  for (const pattern of decisionPatterns) {
    if (pattern.test(input)) {
      return { type: 'decision', content, rationale, confidence: 'high' };
    }
  }

  // If it has rationale, likely a decision
  if (rationale) {
    return { type: 'decision', content, rationale, confidence: 'medium' };
  }

  // Detect preferences (soft guidelines)
  const preferencePatterns = [
    /^(prefer|try to|when possible|ideally|usually|typically)/i,
    /^(consider|favor|lean toward|tend to|like to)/i,
    /\b(when possible|if possible|generally|by default)\b/i,
    /\b(prefer|preferable|preference|rather)\b/i,
  ];

  for (const pattern of preferencePatterns) {
    if (pattern.test(input)) {
      return { type: 'heuristic', content, confidence: 'high' };
    }
  }

  // Default to preference with low confidence
  return { type: 'heuristic', content, confidence: 'low' };
}

/**
 * Create readline interface
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 */
function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

export const learnCommand = new Command('learn')
  .description(`${icons.brain} Teach AI about your project (interactive)`)
  .addHelpText('after', `
${chalk.bold('How it works:')}
  Start typing what AI should remember, and it will auto-detect the type:

  ${chalk.red('Rules')} (hard constraints):
    "Never use var in JavaScript"
    "Always validate user input"

  ${chalk.blue('Choices')} (decisions with reasons):
    "Use PostgreSQL because we need complex queries"
    "Chose TypeScript for type safety"

  ${chalk.yellow('Preferences')} (soft guidelines):
    "Prefer functional components"
    "Try to use named exports"

${chalk.bold('Tips:')}
  ${icons.lightbulb} Press Enter on empty line to exit
  ${icons.lightbulb} Be specific - AI remembers exactly what you say
  ${icons.lightbulb} Add "because..." to explain decisions
`);

learnCommand.action(async () => {
  try {
    const { retriever, store } = await getMemorySystem();
    const rl = createReadline();

    console.log();
    console.log(`${icons.brain} ${chalk.bold.cyan('Deep Context Learning Mode')}`);
    console.log(chalk.gray('\u2500'.repeat(40)));
    console.log();
    console.log(chalk.gray('  Tell me what AI should remember about your project.'));
    console.log(chalk.gray('  I\'ll auto-detect if it\'s a rule, choice, or preference.'));
    console.log();
    console.log(chalk.dim('  Press Enter on empty line to exit.'));
    console.log();

    let count = 0;

    // Main loop
    while (true) {
      const input = await prompt(rl, chalk.cyan('  > '));

      // Exit on empty input
      if (!input.trim()) {
        break;
      }

      // Detect type and save
      const detected = detectMemoryType(input);

      const metadata: Record<string, unknown> = { source: 'user' };
      if (detected.rationale) {
        metadata.rationale = detected.rationale;
      }

      await retriever.addMemory(detected.type, detected.content, metadata);

      // Show feedback
      const icon = getTypeIcon(detected.type);
      const colorFn = typeColors[detected.type as keyof typeof typeColors];
      const typeName = getFriendlyTypeName(detected.type);

      console.log();
      console.log(`  ${icons.checkmark} Saved as ${icon} ${colorFn(`[${typeName}]`)}`);

      if (detected.confidence === 'low') {
        console.log(chalk.gray(`     (Tip: Start with "rule:", "choice:", or "preference:" to be explicit)`));
      }

      console.log();

      count++;
    }

    // Cleanup
    rl.close();
    store.close();

    // Final summary
    console.log();
    if (count === 0) {
      console.log(chalk.gray('  No memories added. Come back anytime!'));
    } else {
      console.log(success(` Added ${count} memor${count === 1 ? 'y' : 'ies'}!`));
      console.log(chalk.gray(`  View them with: ${chalk.cyan('dc show')}`));
    }
    console.log();
  } catch (err) {
    if (err instanceof Error) {
      console.log(error(err.message));
    }
    process.exit(1);
  }
});
