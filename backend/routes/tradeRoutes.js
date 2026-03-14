// =================================================================
// routes/tradeRoutes.js - Express router for trade operations
// Handles all trade lifecycle API calls to the blockchain.
// Educational prototype - uses simulated tokens on local Hardhat network.
// =================================================================

const express = require("express");
const router = express.Router();
const {
  deployment,
  buyerWallet,
  sellerWallet,
  assetToken,
  paymentToken,
  settlementEngine,
  ethers,
  provider
} = require("../blockchain");

// In-memory trade cache for quick front-end listing
// (The source of truth is always the blockchain)
const tradeCache = {};
const { logTransaction } = require("../utils/transactionLogger");

// --------------------------------------------------------
// GET /trade/accounts
// Returns the wallet addresses dynamically based on the active network.
// --------------------------------------------------------
router.get("/accounts", (req, res) => {
  res.json({
    deployer: deployment.deployer,
    buyer: deployment.buyer,
    seller: deployment.seller
  });
});

// --------------------------------------------------------
// POST /trade/create
// Creates a new trade. The buyer is the fixed demo buyer wallet.
// Body: { seller, assetAmount, paymentAmount }
// --------------------------------------------------------
router.post("/create", async (req, res) => {
  try {
    const { seller, assetAmount, paymentAmount } = req.body;

    if (!seller || !assetAmount || !paymentAmount) {
      return res.status(400).json({ error: "Missing required fields: seller, assetAmount, paymentAmount" });
    }

    const assetWei = ethers.parseEther(String(assetAmount));
    const paymentWei = ethers.parseEther(String(paymentAmount));

    // Buyer submits the createTrade transaction
    const engineAsBuyer = settlementEngine.connect(buyerWallet);
    const tx = await engineAsBuyer.createTrade(seller, assetWei, paymentWei);
    const receipt = await tx.wait();

    // Extract tradeId from the TradeCreated event
    const event = receipt.logs
      .map((log) => {
        try { return settlementEngine.interface.parseLog(log); } catch { return null; }
      })
      .find((e) => e && e.name === "TradeCreated");

    const tradeId = event ? event.args.tradeId.toString() : null;

    if (tradeId) {
      tradeCache[tradeId] = {
        tradeId,
        buyer: deployment.buyer,
        seller,
        assetAmount,
        paymentAmount,
        status: "Created",
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        duration: null
      };
    }

    res.json({ success: true, tradeId, txHash: receipt.hash });
  } catch (err) {
    console.error("createTrade error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------
// POST /trade/confirm
// Confirms a trade. Must be called by the seller.
// Body: { tradeId }
// --------------------------------------------------------
router.post("/confirm", async (req, res) => {
  try {
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ error: "Missing tradeId" });

    // Seller approves the SettlementEngine to transfer BOND tokens on their behalf
    const engineAddress = await settlementEngine.getAddress();
    const trade = await settlementEngine.trades(tradeId);
    
    // Ensure the caller is the actual seller from the trade
    const actualSellerAddress = await sellerWallet.getAddress();
    if (trade.seller.toLowerCase() !== actualSellerAddress.toLowerCase()) {
       return res.status(400).json({ error: `Only the seller (${trade.seller}) can confirm this trade. The configured backend seller is ${actualSellerAddress}.` });
    }

    const assetAmount = trade.assetAmount;

    const assetAsSeller = assetToken.connect(sellerWallet);
    const approveTx = await assetAsSeller.approve(engineAddress, assetAmount);
    await approveTx.wait();

    // Seller confirms the trade
    const engineAsSeller = settlementEngine.connect(sellerWallet);
    const tx = await engineAsSeller.confirmTrade(tradeId);
    const receipt = await tx.wait();

    if (tradeCache[tradeId]) {
      tradeCache[tradeId].status = "Confirmed";
      tradeCache[tradeId].txHash = receipt.hash;
      tradeCache[tradeId].blockNumber = receipt.blockNumber;
    }

    res.json({ success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (err) {
    console.error("confirmTrade error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------
// POST /trade/settle
// Settles a confirmed trade atomically (DvP).
// Body: { tradeId }
// --------------------------------------------------------
router.post("/settle", async (req, res) => {
  try {
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ error: "Missing tradeId" });

    const engineAddress = await settlementEngine.getAddress();
    const trade = await settlementEngine.trades(tradeId);
    const paymentAmount = trade.paymentAmount;

    // Buyer approves SettlementEngine to spend SET tokens
    const paymentAsBuyer = paymentToken.connect(buyerWallet);
    const approveTx = await paymentAsBuyer.approve(engineAddress, paymentAmount);
    await approveTx.wait();

    // Anyone can call settleTrade - using deployer for simplicity
    const start = Date.now();
    const tx = await settlementEngine.settleTrade(tradeId);
    const receipt = await tx.wait();
    const end = Date.now();
    const durationMs = end - start;

    if (tradeCache[tradeId]) {
      tradeCache[tradeId].status = "Settled";
      tradeCache[tradeId].txHash = receipt.hash;
      tradeCache[tradeId].blockNumber = receipt.blockNumber;
      tradeCache[tradeId].duration = durationMs;
    }

    // ── Log left-offs and time to terminal ──
    let sellerAddr;

    if (tradeCache[tradeId] && tradeCache[tradeId].seller) {
      sellerAddr = tradeCache[tradeId].seller;
    } else {
      const tradeData = await settlementEngine.trades(tradeId);
      sellerAddr = tradeData.seller;
    }

    if (!sellerAddr || sellerAddr === ethers.ZeroAddress) {
      throw new Error("Invalid seller address");
    }

    const buyerAddress = await buyerWallet.getAddress();

    console.log("Seller Address:", sellerAddr);
    console.log("Buyer Address:", buyerAddress);
    console.log("Engine Address:", engineAddress);
    
    // Convert addresses to format safely stringable for log
    const buyerBOND = ethers.formatEther(await assetToken.balanceOf(buyerAddress));
    const buyerSET = ethers.formatEther(await paymentToken.balanceOf(buyerAddress));
    const sellerBOND = ethers.formatEther(await assetToken.balanceOf(sellerAddr));
    const sellerSET = ethers.formatEther(await paymentToken.balanceOf(sellerAddr));
    
    const timeOfTx = new Date().toLocaleString();

    console.log("\n============================================================");
    console.log(`✅ TRADE #${tradeId} SETTLED AT: ${timeOfTx}`);
    console.log("============================================================");
    console.log(` BUYER  (${buyerAddress.slice(0, 6)}...${buyerAddress.slice(-4)}) remaining: ${buyerBOND} BOND | ${buyerSET} SET`);
    console.log(` SELLER (${sellerAddr.slice(0, 6)}...${sellerAddr.slice(-4)}) remaining: ${sellerBOND} BOND | ${sellerSET} SET`);
    console.log("============================================================\n");

    const assetQty = ethers.formatEther(trade.assetAmount);
    const setPayment = ethers.formatEther(trade.paymentAmount);
    const pricePerUnit = Number(assetQty) > 0 ? (Number(setPayment) / Number(assetQty)).toString() : "0";

    logTransaction({
      tradeId: tradeId.toString(),
      timestamp: new Date().toISOString(),
      buyerAddress: buyerAddress,
      sellerAddress: sellerAddr,
      assetSymbol: "BOND",
      quantity: assetQty,
      price: pricePerUnit,
      totalValue: setPayment,
      txHash: receipt.hash,
      status: "SETTLED"
    });

    res.json({ success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber, duration: durationMs });
  } catch (err) {
    console.error("settleTrade error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------
// GET /trade/list
// Returns all trades from the blockchain (with cache overlay).
// --------------------------------------------------------
router.get("/list", async (req, res) => {
  try {
    const count = await settlementEngine.getTradeCount();
    const trades = [];
    const statusNames = ["Created", "Confirmed", "Settled"];

    for (let i = 1; i <= Number(count); i++) {
      const t = await settlementEngine.trades(i);
      const cacheData = tradeCache[t.tradeId.toString()] || {};
      trades.push({
        tradeId: t.tradeId.toString(),
        buyer: t.buyer,
        seller: t.seller,
        assetAmount: ethers.formatEther(t.assetAmount),
        paymentAmount: ethers.formatEther(t.paymentAmount),
        status: statusNames[Number(t.status)],
        txHash: cacheData.txHash || null,
        blockNumber: cacheData.blockNumber || null,
        duration: cacheData.duration || null
      });
    }

    res.json({ trades });
  } catch (err) {
    console.error("listTrades error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------
// GET /portfolio/:address
// Returns BOND and SET balances for a given wallet address.
// --------------------------------------------------------
router.get("/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid Ethereum address" });
    }

    const bondBalance = await assetToken.balanceOf(address);
    const setBalance = await paymentToken.balanceOf(address);

    res.json({
      address,
      assetBalance: ethers.formatEther(bondBalance),
      paymentBalance: ethers.formatEther(setBalance),
      labels: { asset: "BOND", payment: "SET" },
    });
  } catch (err) {
    console.error("portfolio error:", err);
    res.status(500).json({ error: err.message });
  }
});
// GET /trade/status/:txHash
router.get("/status/:txHash", async (req, res) => {
  try {
    const { txHash } = req.params;

    // Basic validation
    if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
      return res.status(400).json({ error: "Invalid transaction hash" });
    }

    // Get the transaction receipt from the active provider
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return res.json({
        exists: false,
        message: "Transaction not mined yet or does not exist on Sepolia",
      });
    }

    // If mined, return all useful info
    res.json({
      exists: true,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? "Success" : "Failed",
      gasUsed: receipt.gasUsed.toString(),
      logsCount: receipt.logs.length,
      txHash: receipt.transactionHash,
    });
  } catch (err) {
    console.error("checkTxHash error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;