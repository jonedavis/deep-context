#!/usr/bin/env node

/**
 * Load benchmark memories into Deep Context
 *
 * This populates the DC database with test memories for the treatment group.
 *
 * Usage:
 *   cd benchmark/project
 *   dc init
 *   node ../setup-memories.js
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DC_MCP_PATH = path.resolve(__dirname, '../bin/dc-mcp.js');
const MEMORIES_PATH = path.join(__dirname, 'memories.json');

class MCPClient {
  constructor() {
    this.process = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.process = spawn('node', [DC_MCP_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.join(__dirname, 'project')
      });

      this.process.on('error', reject);
      this.process.stderr.on('data', (data) => {
        console.error('MCP stderr:', data.toString());
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

      // Initialize
      this.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'benchmark-loader', version: '1.0.0' }
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

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
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

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      LOADING BENCHMARK MEMORIES INTO DEEP CONTEXT        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Check if DC is initialized in project
  const dcPath = path.join(__dirname, 'project', '.dc');
  if (!fs.existsSync(dcPath)) {
    console.log('Initializing Deep Context in benchmark/project...');
    const { execSync } = await import('child_process');
    execSync('node ../../bin/dc.js init', {
      cwd: path.join(__dirname, 'project'),
      stdio: 'inherit'
    });
  }

  // Load memories
  const { memories } = JSON.parse(fs.readFileSync(MEMORIES_PATH, 'utf-8'));

  console.log(`Loading ${memories.length} memories...\n`);

  const client = new MCPClient();
  await client.connect();

  for (const memory of memories) {
    try {
      const result = await client.callTool('dc_memory_add', {
        type: memory.type,
        content: memory.content,
        rationale: memory.rationale
      });

      console.log(`✓ Added ${memory.type}: "${memory.content.slice(0, 50)}..."`);
    } catch (error) {
      console.error(`✗ Failed to add ${memory.type}: ${error.message}`);
    }
  }

  // Show stats
  console.log('\n--- Final Stats ---');
  const stats = await client.callTool('dc_stats', {});
  console.log(stats.content[0].text);

  client.close();
  console.log('\n✓ Memories loaded successfully!');
}

main().catch(console.error);
