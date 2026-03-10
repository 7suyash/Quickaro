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
} = require("../blockchain");

// In-memory trade cache for quick front-end listing
// (The source of truth is always the blockchain)
const tradeCache = {};

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
    }

    res.json({ success: true, txHash: receipt.hash });
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
    const tx = await settlementEngine.settleTrade(tradeId);
    const receipt = await tx.wait();

    if (tradeCache[tradeId]) {
      tradeCache[tradeId].status = "Settled";
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

    res.json({ success: true, txHash: receipt.hash });
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
      trades.push({
        tradeId: t.tradeId.toString(),
        buyer: t.buyer,
        seller: t.seller,
        assetAmount: ethers.formatEther(t.assetAmount),
        paymentAmount: ethers.formatEther(t.paymentAmount),
        status: statusNames[Number(t.status)],
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

module.exports = router;