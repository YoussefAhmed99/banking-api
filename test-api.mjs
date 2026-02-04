const BASE_URL = process.argv[2];

if (!BASE_URL) {
    console.error('\n❌ Usage: node test-api.mjs <API_URL>\n');
    console.error('   Example:');
    console.error('     node test-api.mjs https://xxxxx.execute-api.eu-north-1.amazonaws.com/dev\n');
    process.exit(1);
}

// Shared context for test data
const testId = Date.now()

const ctx = {
    user1: { email: `user1-${testId}@test.com`, password: 'password123', token: null, refreshToken: null, userId: null },
    user2: { email: `user2-${testId}@test.com`, password: 'password456', token: null, refreshToken: null, userId: null },
    accounts: { acc1: `ACC001-${testId}`, acc2: `ACC002-${testId}`, acc3: `ACC003-${testId}` }
};

// Colors for output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    gray: '\x1b[90m'
};

// Helper: Make HTTP request
async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    let data;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    return { status: response.status, data };
}

// Helper: Assert status code
function assertStatus(actual, expected, testName, responseData) {
    if (actual !== expected) {
        const statusText = {
            200: 'OK', 201: 'Created', 400: 'Bad Request',
            401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
            409: 'Conflict', 500: 'Internal Server Error'
        };

        let error = `${testName}\n   Expected: ${expected} ${statusText[expected] || ''}\n   Received: ${actual} ${statusText[actual] || ''}`;

        if (responseData) {
            error += `\n   Response: ${JSON.stringify(responseData, null, 2)}`;
        }

        throw new Error(error);
    }
}

// ============================================================================
// PHASE 1: HAPPY PATH TESTS
// ============================================================================

async function register_user1() {
    const { status, data } = await request('/register', {
        method: 'POST',
        body: JSON.stringify({
            email: ctx.user1.email,
            password: ctx.user1.password
        })
    });

    assertStatus(status, 201, 'Register user 1', data);
    ctx.user1.userId = data.userId;
    return 'Register user 1';
}

async function login_user1() {
    const { status, data } = await request('/login', {
        method: 'POST',
        body: JSON.stringify({
            email: ctx.user1.email,
            password: ctx.user1.password
        })
    });

    assertStatus(status, 200, 'Login user 1', data);
    ctx.user1.token = data.accessToken;
    ctx.user1.refreshToken = data.refreshToken;
    return 'Login user 1';
}

async function create_account1_user1() {
    const { status, data } = await request('/accounts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({
            accountId: ctx.accounts.acc1,
            customerName: 'User One',
            initialBalance: 1000
        })
    });

    assertStatus(status, 201, 'Create account 1', data);
    return 'Create account 1 (user 1)';
}

async function create_account2_user1() {
    const { status, data } = await request('/accounts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({
            accountId: ctx.accounts.acc2,
            customerName: 'User One Secondary',
            initialBalance: 500
        })
    });

    assertStatus(status, 201, 'Create account 2', data);
    return 'Create account 2 (user 1)';
}

async function deposit_account1() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}/deposit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({ amount: 200 })
    });

    assertStatus(status, 200, 'Deposit to account 1', data);
    if (data.newBalance !== 1200) {
        throw new Error(`Expected balance 1200, got ${data.newBalance}`);
    }
    return 'Deposit to account 1';
}

async function withdraw_account1() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}/withdraw`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({ amount: 100 })
    });

    assertStatus(status, 200, 'Withdraw from account 1', data);
    if (data.newBalance !== 1100) {
        throw new Error(`Expected balance 1100, got ${data.newBalance}`);
    }
    return 'Withdraw from account 1';
}

async function transfer_account1_to_account2() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}/transfer`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({
            toAccountId: ctx.accounts.acc2,
            amount: 100
        })
    });

    assertStatus(status, 200, 'Transfer account 1 to account 2', data);
    if (data.newBalance !== 1000) {
        throw new Error(`Expected balance 1000, got ${data.newBalance}`);
    }
    return 'Transfer account 1 → account 2';
}

async function get_balance_account1() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}/balance`, {
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` }
    });

    assertStatus(status, 200, 'Get balance', data);
    if (data.balance !== 1000) {
        throw new Error(`Expected balance 1000, got ${data.balance}`);
    }
    return 'Get balance (account 1)';
}

async function get_transactions_account1() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}/transactions`, {
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` }
    });

    assertStatus(status, 200, 'Get transactions', data);
    if (!data.transactions || data.transactions.length < 4) {
        throw new Error(`Expected at least 4 transactions, got ${data.transactions?.length || 0}`);
    }
    return 'Get transactions (account 1)';
}

async function list_accounts_user1() {
    const { status, data } = await request('/accounts', {
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` }
    });

    assertStatus(status, 200, 'List accounts', data);
    if (!data.accounts || data.accounts.length !== 2) {
        throw new Error(`Expected 2 accounts, got ${data.accounts?.length || 0}`);
    }
    return 'List accounts (user 1)';
}

async function get_account_details() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}`, {
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` }
    });

    assertStatus(status, 200, 'Get account details', data);
    if (data.accountId !== ctx.accounts.acc1) {
        throw new Error(`Expected account ${ctx.accounts.acc1}, got ${data.accountId}`);
    }
    return 'Get account details (account 1)';
}

async function refresh_token_user1() {
    const { status, data } = await request('/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: ctx.user1.refreshToken })
    });

    assertStatus(status, 200, 'Refresh token', data);
    ctx.user1.token = data.accessToken; // Update with new token
    return 'Refresh token (user 1)';
}

async function logout_user1() {
    const { status, data } = await request('/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` }
    });

    assertStatus(status, 200, 'Logout', data);
    return 'Logout (user 1)';
}

// ============================================================================
// PHASE 2: SECURITY TESTS
// ============================================================================

async function register_user2() {
    const { status, data } = await request('/register', {
        method: 'POST',
        body: JSON.stringify({
            email: ctx.user2.email,
            password: ctx.user2.password
        })
    });

    assertStatus(status, 201, 'Register user 2', data);
    ctx.user2.userId = data.userId;
    return 'Register user 2';
}

async function login_user2() {
    const { status, data } = await request('/login', {
        method: 'POST',
        body: JSON.stringify({
            email: ctx.user2.email,
            password: ctx.user2.password
        })
    });

    assertStatus(status, 200, 'Login user 2', data);
    ctx.user2.token = data.accessToken;
    ctx.user2.refreshToken = data.refreshToken;
    return 'Login user 2';
}

async function create_account3_user2() {
    const { status, data } = await request('/accounts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user2.token}` },
        body: JSON.stringify({
            accountId: ctx.accounts.acc3,
            customerName: 'User Two',
            initialBalance: 750
        })
    });

    assertStatus(status, 201, 'Create account 3', data);
    return 'Create account 3 (user 2)';
}

async function user1_cannot_access_user2_account() {
    // Re-login user1 (since we logged out)
    const loginRes = await request('/login', {
        method: 'POST',
        body: JSON.stringify({
            email: ctx.user1.email,
            password: ctx.user1.password
        })
    });
    ctx.user1.token = loginRes.data.accessToken;

    const { status, data } = await request(`/accounts/${ctx.accounts.acc3}`, {
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` }
    });

    assertStatus(status, 403, 'User 1 access user 2 account', data);
    return 'User 1 cannot access user 2 account (403)';
}

async function user1_cannot_get_balance_user2_account() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc3}/balance`, {
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` }
    });

    assertStatus(status, 403, 'User 1 get balance user 2 account', data);
    return 'User 1 cannot get balance for user 2 account (403)';
}

async function user1_cannot_deposit_user2_account() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc3}/deposit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({ amount: 100 })
    });

    assertStatus(status, 403, 'User 1 deposit to user 2 account', data);
    return 'User 1 cannot deposit to user 2 account (403)';
}

async function user1_cannot_transfer_from_user2_account() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc3}/transfer`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({
            toAccountId: ctx.accounts.acc1,
            amount: 50
        })
    });

    assertStatus(status, 403, 'User 1 transfer from user 2 account', data);
    return 'User 1 cannot transfer from user 2 account (403)';
}

// ============================================================================
// PHASE 3: VALIDATION TESTS
// ============================================================================

async function login_wrong_password() {
    const { status, data } = await request('/login', {
        method: 'POST',
        body: JSON.stringify({
            email: ctx.user1.email,
            password: 'wrongpassword'
        })
    });

    assertStatus(status, 401, 'Login with wrong password', data);
    return 'Login with wrong password (401)';
}

async function access_without_token() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}`);

    assertStatus(status, 401, 'Access without token', data);
    return 'Access without token (401)';
}

async function duplicate_account_id() {
    const { status, data } = await request('/accounts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({
            accountId: ctx.accounts.acc1, // Already exists
            customerName: 'Duplicate',
            initialBalance: 100
        })
    });

    assertStatus(status, 409, 'Duplicate account ID', data);
    return 'Duplicate account ID (409)';
}

async function insufficient_funds_withdraw() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}/withdraw`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({ amount: 999999 })
    });

    assertStatus(status, 400, 'Insufficient funds withdraw', data);
    return 'Insufficient funds withdraw (400)';
}

async function transfer_to_nonexistent_account() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}/transfer`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({
            toAccountId: 'NONEXISTENT',
            amount: 50
        })
    });

    assertStatus(status, 404, 'Transfer to nonexistent account', data);
    return 'Transfer to nonexistent account (404)';
}

async function negative_deposit_amount() {
    const { status, data } = await request(`/accounts/${ctx.accounts.acc1}/deposit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ctx.user1.token}` },
        body: JSON.stringify({ amount: -100 })
    });

    assertStatus(status, 400, 'Negative deposit amount', data);
    return 'Negative deposit amount (400)';
}

// ============================================================================
// TEST SUITE DEFINITION
// ============================================================================

const testSuite = {
    happyPath: [
        register_user1,
        login_user1,
        create_account1_user1,
        create_account2_user1,
        deposit_account1,
        withdraw_account1,
        transfer_account1_to_account2,
        get_balance_account1,
        get_transactions_account1,
        list_accounts_user1,
        get_account_details,
        refresh_token_user1,
        logout_user1
    ],
    security: [
        register_user2,
        login_user2,
        create_account3_user2,
        user1_cannot_access_user2_account,
        user1_cannot_get_balance_user2_account,
        user1_cannot_deposit_user2_account,
        user1_cannot_transfer_from_user2_account
    ],
    validation: [
        login_wrong_password,
        access_without_token,
        duplicate_account_id,
        insufficient_funds_withdraw,
        transfer_to_nonexistent_account,
        negative_deposit_amount
    ]
};

// ============================================================================
// PREREQUISITES CHECK
// ============================================================================

async function checkPrerequisites() {
    console.log('  🔍 Checking API connectivity...\n');
    console.log(`  📍 Target: ${BASE_URL}\n`);

    try {
        const response = await fetch(BASE_URL + '/register', { method: 'OPTIONS' });
        console.log(`  ${colors.green}✅ API is reachable${colors.reset}\n`);
    } catch (error) {
        console.error(`${colors.red}❌ Cannot reach API at ${BASE_URL}${colors.reset}\n`);
        console.error('   Check that:');
        console.error('     1. The URL is correct');
        console.error('     2. The API is deployed (serverless deploy --stage dev)');
        console.error('     3. You have internet connectivity\n');
        process.exit(1);
    }
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTests() {
    console.log(`\n${colors.blue}🧪 Banking API - Integration Tests${colors.reset}\n`);
    console.log('═'.repeat(50));

    await checkPrerequisites();

    const results = {
        passed: 0,
        failed: 0,
        details: []
    };

    // Run each phase
    for (const [phase, tests] of Object.entries(testSuite)) {
        const phaseName = phase === 'happyPath' ? 'Happy Path' :
            phase === 'security' ? 'Security' : 'Validation';

        console.log(`\n${colors.yellow}📍 ${phaseName} Tests${colors.reset}`);

        for (const test of tests) {
            try {
                const result = await test();
                console.log(`  ${colors.green}✅${colors.reset} ${result}`);
                results.passed++;
            } catch (error) {
                console.log(`  ${colors.red}❌${colors.reset} ${error.message}\n`);
                results.failed++;
                results.details.push({ test: test.name, error: error.message });
            }
        }
    }

    // Summary
    console.log('\n' + '═'.repeat(50));
    const total = results.passed + results.failed;

    if (results.failed === 0) {
        console.log(`\n${colors.green}✅ All tests passed: ${results.passed}/${total}${colors.reset}\n`);
        process.exit(0);
    } else {
        console.log(`\n${colors.red}❌ Tests failed: ${results.failed}/${total}${colors.reset}\n`);
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    console.error(`\n${colors.red}❌ Test runner failed:${colors.reset}`, error.message, '\n');
    process.exit(1);
});