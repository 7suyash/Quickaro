// =============================================================================
// queryLedger.js - CLI Utility to Query Settlement Ledger
// =============================================================================
// Usage:
//   node queryLedger.js security <symbol> <owner>
//   node queryLedger.js balance <accountID>
//   node queryLedger.js trade <tradeID>
//
// Examples:
//   node queryLedger.js security RELIANCE brokerA
//   node queryLedger.js balance brokerA_cash
//   node queryLedger.js trade TX001
// =============================================================================

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const CHANNEL_NAME = 'settlementchannel';
const WALLET_PATH = path.join(__dirname, 'wallet');

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        printUsage();
        process.exit(1);
    }

    const queryType = args[0].toLowerCase();

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

        switch (queryType) {
            case 'security': {
                if (args.length !== 3) {
                    console.log('Usage: node queryLedger.js security <symbol> <owner>');
                    process.exit(1);
                }
                const [, symbol, owner] = args;
                const contract = network.getContract('securities-contract');
                const result = await contract.evaluateTransaction('QuerySecurityOwner', symbol, owner);
                const asset = JSON.parse(result.toString());

                console.log('─── Security Asset ───');
                console.log(`  Symbol:   ${asset.symbol}`);
                console.log(`  Owner:    ${asset.owner}`);
                console.log(`  Quantity: ${asset.quantity}`);
                break;
            }

            case 'balance': {
                if (args.length !== 2) {
                    console.log('Usage: node queryLedger.js balance <accountID>');
                    process.exit(1);
                }
                const [, accountID] = args;
                const contract = network.getContract('payment-contract');
                const result = await contract.evaluateTransaction('QueryBalance', accountID);

                console.log('─── Account Balance ───');
                console.log(`  Account: ${accountID}`);
                console.log(`  Balance: ₹${result.toString()}`);
                break;
            }

            case 'trade': {
                if (args.length !== 2) {
                    console.log('Usage: node queryLedger.js trade <tradeID>');
                    process.exit(1);
                }
                const [, tradeID] = args;
                const contract = network.getContract('settlement-contract');
                const result = await contract.evaluateTransaction('QueryTrade', tradeID);
                const trade = JSON.parse(result.toString());

                console.log('─── Trade Record ───');
                console.log(`  Trade ID:    ${trade.tradeID}`);
                console.log(`  Buyer:       ${trade.buyer}`);
                console.log(`  Seller:      ${trade.seller}`);
                console.log(`  Symbol:      ${trade.symbol}`);
                console.log(`  Quantity:    ${trade.quantity}`);
                console.log(`  Price:       ₹${trade.price}`);
                console.log(`  Trade Value: ₹${trade.tradeValue}`);
                console.log(`  Status:      ${trade.status}`);
                console.log(`  Settled At:  ${trade.settledAt}`);
                if (trade.failureReason) {
                    console.log(`  Failure:     ${trade.failureReason}`);
                }
                break;
            }

            default:
                printUsage();
                process.exit(1);
        }

        await gateway.disconnect();

    } catch (error) {
        console.error(`\n✗ Query failed: ${error.message || error}`);
        process.exit(1);
    }
}

function printUsage() {
    console.log('Usage:');
    console.log('  node queryLedger.js security <symbol> <owner>');
    console.log('  node queryLedger.js balance <accountID>');
    console.log('  node queryLedger.js trade <tradeID>');
    console.log();
    console.log('Examples:');
    console.log('  node queryLedger.js security RELIANCE brokerA');
    console.log('  node queryLedger.js balance brokerA_cash');
    console.log('  node queryLedger.js trade TX001');
}

main();
