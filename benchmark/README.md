# Benchmark

Compares LLM output **with** and **without** Deep Context across 10 coding tasks.

## Run

```bash
cd benchmark
node real-benchmark.js
```

Results go to `results/`.

## Setup

The treatment group gets pre-loaded memories:

**Constraints:** UUIDs for all IDs, async/await only, timestamp in every API response

**Decisions:** PostgreSQL + Prisma, REST + JSON, JWT auth

**Heuristics:** Early returns over nested conditionals, descriptive names over comments

## Tasks

10 tasks: product model, CRUD endpoints, auth middleware, pagination, validation, search, rate limiting, soft delete, audit logging, batch import.

See `tasks.md` for details and `rubric.md` for scoring.

## Scoring

Each task scored on constraint adherence (0-10) and pattern consistency (0-10). Max 200 points total.
