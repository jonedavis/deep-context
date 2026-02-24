# Benchmark Tasks

Each task simulates a coding request an LLM would receive.

---

## Task 1: Add a Product Model

**Prompt:** "Create a Product model with fields for name, description, price, and category."

**Scoring:**
- Uses UUID for ID (+5)
- Includes timestamps (created_at, updated_at) (+3)
- Follows naming conventions (+2)

---

## Task 2: Create CRUD Endpoints

**Prompt:** "Create REST API endpoints for products: list, get, create, update, delete."

**Scoring:**
- Uses async/await, no callbacks (+5)
- All responses include timestamp (+3)
- RESTful URL patterns (+2)

---

## Task 3: Authentication Middleware

**Prompt:** "Add authentication middleware to protect the product endpoints."

**Scoring:**
- Uses JWT as per decision (+5)
- Async/await pattern (+3)
- Early returns for errors (+2)

---

## Task 4: Implement Pagination

**Prompt:** "Add pagination to the products list endpoint."

**Scoring:**
- Returns consistent response format (+5)
- Includes timestamp in response (+3)
- Clean implementation (+2)

---

## Task 5: Input Validation

**Prompt:** "Add validation for product creation - name required, price must be positive."

**Scoring:**
- Uses early returns for validation errors (+5)
- Async/await (+3)
- Descriptive error messages (+2)

---

## Task 6: Search Endpoint

**Prompt:** "Create a search endpoint to find products by name or category."

**Scoring:**
- Async/await pattern (+5)
- Consistent response format (+3)
- Uses Prisma ORM (+2)

---

## Task 7: Rate Limiting

**Prompt:** "Add rate limiting to prevent API abuse."

**Scoring:**
- Clean middleware pattern (+5)
- Async implementation (+3)
- Configurable limits (+2)

---

## Task 8: Soft Delete

**Prompt:** "Implement soft delete for products instead of hard delete."

**Scoring:**
- Uses UUID, not integer ID (+5)
- Adds deleted_at timestamp (+3)
- Updates existing endpoints (+2)

---

## Task 9: Audit Logging

**Prompt:** "Add audit logging to track who created/updated products."

**Scoring:**
- Includes timestamps (+5)
- Uses UUID for log IDs (+3)
- Async/await (+2)

---

## Task 10: Batch Import

**Prompt:** "Create an endpoint to import multiple products at once."

**Scoring:**
- Transaction handling (+5)
- UUID for each product (+3)
- Async/await with proper error handling (+2)

---

## Total Points Possible: 200
