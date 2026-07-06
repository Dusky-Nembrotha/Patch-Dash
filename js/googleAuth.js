import { CONFIG } from "./config.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

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

  // Try a silent sign-in first, in case this browser already granted access.
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
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

export function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => window.location.reload());
  } else {
    window.location.reload();
  }
}
