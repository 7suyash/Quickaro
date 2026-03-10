// =================================================================
// deploy.cjs - Deployment script for the Atomic Settlement Platform
// Runs on a local Hardhat node (http://127.0.0.1:8545)
// This is an educational prototype - no real assets involved.
// =================================================================

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, buyer, seller] = await ethers.getSigners();

  console.log("==============================================");
  console.log("  Atomic Trade Settlement Platform (Demo)");
  console.log("  Educational Prototype - Simulated Tokens");
  console.log("==============================================\n");

  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy AssetContract (BOND token)
  const AssetContract = await ethers.getContractFactory("AssetContract");
  const assetToken = await AssetContract.deploy(deployer.address);
  await assetToken.waitForDeployment();
  const assetTokenAddress = await assetToken.getAddress();
  console.log("AssetContract (BOND) deployed to:", assetTokenAddress);

  // 2. Deploy PaymentToken (SET token)
  const PaymentToken = await ethers.getContractFactory("PaymentToken");
  const paymentToken = await PaymentToken.deploy(deployer.address);
  await paymentToken.waitForDeployment();
  const paymentTokenAddress = await paymentToken.getAddress();
  console.log("PaymentToken (SET) deployed to:", paymentTokenAddress);

  // 3. Deploy SettlementEngine
  const SettlementEngine = await ethers.getContractFactory("SettlementEngine");
  const settlementEngine = await SettlementEngine.deploy(assetTokenAddress, paymentTokenAddress);
  await settlementEngine.waitForDeployment();
  const settlementEngineAddress = await settlementEngine.getAddress();
  console.log("SettlementEngine deployed to:", settlementEngineAddress);

  // 4. Mint demo tokens to test accounts
  const BOND_AMOUNT = ethers.parseEther("1000"); // 1000 BOND to seller
  const SET_AMOUNT = ethers.parseEther("5000");   // 5000 SET to buyer

  await assetToken.mint(seller.address, BOND_AMOUNT);
  console.log(`\nMinted 1000 BOND to seller: ${seller.address}`);

  await paymentToken.mint(buyer.address, SET_AMOUNT);
  console.log(`Minted 5000 SET to buyer: ${buyer.address}`);

  // 5. Save deployed addresses + account info to a JSON file for backend use
  const deploymentInfo = {
    network: "localhost",
    deployer: deployer.address,
    buyer: buyer.address,
    seller: seller.address,
    contracts: {
      AssetToken: assetTokenAddress,
      PaymentToken: paymentTokenAddress,
      SettlementEngine: settlementEngineAddress,
    },
  };

  const outputPath = path.join(__dirname, "../backend/deployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n==============================================");
  console.log("Deployment complete!");
  console.log(`Deployment info saved to: backend/deployment.json`);
  console.log("\nDemo Accounts:");
  console.log("  Deployer:", deployer.address);
  console.log("  Buyer:   ", buyer.address, "(has 5000 SET)");
  console.log("  Seller:  ", seller.address, "(has 1000 BOND)");
  console.log("==============================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
