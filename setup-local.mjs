import { existsSync, symlinkSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { platform } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Check if this is the first run (dependencies need installing)
const SKIP_DEPS = process.env.SKIP_DEPS === 'true';

// Validation: Check prerequisites
async function validatePrerequisites() {
    console.log('  🔍 Validating project structure...');

    // Check serverless.yml
    if (!existsSync('serverless.yml')) {
        console.error('\n❌ serverless.yml not found!\n');
        console.error('   This file is required to define table schemas.\n');
        console.error('   Ensure you\'re in the project root directory.\n');
        process.exit(1);
    }

    // Check layer/nodejs/package.json
    if (!existsSync('layer/nodejs/package.json')) {
        console.error('\n❌ layer/nodejs/package.json not found!\n');
        console.error('   Layer structure is required as the source of truth for dependencies.\n');
        console.error('   Expected structure:');
        console.error('     layer/');
        console.error('     └── nodejs/');
        console.error('         ├── package.json');
        console.error('         └── shared/\n');
        console.error('   Create the package.json with:');
        console.error('     cd layer/nodejs');
        console.error('     npm init -y');
        console.error('     npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb jsonwebtoken bcryptjs js-yaml\n');
        process.exit(1);
    }

    // Check layer/nodejs/shared/
    if (!existsSync('layer/nodejs/shared')) {
        console.error('\n❌ layer/nodejs/shared/ directory not found!\n');
        console.error('   Shared utilities directory is required.\n');
        console.error('   Expected structure:');
        console.error('     layer/');
        console.error('     └── nodejs/');
        console.error('         └── shared/');
        console.error('             ├── auth/');
        console.error('             ├── db/');
        console.error('             ├── errors/');
        console.error('             ├── logger/');
        console.error('             └── utils/\n');
        process.exit(1);
    }

    console.log('  ✅ Project structure validated');
}

// Step 1: Nuclear cleanup and install dependencies
async function setupDependencies() {
    const rootPackageJson = 'package.json';
    const rootPackageLock = 'package-lock.json';
    const rootNodeModules = 'node_modules';
    const layerPackageJson = 'layer/nodejs/package.json';
    const layerNodeModules = 'layer/nodejs/node_modules';

    let needsRestart = false;

    // Nuclear option: Always delete root dependencies
    console.log('  🗑️  Cleaning root dependencies...');
    if (existsSync(rootNodeModules)) {
        rmSync(rootNodeModules, { recursive: true, force: true });
        console.log('     ✓ Deleted node_modules/');
    }
    if (existsSync(rootPackageJson)) {
        rmSync(rootPackageJson, { force: true });
        console.log('     ✓ Deleted package.json');
    }
    if (existsSync(rootPackageLock)) {
        rmSync(rootPackageLock, { force: true });
        console.log('     ✓ Deleted package-lock.json');
    }
    console.log('  ✅ Root cleanup complete');

    // Sync dependencies from layer to root
    console.log('  📋 Syncing dependencies from layer...');
    const layerPkg = JSON.parse(readFileSync(layerPackageJson, 'utf8'));

    const rootPkg = {
        type: 'module',
        dependencies: {
            ...layerPkg.dependencies,
            // Local development dependencies (not needed in AWS Lambda)
            '@aws-sdk/client-dynamodb': '^3.0.0',
            '@aws-sdk/lib-dynamodb': '^3.0.0',
            'js-yaml': '^4.1.0'
        },
        devDependencies: {
            'serverless-offline': '^13.0.0',
            'serverless-esbuild': '^1.52.0',
            'esbuild': '^0.20.0'
        }
    };

    writeFileSync(rootPackageJson, JSON.stringify(rootPkg, null, 2));
    console.log('  ✅ Created fresh package.json from layer');

    // Install root dependencies
    console.log('  📦 Installing root dependencies...');
    try {
        await execAsync('npm install');
        console.log('  ✅ Root dependencies installed');
        needsRestart = true;
    } catch (error) {
        console.error('  ❌ Failed to install root dependencies');
        throw error;
    }

    // Check and install layer dependencies if missing
    if (!existsSync(layerNodeModules)) {
        console.log('  📦 Installing layer dependencies...');
        try {
            await execAsync('cd layer/nodejs && npm install');
            console.log('  ✅ Layer dependencies installed');
        } catch (error) {
            console.error('  ❌ Failed to install layer dependencies\n');
            console.error('   Run this command:');
            console.error('     cd layer/nodejs');
            console.error('     npm install\n');
            throw error;
        }
    } else {
        console.log('  ✅ Layer dependencies already installed');
    }

    return needsRestart;
}

// Step 2: Create symlink
async function setupSymlink() {
    const symlinkPath = 'shared';
    const targetPath = platform() === 'win32' ? 'layer\\nodejs\\shared' : 'layer/nodejs/shared';

    // Always recreate symlink
    if (existsSync(symlinkPath)) {
        console.log('  🗑️  Removing existing symlink...');
        rmSync(symlinkPath, { recursive: true, force: true });
    }

    try {
        symlinkSync(targetPath, symlinkPath, 'junction');
        console.log('  ✅ Symlink created: shared -> layer/nodejs/shared');
    } catch (error) {
        if (error.code === 'EPERM') {
            console.error('\n❌ Permission denied creating symlink.\n');
            console.error('   On Windows, run PowerShell as Administrator:\n');
            console.error('     Right-click PowerShell → "Run as Administrator"');
            console.error('     cd ' + process.cwd());
            console.error('     node setup-local.mjs\n');
            throw error;
        }
        throw error;
    }
}

// Step 3: Check Docker
async function checkDocker() {
    try {
        await execAsync('docker --version');
        console.log('  ✅ Docker is installed and available');
    } catch (error) {
        console.error('\n❌ Docker is not installed or not in PATH\n');
        console.error('   Install Docker Desktop from:');
        console.error('     https://www.docker.com/products/docker-desktop\n');
        throw new Error('Docker is required');
    }
}

// Step 4: Check DynamoDB Local
async function checkDynamoDBLocal() {
    const { DynamoDBClient, ListTablesCommand } = await import('@aws-sdk/client-dynamodb');
    const client = new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'us-east-1' });

    try {
        await client.send(new ListTablesCommand({}));
        console.log('  ✅ DynamoDB Local is running on http://localhost:8000');
        return client;
    } catch (error) {
        console.error('\n❌ DynamoDB Local is not running on http://localhost:8000\n');
        console.error('   Start it with:');
        console.error('     docker run -p 8000:8000 amazon/dynamodb-local\n');
        console.error('   Keep it running in a separate terminal.\n');
        throw new Error('DynamoDB Local not running');
    }
}

// Step 5: Parse serverless.yml dynamically
async function parseServerlessYml() {
    console.log('  📖 Parsing serverless.yml for table schemas...');

    const YAML = await import('js-yaml');
    const config = YAML.default.load(readFileSync('serverless.yml', 'utf8'));

    // Helper to resolve Serverless variables
    function resolveVariable(str) {
        if (typeof str !== 'string') return str;

        let resolved = str
            .replace(/\$\{self:service\}/g, config.service)
            .replace(/\$\{self:provider\.stage\}/g, 'dev');

        // Resolve environment variables like ${self:provider.environment.ACCOUNTS_TABLE}
        resolved = resolved.replace(/\$\{self:provider\.environment\.([A-Z_]+)\}/g, (match, key) => {
            const envValue = config.provider.environment[key];
            if (envValue) {
                return resolveVariable(envValue); // Recursively resolve
            }
            return match;
        });

        return resolved;
    }

    // Extract all DynamoDB tables from resources
    const tables = Object.values(config.resources.Resources)
        .filter(resource => resource.Type === 'AWS::DynamoDB::Table')
        .map(table => {
            const props = table.Properties;
            return {
                TableName: resolveVariable(props.TableName),
                KeySchema: props.KeySchema,
                AttributeDefinitions: props.AttributeDefinitions,
                GlobalSecondaryIndexes: props.GlobalSecondaryIndexes || undefined,
                BillingMode: props.BillingMode || 'PAY_PER_REQUEST',
                TimeToLiveSpecification: props.TimeToLiveSpecification || undefined
            };
        });

    console.log(`  ✅ Found ${tables.length} table(s) in serverless.yml:`);
    tables.forEach(t => console.log(`     - ${t.TableName}`));

    return tables;
}

// Step 6: Nuclear table cleanup - delete ALL tables
async function deleteAllTables(client) {
    const { ListTablesCommand, DeleteTableCommand, DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');

    const { TableNames } = await client.send(new ListTablesCommand({}));

    if (!TableNames || TableNames.length === 0) {
        console.log('  ℹ️  No existing tables found');
        return;
    }

    console.log(`  ℹ️  Found ${TableNames.length} existing table(s):`);
    TableNames.forEach(name => console.log(`     - ${name}`));

    console.log('  🗑️  Deleting all tables...');

    // Delete all tables
    for (const tableName of TableNames) {
        await client.send(new DeleteTableCommand({ TableName: tableName }));
        console.log(`     ✓ Deleting: ${tableName}`);
    }

    // Wait for all deletions to complete
    console.log('  ⏳ Waiting for deletions to complete...');
    for (const tableName of TableNames) {
        let deleted = false;
        while (!deleted) {
            try {
                await client.send(new DescribeTableCommand({ TableName: tableName }));
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                if (error.name === 'ResourceNotFoundException') {
                    deleted = true;
                    console.log(`     ✓ Confirmed deleted: ${tableName}`);
                } else {
                    throw error;
                }
            }
        }
    }

    // Verify zero tables remain
    const { TableNames: remaining } = await client.send(new ListTablesCommand({}));
    if (remaining && remaining.length > 0) {
        throw new Error(`Failed to delete all tables. Remaining: ${remaining.join(', ')}`);
    }

    console.log('  ✅ All tables deleted successfully');
}

// Step 7: Create fresh tables
async function createFreshTables(client, tables) {
    const { CreateTableCommand, DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');

    console.log(`  📋 Creating ${tables.length} fresh table(s)...`);

    for (const table of tables) {
        // Remove undefined fields
        const tableConfig = {
            TableName: table.TableName,
            KeySchema: table.KeySchema,
            AttributeDefinitions: table.AttributeDefinitions,
            BillingMode: table.BillingMode
        };

        if (table.GlobalSecondaryIndexes) {
            tableConfig.GlobalSecondaryIndexes = table.GlobalSecondaryIndexes;
        }

        if (table.TimeToLiveSpecification) {
            tableConfig.TimeToLiveSpecification = table.TimeToLiveSpecification;
        }

        await client.send(new CreateTableCommand(tableConfig));
        console.log(`     ✓ Creating: ${table.TableName}`);
    }

    // Wait for all tables to become ACTIVE
    console.log('  ⏳ Waiting for tables to become active...');
    for (const table of tables) {
        let active = false;
        while (!active) {
            const { Table } = await client.send(new DescribeTableCommand({ TableName: table.TableName }));
            if (Table.TableStatus === 'ACTIVE') {
                active = true;
                console.log(`     ✓ Active: ${table.TableName}`);
            } else {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // Verify all tables exist
    const { ListTablesCommand } = await import('@aws-sdk/client-dynamodb');
    const { TableNames } = await client.send(new ListTablesCommand({}));

    if (!TableNames || TableNames.length !== tables.length) {
        throw new Error(`Expected ${tables.length} tables, but found ${TableNames?.length || 0}`);
    }

    console.log('  ✅ All tables created and active');
}

// Main setup function
async function setup() {
    console.log('\n🚀 Banking API - Local Environment Setup\n');
    console.log('═'.repeat(50));

    try {
        // Step 0: Validate prerequisites
        console.log('\n📍 Step 0: Validating prerequisites');
        await validatePrerequisites();

        if (!SKIP_DEPS) {
            console.log('\n📍 Step 1: Setting up dependencies (nuclear cleanup)');
            const needsRestart = await setupDependencies();

            if (needsRestart) {
                console.log('\n' + '═'.repeat(50));
                console.log('\n⚠️  Dependencies installed. Restarting setup...\n');

                // Restart the script with dependencies installed
                const { spawn } = await import('child_process');
                const child = spawn('node', ['setup-local.mjs'], {
                    env: { ...process.env, SKIP_DEPS: 'true' },
                    stdio: 'inherit',
                    shell: true
                });

                child.on('exit', (code) => process.exit(code));
                return;
            }
        }

        console.log('\n📍 Step 2: Creating symlink for shared utilities');
        await setupSymlink();

        console.log('\n📍 Step 3: Checking Docker installation');
        await checkDocker();

        console.log('\n📍 Step 4: Checking DynamoDB Local connection');
        const client = await checkDynamoDBLocal();

        console.log('\n📍 Step 5: Parsing serverless.yml for table schemas');
        const tables = await parseServerlessYml();

        console.log('\n📍 Step 6: Nuclear table cleanup (delete all)');
        await deleteAllTables(client);

        console.log('\n📍 Step 7: Creating fresh tables');
        await createFreshTables(client, tables);

        console.log('\n' + '═'.repeat(50));
        console.log('\n✅ Setup complete! Environment is ready.\n');
        console.log('\n run "serverless offline start" in your cmd.\n');

    } catch (error) {
        console.log('\n' + '═'.repeat(50));
        console.error('\n❌ Setup failed:', error.message, '\n');
        process.exit(1);
    }
}

setup();