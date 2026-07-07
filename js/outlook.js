import { CONFIG } from "./config.js";
import { loadComments, addComment, formatAuthor } from "./comments.js";

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
let mailFilter = "all"; // "all" | "unread" | "flagged"

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
      graphGet(`/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=15&$select=subject,from,receivedDateTime`, token),
      graphGet(`/me/mailFolders/inbox/messages?$filter=flag/flagStatus eq 'flagged'&$top=15&$select=subject,from,receivedDateTime`, token),
    ]);
    mailMessages = mergeMailLists(unread.value, flagged.value);

    // Comments live in Drive; if that read fails, still show the mail.
    try {
      mailComments = await loadComments("mail");
    } catch (err) {
      mailComments = [];
      console.error("Couldn't load mail comments:", err);
    }

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

function drawMail(body) {
  const counts = {
    all: mailMessages.length,
    unread: mailMessages.filter((m) => m.unread).length,
    flagged: mailMessages.filter((m) => m.flagged).length,
  };
  const items = mailMessages.filter((m) =>
    mailFilter === "unread" ? m.unread : mailFilter === "flagged" ? m.flagged : true
  );

  const list = items.length
    ? items.map(mailItemHtml).join("")
    : `<div class="empty-state">No ${mailFilter === "all" ? "" : mailFilter + " "}mail.</div>`;

  body.innerHTML = filterBarHtml(counts) + list;
  appendSignOut(body);
}

function filterBarHtml(counts) {
  const chip = (key, label) =>
    `<button class="chip${mailFilter === key ? " active" : ""}" data-filter="${key}">${label} (${counts[key]})</button>`;
  return `<div class="mail-filters">${chip("all", "All")}${chip("unread", "Unread")}${chip("flagged", "Flagged")}</div>`;
}

function mailItemHtml(m) {
  const time = new Date(m.receivedDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const indicator = m.flagged
    ? '<span class="flag">&#9873;</span>'
    : m.unread
    ? '<span class="unread-dot"></span>'
    : '<span class="dot-spacer"></span>';
  const notes = mailComments.filter((c) => c.refId === m.id).map(commentHtml).join("");
  return `
    <div class="mail-item-wrap">
      <div class="item-row">
        ${indicator}
        <div class="item-main">
          <div class="item-title">${escapeHtml(m.subject || "(no subject)")}</div>
          <div class="item-sub">${escapeHtml(m.from?.emailAddress?.name || "")}</div>
        </div>
        <div class="item-time">${time}</div>
      </div>
      <div class="mail-notes">
        ${notes}
        <button class="cmt-toggle" type="button">&#43; note</button>
        <div class="cmt-add">
          <input class="cmt-input" type="text" placeholder="Add a note…" />
          <button class="cmt-save" type="button" data-id="${escapeAttr(m.id)}">Save</button>
        </div>
      </div>
    </div>
  `;
}

function commentHtml(c) {
  return `
    <div class="cmt">
      <span class="cmt-text">${escapeHtml(c.text)}</span>
      <span class="cmt-meta">${escapeHtml(formatAuthor(c))}</span>
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
    const toggle = e.target.closest(".cmt-toggle");
    if (toggle) {
      const wrap = toggle.closest(".mail-item-wrap");
      wrap.classList.add("commenting");
      wrap.querySelector(".cmt-input").focus();
      return;
    }
    const save = e.target.closest(".cmt-save");
    if (save) {
      await submitComment(body, save.closest(".mail-item-wrap"), save.dataset.id);
    }
  });
  body.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && e.target.matches(".cmt-input")) {
      e.preventDefault();
      const wrap = e.target.closest(".mail-item-wrap");
      await submitComment(body, wrap, wrap.querySelector(".cmt-save").dataset.id);
    }
  });
}

async function submitComment(body, wrap, refId) {
  const input = wrap.querySelector(".cmt-input");
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    const comment = await addComment("mail", refId, text);
    mailComments.push(comment);
    drawMail(body);
  } catch (err) {
    input.disabled = false;
    console.error("Failed to save comment:", err);
  }
}

// ---------- Calendar ----------

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
      `/me/calendarview?startDateTime=${now.toISOString()}&endDateTime=${in14.toISOString()}&$orderby=start/dateTime&$top=10&$select=subject,start,location`,
      token
    );

    body.innerHTML = data.value.length
      ? data.value.map(eventRowHtml).join("")
      : `<div class="empty-state">Nothing on the calendar in the next 14 days.</div>`;
    appendSignOut(body);
  } catch (err) {
    showError(body, btnId, "Couldn't load calendar.", err.message);
  }
}

function eventRowHtml(ev) {
  const start = new Date(ev.start.dateTime + "Z");
  const time = start.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `
    <div class="item-row">
      <span class="dot-spacer"></span>
      <div class="item-main">
        <div class="item-title">${escapeHtml(ev.subject || "(untitled)")}</div>
        <div class="item-sub">${escapeHtml(ev.location?.displayName || "")}</div>
      </div>
      <div class="item-time">${time}</div>
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
