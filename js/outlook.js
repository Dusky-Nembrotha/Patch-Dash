import { CONFIG } from "./config.js";

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
      graphGet(`/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=8&$select=subject,from,receivedDateTime`, token),
      graphGet(`/me/mailFolders/inbox/messages?$filter=flag/flagStatus eq 'flagged'&$top=8&$select=subject,from,receivedDateTime`, token),
    ]);

    const merged = mergeMailLists(unread.value, flagged.value);
    body.innerHTML = merged.length
      ? merged.map(mailRowHtml).join("")
      : `<div class="empty-state">Inbox zero — no unread or flagged mail.</div>`;
    appendSignOut(body);
  } catch (err) {
    showError(body, btnId, "Couldn't load Outlook mail.", err.message);
  }
}

function mergeMailLists(unread, flagged) {
  const seen = new Set();
  const combined = [];
  flagged.forEach((m) => { seen.add(m.id ?? m.subject); combined.push({ ...m, flagged: true }); });
  unread.forEach((m) => { if (!seen.has(m.id ?? m.subject)) combined.push({ ...m, flagged: false }); });
  return combined.sort((a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime));
}

function mailRowHtml(m) {
  const time = new Date(m.receivedDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `
    <div class="item-row">
      ${m.flagged ? '<span class="flag">&#9873;</span>' : '<span class="unread-dot"></span>'}
      <div class="item-main">
        <div class="item-title">${escapeHtml(m.subject || "(no subject)")}</div>
        <div class="item-sub">${escapeHtml(m.from?.emailAddress?.name || "")}</div>
      </div>
      <div class="item-time">${time}</div>
    </div>
  `;
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
