# Banking API - Step 1: Users & Authentication

## Overview
Transform the banking API from "anyone can access anything" to "users own their accounts" by adding user authentication and account ownership.

---

## Architecture Changes

### Current State
- 5 endpoints with no authentication
- Accounts exist independently
- No user concept

### Target State
- Users register and login to get JWT tokens
- Accounts linked to users (userId field)
- All account operations require valid JWT and ownership verification

---

## New Infrastructure

### Users Table (DynamoDB)
```yaml
UsersTable:
  Type: AWS::Serverless::SimpleTable
  Properties:
    TableName: users
    PrimaryKey:
      Name: userId
      Type: String
```

**Attributes:**
- userId (PK) - unique identifier
- email - user's email (unique)
- passwordHash - bcrypt hashed password
- createdAt - timestamp

### Refresh Tokens Table (DynamoDB)
```yaml
RefreshTokensTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: refresh-tokens
    AttributeDefinitions:
      - AttributeName: token
        AttributeType: S
    KeySchema:
      - AttributeName: token
        KeyType: HASH
```

**Attributes:**
- token (PK) - the refresh token string
- userId - owner of the token
- createdAt - when issued
- expiresAt - when it expires

---

## New Lambda Functions

### 1. RegisterFunction
**Endpoint:** `POST /register`

**Input:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Logic:**
1. Validate email format and password strength
2. Check if email already exists
3. Hash password with bcrypt
4. Create user in UsersTable
5. Return success (don't auto-login)

**Response:** `201 Created`

---

### 2. LoginFunction
**Endpoint:** `POST /login`

**Input:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Logic:**
1. Find user by email
2. Compare password with stored hash
3. Generate access token (15 min expiry)
4. Generate refresh token (7 days expiry)
5. Store refresh token in RefreshTokensTable
6. Return both tokens

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 900
}
```

---

### 3. RefreshFunction
**Endpoint:** `POST /refresh`

**Input:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Logic:**
1. Verify refresh token signature
2. Check if token exists in RefreshTokensTable
3. Check if token expired
4. Generate new access token
5. Return new access token

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 900
}
```

---

### 4. LogoutFunction
**Endpoint:** `POST /logout`

**Headers:** `Authorization: Bearer <accessToken>`

**Logic:**
1. Verify access token
2. Extract userId from token
3. Delete all refresh tokens for this userId
4. Return success

**Response:** `200 OK`

---

### 5. ListAccountsFunction
**Endpoint:** `GET /accounts`

**Headers:** `Authorization: Bearer <accessToken>`

**Logic:**
1. Verify access token & extract userId
2. Query AccountsTable where userId matches
3. Return list of user's accounts

**Response:**
```json
{
  "accounts": [
    {
      "accountId": "ACC001",
      "balance": 1000,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### 6. GetBalanceFunction
**Endpoint:** `GET /accounts/{accountId}/balance`

**Headers:** `Authorization: Bearer <accessToken>`

**Logic:**
1. Verify access token & check ownership of account
2. Fetch account from DynamoDB
3. Return accountId and balance only

**Response:**
```json
{
  "accountId": "ACC001",
  "balance": 1000
}
```

---

### 7. TransferFunction
**Endpoint:** `POST /accounts/{accountId}/transfer`

**Headers:** `Authorization: Bearer <accessToken>`

**Input:**
```json
{
  "toAccountId": "ACC002",
  "amount": 100
}
```

**Logic:**
1. Verify access token & check ownership of source account
2. Validate amount (positive, sufficient funds)
3. Verify destination account exists
4. Withdraw from source account
5. Deposit to destination account
6. Record both transactions
7. Return success

**Response:**
```json
{
  "message": "Transfer successful",
  "newBalance": 900
}
```

---

## Modified Lambda Functions

### Modify CreateAccountFunction
**Changes:**
1. Add JWT verification
2. Extract userId from token
3. Add userId field to account
4. Link account to user

**New account structure:**
```javascript
{
  accountId,
  userId,  // NEW
  customerName,
  balance,
  createdAt
}
```

---

### Modify GetAccountFunction, DepositFunction, WithdrawFunction, GetTransactionsFunction
**Changes (same for all):**
1. Add JWT verification
2. Extract userId from token
3. Check account ownership
4. If account doesn't belong to user → 403 Forbidden
5. Continue with existing logic

---

## Shared Utilities

### shared/auth.js
```javascript
export function verifyAccessToken(token) {
  // Verify JWT signature
  // Check expiration
  // Return decoded payload (userId, role)
  // Throw error if invalid
}

export async function checkAccountOwnership(accountId, userId, docClient) {
  // Fetch account from DynamoDB
  // Check if account.userId === userId
  // Return account if valid
  // Throw 403 error if not
}
```

### shared/password.js
```javascript
export async function hashPassword(password) {
  // Use bcrypt to hash
  // Return hash
}

export async function comparePassword(password, hash) {
  // Use bcrypt to compare
  // Return true/false
}
```

### shared/jwt.js
```javascript
export function generateAccessToken(userId) {
  // Create JWT with 15 min expiry
  // Include: userId, role: 'customer'
  // Return token
}

export function generateRefreshToken(userId) {
  // Create JWT with 7 days expiry
  // Include: userId, type: 'refresh'
  // Return token
}
```

---

## Authentication Flow

### For ALL account operations (deposit, withdraw, balance, etc.):
```
1. Request arrives with Authorization header
2. Extract JWT from "Bearer <token>"
3. Verify JWT (signature, expiration)
4. Decode JWT → get userId
5. Fetch account from DynamoDB
6. Check: account.userId === JWT userId
7. If match → proceed with operation
8. If no match → return 403 Forbidden
```

### Error responses:
- **401 Unauthorized** - Missing/invalid/expired JWT
- **403 Forbidden** - Valid JWT but wrong user (ownership check failed)
- **404 Not Found** - Account doesn't exist

---

## JWT Structure

### Access Token (15 min expiry)
```json
{
  "userId": "USER123",
  "role": "customer",
  "iat": 1234567890,
  "exp": 1234568790
}
```

### Refresh Token (7 days expiry)
```json
{
  "userId": "USER123",
  "type": "refresh",
  "iat": 1234567890,
  "exp": 1235172690
}
```

---

## Implementation Order

1. **Create shared utilities first:**
   - shared/password.js (bcrypt)
   - shared/jwt.js (token generation/verification)
   - shared/auth.js (verification + ownership check)

2. **Add Users table to template.yaml**

3. **Build RegisterFunction** (test registration)

4. **Build LoginFunction** (test login, get tokens)

5. **Add RefreshTokensTable to template.yaml**

6. **Build RefreshFunction** (test token refresh)

7. **Build LogoutFunction** (test logout)

8. **Modify AccountsTable** (add userId field)

9. **Modify CreateAccountFunction** (link accounts to users)

10. **Build ListAccountsFunction** (test listing user's accounts)

11. **Build GetBalanceFunction** (test balance check)

12. **Modify existing functions one by one:**
    - GetAccountFunction
    - DepositFunction
    - WithdrawFunction
    - GetTransactionsFunction

13. **Build TransferFunction** (test transfers)

---

## Testing Strategy

### Test locally in this order:
1. Register user → verify user in DynamoDB
2. Login → verify both tokens returned
3. Use access token to create account → verify userId linked
4. Use access token to check balance → verify ownership check works
5. Use access token to deposit → verify ownership check works
6. Try to access another user's account → verify 403 response
7. Wait for access token to expire → verify 401 response
8. Use refresh token → verify new access token works
9. Logout → verify refresh token deleted
10. Try to refresh after logout → verify failure

---

## Security Considerations

1. **Password hashing:** Use bcrypt with salt rounds = 10
2. **JWT secret:** Store in environment variable (never hardcode)
3. **HTTPS only:** Tokens sent in headers (must be encrypted in transit)
4. **Token storage:** Client stores tokens securely (httpOnly cookies or secure storage)
5. **Refresh token rotation:** Optional but recommended (issue new refresh on use)

---

## Environment Variables

Add to env.json:
```json
{
  "USERS_TABLE": "users",
  "REFRESH_TOKENS_TABLE": "refresh-tokens",
  "JWT_SECRET": "your-secret-key-change-in-production",
  "JWT_ACCESS_EXPIRY": "15m",
  "JWT_REFRESH_EXPIRY": "1h"
}
```

---

## Complete Endpoint List After Step 1

**Public (no auth):**
- POST /register
- POST /login

**Protected (requires JWT):**
- POST /refresh
- POST /logout
- POST /accounts (create account)
- GET /accounts (list user's accounts)
- GET /accounts/{id} (get account details)
- GET /accounts/{id}/balance (get balance only)
- POST /accounts/{id}/deposit
- POST /accounts/{id}/withdraw
- POST /accounts/{id}/transfer
- GET /accounts/{id}/transactions

**Total:** 12 endpoints, 12 Lambda functions

---

## Next Steps (After Step 1)

**Step 2: Role-Based Access Control**
- Add roles to users (Customer, Teller, Manager, Admin)
- Tellers can access any account (process deposits/withdrawals)
- Managers get system-wide reports
- Admins manage users and system configuration

**Step 3: Production Features**
- Conditional writes (fix race conditions)
- Enhanced logging with CloudWatch
- Rate limiting
- Pagination for transaction history
- CloudWatch alarms

**Focus:** Complete Step 1 first. Own authentication and customer features before adding role complexity.