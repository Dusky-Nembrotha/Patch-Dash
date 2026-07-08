import { CONFIG } from "./config.js";
import { getAccessToken } from "./googleAuth.js";
import { loadComments, commentsBlockHtml, wireCommentActions } from "./comments.js";
import { loadMeta } from "./meta.js";
import { assignControlsHtml, assignItemAttrs, priorityTagHtml, wireAssign } from "./assign.js";

let messages = [];
let comments = [];
let meta = [];

export async function initSocial() {
  const body = document.getElementById("social-body");
  body.innerHTML = `<div class="loading-state">Loading messages…</div>`;

  try {
    const token = await getAccessToken();
    const res = await fetch(`${CONFIG.appsScriptUrl}?action=meta&token=${encodeURIComponent(token)}`);
    const json = await res.json();

    if (json.pending) {
      body.innerHTML = notConnectedHtml();
      return;
    }
    if (json.error) {
      body.innerHTML = errorHtml("Couldn't load Facebook/Instagram messages.", json.error);
      return;
    }
    messages = Array.isArray(json) ? json : [];

    [comments, meta] = await Promise.all([
      loadComments("social").catch(() => []),
      loadMeta("social").catch(() => []),
    ]);

    if (!body.dataset.wired) {
      wireCommentActions(
        body,
        (c) => { comments.push(c); draw(body); },
        (id) => { comments = comments.filter((x) => x.id !== id); draw(body); }
      );
      wireAssign(body, "social", metaFor, (id, rec) => {
        const i = meta.findIndex((x) => x.refId === id);
        if (i >= 0) meta[i] = rec;
        else meta.push(rec);
        draw(body);
      });
      body.dataset.wired = "1";
    }
    draw(body);
  } catch (err) {
    document.getElementById("social-body").innerHTML = errorHtml(
      "Couldn't load Facebook/Instagram messages.",
      err.message
    );
  }
}

function metaFor(id) {
  return meta.find((m) => m.refId === id) || {};
}

function draw(body) {
  if (!messages.length) {
    body.innerHTML = `<div class="empty-state">No unread Facebook or Instagram messages.</div>`;
    return;
  }
  body.innerHTML = messages.map(itemHtml).join("");
}

function itemHtml(m) {
  const time = m.timestamp
    ? new Date(m.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
  const mt = metaFor(m.id);
  const { cls, style } = assignItemAttrs(mt);
  const icon = m.platform === "instagram" ? IG_ICON : FB_ICON;
  return `
    <div class="note-item${cls}"${style}>
      <div class="item-row">
        ${icon}
        <div class="item-main">
          <div class="item-title">${escapeHtml(m.from)}${priorityTagHtml(mt)}</div>
          <div class="item-sub">${escapeHtml(m.snippet || "")}</div>
        </div>
        <div class="item-time">${time}</div>
      </div>
      ${assignControlsHtml(m.id, mt)}
      ${commentsBlockHtml("social", m.id, comments)}
    </div>
  `;
}

const FB_ICON =
  '<span class="msg-ico" title="Facebook"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M15.3 8.2h-1.6c-.3 0-.6.3-.6.7V10h2.2l-.3 2.2h-1.9V19h-2.3v-6.8H9v-2.2h1.9V8.4c0-1.7 1-2.7 2.6-2.7h1.8v2.5z"/></svg></span>';

const IG_ICON =
  '<span class="msg-ico" title="Instagram"><svg viewBox="0 0 24 24" width="18" height="18">' +
  '<defs><radialGradient id="ig" cx="0.3" cy="1" r="1"><stop offset="0" stop-color="#FBE18A"/><stop offset="0.35" stop-color="#FCBB45"/><stop offset="0.6" stop-color="#F75274"/><stop offset="1" stop-color="#D53692"/></radialGradient></defs>' +
  '<rect width="24" height="24" rx="6" fill="url(#ig)"/><rect x="5" y="5" width="14" height="14" rx="4.5" fill="none" stroke="#fff" stroke-width="1.8"/>' +
  '<circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.2" cy="7.8" r="1.1" fill="#fff"/></svg></span>';

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
