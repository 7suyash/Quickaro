# Real-Time Settlement for Indian Stock Markets

> Blockchain-based atomic Delivery-versus-Payment (DvP) settlement using Hyperledger Fabric

## Overview

This project implements a permissioned blockchain settlement layer that enables real-time settlement of equity trades on Indian stock markets. Instead of the traditional T+1 settlement cycle, trades are settled in **2–10 seconds** using atomic smart contract execution on Hyperledger Fabric.

## Architecture

```
Trader → Broker → Exchange → Settlement Smart Contract → Blockchain Ledger
```

### Network Participants

| Participant             | Role                                      |
|-------------------------|--------------------------------------------|
| **Exchange Node**       | Submits trade records for settlement        |
| **Clearing Corp Node**  | Validates and monitors clearing obligations |
| **Broker Node**         | Represents buy/sell parties                 |
| **Bank Node**           | Manages cash settlement accounts            |
| **Regulator Node**      | Read-only audit and compliance access       |

### Smart Contracts

1. **Securities Contract** — Manages equity ownership records (create, issue, transfer, query)
2. **Payment Contract** — Manages bank settlement accounts (create, credit, debit, transfer)
3. **Settlement Contract** — Executes atomic DvP (simultaneous share + cash transfer in one transaction)

## Prerequisites

- Docker & Docker Compose
- Go 1.21+
- Node.js 18+
- Hyperledger Fabric binaries (2.5+)

## Quick Start

```bash
# 1. Start the Fabric network
./scripts/start-network.sh

# 2. Create the settlement channel
./scripts/create-channel.sh

# 3. Deploy all three chaincodes
./scripts/deploy-chaincode.sh

# 4. Run the demo settlement
cd application/client-sdk
npm install
node app.js
```

## Demo Scenario

| State       | BrokerA                  | BrokerB                  |
|-------------|--------------------------|--------------------------|
| **Before**  | ₹500,000 cash            | 100 RELIANCE shares      |
| **Trade**   | Buys 100 RELIANCE @ ₹2,500 | Sells 100 RELIANCE @ ₹2,500 |
| **After**   | ₹250,000 cash + 100 shares | ₹250,000 cash + 0 shares |

Settlement completes in seconds with full atomicity — if any step fails, the entire transaction rolls back.

## Project Structure

```
realtime-settlement-blockchain/
├── network/          # Fabric network configuration
├── organizations/    # MSP crypto materials per org
├── chaincode/        # Go smart contracts
├── application/      # Node.js client SDK
├── config/           # Connection profiles
├── scripts/          # Network lifecycle scripts
└── docs/             # Architecture documentation
```

## License

MIT
