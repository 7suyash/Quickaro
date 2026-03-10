// =================================================================
// server.js - Express server entry point
// Educational Prototype - Atomic Trade Settlement Platform
// Runs against a local Hardhat blockchain node only.
// =================================================================

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend")));

// Trade API routes (covers /trade/* and /portfolio/*)
const tradeRoutes = require("./routes/tradeRoutes");
app.use("/trade", tradeRoutes);
app.use("/portfolio", tradeRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Atomic Settlement API running" });
});

// Fallback - serve frontend for any non-API routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.listen(PORT, () => {
  console.log("==============================================");
  console.log("  Atomic Trade Settlement Platform API");
  console.log(`  Server running at: http://localhost:${PORT}`);
  console.log("  Educational prototype - simulated tokens only");
  console.log("==============================================");
});
