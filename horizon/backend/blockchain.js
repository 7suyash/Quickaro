// =================================================================
// blockchain.js - Ethers.js setup for the backend
// Connects to the local Hardhat node and loads contract instances.
// Educational prototype - reads from deployment.json written by deploy.cjs
// =================================================================

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Load deployment info (written by scripts/deploy.cjs after deploy)
const deploymentPath = path.join(__dirname, "deployment.json");

let deployment;
try {
  deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
} catch (e) {
  console.error("ERROR: backend/deployment.json not found.");
  console.error("Please run 'npm run deploy' first to deploy the contracts.");
  process.exit(1);
}

// Load compiled ABIs from Hardhat artifacts
function loadABI(contractName) {
  const artifactPath = path.join(
    __dirname,
    `../artifacts/contracts/${contractName}.sol/${contractName}.json`
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return artifact.abi;
}

// Connect to local Hardhat node
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

// Use Hardhat test accounts (index 0 = deployer/admin, 1 = buyer, 2 = seller)
// Private keys are well-known Hardhat test keys - safe for local dev only
const HARDHAT_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // account[0] deployer
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // account[1] buyer
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // account[2] seller
];

const deployerWallet = new ethers.Wallet(HARDHAT_PRIVATE_KEYS[0], provider);
const buyerWallet = new ethers.Wallet(HARDHAT_PRIVATE_KEYS[1], provider);
const sellerWallet = new ethers.Wallet(HARDHAT_PRIVATE_KEYS[2], provider);

// Load ABIs
const assetABI = loadABI("AssetContract");
const paymentABI = loadABI("PaymentToken");
const settlementABI = loadABI("SettlementEngine");

// Contract instances (connected as deployer for admin ops)
const assetToken = new ethers.Contract(
  deployment.contracts.AssetToken,
  assetABI,
  deployerWallet
);

const paymentToken = new ethers.Contract(
  deployment.contracts.PaymentToken,
  paymentABI,
  deployerWallet
);

const settlementEngine = new ethers.Contract(
  deployment.contracts.SettlementEngine,
  settlementABI,
  deployerWallet
);

module.exports = {
  provider,
  deployment,
  deployerWallet,
  buyerWallet,
  sellerWallet,
  assetToken,
  paymentToken,
  settlementEngine,
  ethers,
};
