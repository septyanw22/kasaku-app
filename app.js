/* =========================================================
KASAKU v3 — FROSTED GLASSMORPHISM + FLUID SPRING MOTION
========================================================= */

:root {
--bg-canvas: #EBF0F5;
--glass-bg: rgba(255, 255, 255, 0.64);
--glass-bg-elevated: rgba(255, 255, 255, 0.78);
--glass-bg-subtle: rgba(255, 255, 255, 0.44);
--glass-input: rgba(255, 255, 255, 0.56);
--glass-border: rgba(255, 255, 255, 0.78);
--glass-border-subtle: rgba(15, 23, 42, 0.08);
--glass-highlight: rgba(255, 255, 255, 0.92);
--glass-shadow: 0 10px 30px -8px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04);
--glass-shadow-lg: 0 20px 44px -12px rgba(15, 23, 42, 0.16);

--text-primary: #0F172A;
--text-secondary: #526071;

--accent-brand: #C84B31;
--accent-income: #0F766E;
--accent-income-bg: rgba(15, 118, 110, 0.13);
--accent-expense: #D94832;
--accent-expense-bg: rgba(217, 72, 50, 0.13);
--accent-transfer: #2563EB;
--accent-transfer-bg: rgba(37, 99, 235, 0.12);
--accent-warn: #D97706;
--accent-warn-bg: rgba(217, 119, 6, 0.14);

--orb-1: rgba(16, 185, 129, 0.24);
--orb-2: rgba(217, 72, 50, 0.20);
--orb-3: rgba(59, 130, 246, 0.22);

--fab-bg: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
--fab-fg: #FFFFFF;
--fab-shadow: 0 10px 24px -4px rgba(15, 23, 42, 0.42);

--font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
--radius-sm: 10px;
--radius-md: 16px;
--radius-lg: 22px;
--ease-spring: cubic-bezier(0.22, 1, 0.36, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
--ease-tactile: cubic-bezier(0.2, 0.8, 0.2, 1);
}

[data-theme="dark"] {
--bg-canvas: #080B11;
--glass-bg: rgba(22, 28, 39, 0.62);
--glass-bg-elevated: rgba(27, 34, 48, 0.80);
--glass-bg-subtle: rgba(30, 38, 54, 0.46);
--glass-input: rgba(15, 20, 30, 0.58);
--glass-border: rgba(255, 255, 255, 0.12);
--glass-border-subtle: rgba(255, 255, 255, 0.08);
--glass-highlight: rgba(255, 255, 255, 0.16);
--glass-shadow: 0 14px 34px -8px rgba(0, 0, 0, 0.52);
--glass-shadow-lg: 0 24px 50px -12px rgba(0, 0, 0, 0.72);

--text-primary: #F1F5F9;
--text-secondary: #94A3B8;

--accent-brand: #E05A3E;
--accent-income: #34D399;
--accent-income-bg: rgba(52, 211, 153, 0.15);
--accent-expense: #FB7185;
--accent-expense-bg: rgba(251, 113, 133, 0.15);
--accent-transfer: #60A5FA;
--accent-transfer-bg: rgba(96, 165, 250, 0.16);
--accent-warn: #FBBF24;
--accent-warn-bg: rgba(251, 191, 36, 0.16);

--orb-1: rgba(16, 185, 129, 0.22);
--orb-2: rgba(224, 90, 62, 0.20);
--orb-3: rgba(59, 130, 246, 0.24);

--fab-bg: linear-gradient(135deg, #F8FAFC 0%, #CBD5E1 100%);
--fab-fg: #0F172A;
--fab-shadow: 0 10px 26px -4px rgba(255, 255, 255, 0.24);
}

{
box-sizing: border-box;
margin: 0;
padding: 0;
-webkit-tap-highlight-color: transparent;
}

body {
background-color: var(--bg-canvas);
color: var(--text-primary);
font-family: var(--font-sans);
font-size: 14px;
line-height: 1.45;
min-height: 100vh;
overflow-x: hidden;
transition: background-color 0.35s var(--ease-tactile), color 0.3s var(--ease-tactile);
}

/* AMBIENT ANIMATED ORBS */
.ambient-bg {
position: fixed;
inset: 0;
z-index: 0;
overflow: hidden;
pointer-events: none;
}

.ambient-orb {
position: absolute;
border-radius: 50%;
filter: blur(72px);
will-change: transform;
opacity: 0.9;
}

.orb-1 {
width: 290px;
height: 290px;
background: var(--orb-1);
top: -60px;
left: -50px;
animation: floatOrb1 16s ease-in-out infinite alternate;
}

.orb-2 {
width: 260px;
height: 260px;
background: var(--orb-2);
top: 28%;
right: -70px;
animation: floatOrb2 19s ease-in-out infinite alternate;
}

.orb-3 {
width: 310px;
height: 310px;
background: var(--orb-3);
bottom: -40px;
left: 10%;
animation: floatOrb3 22s ease-in-out infinite alternate;
}

@keyframes floatOrb1 {
0% { transform: translate3d(0, 0, 0) scale(1); }
100% { transform: translate3d(45px, 60px, 0) scale(1.12); }
}

@keyframes floatOrb2 {
0% { transform: translate3d(0, 0, 0) scale(1); }
100% { transform: translate3d(-40px, -50px, 0) scale(1.08); }
}

@keyframes floatOrb3 {
0% { transform: translate3d(0, 0, 0) scale(1); }
100% { transform: translate3d(35px, -45px, 0) scale(1.14); }
}

.app-shell {
max-width: 480px;
min-height: 100vh;
margin: 0 auto;
position: relative;
z-index: 1;
padding-bottom: 104px;
}

@media (min-width: 520px) {
.app-shell {
border-left: 1px solid var(--glass-border-subtle);
border-right: 1px solid var(--glass-border-subtle);
}
}

.hidden {
display: none !important;
}

/* PRIVACY BLUR MODE */
body.privacy-active .money-val {
filter: blur(7px);
user-select: none;
transition: filter 0.25s var(--ease-tactile);
}

/* TOP FROSTED HEADER */
.top-bar {
position: sticky;
top: 0;
z-index: 25;
background: var(--glass-bg);
backdrop-filter: blur(22px) saturate(180%);
-webkit-backdrop-filter: blur(22px) saturate(180%);
border-bottom: 1px solid var(--glass-border);
box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
padding: calc(12px + env(safe-area-inset-top)) 16px 12px;
display: flex;
align-items: center;
justify-content: space-between;
}

.brand-block {
display: flex;
align-items: center;
gap: 11px;
}

.brand-mark {
position: relative;
font-family: var(--font-sans);
font-weight: 800;
font-size: 15px;
width: 34px;
height: 34px;
background: #14161A;
color: #F4F1EA;
border-radius: 10px;
display: inline-flex;
flex-direction: column;
align-items: center;
justify-content: center;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.2);
transition: transform 0.25s var(--ease-bounce);
}

.brand-bar {
width: 15px;
height: 2.5px;
border-radius: 99px;
background-color: var(--accent-brand);
margin-top: 1px;
}

.brand-block:active .brand-mark {
transform: scale(0.9) rotate(-4deg);
}

.brand-title {
font-size: 16px;
font-weight: 800;
letter-spacing: 0.03em;
line-height: 1.15;
}

.brand-sub {
font-size: 11px;
color: var(--text-secondary);
font-family: var(--font-mono);
}

.header-actions {
display: flex;
align-items: center;
gap: 7px;
}

.icon-btn {
width: 36px;
height: 36px;
border-radius: 11px;
border: 1px solid var(--glass-border);
background: var(--glass-bg-elevated);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
box-shadow: inset 0 1px 0 var(--glass-highlight);
color: var(--text-primary);
display: inline-flex;
align-items: center;
justify-content: center;
cursor: pointer;
transition: transform 0.18s var(--ease-bounce), background-color 0.2s ease, box-shadow 0.2s ease;
}

.icon-btn:hover {
transform: translateY(-1px);
}

.icon-btn:active {
transform: scale(0.9);
}

.icon-btn.spinning svg {
animation: spin 0.85s linear infinite;
}

@keyframes spin {
to { transform: rotate(360deg); }
}

/* MAIN LAYOUT & STAGGERED SPRING MOTION */
.main-content {
padding: 16px;
}

.tab-view {
display: none;
}

.tab-view.active {
display: block;
}

.tab-view.active .reveal-card {
animation: glassCardEnter 0.44s var(--ease-spring) both;
animation-delay: calc(var(--i, 0) * 45ms);
}

@keyframes glassCardEnter {
from {
opacity: 0;
transform: translate3d(0, 14px, 0) scale(0.975);
}
to {
opacity: 1;
transform: translate3d(0, 0, 0) scale(1);
}
}

/* FROSTED GLASS CARDS */
.ledger-card {
position: relative;
background: var(--glass-bg);
backdrop-filter: blur(18px) saturate(165%);
-webkit-backdrop-filter: blur(18px) saturate(165%);
border: 1px solid var(--glass-border);
box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-highlight);
border-radius: var(--radius-md);
padding: 16px;
transition: transform 0.22s var(--ease-spring), box-shadow 0.22s ease, border-color 0.2s ease;
}

.hero-ledger {
background: var(--glass-bg-elevated);
border-radius: var(--radius-lg);
overflow: hidden;
}

.hero-glow-line {
position: absolute;
top: 0;
left: 14%;
right: 14%;
height: 2px;
background: linear-gradient(90deg, transparent, var(--accent-income), var(--accent-brand), transparent);
opacity: 0.75;
}

.ledger-meta-row {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 6px;
}

.mono-tag {
font-family: var(--font-mono);
font-size: 10.5px;
font-weight: 600;
letter-spacing: 0.06em;
color: var(--text-secondary);
text-transform: uppercase;
}

.status-pill {
font-family: var(--font-mono);
font-size: 10px;
font-weight: 600;
padding: 3px 9px;
border-radius: 99px;
background: var(--glass-bg-subtle);
border: 1px solid var(--glass-border);
color: var(--text-secondary);
transition: all 0.25s ease;
}

.status-pill.synced {
border-color: var(--accent-income);
color: var(--accent-income);
background: var(--accent-income-bg);
}

.hero-balance {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-size: 29px;
font-weight: 700;
letter-spacing: -0.025em;
margin-bottom: 14px;
}

.glass-divider {
border-top: 1px solid var(--glass-border-subtle);
margin: 14px 0;
}

.sisa-napas-box {
background: var(--glass-bg-subtle);
border: 1px solid var(--glass-border-subtle);
border-radius: var(--radius-sm);
padding: 11px 12px;
}

.sisa-napas-header {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 4px;
}

.sisa-label {
font-family: var(--font-mono);
font-size: 10px;
font-weight: 700;
color: var(--accent-income);
}

.sisa-days {
font-family: var(--font-mono);
font-size: 10.5px;
color: var(--text-secondary);
}

.sisa-amount {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-size: 20px;
font-weight: 700;
}

.sisa-amount .unit {
font-size: 12px;
font-weight: 500;
color: var(--text-secondary);
}

.sisa-hint {
font-size: 11.5px;
color: var(--text-secondary);
margin-top: 3px;
}

.flow-split {
display: grid;
grid-template-columns: 1fr 1px 1fr;
gap: 12px;
align-items: center;
}

.flow-divider-v {
height: 34px;
background-color: var(--glass-border-subtle);
}

.flow-item {
display: flex;
flex-direction: column;
gap: 2px;
}

.flow-tag {
font-family: var(--font-mono);
font-size: 10px;
color: var(--text-secondary);
}

.flow-num {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-size: 14.5px;
font-weight: 700;
}

.text-income { color: var(--accent-income); }
.text-expense { color: var(--accent-expense); }
.text-transfer { color: var(--accent-transfer); }

/* UPCOMING BILL ALERT BANNER ON DASHBOARD */
.bill-alert-banner {
margin-top: 12px;
background: var(--accent-warn-bg);
backdrop-filter: blur(16px);
-webkit-backdrop-filter: blur(16px);
border: 1px solid rgba(217, 119, 6, 0.35);
border-radius: var(--radius-md);
padding: 12px 14px;
display: flex;
justify-content: space-between;
align-items: center;
gap: 10px;
}

.bill-alert-title {
font-size: 12.5px;
font-weight: 700;
color: var(--text-primary);
}

.bill-alert-sub {
font-size: 11.5px;
color: var(--text-secondary);
font-family: var(--font-mono);
}

/* SECTION HEADERS */
.section-head {
display: flex;
justify-content: space-between;
align-items: center;
margin: 20px 0 10px;
}

.section-head.top-section {
margin-top: 0;
}

.section-head h2 {
font-size: 15px;
font-weight: 700;
letter-spacing: -0.01em;
}

.section-desc {
font-size: 12px;
color: var(--text-secondary);
}

.text-link {
background: var(--glass-bg-subtle);
border: 1px solid var(--glass-border);
border-radius: 99px;
padding: 4px 10px;
color: var(--text-primary);
font-family: var(--font-mono);
font-size: 11px;
font-weight: 600;
cursor: pointer;
transition: transform 0.16s var(--ease-bounce), background-color 0.16s ease;
}

.text-link:active {
transform: scale(0.93);
}

/* FLEXIBLE SWIPEABLE GLASS WALLET STRIP */
.wallet-strip {
display: flex;
gap: 10px;
overflow-x: auto;
scroll-snap-type: x mandatory;
scrollbar-width: none;
-ms-overflow-style: none;
padding: 2px 1px 4px;
}

.wallet-strip::-webkit-scrollbar {
display: none;
}

.wallet-tile {
flex: 1 0 138px;
scroll-snap-align: start;
background: var(--glass-bg);
backdrop-filter: blur(16px) saturate(160%);
-webkit-backdrop-filter: blur(16px) saturate(160%);
border: 1px solid var(--glass-border);
box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-highlight);
border-radius: var(--radius-sm);
padding: 11px 12px;
transition: transform 0.2s var(--ease-spring), border-color 0.2s ease;
}

.wallet-tile:hover {
transform: translateY(-2px);
}

.wallet-tile:active {
transform: scale(0.96);
}

.wallet-name {
font-size: 11.5px;
font-weight: 600;
color: var(--text-secondary);
display: block;
margin-bottom: 4px;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
}

.wallet-bal {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-size: 13px;
font-weight: 700;
}

/* TRANSACTION & MANAGEMENT LISTS */
.list-card {
padding: 0;
overflow: hidden;
}

.tx-row {
display: flex;
justify-content: space-between;
align-items: center;
padding: 12px 14px;
border-bottom: 1px solid var(--glass-border-subtle);
gap: 10px;
transition: background-color 0.18s ease;
}

.tx-row:hover {
background-color: var(--glass-bg-subtle);
}

.tx-row:last-child {
border-bottom: none;
}

.tx-row.flash-new {
animation: rowHighlight 1.1s var(--ease-spring);
}

@keyframes rowHighlight {
0% { background-color: var(--accent-income-bg); }
100% { background-color: transparent; }
}

.tx-left {
display: flex;
flex-direction: column;
gap: 2px;
min-width: 0;
}

.tx-cat {
font-weight: 700;
font-size: 13.5px;
display: flex;
align-items: center;
gap: 6px;
}

.tx-meta {
font-size: 11.5px;
color: var(--text-secondary);
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
}

.tx-right {
text-align: right;
flex-shrink: 0;
}

.tx-amount {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-weight: 700;
font-size: 13.5px;
display: block;
}

.tx-actions {
display: flex;
justify-content: flex-end;
gap: 8px;
margin-top: 3px;
}

.mini-action-btn {
background: none;
border: none;
font-family: var(--font-mono);
font-size: 10.5px;
font-weight: 600;
color: var(--text-secondary);
cursor: pointer;
padding: 2px 5px;
border-radius: 5px;
transition: color 0.15s ease, background-color 0.15s ease, transform 0.14s ease;
}

.mini-action-btn:hover {
background: var(--glass-bg-subtle);
color: var(--text-primary);
}

.mini-action-btn:active {
transform: scale(0.91);
}

.mini-action-btn.del:hover {
color: var(--accent-expense);
background: var(--accent-expense-bg);
}

.empty-state {
padding: 24px 16px;
text-align: center;
color: var(--text-secondary);
font-size: 12.5px;
}

/* CATEGORY MANAGEMENT CHIPS */
.full-switch {
display: grid;
grid-template-columns: 1fr 1fr;
width: 100%;
margin-bottom: 12px;
}

.chip-manage-grid {
display: flex;
flex-wrap: wrap;
gap: 8px;
}

.cat-pill {
display: inline-flex;
align-items: center;
gap: 6px;
background: var(--glass-bg-subtle);
border: 1px solid var(--glass-border);
box-shadow: inset 0 1px 0 var(--glass-highlight);
border-radius: 10px;
padding: 6px 10px;
font-size: 12.5px;
font-weight: 600;
transition: transform 0.18s var(--ease-spring), background-color 0.15s ease;
}

.cat-pill:hover {
transform: translateY(-1px);
background: var(--glass-bg-elevated);
}

.cat-pill-actions {
display: inline-flex;
align-items: center;
gap: 4px;
border-left: 1px solid var(--glass-border-subtle);
padding-left: 6px;
margin-left: 2px;
}

.pill-icon-btn {
background: none;
border: none;
color: var(--text-secondary);
font-family: var(--font-mono);
font-size: 11px;
cursor: pointer;
padding: 1px 3px;
border-radius: 4px;
}

.pill-icon-btn:hover {
color: var(--text-primary);
background: var(--glass-bg-subtle);
}

.pill-icon-btn.del:hover {
color: var(--accent-expense);
}

/* ENVELOPE BUDGETS */
.summary-strip {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 12px;
}

.strip-value {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-weight: 700;
font-size: 15px;
margin-top: 2px;
}

.strip-pct {
font-family: var(--font-mono);
font-weight: 700;
font-size: 18px;
}

.stack-list {
display: flex;
flex-direction: column;
gap: 10px;
}

.budget-item-top {
display: flex;
justify-content: space-between;
align-items: baseline;
margin-bottom: 7px;
}

.budget-cat-name {
font-weight: 700;
font-size: 14px;
}

.budget-numbers {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-size: 12px;
color: var(--text-secondary);
}

.progress-track {
width: 100%;
height: 9px;
background-color: var(--glass-input);
border-radius: 99px;
overflow: hidden;
border: 1px solid var(--glass-border-subtle);
}

.progress-fill {
height: 100%;
border-radius: 99px;
background: linear-gradient(90deg, var(--accent-income), #10B981);
transition: width 0.65s var(--ease-spring), background 0.3s ease;
}

.progress-fill.warn {
background: linear-gradient(90deg, var(--accent-warn), #F59E0B);
}

.progress-fill.danger {
background: linear-gradient(90deg, var(--accent-expense), #EF4444);
}

.budget-footer {
display: flex;
justify-content: space-between;
align-items: center;
margin-top: 7px;
font-size: 11.5px;
color: var(--text-secondary);
}

/* REPORT & AUDIT */
.filter-group {
display: flex;
gap: 6px;
}

.search-filter-bar {
display: grid;
grid-template-columns: 1fr auto;
gap: 8px;
margin-bottom: 10px;
}

.audit-grid {
display: grid;
grid-template-columns: 1fr 1fr;
gap: 10px;
margin-bottom: 12px;
}

.kpi-card {
padding: 13px 14px;
}

.kpi-val {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-size: 20px;
font-weight: 700;
margin: 4px 0 2px;
}

.kpi-sub {
font-size: 11px;
color: var(--text-secondary);
}

.chart-card {
margin-bottom: 12px;
}

.card-header-inline {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 10px;
}

.chart-wrap {
position: relative;
height: 190px;
width: 100%;
}

/* RECURRING BILLS & TOOLS */
.tool-row {
display: flex;
justify-content: space-between;
align-items: center;
gap: 10px;
}

.bill-card-main {
display: flex;
flex-direction: column;
gap: 10px;
}

.bill-card-top {
display: flex;
justify-content: space-between;
align-items: flex-start;
gap: 10px;
}

.bill-card-bottom {
display: flex;
justify-content: space-between;
align-items: center;
padding-top: 8px;
border-top: 1px solid var(--glass-border-subtle);
gap: 8px;
}

.due-chip {
display: inline-flex;
align-items: center;
font-family: var(--font-mono);
font-size: 10.5px;
font-weight: 600;
padding: 2px 8px;
border-radius: 99px;
background: var(--glass-bg-subtle);
border: 1px solid var(--glass-border);
color: var(--text-secondary);
}

.due-chip.soon {
background: var(--accent-warn-bg);
border-color: rgba(217, 119, 6, 0.35);
color: var(--accent-warn);
}

.due-chip.overdue {
background: var(--accent-expense-bg);
border-color: rgba(217, 72, 50, 0.35);
color: var(--accent-expense);
}

.badge-paid {
font-family: var(--font-mono);
font-size: 11px;
padding: 5px 10px;
border-radius: 99px;
background: var(--accent-income-bg);
color: var(--accent-income);
border: 1px solid rgba(15, 118, 110, 0.32);
font-weight: 700;
}

.cooldown-tag {
font-family: var(--font-mono);
font-size: 10.5px;
color: var(--accent-warn);
margin-top: 3px;
display: block;
}

/* GLASS CHECKBOX ROW */
.glass-checkbox-row {
display: flex;
align-items: center;
gap: 9px;
background: var(--glass-input);
border: 1px solid var(--glass-border);
border-radius: var(--radius-sm);
padding: 10px 12px;
font-size: 13px;
font-weight: 600;
cursor: pointer;
}

.glass-checkbox-row input[type="checkbox"] {
width: 17px;
height: 17px;
accent-color: var(--accent-income);
}

/* INPUTS & GLASS BUTTONS */
.field-label {
display: block;
font-size: 12px;
font-weight: 600;
margin-bottom: 5px;
}

.field-label-xs {
display: block;
font-family: var(--font-mono);
font-size: 10px;
color: var(--text-secondary);
margin-bottom: 3px;
text-transform: uppercase;
}

.field-help {
font-size: 11.5px;
color: var(--text-secondary);
margin: 6px 0 12px;
}

.ledger-input,
.ledger-select {
background-color: var(--glass-input);
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
color: var(--text-primary);
border: 1px solid var(--glass-border);
box-shadow: inset 0 1px 0 var(--glass-highlight);
border-radius: var(--radius-sm);
padding: 9px 11px;
font-family: var(--font-sans);
font-size: 13.5px;
width: 100%;
transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.ledger-input:focus,
.ledger-select:focus {
outline: none;
border-color: var(--text-primary);
background-color: var(--glass-bg-elevated);
}

.ledger-input.compact,
.ledger-select.compact,
.ledger-select.full-w {
padding: 8px 10px;
font-size: 13px;
}

.ledger-select {
width: auto;
}

.btn-primary,
.btn-secondary,
.btn-outline-sm {
font-family: var(--font-sans);
font-weight: 700;
border-radius: var(--radius-sm);
cursor: pointer;
display: inline-flex;
align-items: center;
justify-content: center;
gap: 6px;
transition: transform 0.18s var(--ease-bounce), opacity 0.15s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

.btn-primary:hover,
.btn-secondary:hover,
.btn-outline-sm:hover {
transform: translateY(-1px);
}

.btn-primary:active,
.btn-secondary:active,
.btn-outline-sm:active {
transform: scale(0.95);
}

.btn-primary {
background: var(--fab-bg);
color: var(--fab-fg);
border: 1px solid transparent;
box-shadow: 0 6px 18px -4px rgba(15, 23, 42, 0.25);
padding: 11px 14px;
font-size: 13.5px;
}

.btn-secondary {
background: var(--glass-bg-elevated);
color: var(--text-primary);
border: 1px solid var(--glass-border);
box-shadow: inset 0 1px 0 var(--glass-highlight);
padding: 10px 14px;
font-size: 13px;
}

.btn-outline-sm {
background: var(--glass-bg-elevated);
color: var(--text-primary);
border: 1px solid var(--glass-border);
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 var(--glass-highlight);
padding: 6px 11px;
font-size: 12px;
}

.btn-outline-sm:disabled {
opacity: 0.45;
cursor: not-allowed;
transform: none;
}

.btn-grid-2 {
display: grid;
grid-template-columns: 1fr 1fr;
gap: 8px;
}

.action-row-sm {
display: flex;
align-items: center;
gap: 6px;
}

.sync-meta {
font-family: var(--font-mono);
font-size: 11px;
color: var(--text-secondary);
margin-top: 10px;
}

/* FLOATING FROSTED GLASS BOTTOM DOCK */
.bottom-nav {
position: fixed;
bottom: calc(10px + env(safe-area-inset-bottom));
left: 50%;
transform: translateX(-50%);
width: calc(100% - 24px);
max-width: 456px;
background: var(--glass-bg-elevated);
backdrop-filter: blur(24px) saturate(190%);
-webkit-backdrop-filter: blur(24px) saturate(190%);
border: 1px solid var(--glass-border);
box-shadow: var(--glass-shadow-lg), inset 0 1px 0 var(--glass-highlight);
border-radius: 22px;
display: grid;
grid-template-columns: 1fr 1fr auto 1fr 1fr;
align-items: center;
padding: 6px 8px;
z-index: 30;
}

.nav-item {
background: none;
border: none;
color: var(--text-secondary);
display: flex;
flex-direction: column;
align-items: center;
gap: 3px;
padding: 6px 4px;
border-radius: 14px;
font-size: 10.5px;
font-weight: 600;
cursor: pointer;
transition: color 0.2s ease, background-color 0.2s ease, transform 0.2s var(--ease-bounce);
}

.nav-item:active {
transform: scale(0.9);
}

.nav-item.active {
color: var(--text-primary);
background: var(--glass-bg-subtle);
}

.nav-item.active svg {
transform: translateY(-1px) scale(1.06);
transition: transform 0.25s var(--ease-bounce);
}

.nav-fab {
width: 50px;
height: 50px;
border-radius: 16px;
background: var(--fab-bg);
color: var(--fab-fg);
box-shadow: var(--fab-shadow);
border: none;
display: flex;
align-items: center;
justify-content: center;
margin: 0 6px;
cursor: pointer;
transition: transform 0.26s var(--ease-bounce), box-shadow 0.2s ease;
}

.nav-fab:hover {
transform: translateY(-2px) scale(1.03);
}

.nav-fab:active {
transform: scale(0.88) rotate(90deg);
}

/* SPRING GLASS BOTTOM SHEET MODAL */
.modal-backdrop {
position: fixed;
inset: 0;
background-color: rgba(8, 12, 20, 0.45);
backdrop-filter: blur(8px);
-webkit-backdrop-filter: blur(8px);
z-index: 50;
display: flex;
align-items: flex-end;
justify-content: center;
opacity: 0;
pointer-events: none;
transition: opacity 0.26s var(--ease-tactile);
}

.modal-backdrop.open {
opacity: 1;
pointer-events: auto;
}

.bottom-sheet {
width: 100%;
max-width: 480px;
background: var(--glass-bg-elevated);
backdrop-filter: blur(28px) saturate(190%);
-webkit-backdrop-filter: blur(28px) saturate(190%);
border-top: 1px solid var(--glass-border);
box-shadow: 0 -16px 48px rgba(0, 0, 0, 0.22), inset 0 1px 0 var(--glass-highlight);
border-radius: 24px 24px 0 0;
padding: 10px 16px calc(18px + env(safe-area-inset-bottom));
max-height: 92vh;
overflow-y: auto;
transform: translate3d(0, 100%, 0);
transition: transform 0.38s var(--ease-spring);
}

.modal-backdrop.open .bottom-sheet {
transform: translate3d(0, 0, 0);
}

.sheet-handle {
width: 38px;
height: 4px;
background-color: var(--glass-border-subtle);
border-radius: 99px;
margin: 0 auto 10px;
}

.sheet-top {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 10px;
}

.close-sheet-btn {
width: 32px;
height: 32px;
border-radius: 10px;
border: 1px solid var(--glass-border);
background: var(--glass-input);
color: var(--text-primary);
cursor: pointer;
transition: transform 0.16s var(--ease-bounce);
}

.close-sheet-btn:active {
transform: scale(0.88);
}

.type-switch {
display: inline-flex;
background: var(--glass-input);
border: 1px solid var(--glass-border);
border-radius: 11px;
padding: 3px;
gap: 2px;
}

.type-btn {
border: none;
background: none;
padding: 6px 11px;
font-size: 12px;
font-weight: 700;
border-radius: 8px;
color: var(--text-secondary);
cursor: pointer;
transition: background-color 0.22s var(--ease-tactile), color 0.2s ease, transform 0.16s var(--ease-bounce);
}

.type-btn:active {
transform: scale(0.94);
}

.type-btn.active.expense {
background-color: var(--accent-expense);
color: #FFFFFF;
box-shadow: 0 3px 10px rgba(217, 72, 50, 0.35);
}

.type-btn.active.income {
background-color: var(--accent-income);
color: #FFFFFF;
box-shadow: 0 3px 10px rgba(15, 118, 110, 0.35);
}

.type-btn.active.transfer {
background-color: var(--accent-transfer);
color: #FFFFFF;
box-shadow: 0 3px 10px rgba(37, 99, 235, 0.35);
}

.numpad-display-box {
background: var(--glass-input);
border: 1px solid var(--glass-border);
box-shadow: inset 0 1px 0 var(--glass-highlight);
border-radius: 14px;
padding: 11px 14px;
display: flex;
justify-content: space-between;
align-items: baseline;
margin-bottom: 8px;
}

.currency-prefix {
font-family: var(--font-mono);
font-size: 14px;
color: var(--text-secondary);
}

.numpad-value {
font-family: var(--font-mono);
font-variant-numeric: tabular-nums;
font-size: 27px;
font-weight: 700;
display: inline-block;
transition: transform 0.14s var(--ease-bounce);
}

.numpad-value.pop {
transform: scale(1.05);
}

.quick-chips {
display: grid;
grid-template-columns: repeat(4, 1fr);
gap: 6px;
margin-bottom: 10px;
}

.chip-add {
background: var(--glass-input);
border: 1px solid var(--glass-border);
box-shadow: inset 0 1px 0 var(--glass-highlight);
color: var(--text-primary);
font-family: var(--font-mono);
font-size: 11px;
font-weight: 700;
padding: 7px 4px;
border-radius: 9px;
cursor: pointer;
transition: transform 0.14s var(--ease-bounce), background-color 0.14s ease;
}

.chip-add:active {
transform: scale(0.91);
background: var(--glass-bg-elevated);
}

.form-compact-grid {
display: grid;
grid-template-columns: 1fr 1fr;
gap: 8px;
margin-bottom: 8px;
}

.stack-form {
display: flex;
flex-direction: column;
gap: 12px;
}

.numpad-grid {
display: grid;
grid-template-columns: repeat(4, 1fr);
gap: 7px;
margin-top: 10px;
}

.pad-key {
background: var(--glass-input);
color: var(--text-primary);
border: 1px solid var(--glass-border);
box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04), inset 0 1px 0 var(--glass-highlight);
border-radius: 12px;
height: 45px;
font-family: var(--font-mono);
font-size: 17px;
font-weight: 700;
cursor: pointer;
transition: transform 0.12s var(--ease-bounce), background-color 0.12s ease;
}

.pad-key:active {
transform: scale(0.9);
background: var(--glass-bg-elevated);
}

.pad-fn {
font-size: 14px;
color: var(--text-secondary);
}

.pad-save {
grid-column: span 3;
background: var(--fab-bg);
color: var(--fab-fg);
border-color: transparent;
box-shadow: var(--fab-shadow);
font-family: var(--font-sans);
font-size: 13px;
letter-spacing: 0.04em;
}

/* GLASS TOAST WITH SPRING DROP MOTION */
.toast {
position: fixed;
top: calc(68px + env(safe-area-inset-top));
left: 50%;
transform: translate3d(-50%, -18px, 0) scale(0.95);
opacity: 0;
pointer-events: none;
background: var(--glass-bg-elevated);
backdrop-filter: blur(20px) saturate(180%);
-webkit-backdrop-filter: blur(20px) saturate(180%);
border: 1px solid var(--glass-border);
box-shadow: var(--glass-shadow-lg), inset 0 1px 0 var(--glass-highlight);
color: var(--text-primary);
font-size: 12.5px;
font-weight: 700;
padding: 10px 18px;
border-radius: 99px;
z-index: 80;
white-space: nowrap;
transition: opacity 0.24s var(--ease-tactile), transform 0.32s var(--ease-bounce);
}

.toast.show {
opacity: 1;
transform: translate3d(-50%, 0, 0) scale(1);
}

@media (prefers-reduced-motion: reduce) {
*, *::before, *::after {
animation-duration: 0.01ms !important;
transition-duration: 0.01ms !important;
}
}

/* PRINT STYLESHEET (RECEIPT PDF) */
.print-only {
display: none;
}

@media print {
body {
background: #FFFFFF !important;
color: #000000 !important;
}
.no-print,
.main-content,
.ambient-bg {
display: none !important;
}
.app-shell {
max-width: 100%;
border: none;
padding: 0;
}
.print-only {
display: block !important;
padding: 12px;
font-family: var(--font-mono);
font-size: 11px;
}
.receipt-box h2 {
font-size: 15px;
margin-bottom: 4px;
}
.receipt-line {
border-top: 1px dashed #000000;
margin: 10px 0;
}
.receipt-summary-item {
display: flex;
justify-content: space-between;
margin-bottom: 4px;
}
.receipt-table {
width: 100%;
border-collapse: collapse;
margin-top: 6px;
}
.receipt-table th,
.receipt-table td {
padding: 5px 4px;
border-bottom: 1px solid #CCCCCC;
text-align: left;
}
}
