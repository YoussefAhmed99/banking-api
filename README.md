# Banking Transaction API

A serverless REST API for managing bank accounts and transactions, built with AWS Lambda, DynamoDB, and API Gateway.

## Overview

This project demonstrates serverless architecture and banking logic implementation using AWS services. It handles account creation, deposits, withdrawals, and maintains a complete transaction audit trail.

**Live API:** `https://ut6xn1og0b.execute-api.eu-north-1.amazonaws.com/Prod/`

---

## Features

- Account management (create, retrieve)
- Deposit and withdrawal operations
- Balance validation (prevents overdrafts)
- Transaction history with timestamps
- Complete audit trail for all operations

---

## Tech Stack

- **AWS Lambda** - Serverless compute (Node.js 24.x)
- **Amazon DynamoDB** - NoSQL database
- **API Gateway** - HTTP API endpoints
- **AWS SAM** - Infrastructure as Code
- **Docker** - Local development (DynamoDB Local)

---

## API Endpoints
```
POST   /accounts                              Create account
GET    /accounts/{accountId}                  Get account details
POST   /accounts/{accountId}/deposit          Deposit funds
POST   /accounts/{accountId}/withdraw         Withdraw funds
GET    /accounts/{accountId}/transactions     Get transaction history
```

---

## Database Schema

**Accounts Table**
- Partition Key: `accountId` (String)
- Attributes: `customerName`, `balance`, `createdAt`

**Transactions Table**
- Partition Key: `accountId` (String)
- Sort Key: `timestamp` (Number)
- Attributes: `amount`, `type`, `newBalance`

---

## Local Development

**Prerequisites:** Node.js, Docker, AWS CLI, AWS SAM CLI

**Setup:**

1. Start DynamoDB Local
```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

2. Create tables
```bash
aws dynamodb create-table \
    --table-name accounts \
    --attribute-definitions AttributeName=accountId,AttributeType=S \
    --key-schema AttributeName=accountId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url http://localhost:8000

aws dynamodb create-table \
    --table-name transactions \
    --attribute-definitions AttributeName=accountId,AttributeType=S AttributeName=timestamp,AttributeType=N \
    --key-schema AttributeName=accountId,KeyType=HASH AttributeName=timestamp,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url http://localhost:8000
```

3. Run locally
```bash
sam build
sam local start-api
```

---

## Deployment
```bash
sam build
sam deploy --guided
```

---

## Example Usage

**Create Account:**
```bash
curl -X POST https://[API-URL]/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "ACC001",
    "customerName": "John Doe",
    "initialBalance": 1000
  }'
```

**Deposit:**
```bash
curl -X POST https://[API-URL]/accounts/ACC001/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount": 500}'
```

**Get Transactions:**
```bash
curl https://[API-URL]/accounts/ACC001/transactions
```

---

## Key Learnings

- DynamoDB data modeling (partition keys, sort keys)
- Serverless architecture patterns
- Infrastructure as Code with AWS SAM
- Local testing strategies for serverless applications
- Banking business logic implementation

---

## Author

Youssef Ahmed  
[LinkedIn](https://www.linkedin.com/in/youssef-ahmed-a74509218/)