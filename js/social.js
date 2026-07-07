import { CONFIG } from "./config.js";
import { getAccessToken } from "./googleAuth.js";

export async function initSocial() {
  const body = document.getElementById("social-body");
  body.innerHTML = `<div class="loading-state">Loading messages…</div>`;

  try {
    const token = await getAccessToken();
    const res = await fetch(
      `${CONFIG.appsScriptUrl}?action=meta&token=${encodeURIComponent(token)}`
    );
    const json = await res.json();

    if (json.pending) {
      body.innerHTML = notConnectedHtml();
      return;
    }
    if (json.error) {
      body.innerHTML = errorHtml("Couldn't load Facebook/Instagram messages.", json.error);
      return;
    }

    if (!json.length) {
      body.innerHTML = `<div class="empty-state">No recent Facebook or Instagram messages.</div>`;
      return;
    }
    body.innerHTML = json.map(rowHtml).join("");
  } catch (err) {
    body.innerHTML = errorHtml("Couldn't load Facebook/Instagram messages.", err.message);
  }
}

function rowHtml(m) {
  const time = new Date(m.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `
    <div class="item-row">
      <span class="unread-dot" style="background: ${m.platform === "instagram" ? "#C97D5D" : "#7FA9B5"}"></span>
      <div class="item-main">
        <div class="item-title">${escapeHtml(m.from)} <span style="color:var(--mist); font-weight:400;">· ${m.platform}</span></div>
        <div class="item-sub">${escapeHtml(m.snippet)}</div>
      </div>
      <div class="item-time">${time}</div>
    </div>
  `;
}

function notConnectedHtml() {
  return `
    <div class="empty-state">
      Facebook &amp; Instagram not connected yet. Add your Meta Page access
      token and Page ID to the Apps Script properties (SETUP.md step 6) and
      this panel fills in automatically — no code change needed.
    </div>
  `;
}

function errorHtml(headline, detail) {
  return `<div class="error-state">${escapeHtml(headline)}<span class="fix">${escapeHtml(detail)}</span></div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
