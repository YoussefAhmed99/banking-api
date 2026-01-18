# Banking API - RBAC Upgrade Implementation Plan

## Project Context

**Current Branch:** `rbac-upgrade`  
**Base Branch:** `main` (contains working v1 with 5 endpoints)  
**Development Environment:** Windows, Node.js 20.11.0, Docker Desktop, AWS SAM CLI, VSCode  
**Local Testing Setup:** Docker network `lambda-local`, DynamoDB Local on port 8000, SAM local API on port 3000

**Learning Methodology:** Build features → encounter real problems → understand theory in context → apply solutions

---

## Current State (What Exists)

### Existing Infrastructure (template.yaml)
- 2 DynamoDB tables: `accounts` (PK: accountId), `transactions` (PK: accountId, SK: timestamp)
- 5 Lambda functions with API Gateway endpoints
- All functions use Node.js 24.x, ES modules (type: "module")
- Environment variables: ACCOUNTS_TABLE, TRANSACTIONS_TABLE, AWS_SAM_LOCAL

### Existing Endpoints
```
POST   /accounts                        → functions/create-account/app.js
GET    /accounts/{accountId}            → functions/get-account/app.js
POST   /accounts/{accountId}/deposit    → functions/deposit/app.js
POST   /accounts/{accountId}/withdraw   → functions/withdraw/app.js
GET    /accounts/{accountId}/transactions → functions/get-transactions/app.js
```

### Current Code Patterns (To Be Refactored)
**Pattern 1:** Every function has duplicate DynamoDB client setup:
```javascript
const client = new DynamoDBClient({
  ...(process.env.AWS_SAM_LOCAL === 'true' && {
    endpoint: 'http://172.18.0.2:8000'
  })
})
const docClient = DynamoDBDocumentClient.from(client)
```

**Pattern 2:** Basic try-catch error handling (all errors return 500)
**Pattern 3:** Inconsistent validation (each function validates differently)
**Pattern 4:** console.error() logging only
**Pattern 5:** Manual response object construction

### Known Issues
**Race Condition:** deposit/withdraw use read-modify-write without version checking
```javascript
// Current vulnerable pattern:
const result = await docClient.send(new GetCommand(...))
const newBalance = result.Item.balance + amount  // ⚠️ Race condition
await docClient.send(new PutCommand(...))
```

**Solution (to implement in Phase 6):** DynamoDB conditional writes with version numbers

---

## Target State (What We're Building)

### New Tables
```
users:
  PK: userId (String)
  Attributes: email, passwordHash, role, createdAt, requestCount, lastRequestTime

refresh-tokens:
  PK: token (String)
  Attributes: userId, expiresAt, createdAt
```

### Updated Tables
```
accounts:
  Add: userId (String), version (Number) for optimistic locking
```

### Authentication Flow
```
Register → hash password with bcrypt → store in users table
Login → verify password → generate JWT access token (1h) + refresh token (30d)
Protected routes → verify JWT in Authorization header → extract userId/role
Refresh → validate refresh token from DB → issue new access token
Logout → delete refresh token from DB
```

### RBAC Hierarchy
```
Admin > Manager > Teller > Customer
- Customer: own accounts only
- Teller+: any account
- Manager+: reports, summaries
- Admin: user management, system config
```

### Final Endpoint Structure
```
Public:
  POST /auth/register
  POST /auth/login
  POST /auth/refresh
  POST /auth/logout

Customer (authenticated):
  GET /accounts/me
  GET /accounts/me/{id}
  GET /accounts/me/{id}/transactions?limit=20&lastKey=...

Teller+ (role required):
  GET /accounts/{customerId}
  POST /accounts/{id}/deposit    (with conditional write)
  POST /accounts/{id}/withdraw   (with conditional write)
  GET /accounts/{id}/transactions?limit=20&lastKey=...

Manager+:
  GET /reports/transactions?limit=50&lastKey=...
  GET /reports/daily-summary

Admin:
  POST /users
  PUT /users/{id}/role
  DELETE /accounts/{id}
```

---

## Implementation Phases

### Phase 1: Shared Utilities Foundation (4-5 hours)

**Goal:** Eliminate code duplication, establish professional patterns

**1.1 Create Folder Structure**
```
shared/
├── db/
│   └── client.js
├── errors/
│   └── AppError.js
├── utils/
│   ├── validators.js
│   └── responses.js
├── auth/
│   └── jwt.js          (Phase 2)
├── middleware/
│   ├── auth.js         (Phase 2)
│   ├── authorize.js    (Phase 4)
│   └── rateLimit.js    (Phase 8)
└── logger/
    └── index.js
```

**1.2 Build shared/db/client.js**
```javascript
// Export single DynamoDB client for all functions
// Handle local vs deployed endpoint via AWS_SAM_LOCAL env var
// Return docClient ready to use
```

**1.3 Build shared/errors/AppError.js**
```javascript
// Base class: AppError extends Error
// Subclasses: ValidationError (400), NotFoundError (404), 
//             UnauthorizedError (401), ForbiddenError (403),
//             ConflictError (409), RateLimitError (429)
// Each has: message, statusCode, isOperational: true
```

**1.4 Build shared/utils/responses.js**
```javascript
// success(data, statusCode = 200)
// error(message, statusCode = 500)
// Returns: { statusCode, body: JSON.stringify(...) }
```

**1.5 Build shared/utils/validators.js**
```javascript
// validateEmail(email) → throws ValidationError if invalid
// validatePassword(password) → min 8 chars, throws if weak
// validateAmount(amount) → positive number, throws if invalid
// validateAccountId(accountId) → non-empty string
```

**1.6 Build shared/logger/index.js**
```javascript
// JSON structured logging
// logger.info(message, context)
// logger.error(message, error, context)
// Include: timestamp, level, message, ...context
// Use console.log (CloudWatch captures stdout)
```

**1.7 Refactor Existing 5 Functions**
- Replace DynamoDB client setup with: `import { docClient } from '/opt/nodejs/shared/db/client.js'`
- Replace try-catch with custom errors
- Replace manual responses with response utilities
- Add validation using validators
- Add structured logging

**Testing:** All 5 existing endpoints work with shared utilities

---

### Phase 2: Authentication System (4-5 hours)

**Goal:** Add user registration, login, JWT tokens

**2.1 Update template.yaml**
```yaml
UsersTable:
  Type: AWS::Serverless::SimpleTable
  Properties:
    TableName: users
    PrimaryKey:
      Name: userId
      Type: String

# Add USERS_TABLE to Globals environment variables
# Add JWT_SECRET to environment (use placeholder, document prod should use Secrets Manager)
```

**2.2 Create users table locally**
```bash
aws dynamodb create-table --table-name users \
    --attribute-definitions AttributeName=userId,AttributeType=S \
    --key-schema AttributeName=userId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000
```

**2.3 Build shared/auth/jwt.js**
```javascript
import jwt from 'jsonwebtoken'

// generateAccessToken(userId, role) → JWT expires 1h
// verifyToken(token) → decoded payload or throws
// Use HMAC-SHA256 (symmetric, HS256 algorithm)
// Payload: { userId, role, iat, exp }
// Secret from process.env.JWT_SECRET
```

**2.4 Install dependencies**
```bash
cd functions/auth-register
npm install bcryptjs jsonwebtoken
# Repeat for auth-login
```

**2.5 Create functions/auth-register/app.js**
```javascript
// POST /auth/register
// Body: { email, password, role }
// Validate email/password
// Check if email exists (query by email - may need GSI or scan for MVP)
// Hash password with bcrypt (10 rounds)
// Generate userId with crypto.randomUUID()
// Store in users table
// Return: { userId, email, role }
// No token on register (must login)
```

**2.6 Create functions/auth-login/app.js**
```javascript
// POST /auth/login
// Body: { email, password }
// Find user by email
// Verify password with bcrypt.compare()
// Generate access token with jwt.generateAccessToken(userId, role)
// Return: { accessToken, userId, role }
// (Refresh token in Phase 3)
```

**2.7 Build shared/middleware/auth.js**
```javascript
// export function authMiddleware(event)
// Extract token from Authorization: Bearer <token>
// Verify with jwt.verifyToken()
// Return decoded { userId, role }
// Throw UnauthorizedError if invalid/missing
```

**2.8 Apply auth middleware to existing functions**
Example in functions/get-account/app.js:
```javascript
import { authMiddleware } from '/opt/nodejs/shared/middleware/auth.js'

export const handler = async (event) => {
  const user = authMiddleware(event)  // Throws if invalid
  // ... rest of logic
}
```

**Testing:** 
- Register user, login, get token
- Access protected endpoint with token → success
- Access without token → 401

---

### Phase 3: Refresh Token System (2-3 hours)

**Goal:** Add token rotation for better security

**3.1 Update template.yaml**
```yaml
RefreshTokensTable:
  Type: AWS::Serverless::SimpleTable
  Properties:
    TableName: refresh-tokens
    PrimaryKey:
      Name: token
      Type: String

# Add REFRESH_TOKENS_TABLE to environment
```

**3.2 Create table locally**
```bash
aws dynamodb create-table --table-name refresh-tokens \
    --attribute-definitions AttributeName=token,AttributeType=S \
    --key-schema AttributeName=token,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000
```

**3.3 Update shared/auth/jwt.js**
```javascript
// Add: generateRefreshToken() → crypto.randomBytes(32).toString('hex')
// Refresh tokens NOT JWT (just random strings)
// Stored in database with expiry
```

**3.4 Update functions/auth-login/app.js**
```javascript
// After password verification:
// Generate refresh token
// Store in refresh-tokens table: { token, userId, expiresAt: 30 days, createdAt }
// Return both tokens: { accessToken, refreshToken, userId, role }
```

**3.5 Create functions/auth-refresh/app.js**
```javascript
// POST /auth/refresh
// Body: { refreshToken }
// Look up token in refresh-tokens table
// Check if expired
// If valid: generate new access token, return { accessToken }
// Optionally: rotate refresh token (delete old, issue new)
```

**3.6 Create functions/auth-logout/app.js**
```javascript
// POST /auth/logout
// Body: { refreshToken }
// Delete from refresh-tokens table
// Return: { message: "Logged out successfully" }
```

**Testing:**
- Login → get both tokens
- Use access token until expires → refresh → get new access token
- Logout → refresh token deleted → refresh fails

---

### Phase 4: RBAC System (3-4 hours)

**Goal:** Enforce role-based permissions

**4.1 Build shared/middleware/authorize.js**
```javascript
// export function authorize(requiredRole)
// Role hierarchy: { customer: 1, teller: 2, manager: 3, admin: 4 }
// Return middleware function that checks user.role >= requiredRole
// Throw ForbiddenError if insufficient permissions
```

**4.2 Update accounts table schema**
```javascript
// Add userId field to link accounts to users
// When creating account, require userId from token
// Migration: For existing accounts, assign to a default user or require manual linking
```

**4.3 Update functions/create-account/app.js**
```javascript
// Extract userId from token
// Store account with: { accountId, userId, customerName, balance, version: 0, createdAt }
// Only user or Teller+ can create accounts
```

**4.4 Update functions/get-account/app.js**
```javascript
// Customer role: check account.userId === user.userId (own accounts only)
// Teller+ role: can access any account
```

**4.5 Update functions/deposit/app.js & withdraw/app.js**
```javascript
// Require Teller+ role
// Log who performed transaction: { ...transaction, performedBy: user.userId }
```

**4.6 Update functions/get-transactions/app.js**
```javascript
// Customer: own accounts only
// Teller+: any account
```

**Testing:**
- Create users with different roles
- Customer can only see own accounts → 403 on others
- Teller can access any account
- Test role hierarchy

---

### Phase 5: New Role-Specific Endpoints (3-4 hours)

**5.1 Customer Endpoints**
```javascript
// functions/get-my-accounts/app.js
// GET /accounts/me
// Query accounts where userId = user.userId
// Return array of accounts

// functions/get-my-account/app.js
// GET /accounts/me/{id}
// Get account, verify userId matches token
```

**5.2 Manager Endpoints**
```javascript
// functions/get-all-transactions/app.js
// GET /reports/transactions
// Require Manager+ role
// Scan transactions table (will add pagination in Phase 7)

// functions/get-daily-summary/app.js
// GET /reports/daily-summary
// Aggregate: total deposits, withdrawals, account count
// Return summary object
```

**5.3 Admin Endpoints**
```javascript
// functions/create-user/app.js
// POST /users
// Require Admin role
// Body: { email, password, role }
// Create user (similar to register but admin can set role)

// functions/update-user-role/app.js
// PUT /users/{id}/role
// Require Admin role
// Update user.role

// functions/delete-account/app.js
// DELETE /accounts/{id}
// Require Admin role
// Delete account and associated transactions
```

**Testing:** Test each endpoint with appropriate role

---

### Phase 6: Race Condition Fix (2 hours)

**Goal:** Prevent concurrent transaction conflicts

**6.1 Update accounts table**
```javascript
// Add version: 0 to all accounts
// Migration: Update existing accounts to set version = 0
```

**6.2 Update functions/deposit/app.js**
```javascript
// Replace PutCommand with UpdateCommand:
await docClient.send(new UpdateCommand({
  TableName: process.env.ACCOUNTS_TABLE,
  Key: { accountId },
  UpdateExpression: 'SET balance = balance + :amount, version = version + :inc',
  ConditionExpression: 'version = :currentVersion',
  ExpressionAttributeValues: {
    ':amount': amount,
    ':currentVersion': currentVersion,  // from GetCommand
    ':inc': 1
  }
}))

// Handle ConditionalCheckFailedException:
// Retry logic or return error asking client to retry
```

**6.3 Update functions/withdraw/app.js**
```javascript
// Same pattern, but also check balance >= amount in ConditionExpression
ConditionExpression: 'version = :currentVersion AND balance >= :amount'
```

**Testing:**
- Simulate concurrent deposits (two requests same time)
- Verify one succeeds, one gets ConditionalCheckFailedException
- Verify balance correct

---

### Phase 7: Pagination (2 hours)

**Goal:** Handle large result sets efficiently

**7.1 Update functions/get-transactions/app.js**
```javascript
// Accept query params: limit (default 20, max 100), lastKey (base64 encoded)
// Pass to QueryCommand: { Limit, ExclusiveStartKey }
// Return: { transactions, nextKey: base64(LastEvaluatedKey) }
```

**7.2 Update functions/get-all-transactions/app.js**
```javascript
// Same pagination pattern for manager reports
```

**Testing:**
- Create account with 100+ transactions
- Request with limit=10
- Use nextKey to get next page
- Verify no duplicates/missing items

---

### Phase 8: Rate Limiting (2-3 hours)

**Goal:** Prevent API abuse

**8.1 Update users table schema**
```javascript
// Add: requestCount (Number), lastRequestTime (Number - timestamp)
```

**8.2 Build shared/middleware/rateLimit.js**
```javascript
// Check user's requestCount and lastRequestTime
// If within same minute window: increment count, check < 100
// If new minute: reset count to 1, update lastRequestTime
// Use UpdateCommand with conditions for atomic increment
// Throw RateLimitError (429) if exceeded
// Return Retry-After header
```

**8.3 Apply to all authenticated endpoints**
```javascript
// In each handler:
await rateLimit(user.userId)
```

**Testing:**
- Send 100 requests in 1 minute → succeeds
- Send 101st → 429 error
- Wait 1 minute → works again

---

### Phase 9: CloudWatch Alarms (1.5 hours)

**Goal:** Monitor suspicious activity

**9.1 Update template.yaml**
```yaml
# Add SNS topic for alarm notifications
AlarmTopic:
  Type: AWS::SNS::Topic
  Properties:
    Subscription:
      - Endpoint: your-email@example.com
        Protocol: email

# Add metric filters and alarms:
FailedLoginAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    MetricName: FailedLogins
    Threshold: 10
    Period: 60
    EvaluationPeriods: 1
    AlarmActions: [!Ref AlarmTopic]

ErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  # Track 5xx errors > 5% of requests

LargeDepositAlarm:
  Type: AWS::CloudWatch::Alarm
  # Track deposits > $10,000

RateLimitAlarm:
  Type: AWS::CloudWatch::Alarm
  # Track rate limit violations > 50/min system-wide
```

**9.2 Add custom metrics in code**
```javascript
// In auth-login: log failed attempts with CloudWatch metric
// In deposit: log large amounts with custom metric
// In rateLimit: log violations
```

**Testing:**
- Trigger each alarm condition
- Verify SNS email received

---

### Phase 10: Final Testing & Deployment (2 hours)

**10.1 End-to-End Testing Checklist**
```
□ Register 4 users (one per role)
□ Login with each → verify tokens
□ Test customer endpoints (own data only)
□ Test teller endpoints (any data)
□ Test manager reports
□ Test admin user management
□ Test race condition (concurrent deposits)
□ Test pagination (large result sets)
□ Test rate limiting (exceed limit)
□ Test token refresh/logout
□ Test all error cases (401, 403, 404, 429, 500)
```

**10.2 Update Documentation**
- README.md: Add any missing examples
- Add architecture diagram (optional)
- Document environment variables needed

**10.3 Deploy to AWS**
```bash
sam build
sam deploy --guided

# Note: First deploy will ask for:
# - Stack name
# - Region
# - JWT_SECRET parameter
# - Email for CloudWatch alarms
# - Confirm IAM role creation
```

**10.4 Test Deployed API**
- Run same tests against deployed URL
- Verify CloudWatch logs appear
- Check DynamoDB tables populated

---

## Local Development Commands

**Start DynamoDB Local:**
```bash
docker run -d --name dynamodb-local --network lambda-local -p 8000:8000 amazon/dynamodb-local
```

**Create tables:** (run all 4 create-table commands from phases above)

**Build and run API:**
```bash
sam build
sam local start-api --docker-network lambda-local --env-vars env.json
```

**Test endpoint:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","role":"customer"}'
```

---

## Environment Variables (env.json for local)
```json
{
  "Parameters": {
    "ACCOUNTS_TABLE": "accounts",
    "TRANSACTIONS_TABLE": "transactions",
    "USERS_TABLE": "users",
    "REFRESH_TOKENS_TABLE": "refresh-tokens",
    "AWS_SAM_LOCAL": "true",
    "JWT_SECRET": "local-dev-secret-change-in-production"
  }
}
```

---

## Key Technical Patterns

**Error Handling Pattern:**
```javascript
try {
  // business logic
} catch (error) {
  if (error.isOperational) {
    logger.warn('Operational error', { error: error.message })
    return responses.error(error.message, error.statusCode)
  }
  logger.error('Unexpected error', error)
  return responses.error('Internal server error', 500)
}
```

**Auth Pattern:**
```javascript
export const handler = async (event) => {
  const user = authMiddleware(event)  // { userId, role }
  authorize('teller')(user)  // Throws if insufficient role
  // ... business logic
}
```

**Conditional Write Pattern:**
```javascript
try {
  await docClient.send(new UpdateCommand({
    // ... update with version check
  }))
} catch (error) {
  if (error.name === 'ConditionalCheckFailedException') {
    throw new ConflictError('Concurrent modification detected, please retry')
  }
  throw error
}
```

---

## Dependencies to Install

**All function folders need:**
```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

**Auth functions additionally need:**
```bash
npm install bcryptjs jsonwebtoken
```

---

## Success Criteria

**Phase 1 Complete:** All 5 original endpoints refactored, use shared utilities  
**Phase 2 Complete:** Can register, login, access protected routes with token  
**Phase 3 Complete:** Token refresh/logout working  
**Phase 4 Complete:** Role checks enforced on all endpoints  
**Phase 5 Complete:** All 15+ endpoints working with proper roles  
**Phase 6 Complete:** Concurrent transactions handled safely  
**Phase 7 Complete:** Can paginate through large datasets  
**Phase 8 Complete:** Rate limiting prevents abuse  
**Phase 9 Complete:** Alarms configured and testable  
**Phase 10 Complete:** Deployed to AWS, fully tested  

---

## Interview Talking Points (Document After Each Phase)

After completing each phase, document in `LEARNINGS.md`:
- What problem did this solve?
- What did you learn?
- What would you do differently?
- What trade-offs did you make?

This becomes your interview prep material.