# Banking Transaction API

A secure serverless REST API for managing bank accounts and transactions with JWT authentication, built with AWS Lambda, DynamoDB, and API Gateway.

## Overview

This project demonstrates serverless architecture, banking logic, and security best practices using AWS services. Features user authentication, account ownership verification, deposits, withdrawals, transfers, and complete transaction audit trail.

**Live API:** `https://s8rcq88bub.execute-api.eu-north-1.amazonaws.com/Prod/`

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

- **AWS Lambda** - Serverless compute (Node.js 24.x)
- **Amazon DynamoDB** - NoSQL database with GSIs
- **API Gateway** - HTTP API endpoints
- **AWS SAM** - Infrastructure as Code
- **JWT** - Token-based authentication
- **bcrypt** - Password hashing
- **Docker** - Local development (DynamoDB Local)

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
curl -X POST https://s8rcq88bub.execute-api.eu-north-1.amazonaws.com/Prod/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

### 2. Login
```bash
curl -X POST https://s8rcq88bub.execute-api.eu-north-1.amazonaws.com/Prod/login \
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
curl -X POST https://s8rcq88bub.execute-api.eu-north-1.amazonaws.com/Prod/accounts \
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
curl -X POST https://s8rcq88bub.execute-api.eu-north-1.amazonaws.com/Prod/accounts/ACC001/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"amount": 500}'
```

### 5. Transfer Funds
```bash
curl -X POST https://s8rcq88bub.execute-api.eu-north-1.amazonaws.com/Prod/accounts/ACC001/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "toAccountId": "ACC002",
    "amount": 200
  }'
```

### 6. Get Transactions
```bash
curl https://s8rcq88bub.execute-api.eu-north-1.amazonaws.com/Prod/accounts/ACC001/transactions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Authentication Flow

```
┌─────────┐                  ┌─────────┐
│ Client  │                  │   API   │
└────┬────┘                  └────┬────┘
     │                            │
     │  POST /register            │
     ├───────────────────────────>│
     │  {email, password}         │
     │                            │
     │  201 Created               │
     │<───────────────────────────┤
     │  {userId}                  │
     │                            │
     │  POST /login               │
     ├───────────────────────────>│
     │  {email, password}         │
     │                            │
     │  200 OK                    │
     │<───────────────────────────┤
     │  {accessToken,             │
     │   refreshToken}            │
     │                            │
     │  GET /accounts             │
     ├───────────────────────────>│
     │  Authorization: Bearer     │
     │                            │
     │  200 OK                    │
     │<───────────────────────────┤
     │  {accounts: [...]}         │
     │                            │
     │  POST /refresh             │
     ├───────────────────────────>│
     │  {refreshToken}            │
     │                            │
     │  200 OK                    │
     │<───────────────────────────┤
     │  {accessToken}             │
     │                            │
     │  POST /logout              │
     ├───────────────────────────>│
     │  Authorization: Bearer     │
     │                            │
     │  200 OK                    │
     │<───────────────────────────┤
     │  {message}                 │
     │                            │
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

## Local Development

**Prerequisites:** Node.js, Docker, AWS CLI, AWS SAM CLI

**Setup:**

1. Start DynamoDB Local
```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

2. Install dependencies
```bash
cd layer/shared
npm install
```

3. Build and run
```bash
sam build
sam local start-api --env-vars env.json
```

4. Test locally at `http://localhost:3000`

---

## Deployment

```bash
# Build
sam build

# Deploy
sam deploy --guided

# Follow prompts and set a strong JWT_SECRET
```

**Important:** Always use a strong JWT secret in production!

Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Error Handling

The API returns standard HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (ownership violation)
- `404` - Not Found
- `409` - Conflict (duplicate email/account)
- `500` - Internal Server Error

**Example Error Response:**
```json
{
  "error": "You do not have access to this account"
}
```

---

## Key Learnings

- **Authentication:** JWT token management, refresh token rotation
- **Authorization:** Role-based access control, ownership verification
- **Security:** Password hashing, token expiration, secure API design
- **DynamoDB:** GSI design for efficient queries, TTL for auto-cleanup
- **Serverless:** Lambda best practices, shared layers, environment variables
- **Infrastructure as Code:** AWS SAM templates, CloudFormation
- **API Design:** RESTful endpoints, proper HTTP semantics

---

## Project Evolution

### Phase 1: Core Banking API
- Basic account operations (create, deposit, withdraw)
- Transaction tracking
- DynamoDB integration

### Phase 2: Authentication & Authorization (Current)
- User registration and login
- JWT-based authentication
- Account ownership enforcement
- Token refresh mechanism
- Secure multi-user system

---

## Author

Youssef Ahmed
[LinkedIn](https://www.linkedin.com/in/youssef-ahmed-a74509218/)
