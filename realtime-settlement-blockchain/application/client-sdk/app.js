// =============================================================================
// app.js - Main Application: Demo Settlement Scenario
// =============================================================================
// Connects to the Hyperledger Fabric network and runs the full demo:
//   1. Enroll admin user
//   2. Register and enroll client users
//   3. Set up initial state (accounts + securities)
//   4. Execute atomic DvP settlement
//   5. Query final state to verify
// =============================================================================

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CHANNEL_NAME = 'settlementchannel';
const SECURITIES_CONTRACT = 'securities-contract';
const PAYMENT_CONTRACT = 'payment-contract';
const SETTLEMENT_CONTRACT = 'settlement-contract';
const WALLET_PATH = path.join(__dirname, 'wallet');
const CONNECTION_PROFILE_PATH = path.resolve(
    __dirname, '..', '..', 'config', 'connection-profile.yaml'
);

// ---------------------------------------------------------------------------
// Helper: Load connection profile
// ---------------------------------------------------------------------------
function loadConnectionProfile() {
    const profilePath = CONNECTION_PROFILE_PATH.replace('.yaml', '.json');
    if (fs.existsSync(profilePath)) {
        return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    }
    // Fallback: try YAML (requires yaml parser)
    if (fs.existsSync(CONNECTION_PROFILE_PATH)) {
        console.log('Note: YAML connection profile detected. For production, convert to JSON.');
        // Return a minimal profile for demo purposes
        return buildMinimalProfile();
    }
    throw new Error(`Connection profile not found at ${CONNECTION_PROFILE_PATH}`);
}

function buildMinimalProfile() {
    return {
        name: 'settlement-network',
        version: '1.0.0',
        client: {
            organization: 'ExchangeOrg',
        },
        organizations: {
            ExchangeOrg: {
                mspid: 'ExchangeMSP',
                peers: ['peer0.exchange.settlement.com'],
                certificateAuthorities: ['ca.exchange.settlement.com'],
            },
        },
        peers: {
            'peer0.exchange.settlement.com': {
                url: 'grpcs://localhost:7051',
            },
        },
        certificateAuthorities: {
            'ca.exchange.settlement.com': {
                url: 'https://localhost:7054',
                caName: 'ca-exchange',
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Enroll Admin
// ---------------------------------------------------------------------------
async function enrollAdmin(ccp) {
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);

    const adminIdentity = await wallet.get('admin');
    if (adminIdentity) {
        console.log('✓ Admin identity already exists in wallet');
        return;
    }

    const caInfo = ccp.certificateAuthorities['ca.exchange.settlement.com'];
    const ca = new FabricCAServices(caInfo.url);

    const enrollment = await ca.enroll({
        enrollmentID: 'admin',
        enrollmentSecret: 'adminpw',
    });

    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
        },
        mspId: 'ExchangeMSP',
        type: 'X.509',
    };

    await wallet.put('admin', x509Identity);
    console.log('✓ Admin enrolled and added to wallet');
}

// ---------------------------------------------------------------------------
// Register User
// ---------------------------------------------------------------------------
async function registerUser(ccp, userId) {
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);

    const userIdentity = await wallet.get(userId);
    if (userIdentity) {
        console.log(`✓ User '${userId}' already exists in wallet`);
        return;
    }

    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
        throw new Error('Admin must be enrolled before registering users');
    }

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: 'admin',
        discovery: { enabled: true, asLocalhost: true },
    });

    const ca = gateway.getClient().getCertificateAuthority();
    const adminUser = gateway.getCurrentIdentity();

    const secret = await ca.register({
        affiliation: 'org1.department1',
        enrollmentID: userId,
        role: 'client',
    }, adminUser);

    const enrollment = await ca.enroll({
        enrollmentID: userId,
        enrollmentSecret: secret,
    });

    const x509Identity = {
        credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
        },
        mspId: 'ExchangeMSP',
        type: 'X.509',
    };

    await wallet.put(userId, x509Identity);
    console.log(`✓ User '${userId}' registered and enrolled`);

    await gateway.disconnect();
}

// ---------------------------------------------------------------------------
// Main Demo
// ---------------------------------------------------------------------------
async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Real-Time Settlement Demo - Indian Stock Markets');
    console.log('  Blockchain: Hyperledger Fabric');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();

    try {
        // Load connection profile
        const ccp = loadConnectionProfile();

        // Step 1: Enroll admin
        console.log('─── Step 1: Enroll Admin ───');
        await enrollAdmin(ccp);
        console.log();

        // Step 2: Register users
        console.log('─── Step 2: Register Users ───');
        await registerUser(ccp, 'exchangeUser');
        console.log();

        // Step 3: Connect to network
        console.log('─── Step 3: Connect to Network ───');
        const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);
        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: 'exchangeUser',
            discovery: { enabled: true, asLocalhost: true },
        });

        const network = await gateway.getNetwork(CHANNEL_NAME);
        const securitiesContract = network.getContract(SECURITIES_CONTRACT);
        const paymentContract = network.getContract(PAYMENT_CONTRACT);
        const settlementContract = network.getContract(SETTLEMENT_CONTRACT);
        console.log('✓ Connected to settlement channel');
        console.log();

        // Step 4: Set up initial state
        console.log('─── Step 4: Initialize State ───');

        // Create BrokerA cash account: ₹500,000
        await paymentContract.submitTransaction(
            'CreateAccount', 'brokerA_cash', 'brokerA', '500000'
        );
        console.log('✓ BrokerA cash account created: ₹500,000');

        // Create BrokerB cash account: ₹0
        await paymentContract.submitTransaction(
            'CreateAccount', 'brokerB_cash', 'brokerB', '0'
        );
        console.log('✓ BrokerB cash account created: ₹0');

        // Issue 100 RELIANCE shares to BrokerB
        await securitiesContract.submitTransaction(
            'CreateSecurity', 'RELIANCE', 'brokerB', '100'
        );
        console.log('✓ BrokerB issued 100 RELIANCE shares');
        console.log();

        // Step 5: Display initial state
        console.log('─── Step 5: Initial State ───');
        const brokerABalance = await paymentContract.evaluateTransaction(
            'QueryBalance', 'brokerA_cash'
        );
        const brokerBBalance = await paymentContract.evaluateTransaction(
            'QueryBalance', 'brokerB_cash'
        );
        const brokerBShares = await securitiesContract.evaluateTransaction(
            'QuerySecurityOwner', 'RELIANCE', 'brokerB'
        );

        console.log(`  BrokerA: ₹${brokerABalance.toString()} cash`);
        console.log(`  BrokerB: ₹${brokerBBalance.toString()} cash, ${JSON.parse(brokerBShares.toString()).quantity} RELIANCE shares`);
        console.log();

        // Step 6: Execute atomic DvP settlement
        console.log('─── Step 6: Atomic DvP Settlement ───');
        console.log('  Trade: BrokerA buys 100 RELIANCE @ ₹2,500 from BrokerB');

        const startTime = Date.now();
        await settlementContract.submitTransaction(
            'AtomicSettlement', 'TX001', 'brokerA', 'brokerB', 'RELIANCE', '100', '2500'
        );
        const settlementTime = Date.now() - startTime;

        console.log(`  ✓ Settlement completed in ${settlementTime}ms`);
        console.log();

        // Step 7: Display final state
        console.log('─── Step 7: Post-Settlement State ───');
        const finalBrokerABalance = await paymentContract.evaluateTransaction(
            'QueryBalance', 'brokerA_cash'
        );
        const finalBrokerBBalance = await paymentContract.evaluateTransaction(
            'QueryBalance', 'brokerB_cash'
        );
        const brokerAShares = await securitiesContract.evaluateTransaction(
            'GetShares', 'brokerA', 'RELIANCE'
        );
        const finalBrokerBShares = await securitiesContract.evaluateTransaction(
            'GetShares', 'brokerB', 'RELIANCE'
        );

        console.log(`  BrokerA: ₹${finalBrokerABalance.toString()} cash, ${brokerAShares.toString()} RELIANCE shares`);
        console.log(`  BrokerB: ₹${finalBrokerBBalance.toString()} cash, ${finalBrokerBShares.toString()} RELIANCE shares`);
        console.log();

        // Step 8: Query trade record
        console.log('─── Step 8: Trade Record ───');
        const tradeResult = await settlementContract.evaluateTransaction(
            'QueryTrade', 'TX001'
        );
        const trade = JSON.parse(tradeResult.toString());
        console.log(`  Trade ID:    ${trade.tradeID}`);
        console.log(`  Buyer:       ${trade.buyer}`);
        console.log(`  Seller:      ${trade.seller}`);
        console.log(`  Symbol:      ${trade.symbol}`);
        console.log(`  Quantity:    ${trade.quantity}`);
        console.log(`  Price:       ₹${trade.price}`);
        console.log(`  Trade Value: ₹${trade.tradeValue}`);
        console.log(`  Status:      ${trade.status}`);
        console.log(`  Settled At:  ${trade.settledAt}`);
        console.log();

        console.log('═══════════════════════════════════════════════════════════════');
        console.log('  ✓ Demo completed successfully!');
        console.log('  Settlement achieved in seconds instead of T+1');
        console.log('═══════════════════════════════════════════════════════════════');

        await gateway.disconnect();

    } catch (error) {
        console.error(`\n✗ Error: ${error.message || error}`);
        process.exit(1);
    }
}

main();
