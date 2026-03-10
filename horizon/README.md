# ⚡ Atomic Trade Settlement Platform

> **Educational Prototype** — Simulated Delivery vs Payment (DvP) using smart contracts on a local Hardhat blockchain.  
> This project does **not** interact with real financial systems or real money.

---

## 🗂️ Project Structure

```
horizon/
├── contracts/
│   ├── AssetContract.sol      # ERC-20 BOND token (tokenized asset)
│   ├── PaymentToken.sol       # ERC-20 SET token (settlement currency)
│   └── SettlementEngine.sol   # DvP atomic settlement engine
├── scripts/
│   └── deploy.cjs             # Deploys contracts, mints demo tokens
├── backend/
│   ├── server.js              # Express API server
│   ├── blockchain.js          # ethers.js setup & contract instances
│   ├── deployment.json        # Auto-generated after deploy (contract addresses)
│   └── routes/
│       └── tradeRoutes.js     # Trade lifecycle API endpoints
├── frontend/
│   ├── index.html             # Dashboard UI
│   ├── style.css              # Modern fintech CSS
│   └── app.js                 # API calls & DOM logic
├── hardhat.config.cjs         # Hardhat config (local network)
├── package.json
└── README.md
```

---

## 🚀 Setup Guide

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm

### Step 1 — Install Dependencies

```bash
npm install
```

### Step 2 — Compile Smart Contracts

```bash
npm run compile
```

### Step 3 — Start the Local Blockchain Node

Open a **new terminal** and run:

```bash
npm run node
```

Keep this terminal open. This starts a local Hardhat blockchain at `http://127.0.0.1:8545`.

### Step 4 — Deploy Contracts & Mint Demo Tokens

In another terminal:

```bash
npm run deploy
```

This will:
- Deploy `AssetContract` (BOND), `PaymentToken` (SET), and `SettlementEngine`
- Mint **1000 BOND** to the demo seller
- Mint **5000 SET** to the demo buyer
- Write contract addresses to `backend/deployment.json`

### Step 5 — Start the Backend Server

```bash
npm run backend
```

Server runs at `http://localhost:3001`

### Step 6 — Open the Frontend

Open your browser and navigate to:

```
http://localhost:3001
```

---

## 🎮 How to Use the Dashboard

### Demo Accounts (Hardhat local network)

| Role     | Address                                      | Initial Balance |
|----------|----------------------------------------------|-----------------|
| Deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Admin           |
| Buyer    | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 5000 SET        |
| Seller   | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 1000 BOND       |

### Trade Lifecycle

1. **Create Trade** — Fill in the seller address, BOND amount, SET amount, and click **Create Trade**. The buyer initiates the trade.
2. **Confirm Trade** — Click **✓ Confirm** on the trade row. The seller approves and confirms.
3. **Settle Trade** — Click **⚡ Settle**. The smart contract atomically swaps BOND (seller→buyer) and SET (buyer→seller) in a single transaction.

---

## 🔌 API Endpoints

| Method | Endpoint             | Description                      |
|--------|----------------------|----------------------------------|
| POST   | `/trade/create`      | Create a new trade               |
| POST   | `/trade/confirm`     | Confirm a trade (seller)         |
| POST   | `/trade/settle`      | Atomically settle a trade (DvP)  |
| GET    | `/trade/list`        | List all trades from blockchain  |
| GET    | `/portfolio/:addr`   | Get BOND & SET balances          |

---

## ⚙️ Smart Contracts

### SettlementEngine — DvP Logic

```
settleTrade(tradeId)
  ├─ transferFrom(seller → buyer, BOND amount)   ← Asset delivery
  └─ transferFrom(buyer  → seller, SET amount)   ← Payment
         ↑ Both or neither — atomic!
```

If either token transfer fails, the entire transaction reverts.

---

## ⚠️ Safety Notice

- Runs entirely on a **local Hardhat node** — no external network connections
- Uses **demo tokens only** (BOND, SET) — no real monetary value
- Private keys used are the **well-known Hardhat test keys** — never use these on a real network
- For educational and prototyping purposes only
