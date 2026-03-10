// =============================================================================
// invokeSettlement.js - CLI Utility to Invoke Atomic DvP Settlement
// =============================================================================
// Usage:
//   node invokeSettlement.js <tradeID> <buyer> <seller> <symbol> <qty> <price>
//
// Example:
//   node invokeSettlement.js TX002 brokerA brokerB TCS 50 3500
// =============================================================================

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const CHANNEL_NAME = 'settlementchannel';
const SETTLEMENT_CONTRACT = 'settlement-contract';
const WALLET_PATH = path.join(__dirname, 'wallet');

async function main() {
    const args = process.argv.slice(2);

    if (args.length !== 6) {
        console.log('Usage: node invokeSettlement.js <tradeID> <buyer> <seller> <symbol> <qty> <price>');
        console.log('Example: node invokeSettlement.js TX002 brokerA brokerB TCS 50 3500');
        process.exit(1);
    }

    const [tradeID, buyer, seller, symbol, qty, price] = args;

    try {
        // Load connection profile
        const ccpPath = path.resolve(__dirname, '..', '..', 'config', 'connection-profile.json');
        if (!fs.existsSync(ccpPath)) {
            throw new Error(`Connection profile not found at ${ccpPath}`);
        }
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Connect to network
        const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);
        const identity = await wallet.get('exchangeUser');
        if (!identity) {
            throw new Error('exchangeUser not found in wallet. Run app.js first to enroll.');
        }

        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: 'exchangeUser',
            discovery: { enabled: true, asLocalhost: true },
        });

        const network = await gateway.getNetwork(CHANNEL_NAME);
        const contract = network.getContract(SETTLEMENT_CONTRACT);

        // Execute atomic settlement
        console.log('─── Invoking Atomic Settlement ───');
        console.log(`  Trade ID: ${tradeID}`);
        console.log(`  Buyer:    ${buyer}`);
        console.log(`  Seller:   ${seller}`);
        console.log(`  Symbol:   ${symbol}`);
        console.log(`  Quantity: ${qty}`);
        console.log(`  Price:    ₹${price}`);
        console.log(`  Value:    ₹${parseInt(qty) * parseInt(price)}`);
        console.log();

        const startTime = Date.now();
        await contract.submitTransaction(
            'AtomicSettlement', tradeID, buyer, seller, symbol, qty, price
        );
        const elapsed = Date.now() - startTime;

        console.log(`✓ Settlement completed successfully in ${elapsed}ms`);

        // Query the trade record
        const tradeResult = await contract.evaluateTransaction('QueryTrade', tradeID);
        const trade = JSON.parse(tradeResult.toString());
        console.log(`  Status:     ${trade.status}`);
        console.log(`  Settled At: ${trade.settledAt}`);

        await gateway.disconnect();

    } catch (error) {
        console.error(`\n✗ Settlement failed: ${error.message || error}`);
        process.exit(1);
    }
}

main();
