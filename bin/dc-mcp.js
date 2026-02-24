#!/usr/bin/env node

import { runMcpServer } from '../dist/mcp/index.js';

runMcpServer().catch((error) => {
  console.error('MCP Server Error:', error);
  process.exit(1);
});
