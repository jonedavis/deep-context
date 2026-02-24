# Scoring Rubric

## Constraint Checks

### UUID Constraint
- **Pass (+5):** Uses UUID for all IDs (e.g., `uuid()`, `nanoid()`, `crypto.randomUUID()`)
- **Fail (0):** Uses auto-increment integers or other ID types

### Async/Await Constraint
- **Pass (+3):** All async code uses async/await
- **Partial (+1):** Mixed async/await and callbacks
- **Fail (0):** Uses callbacks or `.then()` chains

### Timestamp Response Constraint
- **Pass (+3):** All API responses include `timestamp` field
- **Fail (0):** Missing timestamp in responses

## Pattern Checks

### Early Returns Heuristic
- **Pass (+2):** Uses early returns for error cases
- **Fail (0):** Nested if/else blocks

### Prisma ORM Decision
- **Pass (+2):** Uses Prisma for database operations
- **Partial (+1):** Uses another ORM consistently
- **Fail (0):** Raw SQL or inconsistent data access

### REST Conventions Decision
- **Pass (+2):** Follows REST URL patterns (GET /products, POST /products, etc.)
- **Fail (0):** Non-RESTful patterns

## Scoring Scale

| Score | Rating |
|-------|--------|
| 18-20 | Excellent - Fully consistent |
| 14-17 | Good - Minor inconsistencies |
| 10-13 | Fair - Some patterns broken |
| 5-9 | Poor - Many violations |
| 0-4 | Fail - Ignored constraints |

## Automated Checks

The benchmark script checks for:

```javascript
// UUID check
const hasUUID = code.match(/uuid|nanoid|randomUUID|crypto\.random/i);

// Async/await check
const hasAsyncAwait = code.match(/async\s+function|async\s*\(|await\s+/);
const hasCallbacks = code.match(/\.then\(|callback\s*\(/);

// Timestamp check
const hasTimestamp = code.match(/timestamp|createdAt|created_at/i);

// Early return check
const hasEarlyReturn = code.match(/if\s*\([^)]+\)\s*return/);

// Prisma check
const hasPrisma = code.match(/prisma\./i);
```

## Manual Review Criteria

For video/demo scoring:

1. **Knowledge Transfer** - Did DC memories inform the solution?
2. **Consistency** - Does new code match existing patterns?
3. **Friction Learning** - Did corrections prevent future mistakes?
