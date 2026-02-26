# Validation Middleware Migration — Implementation Instructions

## Objective

Migrate all remaining Lambda functions from manual validation (helper functions + inline checks) to the centralized **Middy + Zod middleware** pattern already established in `create-account` and `deposit`.

**Branch:** `request-validation`

---

## Reference: The Target Pattern

Every migrated function follows this exact structure. Use `functions/deposit/app.ts` as the canonical reference:

```typescript
import middy from '/opt/nodejs/node_modules/@middy/core/index.js'
import { validationMiddleware } from '/opt/nodejs/shared/middleware/validation.js'
import { someSchema, SomeBody, accountIdSchema, AccountIdPathParam } from '/opt/nodejs/shared/schemas/index.js'

// 1. Custom event type extends APIGatewayProxyEvent with validated fields
type SomeEvent = APIGatewayProxyEvent & {
  validatedBody: SomeBody
  validatedParams: AccountIdPathParam
}

// 2. Handler receives typed event — no manual parsing or validation
const baseHandler = async (event: SomeEvent): Promise<APIGatewayProxyResult> => {
  // Access validated data directly:
  const { field } = event.validatedBody
  const { accountId } = event.validatedParams
  // ... business logic ...
}

// 3. Middy wraps handler with validation middleware
export const handler = middy(baseHandler).use(
  validationMiddleware({
    body: someSchema,
    pathParameters: accountIdSchema
  })
)
```

---

## Task 1: Add New Schemas to `layer/nodejs/shared/schemas/index.ts`

Add these **after** the existing field schemas and **before** the path params section:

### New field schemas:

```typescript
const email = z.string()
  .min(1, { message: 'Email is required' })
  .email({ message: 'Invalid email format' })

const password = z.string()
  .min(1, { message: 'Password is required' })
  .min(8, { message: 'Password must be at least 8 characters' })

const toAccountId = z.string()
  .min(1, { message: 'Destination account ID is required' })

const refreshToken = z.string()
  .min(1, { message: 'Refresh token is required' })
```

### New body schemas (add after the existing body schemas section):

```typescript
export const loginSchema = z.object({ email, password })
export const registerSchema = z.object({ email, password })
export const transferSchema = z.object({ toAccountId, amount })
export const withdrawSchema = z.object({ amount })
export const refreshTokenSchema = z.object({ refreshToken })
```

### New inferred types (add after the existing types section):

```typescript
export type LoginBody = z.infer<typeof loginSchema>
export type RegisterBody = z.infer<typeof registerSchema>
export type TransferBody = z.infer<typeof transferSchema>
export type WithdrawBody = z.infer<typeof withdrawSchema>
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>
```

---

## Task 2: Migrate Each Function

For every function below, apply these steps:

1. Add imports: `middy`, `validationMiddleware`, and the appropriate schema/types from `schemas/index.js`
2. Define a custom event type with `validatedBody` and/or `validatedParams`
3. Rename `export const handler` to `const baseHandler`
4. Replace manual `JSON.parse(event.body)` with `event.validatedBody`
5. Replace manual `event.pathParameters?.accountId` with `event.validatedParams.accountId`
6. Remove manual body null checks (`if (!event.body) throw ...`)
7. Remove manual field null checks that are now handled by schemas
8. Remove old validator imports (`validateEmail`, `validatePassword`, `validateAmount`, `validateAccountId`)
9. Remove `ValidationError` import if no longer used in that handler
10. Export `handler = middy(baseHandler).use(validationMiddleware({...}))`
11. **DO NOT** move business logic validations (insufficient funds, same-account check, etc.) into the middleware — those stay in the handler

---

### 2a. `functions/withdraw/app.ts`

**Schemas:** `withdrawSchema` (body) + `accountIdSchema` (path)
**Type:** `WithdrawEvent = APIGatewayProxyEvent & { validatedBody: WithdrawBody; validatedParams: AccountIdPathParam }`

**Remove:**
- `import { validateAmount } from '/opt/nodejs/shared/utils/validators.js'`
- `import { ValidationError } from ...` (only if no other usage — check: `Insufficient funds` still throws `ValidationError`, so **keep the import**)
- Manual `if (!event.body)` check (line 15-17)
- Manual `JSON.parse(event.body)` (line 18)
- Manual `if (!accountId)` check (lines 22-24)
- `validateAmount(amount)` call (line 26)

**Keep unchanged:**
- `Insufficient funds` check (line 36-38) — this is business logic, stays in handler

**Result shape:**
```typescript
export const handler = middy(baseHandler).use(
  validationMiddleware({
    body: withdrawSchema,
    pathParameters: accountIdSchema
  })
)
```

---

### 2b. `functions/transfer/app.ts`

**Schemas:** `transferSchema` (body) + `accountIdSchema` (path)
**Type:** `TransferEvent = APIGatewayProxyEvent & { validatedBody: TransferBody; validatedParams: AccountIdPathParam }`

**Remove:**
- `import { validateAmount, validateAccountId } from '/opt/nodejs/shared/utils/validators.js'`
- `import { ValidationError } from ...` (check: `Cannot transfer to the same account` and `Insufficient funds` still throw `ValidationError`, so **keep the import**)
- Manual `if (!event.body)` check (lines 14-16)
- Manual `JSON.parse(event.body)` (line 18)
- Manual `if (!accountId)` check (lines 22-24)
- `validateAccountId(toAccountId)` call (line 26)
- `validateAmount(amount)` call (line 27)

**Keep unchanged:**
- `accountId === toAccountId` check (line 29-31) — business logic
- `Insufficient funds` check (lines 53-56) — business logic

**Result shape:**
```typescript
export const handler = middy(baseHandler).use(
  validationMiddleware({
    body: transferSchema,
    pathParameters: accountIdSchema
  })
)
```

---

### 2c. `functions/login/app.ts`

**Schemas:** `loginSchema` (body only, no path params)
**Type:** `LoginEvent = APIGatewayProxyEvent & { validatedBody: LoginBody }`

**Remove:**
- `import { validateEmail, validatePassword } from '/opt/nodejs/shared/utils/validators.js'`
- `import { ValidationError } from ...` (no remaining usages — **remove**)
- Manual `if (!event.body)` check (lines 14-16)
- Manual `JSON.parse(event.body)` (line 18)
- `validateEmail(email)` call (line 21)
- `validatePassword(password)` call (line 22)

**Result shape:**
```typescript
export const handler = middy(baseHandler).use(
  validationMiddleware({
    body: loginSchema
  })
)
```

---

### 2d. `functions/register/app.ts`

**Schemas:** `registerSchema` (body only)
**Type:** `RegisterEvent = APIGatewayProxyEvent & { validatedBody: RegisterBody }`

**Remove:**
- `import { validateEmail, validatePassword } from '/opt/nodejs/shared/utils/validators.js'`
- `import { ValidationError } from ...` (no remaining usages — **remove**)
- Manual `if (!event.body)` check (lines 13-15)
- Manual `JSON.parse(event.body)` (line 16)
- `validateEmail(email)` call (line 19)
- `validatePassword(password)` call (line 20)

**Result shape:**
```typescript
export const handler = middy(baseHandler).use(
  validationMiddleware({
    body: registerSchema
  })
)
```

---

### 2e. `functions/get-balance/app.ts`

**Schemas:** `accountIdSchema` (path params only, no body)
**Type:** `GetBalanceEvent = APIGatewayProxyEvent & { validatedParams: AccountIdPathParam }`

**Remove:**
- `import { ValidationError } from ...` — **remove** (no remaining usages)
- Manual `const accountId = event.pathParameters?.accountId` (line 12)
- Manual `if (!accountId)` check (lines 14-16)

**Replace with:** `const { accountId } = event.validatedParams`

**Result shape:**
```typescript
export const handler = middy(baseHandler).use(
  validationMiddleware({
    pathParameters: accountIdSchema
  })
)
```

---

### 2f. `functions/get-transactions/app.ts`

**Schemas:** `accountIdSchema` (path params only)
**Type:** `GetTransactionsEvent = APIGatewayProxyEvent & { validatedParams: AccountIdPathParam }`

**Remove:**
- `import { ValidationError } from ...` — **remove**
- Manual `const accountId = event.pathParameters?.accountId` (line 13)
- Manual `if (!accountId)` check (lines 15-17)

**Replace with:** `const { accountId } = event.validatedParams`

**Result shape:**
```typescript
export const handler = middy(baseHandler).use(
  validationMiddleware({
    pathParameters: accountIdSchema
  })
)
```

---

### 2g. `functions/get-account/app.ts`

**Schemas:** `accountIdSchema` (path params only)
**Type:** `GetAccountEvent = APIGatewayProxyEvent & { validatedParams: AccountIdPathParam }`

**Remove:**
- `import { ValidationError } from ...` — **remove**
- Manual `const accountId = event.pathParameters?.accountId` (line 12)
- Manual `if (!accountId)` check (lines 14-16)

**Replace with:** `const { accountId } = event.validatedParams`

**Result shape:**
```typescript
export const handler = middy(baseHandler).use(
  validationMiddleware({
    pathParameters: accountIdSchema
  })
)
```

---

### 2h. `functions/refresh/app.ts`

**Schemas:** `refreshTokenSchema` (body only)
**Type:** `RefreshEvent = APIGatewayProxyEvent & { validatedBody: RefreshTokenBody }`

**Remove:**
- `import { ValidationError } from ...` — **remove**
- Manual `if (!event.body)` check (lines 11-13)
- Manual `JSON.parse(event.body)` (line 15)
- Manual `if (!refreshToken)` check (lines 18-20)

**Replace with:** `const { refreshToken } = event.validatedBody`

**Result shape:**
```typescript
export const handler = middy(baseHandler).use(
  validationMiddleware({
    body: refreshTokenSchema
  })
)
```

---

## Task 3: Skip These Functions (No Changes Needed)

These functions have **no request body or path parameters** to validate — only JWT verification:

- **`functions/list-accounts/app.ts`** — no input validation
- **`functions/logout/app.ts`** — no input validation

Do NOT wrap these in middy. Leave them as-is.

---

## Task 4: Delete Old Validators

**File:** `layer/nodejs/shared/utils/validators.ts`

After ALL function migrations are complete, **delete this file entirely**.

Before deleting, verify no remaining imports exist by searching for `validators.js` across all function files. There should be zero results.

---

## Implementation Order

1. Schemas first (Task 1)
2. Functions with body + path params: `withdraw`, `transfer` (Tasks 2a, 2b)
3. Functions with body only: `login`, `register`, `refresh` (Tasks 2c, 2d, 2h)
4. Functions with path params only: `get-balance`, `get-transactions`, `get-account` (Tasks 2e, 2f, 2g)
5. Delete validators.ts (Task 4)

---

## Verification

1. **Build:** `npm run build` — compiles TypeScript to `dist/`. Must complete with zero errors.
2. **Deploy:** `serverless deploy --stage dev` — deploys all functions to AWS.
3. **Integration tests:** Run the existing 26-test suite against the deployed API:
   ```bash
   node test-api.mjs https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev
   ```
   The suite (`test-api.mjs`) covers happy path (13 tests), security/ownership (7 tests), and validation (6 tests). All 26 must pass.
4. **Cleanup grep:** After all migrations, search for `validators.js` across `functions/` — should return zero matches before deleting the old validators file.
