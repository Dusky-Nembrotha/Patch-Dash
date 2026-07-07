import { CONFIG } from "./config.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// Where we stash the access token between page loads. localStorage persists
// it across refreshes AND browser restarts, so you stay signed in until the
// token expires (~1h) — after which a silent refresh renews it without a
// popup. Cleared on sign-out. (A drive.file + email scoped bearer token in
// localStorage is a fair trade-off for a private single-user dashboard.)
const STORAGE_KEY = "apw_google_auth";

let tokenClient;
let accessToken = null;
let tokenExpiry = 0;
let currentEmail = null;
let currentScope = "";

// The Drive scope the data panels need. Google's granular consent lets a user
// approve email but decline Drive, which yields a token that 403s on Drive —
// so we treat a token without this scope as not signed in.
function hasDriveScope(scope) {
  return (scope || "").includes("drive.file");
}

function loadGis() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken, tokenExpiry, email: currentEmail, scope: currentScope })
    );
  } catch (_) {}
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Keep a small safety margin so we don't hand back a token about to expire,
    // and reject a cached token that never got Drive access granted.
    if (
      saved.accessToken &&
      Date.now() < saved.tokenExpiry - 30000 &&
      hasDriveScope(saved.scope)
    ) {
      return saved;
    }
  } catch (_) {}
  return null;
}

function clearStored() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

async function fetchEmail(token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json.email;
}

// Shows the connect gate; calls onReady({email}) once signed in.
export async function requireGoogleAuth(onReady) {
  await loadGis();
  const gate = document.getElementById("auth-gate");
  const connectBtn = document.getElementById("google-connect-btn");
  const msg = document.getElementById("auth-msg");

  const handleToken = async (resp) => {
    if (resp.error) {
      msg.textContent = "Connect your Google account to continue.";
      gate.style.display = "flex";
      return;
    }
    if (!hasDriveScope(resp.scope)) {
      // The user approved sign-in but not Drive — the data panels can't work.
      msg.textContent =
        "This dashboard needs Google Drive access. Click Connect again and tick the Google Drive permission.";
      gate.style.display = "flex";
      return;
    }
    accessToken = resp.access_token;
    tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
    currentScope = resp.scope;
    currentEmail = await fetchEmail(accessToken);
    persist();
    document.getElementById("user-email").textContent = currentEmail;
    gate.style.display = "none";
    onReady({ email: currentEmail });
  };

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.google.clientId,
    scope: SCOPES,
    callback: handleToken,
  });

  connectBtn.addEventListener("click", () => {
    tokenClient.requestAccessToken({ prompt: "consent" });
  });

  // Fast path: a valid token from earlier in this tab session — go straight
  // in, no gate, no Google round-trip.
  const saved = restore();
  if (saved) {
    accessToken = saved.accessToken;
    tokenExpiry = saved.tokenExpiry;
    currentEmail = saved.email;
    currentScope = saved.scope;
    document.getElementById("user-email").textContent = currentEmail;
    gate.style.display = "none";
    onReady({ email: currentEmail });
    return;
  }

  // Otherwise show the gate and try a silent sign-in behind it. If the
  // browser still has an active Google session + prior consent, the token
  // comes back with no popup and handleToken hides the gate; if not, the
  // Connect button is already there for the user. (We keep the gate up
  // rather than hidden so a silent attempt that never resolves can't leave
  // the user stuck with no way in.)
  gate.style.display = "flex";
  tokenClient.requestAccessToken({ prompt: "" });
}

// Returns a valid access token, silently refreshing if it's expired.
export function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) {
    return Promise.resolve(accessToken);
  }
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error));
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
      if (resp.scope) currentScope = resp.scope;
      persist();
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

export function getCurrentEmail() {
  return currentEmail;
}

export function signOut() {
  clearStored();
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => window.location.reload());
  } else {
    window.location.reload();
  }
}
