# Banking Transaction API

A secure serverless REST API for managing bank accounts and transactions with JWT authentication, built with AWS Lambda, DynamoDB, and API Gateway.

## Overview

This project demonstrates serverless architecture, banking logic, and security best practices using AWS services. Features user authentication, account ownership verification, deposits, withdrawals, transfers, and complete transaction audit trail.

**Live API:** `https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev`

---

## Features

### 🔐 Authentication & Security
- User registration with bcrypt password hashing
- JWT-based authentication (15min access tokens, 1h refresh tokens)
- Token refresh mechanism with automatic expiration
- Secure logout with token revocation

### 🏦 Banking Operations
- Account management (create, retrieve, list)
- Deposit and withdrawal operations
- Inter-account transfers (same user or cross-user)
- Balance validation (prevents overdrafts)
- Account ownership verification (users can only access their own accounts)

### 📊 Audit & Tracking
- Complete transaction history with timestamps
- Transaction types: initial_deposit, deposit, withdrawal, transfer_in, transfer_out
- Chronological ordering (newest first)

---

## Tech Stack

- **AWS Lambda** - Serverless compute (Node.js 20.x)
- **Amazon DynamoDB** - NoSQL database with GSIs
- **API Gateway** - HTTP API endpoints
- **Serverless Framework v4** - Infrastructure as Code
- **Lambda Layers** - Shared utilities and dependencies
- **JWT** - Token-based authentication
- **bcrypt** - Password hashing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    ▼                     ▼                     ▼
┌────────┐          ┌────────┐           ┌────────┐
│register│          │ login  │           │accounts│  ... 12 functions
└───┬────┘          └───┬────┘           └───┬────┘
    │                   │                    │
    └───────────────────┼────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │    Lambda Layer       │
            │  ┌─────────────────┐  │
            │  │ shared/         │  │
            │  │  ├── auth/      │  │
            │  │  ├── db/        │  │
            │  │  ├── errors/    │  │
            │  │  ├── logger/    │  │
            │  │  └── utils/     │  │
            │  ├─────────────────┤  │
            │  │ node_modules/   │  │
            │  │  ├── bcryptjs   │  │
            │  │  ├── jsonwebtoken│ │
            │  │  └── @aws-sdk   │  │
            │  └─────────────────┘  │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │      DynamoDB         │
            │  ┌─────┐ ┌─────────┐  │
            │  │Users│ │Accounts │  │
            │  └─────┘ └─────────┘  │
            │  ┌─────┐ ┌─────────┐  │
            │  │Trans│ │ Tokens  │  │
            │  └─────┘ └─────────┘  │
            └───────────────────────┘
```

---

## Project Structure

```
banking-api/
├── functions/                 # Lambda handlers (~1-2KB each)
│   ├── register/
│   │   └── app.js
│   ├── login/
│   ├── refresh/
│   ├── logout/
│   ├── list-accounts/
│   ├── create-account/
│   ├── get-account/
│   ├── get-balance/
│   ├── deposit/
│   ├── withdraw/
│   ├── transfer/
│   └── get-transactions/
├── layer/                     # Lambda Layer (~231KB)
│   └── nodejs/
│       ├── package.json
│       ├── node_modules/
│       └── shared/
│           ├── auth/          # JWT, password hashing
│           ├── db/            # DynamoDB client
│           ├── errors/        # Custom error classes
│           ├── logger/        # Structured logging
│           └── utils/         # Responses, validators
├── serverless.yml             # Infrastructure definition
├── test-api.mjs               # Integration tests (26 tests)
└── README.md
```

---

## API Endpoints

### Public Endpoints (No Authentication)
```
POST   /register                              Register new user
POST   /login                                 Login and get JWT tokens
POST   /refresh                               Refresh access token
```

### Protected Endpoints (Require JWT)
```
POST   /logout                                Logout and revoke tokens
GET    /accounts                              List user's accounts
POST   /accounts                              Create account (linked to user)
GET    /accounts/{id}                         Get account details (owner only)
GET    /accounts/{id}/balance                 Get account balance (owner only)
POST   /accounts/{id}/deposit                 Deposit funds (owner only)
POST   /accounts/{id}/withdraw                Withdraw funds (owner only)
POST   /accounts/{id}/transfer                Transfer funds (owner only)
GET    /accounts/{id}/transactions            Get transaction history (owner only)
```

---

## Database Schema

### Users Table
- **Partition Key:** `userId` (String)
- **GSI:** `email-index` (for O(1) login lookup)
- **Attributes:** `email`, `passwordHash`, `role`, `createdAt`

### Accounts Table
- **Partition Key:** `accountId` (String)
- **GSI:** `userId-index` (for listing user's accounts)
- **Attributes:** `userId`, `customerName`, `balance`, `createdAt`

### Transactions Table
- **Partition Key:** `accountId` (String)
- **Sort Key:** `timestamp` (Number)
- **Attributes:** `amount`, `type`, `newBalance`

### Refresh Tokens Table
- **Partition Key:** `token` (String)
- **TTL:** `expiresAt` (auto-deletion of expired tokens)
- **Attributes:** `userId`, `createdAt`

---

## Quick Start

### 1. Register a User
```bash
curl -X POST https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

### 2. Login
```bash
curl -X POST https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

### 3. Create Account
```bash
curl -X POST https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "accountId": "ACC001",
    "customerName": "John Doe",
    "initialBalance": 1000
  }'
```

### 4. Deposit Funds
```bash
curl -X POST https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev/accounts/ACC001/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"amount": 500}'
```

### 5. Transfer Funds
```bash
curl -X POST https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev/accounts/ACC001/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "toAccountId": "ACC002",
    "amount": 200
  }'
```

### 6. Get Transactions
```bash
curl https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev/accounts/ACC001/transactions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Development Workflow

This project follows corporate-standard serverless development practices: **deploy to AWS for testing** rather than local emulation.

### Why Not Local Emulation?

Tools like `serverless-offline` and LocalStack have behavior gaps that cause "works locally, fails in AWS" issues. Most teams use personal dev stages instead.

### Setup

**Prerequisites:** Node.js 20.x, AWS CLI configured

```bash
# Install layer dependencies
cd layer/nodejs
npm install
cd ../..

# Deploy to your personal dev stage
serverless deploy --stage dev-yourname
```

### Testing

Run integration tests against deployed API:

```bash
node test-api.mjs https://YOUR_API_URL/dev-yourname
```

**Test coverage (26 tests):**
- Happy path: Registration, login, account operations, transfers
- Security: Token validation, ownership checks, expired tokens
- Validation: Missing fields, invalid amounts, overdrafts

### Debugging

```bash
# View function logs
serverless logs -f register --stage dev

# Tail logs in real-time
serverless logs -f register --stage dev --tail
```

---

## Deployment

```bash
# Package (inspect before deploying)
serverless package --stage dev

# Deploy
serverless deploy --stage dev

# Deploy to production
serverless deploy --stage prod
```

**Important:** Set a strong JWT secret for production:

```bash
# Generate secure secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Deploy with custom secret
JWT_SECRET=your-secure-secret serverless deploy --stage prod
```

---

## Security Features

✅ **Password Security**
- Bcrypt hashing with 10 salt rounds
- Passwords never stored in plaintext
- Email validation and password strength requirements

✅ **Token Security**
- Short-lived access tokens (15 minutes)
- Longer refresh tokens (1 hour) stored separately
- Token type validation (can't use refresh token for API access)
- Automatic token cleanup via DynamoDB TTL

✅ **Authorization**
- JWT verification on all protected endpoints
- Account ownership checks prevent cross-user access
- Proper HTTP status codes (401 Unauthorized, 403 Forbidden)

✅ **Data Protection**
- Users can only access their own accounts
- Ownership verified on every operation
- Proper error handling prevents information leakage

---

## Error Handling

The API returns standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (ownership violation) |
| 404 | Not Found |
| 409 | Conflict (duplicate email/account) |
| 500 | Internal Server Error |

**Example Error Response:**
```json
{
  "error": "You do not have access to this account"
}
```

---

## Key Learnings

- **Lambda Layers:** Shared code packaging, `/opt/nodejs/` import paths, layer versioning
- **Serverless Framework:** Individual packaging, per-function patterns, esbuild configuration
- **Authentication:** JWT token management, refresh token rotation
- **Authorization:** Role-based access control, ownership verification
- **Security:** Password hashing, token expiration, secure API design
- **DynamoDB:** GSI design for efficient queries, TTL for auto-cleanup
- **Testing:** Integration tests against real AWS, corporate dev workflows
