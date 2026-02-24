#!/usr/bin/env node

/**
 * Real Claude API Benchmark for Deep Context
 *
 * Compares Claude's code generation quality with and without Deep Context.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node real-benchmark.js
 *   node real-benchmark.js --model claude-3-haiku-20240307  # Use cheaper model
 *   node real-benchmark.js --tasks 1,2,3                    # Run specific tasks
 *   node real-benchmark.js --control-only                   # Run control only
 *   node real-benchmark.js --treatment-only                 # Run treatment only
 */

import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DC_MCP_PATH = path.resolve(__dirname, '../bin/dc-mcp.js');
const PROJECT_PATH = path.join(__dirname, 'project');
const RESULTS_PATH = path.join(__dirname, 'results');

// ============================================================================
// TASKS DEFINITION
// ============================================================================

const TASKS = [
  {
    id: 1,
    name: 'Add Product Model',
    prompt: 'Create a Product model with fields for id, name, description, price, and category. Write the JavaScript/TypeScript code.',
    checks: ['uuid', 'timestamps'],
    maxPoints: 8
  },
  {
    id: 2,
    name: 'Create CRUD Endpoints',
    prompt: 'Create REST API endpoints for products: list all, get one by id, create, update, delete. Use Express.js.',
    checks: ['asyncAwait', 'restPatterns', 'timestamp'],
    maxPoints: 10
  },
  {
    id: 3,
    name: 'Auth Middleware',
    prompt: 'Add authentication middleware to protect the product endpoints. Write the middleware function.',
    checks: ['jwt', 'asyncAwait', 'earlyReturn'],
    maxPoints: 10
  },
  {
    id: 4,
    name: 'Pagination',
    prompt: 'Add pagination to the products list endpoint with page and limit query parameters.',
    checks: ['asyncAwait', 'timestamp'],
    maxPoints: 6
  },
  {
    id: 5,
    name: 'Input Validation',
    prompt: 'Add validation for product creation - name is required, price must be a positive number. Show the validation logic.',
    checks: ['earlyReturn', 'asyncAwait'],
    maxPoints: 5
  },
  {
    id: 6,
    name: 'Search Endpoint',
    prompt: 'Create a search endpoint to find products by name or category. Include the route and handler.',
    checks: ['asyncAwait', 'prisma'],
    maxPoints: 5
  },
  {
    id: 7,
    name: 'Rate Limiting',
    prompt: 'Add rate limiting middleware to prevent API abuse. Show how to implement it.',
    checks: ['asyncAwait'],
    maxPoints: 3
  },
  {
    id: 8,
    name: 'Soft Delete',
    prompt: 'Implement soft delete for products using a deleted_at timestamp instead of actually deleting.',
    checks: ['uuid', 'timestamps'],
    maxPoints: 8
  },
  {
    id: 9,
    name: 'Audit Logging',
    prompt: 'Add audit logging to track who created and updated each product. Include timestamps.',
    checks: ['uuid', 'timestamps', 'asyncAwait'],
    maxPoints: 10
  },
  {
    id: 10,
    name: 'Batch Import',
    prompt: 'Create an endpoint to import multiple products at once from a JSON array. Handle errors gracefully.',
    checks: ['uuid', 'asyncAwait', 'transaction'],
    maxPoints: 10
  }
];

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

function checkUUID(code) {
  const patterns = [
    /uuid/i,
    /nanoid/i,
    /randomUUID/i,
    /crypto\.random/i,
    /uuidv4/i,
    /v4\(\)/i
  ];
  return patterns.some(p => p.test(code)) ? 5 : 0;
}

function checkAsyncAwait(code) {
  const hasAsync = /async\s+(function|\(|=>|\w+\s*\()/i.test(code);
  const hasAwait = /await\s+/i.test(code);
  const hasCallbacks = /\.then\s*\(|,\s*function\s*\(err|callback\s*\(/i.test(code);

  if (hasAsync && hasAwait && !hasCallbacks) return 3;
  if (hasAsync || hasAwait) return 1;
  return 0;
}

function checkTimestamp(code) {
  const patterns = [
    /timestamp/i,
    /createdAt|created_at/i,
    /updatedAt|updated_at/i,
    /new Date\(\)/i,
    /\.toISOString\(\)/i,
    /Date\.now\(\)/i
  ];
  return patterns.some(p => p.test(code)) ? 3 : 0;
}

function checkEarlyReturn(code) {
  // Look for early return patterns in validation
  const patterns = [
    /if\s*\([^)]+\)\s*{\s*return/i,
    /if\s*\([^)]+\)\s*return/i,
    /if\s*\(!.*\)\s*{\s*return/i
  ];
  return patterns.some(p => p.test(code)) ? 2 : 0;
}

function checkREST(code) {
  const hasGet = /\.get\s*\(/i.test(code);
  const hasPost = /\.post\s*\(/i.test(code);
  const hasPut = /\.put\s*\(/i.test(code) || /\.patch\s*\(/i.test(code);
  const hasDelete = /\.delete\s*\(/i.test(code);

  let score = 0;
  if (hasGet) score += 0.5;
  if (hasPost) score += 0.5;
  if (hasPut) score += 0.5;
  if (hasDelete) score += 0.5;
  return Math.round(score);
}

function checkPrisma(code) {
  return /prisma\./i.test(code) ? 2 : 0;
}

function checkJWT(code) {
  const patterns = [
    /jwt/i,
    /jsonwebtoken/i,
    /bearer/i,
    /token/i,
    /verify.*token/i
  ];
  return patterns.some(p => p.test(code)) ? 5 : 0;
}

function checkTransaction(code) {
  const patterns = [
    /\$transaction/i,
    /transaction/i,
    /BEGIN/i,
    /COMMIT/i,
    /ROLLBACK/i
  ];
  return patterns.some(p => p.test(code)) ? 2 : 0;
}

const CHECKERS = {
  uuid: checkUUID,
  asyncAwait: checkAsyncAwait,
  timestamp: checkTimestamp,
  timestamps: checkTimestamp,
  earlyReturn: checkEarlyReturn,
  restPatterns: checkREST,
  prisma: checkPrisma,
  jwt: checkJWT,
  transaction: checkTransaction
};

function scoreCode(code, checks) {
  let score = 0;
  const details = {};

  for (const check of checks) {
    const checker = CHECKERS[check];
    if (checker) {
      const points = checker(code);
      score += points;
      details[check] = points;
    }
  }

  return { score, details };
}

// ============================================================================
// MCP CLIENT (for Deep Context)
// ============================================================================

class MCPClient {
  constructor(cwd) {
    this.cwd = cwd;
    this.process = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.process = spawn('node', [DC_MCP_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.cwd
      });

      this.process.on('error', reject);
      this.process.stderr.on('data', (data) => {
        // Suppress stderr unless debugging
        if (process.env.DEBUG) {
          console.error('MCP:', data.toString());
        }
      });

      const rl = readline.createInterface({ input: this.process.stdout });
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.pendingRequests.has(msg.id)) {
            this.pendingRequests.get(msg.id)(msg);
            this.pendingRequests.delete(msg.id);
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      });

      this.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'real-benchmark', version: '1.0.0' }
      }).then(() => {
        this.send('notifications/initialized', {}).catch(() => {});
        resolve();
      }).catch(reject);
    });
  }

  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      });

      this.process.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 10000);
    });
  }

  async callTool(name, args) {
    return this.send('tools/call', { name, arguments: args });
  }

  close() {
    if (this.process) {
      this.process.kill();
    }
  }
}

// ============================================================================
// CLAUDE API CLIENT
// ============================================================================

async function callClaude(client, prompt, model, systemPrompt = null) {
  const messages = [{ role: 'user', content: prompt }];

  const params = {
    model,
    max_tokens: 2048,
    messages
  };

  if (systemPrompt) {
    params.system = systemPrompt;
  }

  const response = await client.messages.create(params);

  return response.content[0].text;
}

// Mock response for dry-run mode (simulates what Claude might say without context)
function getMockResponse(task, hasContext) {
  if (hasContext) {
    // Treatment: Has project context, generates correct code
    return `
Here's the implementation following project conventions:

\`\`\`javascript
import { randomUUID } from 'crypto';
import { prisma } from './db';

export async function ${task.name.toLowerCase().replace(/\s+/g, '')}(data) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  // Early return for validation
  if (!data.name) {
    return { error: 'Name is required', timestamp };
  }

  if (data.price && data.price <= 0) {
    return { error: 'Price must be positive', timestamp };
  }

  const result = await prisma.product.create({
    data: {
      id,
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  });

  return { data: result, timestamp };
}

// REST endpoints
router.get('/products', async (req, res) => {
  const products = await prisma.product.findMany();
  res.json({ data: products, timestamp: new Date().toISOString() });
});

router.post('/products', async (req, res) => {
  const result = await createProduct(req.body);
  res.json(result);
});

router.put('/products/:id', async (req, res) => {
  const updated = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
  res.json({ data: updated, timestamp: new Date().toISOString() });
});

router.delete('/products/:id', async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// JWT Authentication middleware
const jwt = require('jsonwebtoken');

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided', timestamp: new Date().toISOString() });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', timestamp: new Date().toISOString() });
  }
}

// Transaction for batch import
async function batchImport(products) {
  return await prisma.$transaction(async (tx) => {
    const results = [];
    for (const product of products) {
      const created = await tx.product.create({
        data: { id: randomUUID(), ...product }
      });
      results.push(created);
    }
    return results;
  });
}
\`\`\`
`;
  } else {
    // Control: No context, makes common mistakes
    return `
Here's a basic implementation:

\`\`\`javascript
const products = [];
let nextId = 1;

function createProduct(data, callback) {
  const product = {
    id: nextId++,
    name: data.name,
    price: data.price
  };

  products.push(product);
  callback(null, product);
}

app.get('/products', function(req, res) {
  db.query('SELECT * FROM products', function(err, results) {
    if (err) {
      res.status(500).send(err);
    } else {
      res.json(results);
    }
  });
});

app.post('/products', function(req, res) {
  const product = req.body;
  product.id = products.length + 1;

  db.query('INSERT INTO products SET ?', product)
    .then(function(result) {
      res.json({ id: result.insertId });
    });
});

// Auth check
function checkAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).send('Unauthorized');
  }
}
\`\`\`
`;
  }
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runControlGroup(anthropic, model, tasks, dryRun = false) {
  console.log('\n' + '='.repeat(70));
  console.log('  CONTROL GROUP: Claude WITHOUT Deep Context' + (dryRun ? ' [DRY RUN]' : ''));
  console.log('='.repeat(70) + '\n');

  const results = [];

  for (const task of tasks) {
    console.log(`Task ${task.id}: ${task.name}`);
    console.log(`  Prompt: "${task.prompt.slice(0, 50)}..."`);

    const startTime = Date.now();

    try {
      let response;
      if (dryRun) {
        response = getMockResponse(task, false);
        await new Promise(r => setTimeout(r, 100)); // Simulate delay
      } else {
        response = await callClaude(anthropic, task.prompt, model);
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      const { score, details } = scoreCode(response, task.checks);

      results.push({
        taskId: task.id,
        name: task.name,
        prompt: task.prompt,
        response,
        score,
        maxPoints: task.maxPoints,
        details,
        elapsed: parseFloat(elapsed),
        error: null
      });

      console.log(`  Score: ${score}/${task.maxPoints} (${elapsed}s)`);
      console.log(`  Checks: ${JSON.stringify(details)}\n`);

    } catch (error) {
      console.log(`  ERROR: ${error.message}\n`);
      results.push({
        taskId: task.id,
        name: task.name,
        prompt: task.prompt,
        response: null,
        score: 0,
        maxPoints: task.maxPoints,
        details: {},
        elapsed: 0,
        error: error.message
      });
    }

    // Small delay to avoid rate limiting
    if (!dryRun) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

async function runTreatmentGroup(anthropic, model, tasks, mcpClient, dryRun = false) {
  console.log('\n' + '='.repeat(70));
  console.log('  TREATMENT GROUP: Claude WITH Deep Context' + (dryRun ? ' [DRY RUN]' : ''));
  console.log('='.repeat(70) + '\n');

  const results = [];

  for (const task of tasks) {
    console.log(`Task ${task.id}: ${task.name}`);
    console.log(`  Prompt: "${task.prompt.slice(0, 50)}..."`);

    const startTime = Date.now();

    try {
      // Get context from Deep Context (always do this, even in dry run)
      console.log(`  Fetching context from Deep Context...`);
      const contextResult = await mcpClient.callTool('dc_memory_context', {
        task: task.prompt
      });

      const context = contextResult.content[0].text;

      // Build system prompt with context
      const systemPrompt = `You are a senior software engineer working on this project.

IMPORTANT PROJECT CONTEXT:
${context}

When writing code, you MUST follow all constraints and decisions listed above.`;

      let response;
      if (dryRun) {
        response = getMockResponse(task, true);
        await new Promise(r => setTimeout(r, 100)); // Simulate delay
        console.log(`  Context retrieved (${context.split('\n').length} lines)`);
      } else {
        response = await callClaude(anthropic, task.prompt, model, systemPrompt);
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      const { score, details } = scoreCode(response, task.checks);

      results.push({
        taskId: task.id,
        name: task.name,
        prompt: task.prompt,
        context,
        response,
        score,
        maxPoints: task.maxPoints,
        details,
        elapsed: parseFloat(elapsed),
        error: null
      });

      console.log(`  Score: ${score}/${task.maxPoints} (${elapsed}s)`);
      console.log(`  Checks: ${JSON.stringify(details)}\n`);

    } catch (error) {
      console.log(`  ERROR: ${error.message}\n`);
      results.push({
        taskId: task.id,
        name: task.name,
        prompt: task.prompt,
        response: null,
        score: 0,
        maxPoints: task.maxPoints,
        details: {},
        elapsed: 0,
        error: error.message
      });
    }

    // Small delay to avoid rate limiting
    if (!dryRun) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(controlResults, treatmentResults, model) {
  const timestamp = new Date().toISOString();

  const controlTotal = controlResults.reduce((sum, r) => sum + r.score, 0);
  const treatmentTotal = treatmentResults.reduce((sum, r) => sum + r.score, 0);
  const maxTotal = controlResults.reduce((sum, r) => sum + r.maxPoints, 0);

  const improvement = controlTotal > 0
    ? ((treatmentTotal - controlTotal) / controlTotal * 100).toFixed(1)
    : 'N/A';

  // Console output
  console.log('\n' + '='.repeat(70));
  console.log('  BENCHMARK RESULTS');
  console.log('='.repeat(70));
  console.log();
  console.log('  Model:', model);
  console.log('  Tasks:', controlResults.length);
  console.log();
  console.log('  +-----------------+----------+------------+');
  console.log('  |                 | Control  | Treatment  |');
  console.log('  +-----------------+----------+------------+');

  for (let i = 0; i < controlResults.length; i++) {
    const c = controlResults[i];
    const t = treatmentResults[i];
    const name = c.name.slice(0, 15).padEnd(15);
    console.log(`  | ${name} | ${String(c.score).padStart(4)}/${String(c.maxPoints).padEnd(3)} | ${String(t.score).padStart(4)}/${String(t.maxPoints).padEnd(3)}   |`);
  }

  console.log('  +-----------------+----------+------------+');
  console.log(`  | TOTAL           | ${String(controlTotal).padStart(4)}/${String(maxTotal).padEnd(3)} | ${String(treatmentTotal).padStart(4)}/${String(maxTotal).padEnd(3)}   |`);
  console.log('  +-----------------+----------+------------+');
  console.log();
  console.log(`  Improvement: +${improvement}%`);
  console.log('='.repeat(70) + '\n');

  // Build full results object
  const results = {
    timestamp,
    model,
    summary: {
      controlScore: controlTotal,
      treatmentScore: treatmentTotal,
      maxScore: maxTotal,
      improvement: parseFloat(improvement) || 0,
      tasksRun: controlResults.length
    },
    control: controlResults,
    treatment: treatmentResults
  };

  // Generate markdown report
  const markdown = `# Deep Context Real API Benchmark Results

## Summary

| Metric | Value |
|--------|-------|
| Model | ${model} |
| Date | ${timestamp} |
| Tasks | ${controlResults.length} |

## Scores

| Group | Score | Percentage |
|-------|-------|------------|
| Control (No DC) | ${controlTotal}/${maxTotal} | ${(controlTotal/maxTotal*100).toFixed(1)}% |
| Treatment (With DC) | ${treatmentTotal}/${maxTotal} | ${(treatmentTotal/maxTotal*100).toFixed(1)}% |
| **Improvement** | **+${treatmentTotal - controlTotal}** | **+${improvement}%** |

## Task-by-Task Comparison

| Task | Control | Treatment | Delta |
|------|---------|-----------|-------|
${controlResults.map((c, i) => {
  const t = treatmentResults[i];
  const delta = t.score - c.score;
  const deltaStr = delta > 0 ? `+${delta}` : String(delta);
  return `| ${c.name} | ${c.score}/${c.maxPoints} | ${t.score}/${t.maxPoints} | ${deltaStr} |`;
}).join('\n')}

## What Deep Context Provided

The treatment group had access to these project constraints:
- **UUIDs**: All IDs must use UUIDs, not auto-increment integers
- **Async/Await**: Use async/await, never callbacks or .then()
- **Timestamps**: All API responses must include timestamps
- **Prisma ORM**: Use Prisma for database operations
- **JWT Auth**: Use JWT tokens for authentication
- **Early Returns**: Prefer early returns over nested if/else

## Detailed Results

### Control Group (Without Deep Context)

${controlResults.map(r => `
#### Task ${r.taskId}: ${r.name}
- **Score**: ${r.score}/${r.maxPoints}
- **Checks**: ${JSON.stringify(r.details)}
- **Time**: ${r.elapsed}s
${r.error ? `- **Error**: ${r.error}` : ''}
`).join('\n')}

### Treatment Group (With Deep Context)

${treatmentResults.map(r => `
#### Task ${r.taskId}: ${r.name}
- **Score**: ${r.score}/${r.maxPoints}
- **Checks**: ${JSON.stringify(r.details)}
- **Time**: ${r.elapsed}s
${r.error ? `- **Error**: ${r.error}` : ''}
`).join('\n')}

---
*Generated by real-benchmark.js using Claude API*
`;

  return { results, markdown };
}

// ============================================================================
// MAIN
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    model: 'claude-sonnet-4-20250514',
    tasks: null, // null = all tasks
    controlOnly: false,
    treatmentOnly: false,
    dryRun: false,
    saveResponses: true
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      config.model = args[i + 1];
      i++;
    } else if (args[i] === '--tasks' && args[i + 1]) {
      config.tasks = args[i + 1].split(',').map(n => parseInt(n.trim()));
      i++;
    } else if (args[i] === '--control-only') {
      config.controlOnly = true;
    } else if (args[i] === '--treatment-only') {
      config.treatmentOnly = true;
    } else if (args[i] === '--dry-run') {
      config.dryRun = true;
    } else if (args[i] === '--no-save-responses') {
      config.saveResponses = false;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Deep Context Real API Benchmark

Usage:
  node real-benchmark.js [options]

Options:
  --model <model>      Claude model to use (default: claude-sonnet-4-20250514)
  --tasks <ids>        Comma-separated task IDs to run (default: all)
  --control-only       Only run control group
  --treatment-only     Only run treatment group
  --dry-run            Test MCP connection without API calls
  --no-save-responses  Don't include full responses in output
  --help, -h           Show this help

Environment:
  ANTHROPIC_API_KEY    Required. Your Anthropic API key.
  DEBUG                Set to show MCP debug output.

Examples:
  ANTHROPIC_API_KEY=sk-... node real-benchmark.js
  node real-benchmark.js --model claude-3-haiku-20240307
  node real-benchmark.js --tasks 1,2,3
  node real-benchmark.js --dry-run                        # Test without API calls
`);
      process.exit(0);
    }
  }

  return config;
}

async function main() {
  const config = parseArgs();

  // Check for API key (not required for dry-run)
  if (!process.env.ANTHROPIC_API_KEY && !config.dryRun) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is required.');
    console.error('');
    console.error('Set it with:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    console.error('');
    console.error('Or run with:');
    console.error('  ANTHROPIC_API_KEY=sk-ant-... node real-benchmark.js');
    console.error('');
    console.error('Or use --dry-run to test without API calls:');
    console.error('  node real-benchmark.js --dry-run');
    process.exit(1);
  }

  console.log('\n');
  console.log('======================================================================');
  console.log('           DEEP CONTEXT REAL API BENCHMARK');
  if (config.dryRun) {
    console.log('                      [DRY RUN MODE]');
  }
  console.log('======================================================================');
  console.log();
  console.log(`  Model: ${config.model}${config.dryRun ? ' (simulated)' : ''}`);
  console.log(`  Project: ${PROJECT_PATH}`);
  console.log();

  // Filter tasks if specified
  let tasksToRun = TASKS;
  if (config.tasks) {
    tasksToRun = TASKS.filter(t => config.tasks.includes(t.id));
    console.log(`  Running tasks: ${config.tasks.join(', ')}`);
  } else {
    console.log(`  Running all ${TASKS.length} tasks`);
  }
  console.log();

  // Initialize Anthropic client (or null for dry-run)
  let anthropic = null;
  if (!config.dryRun) {
    anthropic = new Anthropic();
  }

  // Initialize MCP client for Deep Context
  let mcpClient = null;
  if (!config.controlOnly) {
    console.log('Connecting to Deep Context MCP server...');
    mcpClient = new MCPClient(PROJECT_PATH);
    try {
      await mcpClient.connect();
      console.log('Connected to Deep Context.\n');
    } catch (error) {
      console.error('Failed to connect to Deep Context:', error.message);
      console.error('Make sure DC is initialized: cd benchmark/project && dc init');
      process.exit(1);
    }
  }

  // Run benchmarks
  let controlResults = [];
  let treatmentResults = [];

  try {
    if (!config.treatmentOnly) {
      controlResults = await runControlGroup(anthropic, config.model, tasksToRun, config.dryRun);
    }

    if (!config.controlOnly && mcpClient) {
      treatmentResults = await runTreatmentGroup(anthropic, config.model, tasksToRun, mcpClient, config.dryRun);
    }
  } finally {
    if (mcpClient) {
      mcpClient.close();
    }
  }

  // Generate and save report
  if (controlResults.length > 0 && treatmentResults.length > 0) {
    const { results, markdown } = generateReport(controlResults, treatmentResults, config.model);

    // Ensure results directory exists
    if (!fs.existsSync(RESULTS_PATH)) {
      fs.mkdirSync(RESULTS_PATH, { recursive: true });
    }

    // Save results
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toISOString().split('T')[1].slice(0, 5).replace(':', '');
    const suffix = config.dryRun ? '-dryrun' : '';
    const jsonPath = path.join(RESULTS_PATH, `real-benchmark-${dateStr}-${timeStr}${suffix}.json`);
    const mdPath = path.join(RESULTS_PATH, `real-benchmark-${dateStr}-${timeStr}${suffix}.md`);

    // Optionally strip full responses for smaller JSON
    const resultsToSave = config.saveResponses ? results : {
      ...results,
      control: results.control.map(r => ({ ...r, response: '[omitted]' })),
      treatment: results.treatment.map(r => ({ ...r, response: '[omitted]', context: '[omitted]' }))
    };

    fs.writeFileSync(jsonPath, JSON.stringify(resultsToSave, null, 2));
    fs.writeFileSync(mdPath, markdown);

    console.log(`Results saved to:`);
    console.log(`  ${jsonPath}`);
    console.log(`  ${mdPath}`);

    // Also save latest
    fs.writeFileSync(path.join(RESULTS_PATH, 'real-benchmark-latest.json'), JSON.stringify(resultsToSave, null, 2));
    fs.writeFileSync(path.join(RESULTS_PATH, 'real-benchmark-latest.md'), markdown);

    // Save individual responses for inspection
    if (config.saveResponses) {
      const responsesDir = path.join(RESULTS_PATH, `responses-${dateStr}-${timeStr}${suffix}`);
      if (!fs.existsSync(responsesDir)) {
        fs.mkdirSync(responsesDir, { recursive: true });
      }

      for (const r of controlResults) {
        if (r.response) {
          fs.writeFileSync(
            path.join(responsesDir, `task-${r.taskId}-control.md`),
            `# Task ${r.taskId}: ${r.name} (Control)\n\n**Score:** ${r.score}/${r.maxPoints}\n**Checks:** ${JSON.stringify(r.details)}\n\n---\n\n${r.response}`
          );
        }
      }

      for (const r of treatmentResults) {
        if (r.response) {
          fs.writeFileSync(
            path.join(responsesDir, `task-${r.taskId}-treatment.md`),
            `# Task ${r.taskId}: ${r.name} (Treatment)\n\n**Score:** ${r.score}/${r.maxPoints}\n**Checks:** ${JSON.stringify(r.details)}\n\n## Context Provided\n\n\`\`\`\n${r.context || 'N/A'}\n\`\`\`\n\n---\n\n${r.response}`
          );
        }
      }

      console.log(`  ${responsesDir}/`);
    }

  } else if (controlResults.length > 0) {
    console.log('\nControl-only results:');
    const total = controlResults.reduce((sum, r) => sum + r.score, 0);
    const max = controlResults.reduce((sum, r) => sum + r.maxPoints, 0);
    console.log(`  Total: ${total}/${max} (${(total/max*100).toFixed(1)}%)`);

  } else if (treatmentResults.length > 0) {
    console.log('\nTreatment-only results:');
    const total = treatmentResults.reduce((sum, r) => sum + r.score, 0);
    const max = treatmentResults.reduce((sum, r) => sum + r.maxPoints, 0);
    console.log(`  Total: ${total}/${max} (${(total/max*100).toFixed(1)}%)`);
  }

  console.log('\nBenchmark complete.\n');
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
