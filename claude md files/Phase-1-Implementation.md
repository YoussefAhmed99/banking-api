# Phase 1: Shared Utilities Foundation - Implementation Summary

**Completed:** January 18, 2026
**Branch:** `rbac-upgrade`
**Commit:** `dc0cce3` - "Implement Phase 1: Shared utilities foundation with Lambda Layers"

---

## Overview

Phase 1 established a professional foundation by eliminating code duplication across all Lambda functions through AWS Lambda Layers. This phase created reusable shared utilities that all functions can import from a centralized location.

---

## What Was Built

### Lambda Layer Structure

```
layer/
└── shared/
    ├── db/
    │   └── client.js          # DynamoDB client singleton
    ├── errors/
    │   └── AppError.js        # Custom error class hierarchy
    ├── logger/
    │   └── index.js           # Structured JSON logging
    ├── utils/
    │   ├── responses.js       # HTTP response helpers
    │   └── validators.js      # Input validation functions
    └── package.json           # ES modules configuration
```

---

## Shared Utilities Detail

### 1. Database Client (`layer/shared/db/client.js`)

**Purpose:** Single DynamoDB client instance shared across all functions.

```javascript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({
    ...(process.env.AWS_SAM_LOCAL === 'true' && {
        endpoint: 'http://172.18.0.2:8000'
    })
})

export const docClient = DynamoDBDocumentClient.from(client)
```

**Key Features:**
- Automatically detects local vs AWS environment via `AWS_SAM_LOCAL`
- Returns high-level `DynamoDBDocumentClient` for simplified operations
- Single export eliminates duplicate client setup in each function

**Usage:**
```javascript
import { docClient } from '../../shared/db/client.js'
```

---

### 2. Custom Error Classes (`layer/shared/errors/AppError.js`)

**Purpose:** Consistent error handling with appropriate HTTP status codes.

| Error Class | Status Code | Use Case |
|-------------|-------------|----------|
| `AppError` | (base class) | Parent for all custom errors |
| `ValidationError` | 400 | Invalid input data |
| `UnauthorizedError` | 401 | Missing/invalid authentication |
| `ForbiddenError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource doesn't exist |
| `ConflictError` | 409 | Duplicate resource / conflict |
| `RateLimitError` | 429 | Too many requests |

**Key Features:**
- All errors have `isOperational: true` flag for distinguishing from unexpected errors
- Stack trace captured automatically
- Consistent `message` and `statusCode` properties

**Usage:**
```javascript
import { ValidationError, NotFoundError } from '../../shared/errors/AppError.js'

// Throwing errors
throw new ValidationError('Email is required')
throw new NotFoundError('Account not found')

// Handling errors
catch (err) {
    if (err.isOperational) {
        return error(err.message, err.statusCode)
    }
    // Unexpected error - log and return 500
}
```

---

### 3. Logger (`layer/shared/logger/index.js`)

**Purpose:** Structured JSON logging for CloudWatch compatibility.

```javascript
export const logger = {
    info: (message, context = {}) => {
        console.log(JSON.stringify({
            level: 'INFO',
            timestamp: new Date().toISOString(),
            message,
            ...context
        }))
    },

    error: (message, error, context = {}) => {
        console.error(JSON.stringify({
            level: 'ERROR',
            timestamp: new Date().toISOString(),
            message,
            error: error?.message,
            stack: error?.stack,
            ...context
        }))
    }
}
```

**Output Format:**
```json
{
    "level": "INFO",
    "timestamp": "2026-01-18T12:00:00.000Z",
    "message": "Creating account",
    "accountId": "ACC-001",
    "customerName": "John Doe"
}
```

**Usage:**
```javascript
import { logger } from '../../shared/logger/index.js'

logger.info('Creating account', { accountId, customerName })
logger.error('Unexpected error', err, { accountId })
```

---

### 4. Response Utilities (`layer/shared/utils/responses.js`)

**Purpose:** Standardized HTTP response formatting.

```javascript
export function success(data, statusCode = 200) {
    return {
        statusCode,
        body: JSON.stringify(data)
    }
}

export function error(message, statusCode = 500) {
    return {
        statusCode,
        body: JSON.stringify({ error: message })
    }
}
```

**Usage:**
```javascript
import { success, error } from '../../shared/utils/responses.js'

// Success responses
return success({ message: 'Account created', account }, 201)
return success({ balance: 1000 })  // defaults to 200

// Error responses
return error('Account not found', 404)
return error('Internal server error', 500)
```

---

### 5. Validators (`layer/shared/utils/validators.js`)

**Purpose:** Reusable input validation functions that throw `ValidationError`.

| Function | Validation Rules |
|----------|------------------|
| `validateEmail(email)` | Required, valid email format |
| `validatePassword(password)` | Required, minimum 8 characters |
| `validateAmount(amount, options)` | Must be number, configurable zero/negative |
| `validateAccountId(accountId)` | Required, non-empty string |

**validateAmount Options:**
```javascript
validateAmount(amount, {
    allowZero: false,      // default: false
    allowNegative: false,  // default: false
    fieldName: 'Amount'    // default: 'Amount' (used in error message)
})
```

**Usage:**
```javascript
import { validateEmail, validateAmount, validateAccountId } from '../../shared/utils/validators.js'

validateAccountId(accountId)  // throws ValidationError if invalid
validateAmount(initialBalance, { allowZero: true, fieldName: 'Initial balance' })
validateEmail(email)
```

---

## Template.yaml Changes

Added Lambda Layer resource and attached it to all functions:

```yaml
Globals:
  Function:
    Layers:
      - !Ref SharedUtilitiesLayer    # All functions get the layer

Resources:
  SharedUtilitiesLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      LayerName: banking-api-shared
      Description: Shared utilities for banking API
      ContentUri: layer/
      CompatibleRuntimes:
        - nodejs24.x
    Metadata:
      BuildMethod: nodejs24.x
```

---

## Function Refactoring

All 5 existing functions were refactored to use shared utilities:

### Before (Duplicate Code Pattern)
```javascript
// Every function had this duplicate setup:
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({
    ...(process.env.AWS_SAM_LOCAL === 'true' && {
        endpoint: 'http://172.18.0.2:8000'
    })
})
const docClient = DynamoDBDocumentClient.from(client)

// Manual error handling, inconsistent responses, console.error logging
```

### After (Shared Utilities)
```javascript
import { docClient } from '../../shared/db/client.js'
import { ValidationError, ConflictError } from '../../shared/errors/AppError.js'
import { validateAccountId, validateAmount } from '../../shared/utils/validators.js'
import { success, error } from '../../shared/utils/responses.js'
import { logger } from '../../shared/logger/index.js'

export const handler = async (event) => {
    try {
        // Validation using shared validators
        validateAccountId(accountId)
        validateAmount(amount)

        // Business logic with structured logging
        logger.info('Processing request', { accountId })

        // Consistent success response
        return success({ data }, 200)
    } catch (err) {
        if (err.isOperational) {
            logger.info('Operational error', { error: err.message })
            return error(err.message, err.statusCode)
        }
        logger.error('Unexpected error', err)
        return error('Internal server error', 500)
    }
}
```

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `template.yaml` | Modified | Added SharedUtilitiesLayer, attached to all functions |
| `layer/shared/db/client.js` | Created | DynamoDB client singleton |
| `layer/shared/errors/AppError.js` | Created | Custom error class hierarchy |
| `layer/shared/logger/index.js` | Created | Structured JSON logger |
| `layer/shared/utils/responses.js` | Created | HTTP response helpers |
| `layer/shared/utils/validators.js` | Created | Input validation functions |
| `layer/shared/package.json` | Created | ES modules config (`"type": "module"`) |
| `functions/create-account/app.js` | Refactored | Using shared utilities |
| `functions/get-account/app.js` | Refactored | Using shared utilities |
| `functions/deposit/app.js` | Refactored | Using shared utilities |
| `functions/withdraw/app.js` | Refactored | Using shared utilities |
| `functions/get-transactions/app.js` | Refactored | Using shared utilities |

---

## Benefits Achieved

1. **DRY (Don't Repeat Yourself):** Single source of truth for common code
2. **Consistency:** All functions handle errors and responses the same way
3. **Maintainability:** Fix a bug once, all functions benefit
4. **Professional Logging:** CloudWatch-friendly JSON format
5. **Type Safety:** Custom errors with proper status codes
6. **Foundation Ready:** Layer structure supports Phase 2+ additions (auth, middleware)

---

## Import Path Note

Lambda Layers are mounted at `/opt/nodejs/` at runtime. All imports use this path:

```javascript
import { docClient } from '../../shared/db/client.js'
```

This path works in AWS Lambda but **not in local Node.js** without SAM Local. Always test with `sam local start-api`.

---

## Next Phase

**Phase 2: Authentication System** will add:
- `shared/auth/jwt.js` - JWT token utilities
- `shared/middleware/auth.js` - Authentication middleware
- New `UsersTable` DynamoDB table
- `auth-register` and `auth-login` Lambda functions
