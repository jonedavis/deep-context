/**
 * Sync command - Generate rules files that instruct LLMs to use Deep Context
 *
 * Creates/updates:
 * - CLAUDE.md (for Claude Code)
 * - .cursorrules (for Cursor)
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from '../../config/index.js';

interface SyncOptions {
  force?: boolean;
}

const DEEP_CONTEXT_RULES = `
## Deep Context Integration

This project uses **Deep Context** for persistent memory across coding sessions.

### Available Tools

You have access to these MCP tools:

| Tool | When to Use |
|------|-------------|
| \`dc_memory_context\` | **START OF EVERY TASK** - Get project constraints and past decisions |
| \`dc_memory_add\` | When making architectural decisions or establishing rules |
| \`dc_memory_search\` | When looking for specific past decisions |
| \`dc_log_friction\` | When something doesn't work or user corrects you |

### IMPORTANT: Always Start With Context

At the beginning of ANY coding task, call:
\`\`\`
dc_memory_context({ task: "description of what you're about to do" })
\`\`\`

This retrieves:
- **Constraints**: Rules that MUST be followed
- **Decisions**: Past architectural choices
- **Heuristics**: Soft preferences

### When to Add Memories

**Add a CONSTRAINT when:**
- Establishing a rule that must ALWAYS be followed
- Example: "Never use var in JavaScript"
- Example: "All API responses must include timestamps"

**Add a DECISION when:**
- Making an architectural or technology choice
- Include WHY you made this choice
- Example: "Using PostgreSQL because we need complex relational queries"

**Add a HEURISTIC when:**
- Setting a soft preference (not a hard rule)
- Example: "Prefer composition over inheritance"

### When to Log Friction

Call \`dc_log_friction\` when:
- User corrects your suggestion
- An approach didn't work as expected
- You realize a previous pattern was wrong

This helps Deep Context learn and improve future suggestions.

### Example Workflow

1. User asks: "Add user authentication"
2. You call: \`dc_memory_context({ task: "implementing user authentication" })\`
3. Context returns: Past decision to use JWT, constraint about password hashing
4. You implement following the established patterns
5. If you make new decisions, save them: \`dc_memory_add({ type: "decision", content: "Using bcrypt for password hashing", rationale: "Industry standard, configurable cost factor" })\`
`;

export async function syncCommand(options: SyncOptions): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Not in a Deep Context project. Run `dc init` first.'));
    process.exit(1);
  }

  console.log(chalk.bold('\nSyncing Deep Context rules files...\n'));

  // Generate CLAUDE.md
  await syncClaudeMd(projectRoot, options.force);

  // Generate .cursorrules
  await syncCursorRules(projectRoot, options.force);

  console.log();
  console.log(chalk.green('✓ Rules files synced'));
  console.log(chalk.gray('  LLMs will now automatically use Deep Context tools.'));
  console.log();
}

async function syncClaudeMd(projectRoot: string, force?: boolean): Promise<void> {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  const marker = '## Deep Context Integration';

  let content = '';
  let existed = false;

  // Read existing file if present
  if (fs.existsSync(claudeMdPath)) {
    existed = true;
    content = fs.readFileSync(claudeMdPath, 'utf-8');

    // Check if Deep Context section already exists
    if (content.includes(marker)) {
      if (!force) {
        console.log(chalk.gray('  CLAUDE.md already has Deep Context section (use --force to update)'));
        return;
      }

      // Remove existing section
      const startIndex = content.indexOf(marker);
      const nextSectionMatch = content.slice(startIndex + marker.length).match(/\n## /);
      const endIndex = nextSectionMatch
        ? startIndex + marker.length + (nextSectionMatch.index ?? content.length)
        : content.length;

      content = content.slice(0, startIndex) + content.slice(endIndex);
    }
  }

  // Add Deep Context section
  content = content.trimEnd() + '\n' + DEEP_CONTEXT_RULES;

  // Write file
  fs.writeFileSync(claudeMdPath, content);

  console.log(chalk.cyan(`  ${existed ? 'Updated' : 'Created'} CLAUDE.md`));
}

async function syncCursorRules(projectRoot: string, force?: boolean): Promise<void> {
  const cursorRulesPath = path.join(projectRoot, '.cursorrules');
  const marker = '## Deep Context Integration';

  let content = '';
  let existed = false;

  // Read existing file if present
  if (fs.existsSync(cursorRulesPath)) {
    existed = true;
    content = fs.readFileSync(cursorRulesPath, 'utf-8');

    // Check if Deep Context section already exists
    if (content.includes(marker)) {
      if (!force) {
        console.log(chalk.gray('  .cursorrules already has Deep Context section (use --force to update)'));
        return;
      }

      // Remove existing section
      const startIndex = content.indexOf(marker);
      const nextSectionMatch = content.slice(startIndex + marker.length).match(/\n## /);
      const endIndex = nextSectionMatch
        ? startIndex + marker.length + (nextSectionMatch.index ?? content.length)
        : content.length;

      content = content.slice(0, startIndex) + content.slice(endIndex);
    }
  }

  // Add Deep Context section
  content = content.trimEnd() + '\n' + DEEP_CONTEXT_RULES;

  // Write file
  fs.writeFileSync(cursorRulesPath, content);

  console.log(chalk.cyan(`  ${existed ? 'Updated' : 'Created'} .cursorrules`));
}
