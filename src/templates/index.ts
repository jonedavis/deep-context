import { DetectionResult, getPrimaryProjectType } from '../detection/detector.js';
import { Rule, getRulesFromSets } from './rules.js';

export interface TemplateChoice {
  id: string;
  question: string;
  options: {
    value: string;
    label: string;
    description?: string;
    rules?: Rule[];
  }[];
  default: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  baseRules: string[];
  additionalRuleSets?: string[];
  choices?: TemplateChoice[];
  customRules?: Rule[];
}

export const typescriptTemplate: Template = {
  id: 'typescript',
  name: 'TypeScript Project',
  description: 'A general TypeScript project with strict typing',
  baseRules: ['typescript'],
  choices: [
    {
      id: 'runtime',
      question: 'What runtime are you targeting?',
      options: [
        { value: 'node', label: 'Node.js', description: 'Server-side Node.js application' },
        { value: 'browser', label: 'Browser', description: 'Browser-based application' },
        { value: 'both', label: 'Both', description: 'Universal/isomorphic code' },
      ],
      default: 'node',
    },
    {
      id: 'testing',
      question: 'Which testing approach do you prefer?',
      options: [
        { value: 'vitest', label: 'Vitest', description: 'Fast, Vite-native testing' },
        { value: 'jest', label: 'Jest', description: 'Popular, feature-rich testing framework' },
        { value: 'none', label: 'None', description: 'No testing preferences' },
      ],
      default: 'vitest',
    },
  ],
};

export const reactTemplate: Template = {
  id: 'react',
  name: 'React Application',
  description: 'A React application with modern best practices',
  baseRules: ['typescript', 'react'],
  choices: [
    {
      id: 'styling',
      question: 'What styling approach do you use?',
      options: [
        { value: 'tailwind', label: 'Tailwind CSS', description: 'Utility-first CSS' },
        { value: 'css-modules', label: 'CSS Modules', description: 'Scoped CSS files' },
        { value: 'styled-components', label: 'Styled Components', description: 'CSS-in-JS' },
        { value: 'css', label: 'Plain CSS', description: 'Traditional CSS files' },
      ],
      default: 'tailwind',
    },
    {
      id: 'state',
      question: 'How do you manage global state?',
      options: [
        { value: 'context', label: 'React Context', description: 'Built-in React context' },
        { value: 'zustand', label: 'Zustand', description: 'Simple, fast state management' },
        { value: 'redux', label: 'Redux Toolkit', description: 'Predictable state container' },
        { value: 'none', label: 'None/Local only', description: 'No global state management' },
      ],
      default: 'context',
    },
    {
      id: 'data-fetching',
      question: 'How do you handle data fetching?',
      options: [
        { value: 'tanstack-query', label: 'TanStack Query', description: 'Powerful async state management' },
        { value: 'swr', label: 'SWR', description: 'React Hooks for data fetching' },
        { value: 'fetch', label: 'Native fetch', description: 'Built-in fetch with custom hooks' },
      ],
      default: 'tanstack-query',
    },
  ],
  customRules: [
    {
      id: 'react-folder-structure',
      category: 'project-structure',
      title: 'Organize components by feature',
      description: 'Group related components, hooks, and utilities by feature/domain rather than by type. Use a components/ folder for shared UI components.',
    },
  ],
};

export const nextjsTemplate: Template = {
  id: 'nextjs',
  name: 'Next.js Application',
  description: 'A full-stack Next.js application with App Router',
  baseRules: ['typescript', 'react', 'nextjs'],
  choices: [
    {
      id: 'database',
      question: 'What database/ORM do you use?',
      options: [
        { value: 'prisma', label: 'Prisma', description: 'Type-safe database ORM' },
        { value: 'drizzle', label: 'Drizzle', description: 'Lightweight TypeScript ORM' },
        { value: 'none', label: 'None', description: 'No database or external service' },
      ],
      default: 'prisma',
    },
    {
      id: 'auth',
      question: 'How do you handle authentication?',
      options: [
        { value: 'next-auth', label: 'NextAuth.js', description: 'Authentication for Next.js' },
        { value: 'clerk', label: 'Clerk', description: 'Complete user management' },
        { value: 'custom', label: 'Custom', description: 'Custom authentication solution' },
        { value: 'none', label: 'None', description: 'No authentication needed' },
      ],
      default: 'next-auth',
    },
  ],
  customRules: [
    {
      id: 'nextjs-colocation',
      category: 'project-structure',
      title: 'Colocate related files',
      description: 'Keep page-specific components, actions, and utilities in the same directory as the page. Use app/_components for shared components.',
    },
    {
      id: 'nextjs-server-actions',
      category: 'nextjs',
      title: 'Use Server Actions for mutations',
      description: 'Prefer Server Actions over API routes for form submissions and data mutations. Mark them with "use server".',
    },
  ],
};

export const nodeApiTemplate: Template = {
  id: 'node-api',
  name: 'Node.js API',
  description: 'A Node.js backend API service',
  baseRules: ['typescript', 'node-api'],
  choices: [
    {
      id: 'framework',
      question: 'Which web framework are you using?',
      options: [
        { value: 'express', label: 'Express', description: 'Minimal and flexible' },
        { value: 'fastify', label: 'Fastify', description: 'Fast and low overhead' },
        { value: 'hono', label: 'Hono', description: 'Ultrafast, built on Web Standards' },
        { value: 'nestjs', label: 'NestJS', description: 'Enterprise-grade framework' },
      ],
      default: 'express',
    },
    {
      id: 'database',
      question: 'What database approach do you use?',
      options: [
        { value: 'prisma', label: 'Prisma', description: 'Type-safe database ORM' },
        { value: 'drizzle', label: 'Drizzle', description: 'Lightweight TypeScript ORM' },
        { value: 'raw-sql', label: 'Raw SQL', description: 'Direct database queries' },
        { value: 'mongoose', label: 'Mongoose', description: 'MongoDB object modeling' },
      ],
      default: 'prisma',
    },
    {
      id: 'validation',
      question: 'How do you validate input?',
      options: [
        { value: 'zod', label: 'Zod', description: 'TypeScript-first schema validation' },
        { value: 'joi', label: 'Joi', description: 'Schema description language' },
        { value: 'class-validator', label: 'class-validator', description: 'Decorator-based validation' },
      ],
      default: 'zod',
    },
  ],
  customRules: [
    {
      id: 'api-versioning',
      category: 'node-api',
      title: 'Version your API',
      description: 'Include version in API paths (e.g., /api/v1/). Plan for backwards compatibility.',
    },
    {
      id: 'api-documentation',
      category: 'node-api',
      title: 'Document API endpoints',
      description: 'Use OpenAPI/Swagger for API documentation. Keep documentation in sync with implementation.',
    },
  ],
};

export const pythonTemplate: Template = {
  id: 'python',
  name: 'Python Project',
  description: 'A Python project with modern tooling',
  baseRules: ['python'],
  choices: [
    {
      id: 'project-type',
      question: 'What type of Python project is this?',
      options: [
        { value: 'api', label: 'Web API', description: 'REST or GraphQL API' },
        { value: 'cli', label: 'CLI Application', description: 'Command-line tool' },
        { value: 'library', label: 'Library/Package', description: 'Reusable Python package' },
        { value: 'data', label: 'Data/ML', description: 'Data science or machine learning' },
      ],
      default: 'api',
    },
    {
      id: 'framework',
      question: 'Which web framework (if any)?',
      options: [
        { value: 'fastapi', label: 'FastAPI', description: 'Modern, fast API framework' },
        { value: 'django', label: 'Django', description: 'Full-featured web framework' },
        { value: 'flask', label: 'Flask', description: 'Lightweight and flexible' },
        { value: 'none', label: 'None', description: 'No web framework' },
      ],
      default: 'fastapi',
    },
    {
      id: 'package-manager',
      question: 'Which package manager do you use?',
      options: [
        { value: 'poetry', label: 'Poetry', description: 'Modern dependency management' },
        { value: 'pip', label: 'pip + requirements.txt', description: 'Traditional approach' },
        { value: 'uv', label: 'uv', description: 'Fast Python package installer' },
      ],
      default: 'poetry',
    },
  ],
  customRules: [
    {
      id: 'python-async',
      category: 'python',
      title: 'Use async for I/O-bound operations',
      description: 'Use async/await for network calls, database queries, and file I/O when building APIs. Use asyncio or anyio for concurrent operations.',
    },
  ],
};

export const goTemplate: Template = {
  id: 'go',
  name: 'Go Project',
  description: 'A Go project following idiomatic patterns',
  baseRules: ['go'],
  choices: [
    {
      id: 'project-type',
      question: 'What type of Go project is this?',
      options: [
        { value: 'api', label: 'Web API', description: 'HTTP API service' },
        { value: 'cli', label: 'CLI Application', description: 'Command-line tool' },
        { value: 'library', label: 'Library', description: 'Reusable Go package' },
      ],
      default: 'api',
    },
    {
      id: 'framework',
      question: 'Which HTTP framework (if any)?',
      options: [
        { value: 'stdlib', label: 'Standard Library', description: 'net/http with chi/gorilla' },
        { value: 'gin', label: 'Gin', description: 'Fast HTTP web framework' },
        { value: 'echo', label: 'Echo', description: 'High performance, minimalist' },
        { value: 'fiber', label: 'Fiber', description: 'Express-inspired, built on fasthttp' },
      ],
      default: 'stdlib',
    },
  ],
  customRules: [
    {
      id: 'go-project-layout',
      category: 'go',
      title: 'Follow standard project layout',
      description: 'Use cmd/ for executables, internal/ for private code, pkg/ for public libraries. Keep main.go minimal.',
    },
  ],
};

export const vueTemplate: Template = {
  id: 'vue',
  name: 'Vue.js Application',
  description: 'A Vue.js application with Composition API',
  baseRules: ['typescript', 'vue'],
  choices: [
    {
      id: 'meta-framework',
      question: 'Are you using a meta-framework?',
      options: [
        { value: 'nuxt', label: 'Nuxt', description: 'Full-stack Vue framework' },
        { value: 'none', label: 'Vue only', description: 'Vanilla Vue application' },
      ],
      default: 'none',
    },
    {
      id: 'state',
      question: 'How do you manage state?',
      options: [
        { value: 'pinia', label: 'Pinia', description: 'Official Vue state management' },
        { value: 'composables', label: 'Composables only', description: 'Custom composables for state' },
      ],
      default: 'pinia',
    },
  ],
};

export const allTemplates: Record<string, Template> = {
  typescript: typescriptTemplate,
  javascript: typescriptTemplate,
  react: reactTemplate,
  nextjs: nextjsTemplate,
  'node-api': nodeApiTemplate,
  python: pythonTemplate,
  'python-api': pythonTemplate,
  go: goTemplate,
  vue: vueTemplate,
  nuxt: vueTemplate,
};

export function getTemplate(id: string): Template | undefined {
  return allTemplates[id];
}

export function getTemplateForDetection(detection: DetectionResult): Template | undefined {
  return allTemplates[getPrimaryProjectType(detection)];
}

export function getTemplateSets(template: Template): string[] {
  const sets = [...template.baseRules];
  if (template.additionalRuleSets) sets.push(...template.additionalRuleSets);
  return sets;
}

export function getTemplateRules(template: Template): Rule[] {
  const rules = getRulesFromSets(template.baseRules);
  if (template.customRules) rules.push(...template.customRules);
  return rules;
}

export function getRulesForDetection(detection: DetectionResult): Rule[] {
  const template = getTemplateForDetection(detection);
  return template ? getTemplateRules(template) : [];
}

export function generateRulesSummary(rules: Rule[]): string {
  const byCategory = new Map<string, Rule[]>();

  for (const rule of rules) {
    if (!byCategory.has(rule.category)) byCategory.set(rule.category, []);
    byCategory.get(rule.category)!.push(rule);
  }

  const lines: string[] = [];
  for (const [category, categoryRules] of byCategory) {
    lines.push(`\n${category.toUpperCase()}:`);
    for (const rule of categoryRules) lines.push(`  - ${rule.title}`);
  }

  return lines.join('\n');
}

export type { Rule, RuleSet } from './rules.js';
export { allRuleSets, getRuleSet, getRulesFromSets } from './rules.js';
