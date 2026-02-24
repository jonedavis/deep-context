export interface Rule {
  id: string;
  category: string;
  title: string;
  description: string;
  examples?: string[];
}

export interface RuleSet {
  name: string;
  description: string;
  rules: Rule[];
}

/**
 * TypeScript-specific rules
 */
export const typescriptRules: RuleSet = {
  name: 'TypeScript',
  description: 'Best practices for TypeScript development',
  rules: [
    {
      id: 'ts-strict-mode',
      category: 'typescript',
      title: 'Use strict TypeScript mode',
      description: 'Always enable strict mode in tsconfig.json for better type safety. This includes strictNullChecks, strictFunctionTypes, and noImplicitAny.',
    },
    {
      id: 'ts-interfaces-over-types',
      category: 'typescript',
      title: 'Prefer interfaces over type aliases for objects',
      description: 'Use interfaces for defining object shapes as they provide better error messages and support declaration merging. Use type aliases for unions, intersections, and mapped types.',
      examples: [
        '// Good\ninterface User { name: string; email: string; }',
        '// Also good for unions\ntype Status = "pending" | "active" | "done"',
      ],
    },
    {
      id: 'ts-explicit-return-types',
      category: 'typescript',
      title: 'Use explicit return types for public APIs',
      description: 'Add explicit return types to exported functions and methods. This improves code documentation and catches accidental return type changes.',
      examples: [
        'export function getUser(id: string): Promise<User> { ... }',
      ],
    },
    {
      id: 'ts-avoid-any',
      category: 'typescript',
      title: 'Avoid using any type',
      description: 'Never use the any type. Use unknown for truly unknown types and narrow with type guards. Use generics for flexible yet type-safe code.',
      examples: [
        '// Bad: any\nfunction parse(data: any): any',
        '// Good: unknown with narrowing\nfunction parse(data: unknown): Result',
      ],
    },
    {
      id: 'ts-const-assertions',
      category: 'typescript',
      title: 'Use const assertions for literal types',
      description: 'Use "as const" for arrays and objects that should not be widened to their base types.',
      examples: [
        'const ROLES = ["admin", "user", "guest"] as const;',
        'type Role = typeof ROLES[number]; // "admin" | "user" | "guest"',
      ],
    },
    {
      id: 'ts-discriminated-unions',
      category: 'typescript',
      title: 'Use discriminated unions for state',
      description: 'Model state with discriminated unions using a common literal property for exhaustive type checking.',
      examples: [
        'type Result<T> = { status: "success"; data: T } | { status: "error"; error: Error }',
      ],
    },
  ],
};

/**
 * React-specific rules
 */
export const reactRules: RuleSet = {
  name: 'React',
  description: 'Best practices for React development',
  rules: [
    {
      id: 'react-functional-components',
      category: 'react',
      title: 'Use functional components',
      description: 'Always use functional components with hooks. Avoid class components in new code.',
      examples: [
        '// Good\nfunction UserCard({ user }: Props) { return <div>{user.name}</div>; }',
      ],
    },
    {
      id: 'react-hooks-rules',
      category: 'react',
      title: 'Follow the Rules of Hooks',
      description: 'Only call hooks at the top level. Never call hooks inside loops, conditions, or nested functions. Always call hooks in the same order.',
    },
    {
      id: 'react-custom-hooks',
      category: 'react',
      title: 'Extract reusable logic into custom hooks',
      description: 'When component logic becomes complex or is shared, extract it into a custom hook prefixed with "use".',
      examples: [
        'function useDebounce<T>(value: T, delay: number): T { ... }',
      ],
    },
    {
      id: 'react-state-management',
      category: 'react',
      title: 'Keep state as local as possible',
      description: 'Start with local state and lift up only when needed. Use context for truly global state. Consider server state tools like React Query for API data.',
    },
    {
      id: 'react-memoization',
      category: 'react',
      title: 'Use memoization strategically',
      description: 'Use useMemo for expensive calculations and useCallback for stable function references in dependencies. Don\'t over-optimize - measure first.',
    },
    {
      id: 'react-component-structure',
      category: 'react',
      title: 'Single responsibility for components',
      description: 'Each component should do one thing well. Extract sub-components when a component grows beyond ~150 lines or has distinct sections.',
    },
    {
      id: 'react-prop-types',
      category: 'react',
      title: 'Use TypeScript interfaces for props',
      description: 'Define explicit interfaces for component props. Use children?: React.ReactNode for components that accept children.',
      examples: [
        'interface ButtonProps {\n  variant: "primary" | "secondary";\n  onClick: () => void;\n  children: React.ReactNode;\n}',
      ],
    },
    {
      id: 'react-controlled-components',
      category: 'react',
      title: 'Prefer controlled form components',
      description: 'Use controlled components where React state is the single source of truth for form data. Use uncontrolled only for file inputs or integration with non-React code.',
    },
  ],
};

/**
 * Node.js API-specific rules
 */
export const nodeApiRules: RuleSet = {
  name: 'Node.js API',
  description: 'Best practices for Node.js backend development',
  rules: [
    {
      id: 'node-async-await',
      category: 'node-api',
      title: 'Use async/await consistently',
      description: 'Always use async/await over raw Promises for readability. Never mix callbacks with Promises.',
      examples: [
        '// Good\nconst data = await fetchUser(id);',
        '// Avoid\nfetchUser(id).then(data => { ... });',
      ],
    },
    {
      id: 'node-error-handling',
      category: 'node-api',
      title: 'Centralized error handling',
      description: 'Use a centralized error handler middleware. Create custom error classes for different error types. Always include appropriate status codes.',
      examples: [
        'class NotFoundError extends AppError {\n  constructor(resource: string) {\n    super(`${resource} not found`, 404);\n  }\n}',
      ],
    },
    {
      id: 'node-validation',
      category: 'node-api',
      title: 'Validate all inputs at the boundary',
      description: 'Validate request bodies, query params, and path params at the API layer using Zod, Joi, or similar. Never trust user input.',
      examples: [
        'const CreateUserSchema = z.object({\n  email: z.string().email(),\n  name: z.string().min(1),\n});',
      ],
    },
    {
      id: 'node-env-config',
      category: 'node-api',
      title: 'Use environment variables for configuration',
      description: 'Never hardcode secrets or environment-specific values. Load from environment variables with validation at startup.',
    },
    {
      id: 'node-structured-logging',
      category: 'node-api',
      title: 'Use structured logging',
      description: 'Log in JSON format with consistent fields (timestamp, level, message, context). Include request IDs for traceability.',
    },
    {
      id: 'node-graceful-shutdown',
      category: 'node-api',
      title: 'Handle graceful shutdown',
      description: 'Implement graceful shutdown handling for SIGTERM/SIGINT. Close database connections, finish in-flight requests, and cleanup resources.',
    },
    {
      id: 'node-rate-limiting',
      category: 'node-api',
      title: 'Implement rate limiting',
      description: 'Add rate limiting to public APIs to prevent abuse. Use different limits for authenticated vs anonymous requests.',
    },
    {
      id: 'node-security-headers',
      category: 'node-api',
      title: 'Set security headers',
      description: 'Use helmet or similar middleware to set security headers. Enable CORS only for allowed origins.',
    },
  ],
};

/**
 * Python-specific rules
 */
export const pythonRules: RuleSet = {
  name: 'Python',
  description: 'Best practices for Python development',
  rules: [
    {
      id: 'python-type-hints',
      category: 'python',
      title: 'Use type hints consistently',
      description: 'Add type hints to all function parameters and return values. Use typing module for complex types like Optional, Union, List.',
      examples: [
        'def get_user(user_id: int) -> Optional[User]:\n    ...',
        'def process_items(items: List[Item]) -> Dict[str, int]:\n    ...',
      ],
    },
    {
      id: 'python-docstrings',
      category: 'python',
      title: 'Write comprehensive docstrings',
      description: 'Add docstrings to all public functions, classes, and modules. Use Google, NumPy, or Sphinx style consistently.',
      examples: [
        '"""Get user by ID.\n\nArgs:\n    user_id: The unique identifier for the user.\n\nReturns:\n    The User object if found, None otherwise.\n\nRaises:\n    DatabaseError: If the database connection fails.\n"""',
      ],
    },
    {
      id: 'python-context-managers',
      category: 'python',
      title: 'Use context managers for resources',
      description: 'Always use context managers (with statement) for files, database connections, locks, and other resources that need cleanup.',
      examples: [
        'with open("file.txt", "r") as f:\n    content = f.read()',
      ],
    },
    {
      id: 'python-dataclasses',
      category: 'python',
      title: 'Use dataclasses or Pydantic for data structures',
      description: 'Prefer dataclasses or Pydantic models over plain dictionaries for structured data. This provides type safety and IDE support.',
      examples: [
        '@dataclass\nclass User:\n    id: int\n    name: str\n    email: str',
      ],
    },
    {
      id: 'python-virtual-envs',
      category: 'python',
      title: 'Always use virtual environments',
      description: 'Use venv, virtualenv, or poetry for project isolation. Never install packages globally for project dependencies.',
    },
    {
      id: 'python-list-comprehensions',
      category: 'python',
      title: 'Use list comprehensions appropriately',
      description: 'Use list comprehensions for simple transformations. For complex logic or side effects, use explicit loops.',
      examples: [
        '# Good for simple cases\nnames = [user.name for user in users if user.active]',
      ],
    },
    {
      id: 'python-exceptions',
      category: 'python',
      title: 'Be specific with exceptions',
      description: 'Catch specific exceptions, not bare except. Create custom exception classes for domain-specific errors.',
      examples: [
        '# Bad\nexcept:\n    pass\n\n# Good\nexcept ValueError as e:\n    logger.error(f"Invalid value: {e}")',
      ],
    },
    {
      id: 'python-f-strings',
      category: 'python',
      title: 'Use f-strings for string formatting',
      description: 'Prefer f-strings over .format() or % formatting for readability and performance.',
      examples: [
        'message = f"Hello, {user.name}! You have {count} notifications."',
      ],
    },
  ],
};

/**
 * Go-specific rules
 */
export const goRules: RuleSet = {
  name: 'Go',
  description: 'Best practices for Go development',
  rules: [
    {
      id: 'go-error-handling',
      category: 'go',
      title: 'Handle errors explicitly',
      description: 'Always check and handle errors. Never use _ to ignore errors unless intentional and documented. Wrap errors with context.',
      examples: [
        'if err != nil {\n    return fmt.Errorf("failed to get user: %w", err)\n}',
      ],
    },
    {
      id: 'go-interfaces',
      category: 'go',
      title: 'Accept interfaces, return structs',
      description: 'Functions should accept interface parameters for flexibility but return concrete types for clarity.',
      examples: [
        'func NewService(repo Repository) *Service { ... }',
      ],
    },
    {
      id: 'go-small-interfaces',
      category: 'go',
      title: 'Keep interfaces small',
      description: 'Define small, focused interfaces with 1-3 methods. Larger interfaces should be compositions of smaller ones.',
      examples: [
        'type Reader interface { Read(p []byte) (n int, err error) }',
      ],
    },
    {
      id: 'go-context',
      category: 'go',
      title: 'Use context for cancellation and values',
      description: 'Pass context.Context as the first parameter to functions that may block. Use it for cancellation, deadlines, and request-scoped values.',
    },
    {
      id: 'go-goroutine-management',
      category: 'go',
      title: 'Manage goroutines carefully',
      description: 'Always have a clear owner for each goroutine. Use sync.WaitGroup or channels for coordination. Avoid goroutine leaks.',
    },
    {
      id: 'go-defer',
      category: 'go',
      title: 'Use defer for cleanup',
      description: 'Use defer immediately after acquiring a resource to ensure cleanup. Be aware of defer in loops.',
      examples: [
        'f, err := os.Open(name)\nif err != nil { return err }\ndefer f.Close()',
      ],
    },
    {
      id: 'go-naming',
      category: 'go',
      title: 'Follow Go naming conventions',
      description: 'Use MixedCaps for exported names, mixedCaps for unexported. Keep names short but descriptive. Avoid stuttering (user.UserName -> user.Name).',
    },
    {
      id: 'go-package-design',
      category: 'go',
      title: 'Design packages by responsibility',
      description: 'Organize packages by what they do, not what they contain. Avoid circular dependencies. Keep internal packages truly internal.',
    },
  ],
};

/**
 * Next.js-specific rules
 */
export const nextjsRules: RuleSet = {
  name: 'Next.js',
  description: 'Best practices for Next.js development',
  rules: [
    {
      id: 'nextjs-app-router',
      category: 'nextjs',
      title: 'Use App Router conventions',
      description: 'Follow the App Router file conventions: page.tsx for routes, layout.tsx for layouts, loading.tsx for loading states, error.tsx for error boundaries.',
    },
    {
      id: 'nextjs-server-components',
      category: 'nextjs',
      title: 'Default to Server Components',
      description: 'Start with Server Components (no "use client"). Only add "use client" when you need interactivity, hooks, or browser APIs.',
    },
    {
      id: 'nextjs-data-fetching',
      category: 'nextjs',
      title: 'Fetch data in Server Components',
      description: 'Fetch data directly in Server Components using async/await. Use React cache() for request deduplication. Avoid useEffect for data fetching.',
    },
    {
      id: 'nextjs-streaming',
      category: 'nextjs',
      title: 'Use Suspense for streaming',
      description: 'Wrap slow components in Suspense with appropriate loading fallbacks. This enables streaming SSR and better UX.',
    },
    {
      id: 'nextjs-metadata',
      category: 'nextjs',
      title: 'Define metadata for SEO',
      description: 'Export metadata object or generateMetadata function from pages and layouts for proper SEO.',
      examples: [
        'export const metadata: Metadata = {\n  title: "My Page",\n  description: "Page description",\n};',
      ],
    },
    {
      id: 'nextjs-route-handlers',
      category: 'nextjs',
      title: 'Use Route Handlers for API endpoints',
      description: 'Create API routes using route.ts files with named exports for HTTP methods (GET, POST, etc.).',
    },
  ],
};

/**
 * Vue-specific rules
 */
export const vueRules: RuleSet = {
  name: 'Vue',
  description: 'Best practices for Vue.js development',
  rules: [
    {
      id: 'vue-composition-api',
      category: 'vue',
      title: 'Use Composition API with script setup',
      description: 'Prefer <script setup> with Composition API for new components. It provides better TypeScript integration and cleaner code.',
      examples: [
        '<script setup lang="ts">\nconst count = ref(0)\n</script>',
      ],
    },
    {
      id: 'vue-composables',
      category: 'vue',
      title: 'Extract reusable logic into composables',
      description: 'Create composables (use* functions) for reusable reactive logic. Similar to React hooks but for Vue.',
      examples: [
        'function useCounter() {\n  const count = ref(0)\n  const increment = () => count.value++\n  return { count, increment }\n}',
      ],
    },
    {
      id: 'vue-props-emit',
      category: 'vue',
      title: 'Define typed props and emits',
      description: 'Use defineProps and defineEmits with TypeScript for type-safe component interfaces.',
      examples: [
        "const props = defineProps<{ title: string; count?: number }>()\nconst emit = defineEmits<{ update: [value: number] }>()",
      ],
    },
    {
      id: 'vue-v-for-key',
      category: 'vue',
      title: 'Always use key with v-for',
      description: 'Provide a unique key prop when using v-for. Never use index as key for lists that can be reordered.',
    },
  ],
};

export const allRuleSets: Record<string, RuleSet> = {
  typescript: typescriptRules,
  react: reactRules,
  'node-api': nodeApiRules,
  python: pythonRules,
  go: goRules,
  nextjs: nextjsRules,
  vue: vueRules,
};

export function getRuleSet(name: string): RuleSet | undefined {
  return allRuleSets[name];
}

export function getRulesFromSets(setNames: string[]): Rule[] {
  const rules: Rule[] = [];
  for (const name of setNames) {
    const ruleSet = allRuleSets[name];
    if (ruleSet) {
      rules.push(...ruleSet.rules);
    }
  }
  return rules;
}
