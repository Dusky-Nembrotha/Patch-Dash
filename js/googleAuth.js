import { CONFIG } from "./config.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// Where we stash the access token between page loads. sessionStorage keeps
// it for the life of the tab (so a refresh doesn't force a re-login) but
// clears it when the tab closes — a reasonable spot for a ~1h bearer token.
const STORAGE_KEY = "apw_google_auth";

let tokenClient;
let accessToken = null;
let tokenExpiry = 0;
let currentEmail = null;

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
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken, tokenExpiry, email: currentEmail })
    );
  } catch (_) {}
}

function restore() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Keep a small safety margin so we don't hand back a token about to expire.
    if (saved.accessToken && Date.now() < saved.tokenExpiry - 30000) return saved;
  } catch (_) {}
  return null;
}

function clearStored() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
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
    accessToken = resp.access_token;
    tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
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
    document.getElementById("user-email").textContent = currentEmail;
    gate.style.display = "none";
    onReady({ email: currentEmail });
    return;
  }

  // Otherwise try a silent sign-in (works if this browser already granted
  // access); the gate stays up until it succeeds or the user connects.
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
      persist();
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

export function signOut() {
  clearStored();
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => window.location.reload());
  } else {
    window.location.reload();
  }
}
