import { CONFIG } from "./config.js";

let msalInstance;
let account;

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
      },
      cache: { cacheLocation: "localStorage" },
    });
  }
  return msalInstance;
}

async function ensureSignedIn() {
  const client = getMsal();
  const accounts = client.getAllAccounts();
  if (accounts.length > 0) {
    account = accounts[0];
    return account;
  }
  // No awaits before loginPopup: the popup must open synchronously within the
  // Connect click, or the browser blocks it (empty_window_error). The redirect
  // promise is already handled once at load in initOutlookPanel.
  const result = await client.loginPopup({ scopes: CONFIG.microsoft.scopes });
  account = result.account;
  return account;
}

async function getToken() {
  const client = getMsal();
  try {
    const result = await client.acquireTokenSilent({
      scopes: CONFIG.microsoft.scopes,
      account,
    });
    return result.accessToken;
  } catch (e) {
    const result = await client.acquireTokenPopup({ scopes: CONFIG.microsoft.scopes });
    return result.accessToken;
  }
}

async function graphGet(path, token) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API error ${res.status}`);
  return res.json();
}

export async function initOutlookMail() {
  await initOutlookPanel(
    "mail-body",
    "mail-connect-btn",
    "Connect Outlook to see flagged &amp; unread mail here.",
    loadMail
  );
}

// Decides what a mail/calendar panel shows on load:
//  - not configured yet -> a note pointing at SETUP.md
//  - configured + already signed in -> load straight away (silent token)
//  - configured + not signed in -> a Connect button, so the Microsoft
//    login popup opens from a real click (browsers block gesture-less popups)
async function initOutlookPanel(bodyId, btnId, prompt, loadFn) {
  const body = document.getElementById(bodyId);
  if (!isConfigured()) {
    body.innerHTML = `<div class="empty-state">Outlook isn't set up yet — add your Azure client ID to js/config.js (SETUP.md step 5).</div>`;
    return;
  }
  const client = getMsal();
  await client.handleRedirectPromise();
  if (client.getAllAccounts().length > 0) {
    await loadFn(body);
  } else {
    body.innerHTML = connectPrompt(btnId, prompt);
    document.getElementById(btnId).addEventListener("click", () => loadFn(body));
  }
}

async function loadMail(body) {
  try {
    body.innerHTML = `<div class="loading-state">Connecting to Outlook…</div>`;
    await ensureSignedIn();
    const token = await getToken();

    const [unread, flagged] = await Promise.all([
      graphGet(`/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=8&$select=subject,from,receivedDateTime`, token),
      graphGet(`/me/mailFolders/inbox/messages?$filter=flag/flagStatus eq 'flagged'&$top=8&$select=subject,from,receivedDateTime`, token),
    ]);

    const merged = mergeMailLists(unread.value, flagged.value);
    if (!merged.length) {
      body.innerHTML = `<div class="empty-state">Inbox zero — no unread or flagged mail.</div>`;
      return;
    }
    body.innerHTML = merged.map(mailRowHtml).join("");
  } catch (err) {
    body.innerHTML = errorHtml("Couldn't load Outlook mail.", err.message);
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

export async function initOutlookCalendar() {
  await initOutlookPanel(
    "calendar-body",
    "calendar-connect-btn",
    "Connect Outlook to see upcoming events here.",
    loadCalendar
  );
}

async function loadCalendar(body) {
  try {
    body.innerHTML = `<div class="loading-state">Connecting to Outlook…</div>`;
    await ensureSignedIn();
    const token = await getToken();

    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const data = await graphGet(
      `/me/calendarview?startDateTime=${now.toISOString()}&endDateTime=${in14.toISOString()}&$orderby=start/dateTime&$top=10&$select=subject,start,location`,
      token
    );

    if (!data.value.length) {
      body.innerHTML = `<div class="empty-state">Nothing on the calendar in the next 14 days.</div>`;
      return;
    }
    body.innerHTML = data.value.map(eventRowHtml).join("");
  } catch (err) {
    body.innerHTML = errorHtml("Couldn't load calendar.", err.message);
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

function connectPrompt(btnId, text) {
  return `<div class="empty-state">${text}<br><button class="connect-btn" id="${btnId}">Connect Outlook</button></div>`;
}

function errorHtml(headline, detail) {
  return `<div class="error-state">${headline}<span class="fix">${escapeHtml(detail)}</span></div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
