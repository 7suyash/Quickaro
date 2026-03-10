const { ethers } = require("hardhat");

async function main() {

  const [deployer] = await ethers.getSigners();

  console.log("Deploying with:", deployer.address);

  // Deploy AssetContract
  const AssetContract = await ethers.getContractFactory("AssetContract");
  const asset = await AssetContract.deploy(deployer.address);
  await asset.waitForDeployment();

  console.log("AssetContract:", await asset.getAddress());

  // Deploy PaymentToken
  const PaymentToken = await ethers.getContractFactory("PaymentToken");
  const payment = await PaymentToken.deploy(deployer.address);
  await payment.waitForDeployment();

  console.log("PaymentToken:", await payment.getAddress());

  // Deploy SettlementEngine
  const SettlementEngine = await ethers.getContractFactory("SettlementEngine");

  const engine = await SettlementEngine.deploy(
      await asset.getAddress(),
      await payment.getAddress()
  );

  await engine.waitForDeployment();

  console.log("SettlementEngine:", await engine.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});