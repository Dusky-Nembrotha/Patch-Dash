import { getAccessToken } from "./googleAuth.js";
import { CONFIG } from "./config.js";

// All persisted data now goes through the Apps Script proxy into ONE shared
// Drive (the owner's), so every allowed user sees the same data. The browser
// no longer needs any Drive permission — the Google token is only used to
// prove who the caller is.

async function proxyGet(params) {
  const token = await getAccessToken();
  const qs = new URLSearchParams({ ...params, token });
  const res = await fetch(`${CONFIG.appsScriptUrl}?${qs.toString()}`);
  const json = await res.json();
  if (json && json.error) throw new Error("Proxy: " + json.error);
  return json;
}

// Reads a whole collection (e.g. "todo") as an array.
export async function loadCollection(name) {
  const json = await proxyGet({ action: "load", collection: name });
  return Array.isArray(json) ? json : [];
}

// Overwrites a whole collection with the given array.
//
// Apps Script web apps can't return CORS headers on a POST response, so a
// normal cross-origin POST is blocked. We send it as a "no-cors" simple
// request: the write still reaches doPost and happens server-side; we just
// can't read the reply (fire-and-forget). Callers update local state
// optimistically and the next load reflects the saved data.
export async function saveCollection(name, data) {
  const token = await getAccessToken();
  const qs = new URLSearchParams({ action: "save", collection: name, token });
  await fetch(`${CONFIG.appsScriptUrl}?${qs.toString()}`, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(data),
  });
}

export function newId() {
  return crypto.randomUUID();
}

// A link that opens the shared data folder in Google Drive (owner's Drive).
export async function getFolderUrl() {
  const json = await proxyGet({ action: "folderurl" });
  return json.url || "https://drive.google.com/drive/my-drive";
}
