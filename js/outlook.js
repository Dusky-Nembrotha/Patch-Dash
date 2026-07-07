import { CONFIG } from "./config.js";
import { loadComments, commentsBlockHtml, wireCommentActions } from "./comments.js";
import { loadMeta, setMeta } from "./meta.js";
import { assignableUsers, userColor } from "./users.js";

let msalInstance;
let redirectPromise;

function isConfigured() {
  return CONFIG.microsoft.clientId && !CONFIG.microsoft.clientId.startsWith("YOUR-");
}

function getMsal() {
  if (!msalInstance) {
    msalInstance = new msal.PublicClientApplication({
      auth: {
        clientId: CONFIG.microsoft.clientId,
        authority: CONFIG.microsoft.authority,
        redirectUri: CONFIG.microsoft.redirectUri,
        // Read the sign-in response on the page the redirect lands on, rather
        // than bouncing back to the initiating URL (which can drop it).
        navigateToLoginRequestUrl: false,
      },
      cache: { cacheLocation: "localStorage" },
    });

    // Process a returning sign-in redirect once, as soon as the instance
    // exists, and record the signed-in account as the active one.
    redirectPromise = msalInstance
      .handleRedirectPromise()
      .then((result) => {
        const account = result?.account || msalInstance.getAllAccounts()[0];
        if (account) msalInstance.setActiveAccount(account);
        return result;
      })
      .catch((err) => {
        console.error("Outlook redirect handling failed:", err);
        return null;
      });
  }
  return msalInstance;
}

// Returns a Graph token without any user interaction, or null if a fresh
// sign-in is required. Waits for a returning redirect to be processed first.
async function getTokenSilent() {
  const client = getMsal();
  await redirectPromise;
  const account = client.getActiveAccount() || client.getAllAccounts()[0];
  if (!account) return null;
  try {
    const res = await client.acquireTokenSilent({
      scopes: CONFIG.microsoft.scopes,
      account,
    });
    return res.accessToken;
  } catch (err) {
    console.error("Outlook silent token failed:", err);
    return null;
  }
}

// Full-page redirect to Microsoft and back — works even when popups are
// blocked. On return, handleRedirectOnce() completes it and the panels load.
function startSignIn() {
  // prompt:select_account lets the user pick/switch which Microsoft account
  // to use, rather than silently reusing an existing session.
  getMsal().loginRedirect({ scopes: CONFIG.microsoft.scopes, prompt: "select_account" });
}

// Signs out of Microsoft for this app, then returns to the dashboard where
// the Outlook panels go back to the Connect state.
function signOutOutlook() {
  const client = getMsal();
  const account = client.getActiveAccount() || client.getAllAccounts()[0];
  client.logoutRedirect({ account, postLogoutRedirectUri: CONFIG.microsoft.redirectUri });
}

async function graphGet(path, token) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API error ${res.status}`);
  return res.json();
}

// Shared panel bootstrap: if a silent token is available, render; otherwise
// show a Connect button that kicks off the redirect sign-in.
async function initOutlookPanel(bodyId, btnId, prompt, render) {
  const body = document.getElementById(bodyId);
  if (!isConfigured()) {
    body.innerHTML = `<div class="empty-state">Outlook isn't set up yet — add your Azure client ID to js/config.js (SETUP.md step 5).</div>`;
    return;
  }
  const token = await getTokenSilent();
  if (token) {
    await render(body, token, btnId);
  } else {
    showConnect(body, btnId, prompt);
  }
}

function showConnect(body, btnId, prompt) {
  body.innerHTML = connectPrompt(btnId, prompt);
  document.getElementById(btnId).addEventListener("click", startSignIn);
}

// ---------- Mail ----------

let mailMessages = [];
let mailComments = [];
let mailMeta = [];
let mailFilter = "all"; // "all" | "unread" | "flagged" | a user name

export async function initOutlookMail() {
  await initOutlookPanel(
    "mail-body",
    "mail-connect-btn",
    "Connect Outlook to see flagged &amp; unread mail here.",
    renderMail
  );
}

async function renderMail(body, token, btnId) {
  try {
    body.innerHTML = `<div class="loading-state">Loading mail…</div>`;
    const [unread, flagged] = await Promise.all([
      graphGet(`/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=15&$select=subject,from,receivedDateTime,webLink`, token),
      graphGet(`/me/mailFolders/inbox/messages?$filter=flag/flagStatus eq 'flagged'&$top=15&$select=subject,from,receivedDateTime,webLink`, token),
    ]);
    mailMessages = mergeMailLists(unread.value, flagged.value);

    // Comments + assignment/priority live in Drive; if those reads fail, still
    // show the mail.
    [mailComments, mailMeta] = await Promise.all([
      loadComments("mail").catch((err) => {
        console.error("Couldn't load mail comments:", err);
        return [];
      }),
      loadMeta("mail").catch((err) => {
        console.error("Couldn't load mail metadata:", err);
        return [];
      }),
    ]);

    if (!body.dataset.wired) {
      wireMail(body);
      body.dataset.wired = "1";
    }
    drawMail(body);
  } catch (err) {
    showError(body, btnId, "Couldn't load Outlook mail.", err.message);
  }
}

function mergeMailLists(unread, flagged) {
  const byId = new Map();
  const tag = (m, key) => {
    const id = m.id ?? m.subject;
    if (!byId.has(id)) byId.set(id, { ...m, unread: false, flagged: false });
    byId.get(id)[key] = true;
  };
  unread.forEach((m) => tag(m, "unread"));
  flagged.forEach((m) => tag(m, "flagged"));
  return [...byId.values()].sort(
    (a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime)
  );
}

function metaFor(id) {
  return mailMeta.find((x) => x.refId === id) || {};
}

function drawMail(body) {
  const users = assignableUsers();
  const counts = {
    all: mailMessages.length,
    unread: mailMessages.filter((m) => m.unread).length,
    flagged: mailMessages.filter((m) => m.flagged).length,
  };
  users.forEach((u) => {
    counts[u.name] = mailMessages.filter((m) => metaFor(m.id).assignee === u.name).length;
  });

  const isUserFilter = users.some((u) => u.name === mailFilter);
  const items = mailMessages.filter((m) => {
    if (mailFilter === "unread") return m.unread;
    if (mailFilter === "flagged") return m.flagged;
    if (isUserFilter) return metaFor(m.id).assignee === mailFilter;
    return true;
  });

  const list = items.length
    ? items.map(mailItemHtml).join("")
    : `<div class="empty-state">No mail here.</div>`;

  body.innerHTML = filterBarHtml(counts) + list;
  appendSignOut(body);
}

function filterBarHtml(counts) {
  const chip = (key, label, color) =>
    `<button class="chip${mailFilter === key ? " active" : ""}" data-filter="${key}"${color ? ` style="--chip:${color}"` : ""}>${label} (${counts[key]})</button>`;
  const userChips = assignableUsers().map((u) => chip(u.name, u.name, u.color)).join("");
  return `<div class="mail-filters">${chip("all", "All")}${chip("unread", "Unread")}${chip("flagged", "Flagged")}${userChips}</div>`;
}

function mailItemHtml(m) {
  const meta = metaFor(m.id);
  const time = new Date(m.receivedDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const indicator = m.flagged
    ? '<span class="flag">&#9873;</span>'
    : m.unread
    ? '<span class="unread-dot"></span>'
    : '<span class="dot-spacer"></span>';

  const cls = `note-item${meta.assignee ? " assigned" : ""}${meta.priority ? " priority" : ""}`;
  const style = meta.assignee ? ` style="--assignee:${userColor(meta.assignee)}"` : "";
  const prioTag = meta.priority ? '<span class="prio-tag">High</span>' : "";
  const avatars = assignableUsers()
    .map(
      (u) =>
        `<button class="avatar${meta.assignee === u.name ? " active" : ""}" data-assign="${u.name}" data-id="${escapeAttr(m.id)}" title="Assign to ${u.name}" style="--u:${u.color}">${u.name[0]}</button>`
    )
    .join("");

  return `
    <div class="${cls}"${style}>
      <div class="item-row">
        ${indicator}
        <div class="item-main">
          <div class="item-title">${titleLink(m.subject || "(no subject)", m.webLink)}${prioTag}</div>
          <div class="item-sub">${escapeHtml(m.from?.emailAddress?.name || "")}</div>
        </div>
        <div class="item-time">${time}</div>
      </div>
      <div class="mail-actions">
        <button class="prio${meta.priority ? " on" : ""}" data-prio data-id="${escapeAttr(m.id)}" title="Toggle high priority">!</button>
        <span class="assign-avatars">${avatars}</span>
      </div>
      ${commentsBlockHtml("mail", m.id, mailComments)}
    </div>
  `;
}

function wireMail(body) {
  body.addEventListener("click", async (e) => {
    const chip = e.target.closest(".chip");
    if (chip) {
      mailFilter = chip.dataset.filter;
      drawMail(body);
      return;
    }
    const avatar = e.target.closest(".avatar");
    if (avatar) {
      const current = metaFor(avatar.dataset.id).assignee;
      const assignee = current === avatar.dataset.assign ? null : avatar.dataset.assign;
      await applyMailMeta(body, avatar.dataset.id, { assignee });
      return;
    }
    const prio = e.target.closest(".prio");
    if (prio) {
      await applyMailMeta(body, prio.dataset.id, { priority: !metaFor(prio.dataset.id).priority });
    }
  });
  wireCommentActions(
    body,
    (comment) => { mailComments.push(comment); drawMail(body); },
    (id) => { mailComments = mailComments.filter((c) => c.id !== id); drawMail(body); }
  );
}

async function applyMailMeta(body, id, patch) {
  try {
    const rec = await setMeta("mail", id, patch);
    const i = mailMeta.findIndex((x) => x.refId === id);
    if (i >= 0) mailMeta[i] = rec;
    else mailMeta.push(rec);
    drawMail(body);
  } catch (err) {
    console.error("Failed to update mail metadata:", err);
  }
}

// ---------- Calendar ----------

let calendarEvents = [];
let calendarComments = [];

export async function initOutlookCalendar() {
  await initOutlookPanel(
    "calendar-body",
    "calendar-connect-btn",
    "Connect Outlook to see upcoming events here.",
    renderCalendar
  );
}

async function renderCalendar(body, token, btnId) {
  try {
    body.innerHTML = `<div class="loading-state">Loading calendar…</div>`;
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const data = await graphGet(
      `/me/calendarview?startDateTime=${now.toISOString()}&endDateTime=${in14.toISOString()}&$orderby=start/dateTime&$top=10&$select=id,subject,start,location,webLink`,
      token
    );
    calendarEvents = data.value;

    try {
      calendarComments = await loadComments("calendar");
    } catch (err) {
      calendarComments = [];
      console.error("Couldn't load calendar comments:", err);
    }

    if (!body.dataset.wired) {
      wireCommentActions(
        body,
        (comment) => { calendarComments.push(comment); drawCalendar(body); },
        (id) => { calendarComments = calendarComments.filter((c) => c.id !== id); drawCalendar(body); }
      );
      body.dataset.wired = "1";
    }
    drawCalendar(body);
  } catch (err) {
    showError(body, btnId, "Couldn't load calendar.", err.message);
  }
}

function drawCalendar(body) {
  body.innerHTML = calendarEvents.length
    ? calendarEvents.map(eventItemHtml).join("")
    : `<div class="empty-state">Nothing on the calendar in the next 14 days.</div>`;
  appendSignOut(body);
}

function eventItemHtml(ev) {
  const start = new Date(ev.start.dateTime + "Z");
  const time = start.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `
    <div class="note-item">
      <div class="item-row">
        <span class="dot-spacer"></span>
        <div class="item-main">
          <div class="item-title">${titleLink(ev.subject || "(untitled)", ev.webLink)}</div>
          <div class="item-sub">${escapeHtml(ev.location?.displayName || "")}</div>
        </div>
        <div class="item-time">${time}</div>
      </div>
      ${commentsBlockHtml("calendar", ev.id, calendarComments)}
    </div>
  `;
}

// ---------- Shared UI ----------

function connectPrompt(btnId, text) {
  return `<div class="empty-state">${text}<br><button class="connect-btn" id="${btnId}">Connect Outlook</button></div>`;
}

// Appends a "signed in as … · Sign out" footer to a loaded Outlook panel.
function appendSignOut(body) {
  const account = getMsal().getActiveAccount() || getMsal().getAllAccounts()[0];
  const foot = document.createElement("div");
  foot.className = "panel-foot";
  foot.innerHTML =
    (account ? `<span class="panel-foot-who">${escapeHtml(account.username)}</span> · ` : "") +
    `<a href="#" class="outlook-signout">Sign out</a>`;
  foot.querySelector(".outlook-signout").addEventListener("click", (e) => {
    e.preventDefault();
    signOutOutlook();
  });
  body.appendChild(foot);
}

// Shows an error and a button to retry the sign-in (e.g. token went stale).
function showError(body, btnId, headline, detail) {
  body.innerHTML =
    errorHtml(headline, detail) +
    `<button class="connect-btn" id="${btnId}">Reconnect Outlook</button>`;
  document.getElementById(btnId).addEventListener("click", startSignIn);
}

function errorHtml(headline, detail) {
  return `<div class="error-state">${headline}<span class="fix">${escapeHtml(detail)}</span></div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Links a title to its Outlook web deep link (webLink), opening in a new tab.
// Outlook on the web is the reliable target; if the desktop app is set as the
// default handler the OS can still capture it. Falls back to plain text.
function titleLink(text, webLink) {
  if (!webLink) return escapeHtml(text);
  return `<a class="item-link" href="${escapeAttr(webLink)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}
