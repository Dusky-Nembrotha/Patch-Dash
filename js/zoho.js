// ============================================================
// A Patch Wilder — Zoho mail + calendar panels
//
// Replaces the old Outlook panels. Zoho's Mail and Calendar APIs need a
// client secret to mint tokens, so unlike MSAL there's no per-user sign-in
// here: the Apps Script proxy holds the credentials and serves the owner's
// mail and calendar, exactly as the Ticket Tailor and Messages panels do.
// ============================================================

import { CONFIG } from "./config.js";
import { getAccessToken } from "./googleAuth.js";
import { loadComments, commentsBlockHtml, wireCommentActions } from "./comments.js";
import { loadMeta } from "./meta.js";
import { assignControlsHtml, assignItemAttrs, priorityTagHtml, wireAssign } from "./assign.js";
import { assignableUsers } from "./users.js";

async function proxy(action) {
  const token = await getAccessToken();
  const res = await fetch(`${CONFIG.appsScriptUrl}?action=${action}&token=${encodeURIComponent(token)}`);
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch (_) {
    // Apps Script serves an HTML page when a request errors or runs past its
    // execution limit, so a parse failure here is a proxy problem rather than
    // anything to do with the data.
    throw new Error(
      `The proxy returned a page instead of data (HTTP ${res.status}) — the ` +
      `Apps Script most likely timed out or threw. Check its Executions log.`
    );
  }
}

// ---------- Mail ----------

let mailMessages = [];
let mailComments = [];
let mailMeta = [];
let mailFilter = "all"; // "all" | "unread" | "flagged" | a user name

export async function initZohoMail() {
  const body = document.getElementById("mail-body");
  body.innerHTML = `<div class="loading-state">Loading mail…</div>`;

  try {
    const json = await proxy("zohomail");
    if (json.pending) {
      body.innerHTML = notConnectedHtml("mail");
      return;
    }
    if (json.error) {
      body.innerHTML = errorHtml("Couldn't load Zoho mail.", json.error);
      return;
    }
    mailMessages = Array.isArray(json) ? json : [];

    // Comments and assignment live in Drive; if those reads fail, still show
    // the mail rather than blanking the panel.
    [mailComments, mailMeta] = await Promise.all([
      loadComments("mail").catch(() => []),
      loadMeta("mail").catch(() => []),
    ]);

    if (!body.dataset.wired) {
      wireMail(body);
      body.dataset.wired = "1";
    }
    drawMail(body);
  } catch (err) {
    document.getElementById("mail-body").innerHTML = errorHtml("Couldn't load Zoho mail.", err.message);
  }
}

function mailMetaFor(id) {
  return mailMeta.find((x) => x.refId === id) || {};
}

function wireMail(body) {
  body.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) {
      mailFilter = chip.dataset.filter;
      drawMail(body);
    }
  });
  wireAssign(body, "mail", mailMetaFor, (id, rec) => {
    const i = mailMeta.findIndex((x) => x.refId === id);
    if (i >= 0) mailMeta[i] = rec;
    else mailMeta.push(rec);
    drawMail(body);
  });
  wireCommentActions(
    body,
    (c) => { mailComments.push(c); drawMail(body); },
    (id) => { mailComments = mailComments.filter((x) => x.id !== id); drawMail(body); }
  );
}

function drawMail(body) {
  const users = assignableUsers();
  const counts = {
    all: mailMessages.length,
    unread: mailMessages.filter((m) => m.unread).length,
    flagged: mailMessages.filter((m) => m.flagged).length,
  };
  users.forEach((u) => {
    counts[u.name] = mailMessages.filter((m) => mailMetaFor(m.id).assignee === u.name).length;
  });

  const isUserFilter = users.some((u) => u.name === mailFilter);
  const items = mailMessages.filter((m) => {
    if (mailFilter === "unread") return m.unread;
    if (mailFilter === "flagged") return m.flagged;
    if (isUserFilter) return mailMetaFor(m.id).assignee === mailFilter;
    return true;
  });

  body.innerHTML =
    filterBarHtml(counts) +
    (items.length ? items.map(mailItemHtml).join("") : `<div class="empty-state">No mail here.</div>`);
}

function filterBarHtml(counts) {
  const chip = (key, label, color) =>
    `<button class="chip${mailFilter === key ? " active" : ""}" data-filter="${key}"${color ? ` style="--chip:${color}"` : ""}>${label} (${counts[key]})</button>`;
  const userChips = assignableUsers().map((u) => chip(u.name, u.name, u.color)).join("");
  return `<div class="mail-filters">${chip("all", "All")}${chip("unread", "Unread")}${chip("flagged", "Flagged")}${userChips}</div>`;
}

function mailItemHtml(m) {
  const mt = mailMetaFor(m.id);
  const { cls, style } = assignItemAttrs(mt);
  const time = m.receivedTime
    ? new Date(m.receivedTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
  const indicator = m.flagged
    ? '<span class="flag">&#9873;</span>'
    : m.unread
    ? '<span class="unread-dot"></span>'
    : '<span class="dot-spacer"></span>';

  return `
    <div class="note-item${cls}"${style}>
      <div class="item-row">
        ${indicator}
        <div class="item-main">
          <div class="item-title">${titleLink(m.subject || "(no subject)", m.webLink)}${priorityTagHtml(mt)}</div>
          <div class="item-sub">${escapeHtml(m.from || "")}</div>
        </div>
        <div class="item-time">${time}</div>
      </div>
      ${assignControlsHtml(m.id, mt)}
      ${commentsBlockHtml("mail", m.id, mailComments)}
    </div>
  `;
}

// ---------- Calendar ----------

let calendarEvents = [];
let calendarComments = [];

export async function initZohoCalendar() {
  const body = document.getElementById("calendar-body");
  body.innerHTML = `<div class="loading-state">Loading calendar…</div>`;

  try {
    const json = await proxy("zohocalendar");
    if (json.pending) {
      body.innerHTML = notConnectedHtml("calendar");
      return;
    }
    if (json.error) {
      body.innerHTML = errorHtml("Couldn't load Zoho calendar.", json.error);
      return;
    }
    calendarEvents = Array.isArray(json) ? json : [];

    calendarComments = await loadComments("calendar").catch(() => []);

    if (!body.dataset.wired) {
      wireCommentActions(
        body,
        (c) => { calendarComments.push(c); drawCalendar(body); },
        (id) => { calendarComments = calendarComments.filter((x) => x.id !== id); drawCalendar(body); }
      );
      body.dataset.wired = "1";
    }
    drawCalendar(body);
  } catch (err) {
    document.getElementById("calendar-body").innerHTML = errorHtml("Couldn't load Zoho calendar.", err.message);
  }
}

function drawCalendar(body) {
  body.innerHTML = calendarEvents.length
    ? calendarEvents.map(eventItemHtml).join("")
    : `<div class="empty-state">Nothing on the calendar in the next 14 days.</div>`;
}

function eventItemHtml(ev) {
  const time = ev.start
    ? new Date(ev.start).toLocaleDateString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";
  return `
    <div class="note-item">
      <div class="item-row">
        <span class="dot-spacer"></span>
        <div class="item-main">
          <div class="item-title">${titleLink(ev.title || "(untitled)", ev.webLink)}</div>
          <div class="item-sub">${escapeHtml(ev.location || "")}</div>
        </div>
        <div class="item-time">${time}</div>
      </div>
      ${commentsBlockHtml("calendar", ev.id, calendarComments)}
    </div>
  `;
}

// ---------- Shared UI ----------

function notConnectedHtml(what) {
  return `
    <div class="empty-state">
      Zoho isn't connected yet. Add your Zoho client ID, secret and refresh
      token to the Apps Script properties (SETUP.md step 5) and this ${what}
      panel fills in automatically — no code change needed.
    </div>
  `;
}

function errorHtml(headline, detail) {
  return `<div class="error-state">${escapeHtml(headline)}<span class="fix">${escapeHtml(detail)}</span></div>`;
}

function titleLink(text, webLink) {
  if (!webLink) return escapeHtml(text);
  return `<a class="item-link" href="${escapeAttr(webLink)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
