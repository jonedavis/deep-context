#!/usr/bin/env node

/**
 * Live Proof: Demonstrates Deep Context value with real MCP calls
 *
 * This script simulates what happens when an LLM uses Deep Context
 * to get project context before writing code.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DC_MCP_PATH = path.resolve(__dirname, '../bin/dc-mcp.js');

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

      const rl = readline.createInterface({ input: this.process.stdout });
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.pendingRequests.has(msg.id)) {
            this.pendingRequests.get(msg.id)(msg);
            this.pendingRequests.delete(msg.id);
          }
        } catch (e) {}
      });

      this.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'live-proof', version: '1.0.0' }
      }).then(() => {
        this.send('notifications/initialized', {}).catch(() => {});
        resolve();
      }).catch(reject);
    });
  }

  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = { jsonrpc: '2.0', id, method, params };

      this.pendingRequests.set(id, (response) => {
        if (response.error) reject(new Error(response.error.message));
        else resolve(response.result);
      });

      this.process.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Timeout'));
        }
      }, 5000);
    });
  }

  async callTool(name, args) {
    return this.send('tools/call', { name, arguments: args });
  }

  close() {
    if (this.process) this.process.kill();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           DEEP CONTEXT: LIVE PROOF OF VALUE              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');

  const projectPath = path.join(__dirname, 'project');

  // ==================== SCENARIO 1 ====================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SCENARIO 1: LLM starts coding task');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n> User: "Add a Product model to our API"\n');
  await sleep(500);

  console.log('LLM calls dc_memory_context({ task: "Add a Product model" })...\n');
  await sleep(300);

  const client = new MCPClient(projectPath);
  await client.connect();

  const context = await client.callTool('dc_memory_context', {
    task: 'Add a Product model to the API'
  });

  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ CONTEXT RETRIEVED:                                      │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log(context.content[0].text);
  console.log();

  await sleep(500);

  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ LLM NOW KNOWS:                                          │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log('│ ✓ Must use UUIDs for IDs                                │');
  console.log('│ ✓ Must use async/await                                  │');
  console.log('│ ✓ Must include timestamps in responses                  │');
  console.log('│ ✓ Should use Prisma ORM                                 │');
  console.log('│ ✓ Should use early returns                              │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log();

  await sleep(1000);

  // ==================== SCENARIO 2 ====================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SCENARIO 2: LLM makes a decision');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n> LLM decides to add soft delete to Product model\n');
  await sleep(300);

  console.log('LLM calls dc_memory_add({ type: "decision", content: "Products use soft delete" })...\n');

  const addResult = await client.callTool('dc_memory_add', {
    type: 'decision',
    content: 'Products use soft delete with deleted_at timestamp',
    rationale: 'Allows recovery of deleted products and maintains referential integrity'
  });

  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ DECISION SAVED:                                         │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log(addResult.content[0].text);
  console.log('\n→ This decision will be available in ALL future sessions!\n');

  await sleep(1000);

  // ==================== SCENARIO 3 ====================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SCENARIO 3: User corrects LLM');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n> User: "Don\'t use auto-increment IDs, we agreed on UUIDs!"\n');
  await sleep(300);

  console.log('LLM logs friction...\n');

  const frictionResult = await client.callTool('dc_log_friction', {
    what_failed: 'Suggested auto-increment integer IDs',
    why: 'Project requires UUIDs as per constraint',
    correction: 'Changed to use crypto.randomUUID()'
  });

  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ FRICTION LOGGED:                                        │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log(frictionResult.content[0].text);
  console.log('\n→ Related memories will be downranked. Mistake won\'t repeat!\n');

  await sleep(1000);

  // ==================== SCENARIO 4 ====================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SCENARIO 4: New developer joins');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n> New dev: "I need to add an Orders feature"\n');
  await sleep(300);

  console.log('LLM calls dc_memory_context({ task: "Add Orders feature" })...\n');

  const newContext = await client.callTool('dc_memory_context', {
    task: 'Add Orders feature with order items'
  });

  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ NEW DEVELOPER INSTANTLY KNOWS:                          │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log(newContext.content[0].text);
  console.log();

  await sleep(500);

  // ==================== FINAL STATS ====================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('FINAL: Project Knowledge Stats');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const stats = await client.callTool('dc_stats', {});
  console.log(stats.content[0].text);

  client.close();

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    PROOF COMPLETE                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║ Deep Context provides:                                   ║');
  console.log('║                                                          ║');
  console.log('║ ✓ Cross-session memory     - Decisions persist          ║');
  console.log('║ ✓ Automatic context        - LLMs know constraints      ║');
  console.log('║ ✓ Learning from mistakes   - Friction prevents repeats  ║');
  console.log('║ ✓ Team knowledge sharing   - New devs have full context ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');
}

main().catch(console.error);
