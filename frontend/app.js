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

      // Go to dashboard if not already there
      openDashboard();

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
  const sections = document.querySelectorAll(".canvas-section, .table-section, .velocity-card-wrapper");

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
  try {
    const res = await fetch(`${API_BASE}/trade/accounts`);
    if (!res.ok) throw new Error("Failed to fetch accounts");
    accounts = await res.json();
  } catch (err) {
    console.warn("Using fallback local accounts", err);
    accounts = {
      deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      buyer:    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      seller:   "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    };
  }
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

  // Show/Hide Trade Creation based on role
  const sectionTrade = document.getElementById("section-trade");
  if (sectionTrade) {
    if (type === "buyer") {
      sectionTrade.style.display = "block";
    } else {
      sectionTrade.style.display = "none";
    }
  }

  await refreshPortfolio();
  await loadTrades(); // Refresh trades to update actions based on role
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

    if (currentPortfolioAccount === "buyer") {
      // Optional: don't autofill seller here unless we want to, 
      // since there could be multiple sellers. 
      // The original code was setting seller-address to seller address when portfolio was seller.
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
    updateVelocityCard(trades);

    if (!trades || trades.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10">
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
        <td class="td-address mono" title="${t.txHash || ''}">${shortAddr(t.txHash)}</td>
        <td class="td-amount">${t.blockNumber || '-'}</td>
        <td class="td-amount">${t.duration ? t.duration + ' ms' : '-'}</td>
        <td class="td-actions">${actionsHTML(t)}</td>
      </tr>
    `).join("");

  } catch (err) {
    tbody.innerHTML = `
      <tr><td colspan="10">
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
    // Only seller can confirm
    if (currentPortfolioAccount === "seller") {
      return `<button class="btn btn-confirm" onclick="confirmTrade('${trade.tradeId}', this)">Confirm</button>`;
    }
    return `<span class="badge" style="opacity:0.6;font-size:0.65rem;">Waiting for Seller</span>`;
  }
  if (trade.status === "Confirmed") {
    // Only deployer/clearingHouse can settle, although right now any button might trigger it in UI
    // For demo purposes, we will leave the settle button visible, or we could let the seller/buyer do it
    // if backend allows. The backend route calls it using identities.
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

// ── Transaction Velocity Card — Real Data Only ────────────────────────
function updateVelocityCard(trades) {
  const dataView    = document.getElementById('velocity-data-view');
  const emptyState  = document.getElementById('velocity-empty-state');
  const liveBadge   = document.getElementById('velocity-live-badge');

  if (!dataView || !emptyState) return;

  // Extract settled trades that have a valid duration
  const settledTrades = (trades || []).filter(t => t.status === 'Settled' && t.duration && Number(t.duration) > 0);

  if (settledTrades.length === 0) {
    // Show empty state, hide data view
    dataView.style.display = 'none';
    emptyState.style.display = 'flex';
    if (liveBadge) liveBadge.style.display = 'none';
    return;
  }

  // We have real data — show data view, hide empty state
  dataView.style.display = 'block';
  emptyState.style.display = 'none';
  if (liveBadge) liveBadge.style.display = 'inline-flex';

  // Convert durations from ms to seconds
  const durations = settledTrades.map(t => Number(t.duration) / 1000);
  const tradeIds  = settledTrades.map(t => '#' + t.tradeId);

  const avg    = durations.reduce((a, b) => a + b, 0) / durations.length;
  const peak   = Math.max(...durations);
  const min    = Math.min(...durations);
  const latest = durations[durations.length - 1];

  // Update metrics
  const metricEl  = document.getElementById('velocity-metric');
  const peakEl    = document.getElementById('vel-peak');
  const minEl     = document.getElementById('vel-min');
  const settledEl = document.getElementById('vel-settled');
  const latestEl  = document.getElementById('vel-latest');

  if (metricEl)  metricEl.textContent  = formatDuration(avg);
  if (peakEl)    peakEl.textContent    = formatDuration(peak);
  if (minEl)     minEl.textContent     = formatDuration(min);
  if (settledEl) settledEl.textContent = settledTrades.length;
  if (latestEl)  latestEl.textContent  = formatDuration(latest);

  // Delta badge — compare latest to avg
  const deltaEl    = document.getElementById('velocity-delta');
  const deltaValEl = document.getElementById('velocity-delta-val');
  if (deltaEl && deltaValEl && durations.length >= 2) {
    const change = ((avg - latest) / avg * 100);
    if (Math.abs(change) > 0.5) {
      deltaEl.style.display = 'inline-flex';
      deltaEl.className = 'velocity-card__metric-delta ' + (change > 0 ? 'positive' : 'negative');
      // Flip the arrow for negative
      const arrow = deltaEl.querySelector('svg path');
      if (arrow) {
        arrow.setAttribute('d', change > 0 ? 'M6 2L10 7H2L6 2Z' : 'M6 10L10 5H2L6 10Z');
      }
      deltaValEl.textContent = Math.abs(change).toFixed(0) + '%';
    } else {
      deltaEl.style.display = 'none';
    }
  } else if (deltaEl) {
    deltaEl.style.display = 'none';
  }

  // Render SVG graph
  renderVelocityGraph(durations, tradeIds);
}

function formatDuration(seconds) {
  if (seconds >= 60) return (seconds / 60).toFixed(1) + 'm';
  return seconds.toFixed(1) + 's';
}

function renderVelocityGraph(data, labels) {
  const svgWidth  = 600;
  const svgHeight = 160;
  const padX      = 20;
  const padTop    = 15;
  const padBot    = 15;
  const graphW    = svgWidth - padX * 2;
  const graphH    = svgHeight - padTop - padBot;

  const lineEl = document.getElementById('velocity-line');
  const areaEl = document.getElementById('velocity-area');
  const dotsEl = document.getElementById('velocity-dots');
  const axisEl = document.getElementById('velocity-time-axis');

  if (!lineEl || !areaEl || !dotsEl) return;

  // If only 1 data point, render a single dot with no line
  if (data.length === 1) {
    const cx = svgWidth / 2;
    const cy = svgHeight / 2;
    lineEl.removeAttribute('d');
    areaEl.removeAttribute('d');
    dotsEl.innerHTML = `<circle cx="${cx}" cy="${cy}" r="5" opacity="1"><title>${data[0].toFixed(1)}s</title></circle>`;
    if (axisEl) axisEl.innerHTML = `<span>${labels[0]}</span>`;
    return;
  }

  // Calculate coords
  const yMin   = Math.min(...data) * 0.7;
  const yMax   = Math.max(...data) * 1.2;
  const range  = yMax - yMin || 1;

  const coords = data.map((val, i) => ({
    x: padX + (i / (data.length - 1)) * graphW,
    y: padTop + (1 - (val - yMin) / range) * graphH
  }));

  // Build smooth cubic bezier path
  let d = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];
    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  lineEl.setAttribute('d', d);
  areaEl.setAttribute('d', d + ` L ${coords[coords.length - 1].x},${svgHeight} L ${coords[0].x},${svgHeight} Z`);

  // Render dots with tooltips
  dotsEl.innerHTML = coords.map((c, i) =>
    `<circle cx="${c.x}" cy="${c.y}" r="3" opacity="0.7"><title>${labels[i]}: ${data[i].toFixed(1)}s</title></circle>`
  ).join('');

  // Render time axis labels (trade IDs)
  if (axisEl) {
    // Show at most 7 labels evenly spaced
    const maxLabels = Math.min(7, labels.length);
    const step = Math.max(1, Math.floor((labels.length - 1) / (maxLabels - 1)));
    let axisHTML = '';
    for (let i = 0; i < labels.length; i += step) {
      axisHTML += `<span>${labels[i]}</span>`;
    }
    // Always include the last label
    if ((labels.length - 1) % step !== 0) {
      axisHTML += `<span>${labels[labels.length - 1]}</span>`;
    }
    axisEl.innerHTML = axisHTML;
  }
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

// ── Transaction History Modal ──────────────────────────────────────────
async function openTxHistoryModal() {
  const modal = document.getElementById('tx-history-modal');
  const listContainer = document.getElementById('tx-history-list');
  modal.style.display = 'flex';
  listContainer.innerHTML = '<div style="text-align:center; padding:1rem;">Loading...</div>';

  try {
    const res = await fetch(`${API_BASE}/transactions/history`);
    if (!res.ok) throw new Error('Failed to fetch transaction history');
    const files = await res.json();

    if (files.length === 0) {
      listContainer.innerHTML = '<div style="text-align:center; padding:1rem; opacity:0.6;">No transaction logs found yet.</div>';
      return;
    }

    listContainer.innerHTML = files.map(file => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem; background:#1A202C; border-radius:6px; border:1px solid #2D3748;">
        <span style="font-family:monospace; font-size:0.85rem;">${file}</span>
        <button onclick="downloadTxFile('${file}')" style="background:#00D4FF; color:#0A0A0A; border:none; border-radius:4px; padding:0.4rem 0.8rem; font-size:0.8rem; cursor:pointer; font-weight:bold;">Download</button>
      </div>
    `).join('');
  } catch (err) {
    listContainer.innerHTML = `<div style="color:#F56565; padding:1rem;">Error: ${err.message}</div>`;
  }
}

function closeTxHistoryModal() {
  document.getElementById('tx-history-modal').style.display = 'none';
}

function downloadTxFile(fileName) {
  window.open(`${API_BASE}/transactions/download/${fileName}`, '_blank');
}

// ── Marketplace ──────────────────────────────────────────────────────
function openMarketplace() {
  document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("btn-marketplace").classList.add("active");
  
  const vDash = document.getElementById("dashboard-view");
  const vMkt = document.getElementById("marketplace-view");
  if (vDash) vDash.style.display = "none";
  if (vMkt) vMkt.style.display = "block";
  
  const crumb = document.getElementById("breadcrumb-current");
  if (crumb) crumb.textContent = "Marketplace";
  
  renderMarketplace();
}

function openDashboard() {
  const vDash = document.getElementById("dashboard-view");
  const vMkt = document.getElementById("marketplace-view");
  if (vDash) vDash.style.display = "block";
  if (vMkt) vMkt.style.display = "none";
  
  const crumb = document.getElementById("breadcrumb-current");
  if (crumb) crumb.textContent = "Trade Settlement";
}

function renderMarketplace() {
  const grid = document.getElementById("marketplace-grid");
  if (!grid || !window.marketplaceStocks) return;
  
  let html = "";
  window.marketplaceStocks.forEach(stock => {
    let brokersHtml = stock.brokers.map(b => `
      <div style="margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px dashed rgba(255,255,255,0.1);">
        <div style="font-size: 0.85rem; font-weight: 500; color: #E2E8F0;">${b.name}</div>
        <div style="font-size: 0.7rem; color: #8a8a8a; font-family: monospace; margin: 4px 0;">Wallet: <span style="user-select: all;">${b.wallet}</span></div>
        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <button onclick="copyBrokerWallet('${b.wallet}')" style="padding: 4px 10px; font-size: 0.65rem; background: transparent; border: 1px solid #2a2a2a; color: #8a8a8a; border-radius: 4px; cursor: pointer; transition: all 0.2s;">Copy Address</button>
          <button onclick="sendMarketplaceTrade('${b.wallet}', '${stock.symbol}', '${stock.price}')" style="padding: 4px 10px; font-size: 0.65rem; background: #3b82f6; border: none; color: white; border-radius: 4px; cursor: pointer; transition: all 0.2s;">Send Trade</button>
        </div>
      </div>
    `).join("");
    
    html += `
      <div style="background: #1a1a1a; border: 1px solid #222222; border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column;">
        <h3 style="font-family: 'Space Grotesk', sans-serif; font-size: 1.2rem; color: #e2e2e2; margin-bottom: 4px;">${stock.companyName}</h3>
        <div style="font-size: 0.75rem; color: #8a8a8a;">Symbol: <span style="color: #facc15;">${stock.symbol}</span></div>
        <div style="font-size: 0.75rem; color: #8a8a8a; margin-bottom: 1.25rem;">Price: <span style="color: #2dd4bf;">${stock.price}</span></div>
        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: #555555; margin-bottom: 0.75rem; border-bottom: 1px solid #222; padding-bottom: 4px;">Brokers Offering This Stock:</div>
        <div style="flex: 1;">${brokersHtml}</div>
      </div>
    `;
  });
  grid.innerHTML = html;
}

function copyBrokerWallet(address) {
  navigator.clipboard.writeText(address).then(() => {
    showToast("success", "Address copied", "Address copied to clipboard");
  }).catch(err => {
    showToast("error", "Copy Failed", "Could not copy address");
  });
}

async function sendMarketplaceTrade(brokerWallet, symbol, price) {
  openDashboard();
  
  // Act as Buyer
  await switchPortfolioAccount("buyer");
  
  // Pre-fill trade form
  document.getElementById("seller-address").value = brokerWallet;
  document.getElementById("asset-amount").value = "1";
  
  // Parse numeric price
  const priceNum = price.replace(/[^0-9.]/g, '');
  document.getElementById("payment-amount").value = priceNum;
  
  // Temporarily update labels for context
  const lblAsset = document.getElementById("lbl-asset-amount");
  const lblPayment = document.getElementById("lbl-payment-amount");
  if(lblAsset) lblAsset.textContent = `Asset Amount (${symbol})`;
  if(lblPayment) lblPayment.textContent = `Payment Amount (${price})`;
  
  // Highlight fields
  document.getElementById("seller-address").focus();
}
