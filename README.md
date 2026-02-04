# Banking Transaction API

A secure serverless REST API for managing bank accounts and transactions with JWT authentication, built with AWS Lambda, DynamoDB, API Gateway, and TypeScript.

## Overview

This project demonstrates serverless architecture, banking logic, and security best practices using AWS services. Features user authentication, account ownership verification, deposits, withdrawals, transfers, and complete transaction audit trail.

**Live API:** `https://o7jgcnqqnl.execute-api.eu-north-1.amazonaws.com/dev/`

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
- **API Gateway** - REST API endpoints
- **Serverless Framework v4** - Infrastructure as Code
- **TypeScript** - Type-safe codebase
- **Lambda Layers** - Shared utilities across functions
- **JWT** - Token-based authentication
- **bcrypt** - Password hashing

---

## Project Structure
```
banking-api/
├── functions/                 # Lambda function handlers (TypeScript)
│   ├── register/app.ts
│   ├── login/app.ts
│   ├── refresh/app.ts
│   ├── logout/app.ts
│   ├── create-account/app.ts
│   ├── get-account/app.ts
│   ├── get-balance/app.ts
│   ├── list-accounts/app.ts
│   ├── deposit/app.ts
│   ├── withdraw/app.ts
│   ├── transfer/app.ts
│   └── get-transactions/app.ts
├── layer/nodejs/shared/       # Lambda Layer (shared utilities)
│   ├── auth/
│   │   ├── auth.ts            # Token verification, ownership checks
│   │   ├── jwt.ts             # JWT generation/verification
│   │   └── password.ts        # bcrypt hashing
│   ├── db/
│   │   └── client.ts          # DynamoDB client
│   ├── errors/
│   │   └── AppError.ts        # Custom error classes
│   ├── logger/
│   │   └── index.ts           # Structured JSON logging
│   └── utils/
│       ├── responses.ts       # HTTP response helpers
│       └── validators.ts      # Input validation
├── dist/                      # Compiled output (gitignored)
├── serverless.yml             # Serverless Framework config
├── tsconfig.json              # TypeScript config
├── package.json               # Dependencies & build scripts
└── test-api.mjs               # Integration test suite
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

## Build & Deployment

### Prerequisites
- Node.js 20+
- AWS CLI configured
- Serverless Framework v4

### Build
```bash
npm install
npm run build
```

This compiles TypeScript to `dist/` and copies layer dependencies.

### Deploy
```bash
serverless deploy --stage dev
```

### Run Tests
```bash
node test-api.mjs https://your-api-url.execute-api.region.amazonaws.com/dev
```

26 integration tests covering happy path, security, and validation scenarios.

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

## Project Evolution

### Phase 1: Core Banking API
- Basic account operations (create, deposit, withdraw)
- Transaction tracking
- DynamoDB integration

### Phase 2: Authentication & Authorization
- User registration and login
- JWT-based authentication
- Account ownership enforcement
- Token refresh mechanism

### Phase 3: Production Infrastructure
- Migrated from AWS SAM to Serverless Framework v4
- Lambda Layers for shared utilities
- TypeScript migration for type safety
- Integration test suite

---

## Author

Youssef Ahmed