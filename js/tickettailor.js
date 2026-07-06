import { CONFIG } from "./config.js";
import { getAccessToken } from "./googleAuth.js";

export async function initTicketTailor() {
  const body = document.getElementById("tt-body");
  body.innerHTML = `<div class="loading-state">Loading events…</div>`;

  try {
    const token = await getAccessToken();
    const res = await fetch(
      `${CONFIG.appsScriptUrl}?action=tickettailor&token=${encodeURIComponent(token)}`
    );
    const json = await res.json();

    if (json.error) throw new Error(json.error);

    if (!json.length) {
      body.innerHTML = `<div class="empty-state">No upcoming events on Ticket Tailor.</div>`;
      return;
    }
    body.innerHTML = json.map(rowHtml).join("");
  } catch (err) {
    body.innerHTML = errorHtml(
      "Couldn't load Ticket Tailor events.",
      "Check the Apps Script deployment and TICKET_TAILOR_API_KEY script property. See SETUP.md.\n" + err.message
    );
  }
}

function rowHtml(ev) {
  const date = ev.start?.date
    ? new Date(ev.start.date + (ev.start.time ? `T${ev.start.time}` : "")).toLocaleDateString(undefined, {
        month: "short", day: "numeric",
      })
    : "";
  return `
    <div class="item-row">
      <span class="dot-spacer"></span>
      <div class="item-main">
        <div class="item-title">${escapeHtml(ev.name)}</div>
        <div class="item-sub">${ev.tickets_sold ?? 0} sold${ev.venue ? " · " + escapeHtml(ev.venue) : ""}</div>
      </div>
      <div class="item-time">${date}</div>
    </div>
  `;
}

function errorHtml(headline, detail) {
  return `<div class="error-state">${headline}<span class="fix">${escapeHtml(detail)}</span></div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
