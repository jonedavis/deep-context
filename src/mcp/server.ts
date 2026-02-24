/**
 * Deep Context MCP Server
 *
 * Exposes memory management tools to LLMs via Model Context Protocol.
 * This allows Claude Code, Cursor, and other MCP-compatible clients
 * to directly interact with project memory without CLI commands.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryStore } from '../memory/store.js';
import { MemoryRetriever, formatMemoriesForContext } from '../memory/retriever.js';
import { createEmbedder } from '../memory/embeddings.js';
import { findProjectRoot, getMemoryDbPath, DC_DIR, CONFIG_FILE, ConfigSchema } from '../config/index.js';
import { detectProjectType } from '../detection/detector.js';
import { getTemplateForDetection, getTemplateRules } from '../templates/index.js';
import type { MemoryType } from '../memory/types.js';

// Global registry path
const GLOBAL_DC_DIR = path.join(os.homedir(), '.deep-context');
const PROJECTS_REGISTRY_PATH = path.join(GLOBAL_DC_DIR, 'projects.json');

/**
 * Project registry entry for tracking usage
 */
interface ProjectEntry {
  path: string;
  firstUsed: string;
  lastUsed: string;
  memoryCount: number;
  mcpCalls: number;
}

/**
 * Load the global projects registry
 */
function loadProjectsRegistry(): Record<string, ProjectEntry> {
  try {
    if (fs.existsSync(PROJECTS_REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(PROJECTS_REGISTRY_PATH, 'utf-8'));
    }
  } catch {
    // Ignore errors, return empty registry
  }
  return {};
}

/**
 * Save the global projects registry
 */
function saveProjectsRegistry(registry: Record<string, ProjectEntry>): void {
  try {
    if (!fs.existsSync(GLOBAL_DC_DIR)) {
      fs.mkdirSync(GLOBAL_DC_DIR, { recursive: true, mode: 0o700 });
    }
    // Atomic write: write to temp file then rename to avoid corruption from concurrent writes
    const tmpPath = PROJECTS_REGISTRY_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, PROJECTS_REGISTRY_PATH);
  } catch {
    // Silently ignore write errors - tracking is not critical
  }
}

/**
 * Update project registry entry
 */
function updateProjectRegistry(projectPath: string, memoryCount: number): void {
  const registry = loadProjectsRegistry();
  const now = new Date().toISOString();

  if (registry[projectPath]) {
    registry[projectPath].lastUsed = now;
    registry[projectPath].memoryCount = memoryCount;
    registry[projectPath].mcpCalls++;
  } else {
    registry[projectPath] = {
      path: projectPath,
      firstUsed: now,
      lastUsed: now,
      memoryCount,
      mcpCalls: 1,
    };
  }

  saveProjectsRegistry(registry);
}

/**
 * Check if Deep Context is disabled for a project via .dcignore
 */
function isProjectDisabled(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.dcignore'));
}

/**
 * Silently auto-initialize a project
 * Returns the project root path, or null if disabled/failed
 */
function autoInitProject(targetDir: string): string | null {
  // Check if disabled via .dcignore
  if (isProjectDisabled(targetDir)) {
    return null;
  }

  const dcPath = path.join(targetDir, DC_DIR);

  // Already initialized
  if (fs.existsSync(dcPath)) {
    return targetDir;
  }

  try {
    // Create .dc directory
    fs.mkdirSync(dcPath, { recursive: true });

    // Detect project type
    const detection = detectProjectType(targetDir);
    const template = getTemplateForDetection(detection);

    // Build config with detected rules
    const baseConfig = ConfigSchema.parse({});
    const extendedConfig: Record<string, unknown> = { ...baseConfig };

    if (template) {
      const rules = getTemplateRules(template);
      extendedConfig['project'] = {
        type: template.id,
        detected: {
          languages: detection.tech.languages,
          frameworks: detection.tech.frameworks,
          buildTools: detection.tech.buildTools,
          testing: detection.tech.testing,
          databases: detection.tech.databases,
        },
      };
      extendedConfig['rules'] = rules.map((rule) => ({
        id: rule.id,
        category: rule.category,
        title: rule.title,
        description: rule.description,
        examples: rule.examples,
      }));
    }

    // Write config
    fs.writeFileSync(
      path.join(dcPath, CONFIG_FILE),
      JSON.stringify(extendedConfig, null, 2)
    );

    // Create .gitignore for .dc directory
    fs.writeFileSync(
      path.join(dcPath, '.gitignore'),
      `# Deep Context local files
memory.db
memory.db-journal
memory.db-wal
embeddings/
`
    );

    // Track in global registry
    updateProjectRegistry(targetDir, 0);

    return targetDir;
  } catch {
    // Silently fail - auto-init should never block the user
    return null;
  }
}

// Tool input schemas
const MAX_CONTENT_LENGTH = 2000;
const MAX_QUERY_LENGTH = 500;

const MemoryAddSchema = z.object({
  type: z.enum(['constraint', 'decision', 'heuristic']).describe(
    'Type of memory: constraint (always applies), decision (architectural choice), heuristic (soft preference)'
  ),
  content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH).describe('The memory content'),
  rationale: z.string().max(MAX_CONTENT_LENGTH).optional().describe('Why this was decided (especially for decisions)'),
  context: z.string().max(MAX_CONTENT_LENGTH).optional().describe('Additional context'),
});

const MemorySearchSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH).describe('Search query to find relevant memories'),
  type: z.enum(['constraint', 'decision', 'heuristic']).optional().describe('Filter by type'),
  limit: z.number().int().min(1).max(50).optional().default(5).describe('Maximum results to return'),
});

const MemoryContextSchema = z.object({
  task: z.string().trim().min(1).max(MAX_QUERY_LENGTH).describe('Description of the coding task you are about to do'),
});

const MemoryListSchema = z.object({
  type: z.enum(['constraint', 'decision', 'heuristic']).optional().describe('Filter by type'),
  limit: z.number().int().min(1).max(100).optional().default(20).describe('Maximum results'),
});

const FrictionLogSchema = z.object({
  what_failed: z.string().trim().min(1).max(MAX_CONTENT_LENGTH).describe('What approach did not work'),
  why: z.string().max(MAX_CONTENT_LENGTH).optional().describe('Why it failed'),
  correction: z.string().max(MAX_CONTENT_LENGTH).optional().describe('What was done instead'),
  memory_id: z.string().max(50).optional().describe('Specific memory ID to apply friction to (if known)'),
});

const MemoryBoostSchema = z.object({
  memory_id: z.string().trim().min(1).max(50).describe('ID of memory to boost'),
  reason: z.string().max(MAX_CONTENT_LENGTH).optional().describe('Why this memory is being boosted'),
});

/**
 * Initialize and run the MCP server
 */
export async function runMcpServer(): Promise<void> {
  const cwd = process.cwd();

  // Check if disabled via .dcignore
  if (isProjectDisabled(cwd)) {
    // Create a minimal server that returns empty results
    const server = new Server(
      { name: 'deep-context', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
    server.setRequestHandler(CallToolRequestSchema, async () => ({
      content: [{ type: 'text', text: 'Deep Context is disabled for this project (.dcignore exists)' }],
    }));

    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  // Find existing project root or auto-initialize
  let projectRoot = findProjectRoot();
  if (!projectRoot) {
    projectRoot = autoInitProject(cwd);
  }

  // If still no project root (auto-init failed), use cwd anyway
  if (!projectRoot) {
    projectRoot = cwd;
    // Ensure .dc directory exists
    const dcPath = path.join(cwd, DC_DIR);
    if (!fs.existsSync(dcPath)) {
      fs.mkdirSync(dcPath, { recursive: true });
    }
  }

  // Initialize memory system
  const dbPath = getMemoryDbPath(projectRoot);
  const store = new MemoryStore(dbPath);
  const embedder = await createEmbedder({ provider: 'simple' });
  const retriever = new MemoryRetriever(store, embedder);

  // Track usage in global registry
  const stats = store.getStats();
  updateProjectRegistry(projectRoot, stats.totalMemories);

  // Create MCP server
  const server = new Server(
    {
      name: 'deep-context',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tools
  const tools = [
    {
      name: 'dc_memory_add',
      description: `Add a memory to the project's persistent context.

Use this when:
- Establishing a coding standard or rule (constraint)
- Making an architectural decision (decision)
- Setting a soft preference (heuristic)

The memory will be automatically retrieved in future sessions when relevant.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            enum: ['constraint', 'decision', 'heuristic'],
            description: 'constraint = must always follow, decision = architectural choice, heuristic = soft preference',
          },
          content: { type: 'string', description: 'The memory content' },
          rationale: { type: 'string', description: 'Why this was decided' },
          context: { type: 'string', description: 'Additional context' },
        },
        required: ['type', 'content'],
      },
    },
    {
      name: 'dc_memory_context',
      description: `Get relevant project memories for a coding task.

IMPORTANT: Call this at the START of any coding task to understand:
- Project constraints that must be followed
- Past architectural decisions
- Relevant heuristics and preferences

This ensures your suggestions align with the project's established patterns.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          task: { type: 'string', description: 'Description of what you are about to do' },
        },
        required: ['task'],
      },
    },
    {
      name: 'dc_memory_search',
      description: `Search project memories semantically.

Use this to find specific past decisions or constraints related to a topic.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query' },
          type: {
            type: 'string',
            enum: ['constraint', 'decision', 'heuristic'],
            description: 'Filter by memory type',
          },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'dc_memory_list',
      description: `List all project memories.

Use this to review the full project context.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            enum: ['constraint', 'decision', 'heuristic'],
            description: 'Filter by type',
          },
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
        required: [],
      },
    },
    {
      name: 'dc_log_friction',
      description: `Log that a previous approach did not work.

Call this when:
- The user corrects your suggestion
- An approach failed or had issues
- You realize a different approach is needed

This helps Deep Context learn and improve future suggestions by downranking problematic patterns.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          what_failed: { type: 'string', description: 'What approach did not work' },
          why: { type: 'string', description: 'Why it failed' },
          correction: { type: 'string', description: 'What was done instead' },
          memory_id: { type: 'string', description: 'Specific memory ID to target (optional)' },
        },
        required: ['what_failed'],
      },
    },
    {
      name: 'dc_stats',
      description: `Get memory statistics for the project.`,
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    {
      name: 'dc_memory_boost',
      description: `Boost a memory that was helpful or correct.

Call this when:
- A memory led to a successful outcome
- User confirms a suggestion was correct
- You want to increase a memory's priority in future retrievals`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          memory_id: { type: 'string', description: 'ID of the memory to boost' },
          reason: { type: 'string', description: 'Why this memory is being boosted' },
        },
        required: ['memory_id'],
      },
    },
  ];

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'dc_memory_add': {
          const input = MemoryAddSchema.parse(args);
          const id = await retriever.addMemory(input.type, input.content, {
            rationale: input.rationale,
            context: input.context,
            source: 'auto',
          });
          return {
            content: [
              {
                type: 'text',
                text: `✓ Added ${input.type}: "${input.content.slice(0, 50)}${input.content.length > 50 ? '...' : ''}"\nID: ${id}`,
              },
            ],
          };
        }

        case 'dc_memory_context': {
          const input = MemoryContextSchema.parse(args);
          const context = await retriever.retrieveForContext(input.task);

          if (
            context.constraints.length === 0 &&
            context.decisions.length === 0 &&
            context.heuristics.length === 0
          ) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No relevant memories found for this task. This may be a new area of the project.',
                },
              ],
            };
          }

          const formatted = formatMemoriesForContext(
            context.constraints,
            context.decisions,
            context.heuristics
          );

          return {
            content: [{ type: 'text', text: formatted }],
          };
        }

        case 'dc_memory_search': {
          const input = MemorySearchSchema.parse(args);
          const results = await retriever.search(input.query, {
            type: input.type as MemoryType | undefined,
            limit: input.limit,
          });

          if (results.length === 0) {
            return {
              content: [{ type: 'text', text: `No memories found matching "${input.query}"` }],
            };
          }

          const formatted = results
            .map((r) => {
              const score = (r.adjustedScore * 100).toFixed(0);
              return `[${r.memory.type.toUpperCase()}] ${r.memory.content}\n  Relevance: ${score}%`;
            })
            .join('\n\n');

          return {
            content: [{ type: 'text', text: formatted }],
          };
        }

        case 'dc_memory_list': {
          const input = MemoryListSchema.parse(args);
          const memories = store.listMemories({
            type: input.type as MemoryType | undefined,
            limit: input.limit,
          });

          if (memories.length === 0) {
            return {
              content: [{ type: 'text', text: 'No memories stored yet.' }],
            };
          }

          const formatted = memories
            .map((m) => `[${m.type.toUpperCase()}] ${m.content}`)
            .join('\n\n');

          return {
            content: [{ type: 'text', text: formatted }],
          };
        }

        case 'dc_log_friction': {
          const input = FrictionLogSchema.parse(args);
          let affectedCount = 0;

          if (input.memory_id) {
            // Direct targeting - apply to specific memory
            store.recordFrictionEvent(
              input.memory_id,
              'correction',
              -0.5,
              input.why ?? input.what_failed
            );
            affectedCount = 1;
          } else {
            // Find related memories, but only apply to highly relevant ones
            const related = await retriever.search(input.what_failed, { limit: 3 });
            // Higher threshold because SimpleEmbedder produces similar scores for everything
            // With real embedders (Ollama/OpenAI), this could be lowered to 0.4
            const SIMILARITY_THRESHOLD = 0.55;

            for (const result of related) {
              if (result.adjustedScore >= SIMILARITY_THRESHOLD) {
                store.recordFrictionEvent(
                  result.memory.id,
                  'correction',
                  -0.5,
                  input.why ?? input.what_failed
                );
                affectedCount++;
              }
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: `✓ Logged friction for ${affectedCount} related memories.\n` +
                  `What failed: ${input.what_failed}\n` +
                  (input.why ? `Why: ${input.why}\n` : '') +
                  (input.correction ? `Correction: ${input.correction}` : ''),
              },
            ],
          };
        }

        case 'dc_stats': {
          const stats = store.getStats();
          return {
            content: [
              {
                type: 'text',
                text: `Deep Context Statistics:
- Total memories: ${stats.totalMemories}
  - Constraints: ${stats.constraintCount}
  - Decisions: ${stats.decisionCount}
  - Heuristics: ${stats.heuristicCount}
- Friction events: ${stats.totalFrictionEvents}
- Average friction score: ${stats.averageFrictionScore.toFixed(2)}`,
              },
            ],
          };
        }

        case 'dc_memory_boost': {
          const input = MemoryBoostSchema.parse(args);
          store.recordFrictionEvent(
            input.memory_id,
            'acceptance',
            0.5,
            input.reason ?? 'Memory was helpful'
          );
          return {
            content: [
              {
                type: 'text',
                text: `✓ Boosted memory ${input.memory_id}` +
                  (input.reason ? `\nReason: ${input.reason}` : ''),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle shutdown
  process.on('SIGINT', () => {
    store.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    store.close();
    process.exit(0);
  });
}
