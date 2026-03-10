/**
 * app.js - Quickaro — Atomic Trade Settlement Platform
 * Blueprint Sketch UI with sidebar role toggle and live clock.
 */

const API_BASE = "http://localhost:3001";

// ── State ──────────────────────────────────────────────────────────
let accounts = {};
let currentPortfolioAccount = "buyer";

// ── Parallax Scroll ────────────────────────────────────────────────
function initParallax() {
  const layers = document.querySelectorAll(".parallax-layer");
  let ticking = false;

  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        layers.forEach(layer => {
          const speed = parseFloat(layer.dataset.speed) || 0.02;
          layer.style.transform = `translateY(${scrollY * speed * -1}px)`;
        });
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

// ── Sidebar Clock ──────────────────────────────────────────────────
function initClock() {
  const clockEl = document.getElementById("sidebar-clock");
  if (!clockEl) return;

  function tick() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  tick();
  setInterval(tick, 1000);
}

// ── Sidebar Role Toggle ───────────────────────────────────────────
function initRoleToggle() {
  const roleBtns = document.querySelectorAll(".role-btn");

  roleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.role;
      if (!role) return;

      // Update sidebar toggle active state
      roleBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Switch portfolio account to match role
      switchPortfolioAccount(role);
    });
  });
}

// ── Landing → Dashboard Transition ─────────────────────────────────
function initLanding() {
  const landing = document.getElementById("landing-page");
  const dashboard = document.getElementById("dashboard");
  const enterBtn = document.getElementById("enter-dashboard-btn");

  if (sessionStorage.getItem("dashboard-visited")) {
    landing.style.display = "none";
    dashboard.classList.add("active");
    onDashboardReady();
    return;
  }

  enterBtn.addEventListener("click", () => {
    landing.classList.add("exit");

    setTimeout(() => {
      landing.style.display = "none";
      dashboard.classList.add("active");
      sessionStorage.setItem("dashboard-visited", "1");
      onDashboardReady();
    }, 600);
  });
}

// ── Dashboard Entry Animations ─────────────────────────────────────
function onDashboardReady() {
  const sections = document.querySelectorAll(".canvas-section, .table-section");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  sections.forEach(section => observer.observe(section));

  initClock();
  initRoleToggle();
  init();
}

// ── Init ────────────────────────────────────────────────────────────
async function init() {
  try {
    await loadAccounts();
    loadTrades();
  } catch (e) {
    console.warn("Init warning:", e.message);
  }
}

async function loadAccounts() {
  accounts = {
    deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    buyer:    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    seller:   "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  };
  await refreshPortfolio();
}

// ── Portfolio ────────────────────────────────────────────────────────
async function switchPortfolioAccount(type) {
  currentPortfolioAccount = type;

  // Update top account-selector tabs
  document.querySelectorAll(".account-btn").forEach(b => b.classList.remove("active"));
  const tabBtn = document.getElementById(`btn-${type}-portfolio`);
  if (tabBtn) tabBtn.classList.add("active");

  // Sync sidebar role toggle (buyer/seller only)
  document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
  const roleBtn = document.getElementById(`role-${type}`);
  if (roleBtn) roleBtn.classList.add("active");

  await refreshPortfolio();
}

async function refreshPortfolio() {
  const address = accounts[currentPortfolioAccount];
  if (!address) return;

  document.getElementById("portfolio-address").textContent = address;
  document.getElementById("bond-balance").textContent = "...";
  document.getElementById("set-balance").textContent = "...";

  try {
    const res = await fetch(`${API_BASE}/portfolio/${address}`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    document.getElementById("bond-balance").textContent =
      parseFloat(data.assetBalance).toLocaleString("en-US", { maximumFractionDigits: 2 });
    document.getElementById("set-balance").textContent =
      parseFloat(data.paymentBalance).toLocaleString("en-US", { maximumFractionDigits: 2 });

    if (currentPortfolioAccount === "seller") {
      const el = document.getElementById("seller-address");
      if (!el.value) el.value = address;
    }
  } catch (err) {
    document.getElementById("bond-balance").textContent = "ERR";
    document.getElementById("set-balance").textContent = "ERR";
    showToast("error", "Portfolio Error", err.message);
  }
}

// ── Trade Creation ────────────────────────────────────────────────────
async function createTrade(e) {
  e.preventDefault();

  const seller    = document.getElementById("seller-address").value.trim();
  const assetAmt  = document.getElementById("asset-amount").value;
  const payAmt    = document.getElementById("payment-amount").value;

  if (!seller || !assetAmt || !payAmt) return;

  const btn = document.getElementById("create-btn");
  setLoading(btn, true, "Creating...");

  try {
    const res = await fetch(`${API_BASE}/trade/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller, assetAmount: assetAmt, paymentAmount: payAmt }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast("success", "Trade Created", `Trade #${data.tradeId} created successfully`);
    document.getElementById("trade-form").reset();
    await loadTrades();
    await refreshPortfolio();
  } catch (err) {
    showToast("error", "Failed to Create Trade", err.message);
  } finally {
    setLoading(btn, false, "Create Trade");
  }
}

// ── Confirm Trade ─────────────────────────────────────────────────────
async function confirmTrade(tradeId, btn) {
  setLoading(btn, true, "Confirming...");

  try {
    const res = await fetch(`${API_BASE}/trade/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast("success", "Trade Confirmed", `Trade #${tradeId} confirmed by seller`);
    await loadTrades();
    await refreshPortfolio();
  } catch (err) {
    showToast("error", "Confirm Failed", err.message);
    setLoading(btn, false, "Confirm");
  }
}

// ── Settle Trade ──────────────────────────────────────────────────────
async function settleTrade(tradeId, btn) {
  setLoading(btn, true, "Settling...");

  try {
    const res = await fetch(`${API_BASE}/trade/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast("success", "Trade Settled", `Trade #${tradeId} settled atomically (DvP complete)`);
    await loadTrades();
    await refreshPortfolio();
  } catch (err) {
    showToast("error", "Settle Failed", err.message);
    setLoading(btn, false, "Settle");
  }
}

// ── Load Trades ────────────────────────────────────────────────────────
async function loadTrades() {
  const tbody = document.getElementById("trades-tbody");

  try {
    const res = await fetch(`${API_BASE}/trade/list`);
    if (!res.ok) throw new Error(await res.text());
    const { trades } = await res.json();

    updateStats(trades);

    if (!trades || trades.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <p>No trades yet. Create your first trade above.</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = trades.map(t => `
      <tr>
        <td class="td-id">#${t.tradeId}</td>
        <td class="td-address" title="${t.buyer}">${shortAddr(t.buyer)}</td>
        <td class="td-address" title="${t.seller}">${shortAddr(t.seller)}</td>
        <td class="td-amount">${parseFloat(t.assetAmount).toLocaleString()} BOND</td>
        <td class="td-amount">${parseFloat(t.paymentAmount).toLocaleString()} SET</td>
        <td>${statusBadge(t.status)}</td>
        <td class="td-actions">${actionsHTML(t)}</td>
      </tr>
    `).join("");

  } catch (err) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <p>Failed to load trades: ${err.message}</p>
        </div>
      </td></tr>`;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
function shortAddr(addr) {
  if (!addr) return "\u2014";
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function statusBadge(status) {
  const map = {
    Created:   `<span class="badge badge-created">Created</span>`,
    Confirmed: `<span class="badge badge-confirmed">Confirmed</span>`,
    Settled:   `<span class="badge badge-settled">Settled</span>`,
  };
  return map[status] || `<span class="badge">${status}</span>`;
}

function actionsHTML(trade) {
  if (trade.status === "Created") {
    return `<button class="btn btn-confirm" onclick="confirmTrade('${trade.tradeId}', this)">Confirm</button>`;
  }
  if (trade.status === "Confirmed") {
    return `<button class="btn btn-settle" onclick="settleTrade('${trade.tradeId}', this)">Settle</button>`;
  }
  return `<span class="badge badge-settled" style="opacity:0.4;font-size:0.65rem;">Complete</span>`;
}

function updateStats(trades) {
  document.getElementById("stat-total").textContent     = trades.length;
  document.getElementById("stat-created").textContent   = trades.filter(t => t.status === "Created").length;
  document.getElementById("stat-confirmed").textContent = trades.filter(t => t.status === "Confirmed").length;
  document.getElementById("stat-settled").textContent   = trades.filter(t => t.status === "Settled").length;
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner"></span> ${label}`
    : label;
}

// ── Toast Notifications ────────────────────────────────────────────────
function showToast(type, title, message, duration = 5000) {
  const container = document.getElementById("toast-container");

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Start ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initParallax();
  initLanding();
});

// Auto-refresh trades every 15 seconds
setInterval(() => {
  const dashboard = document.getElementById("dashboard");
  if (dashboard.classList.contains("active")) {
    loadTrades();
  }
}, 15000);
