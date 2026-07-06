import { getAccessToken } from "./googleAuth.js";

const FOLDER_NAME = "A Patch Wilder Data";
let folderId = null;
const fileIdCache = {};

async function driveFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res;
}

async function ensureFolder() {
  if (folderId) return folderId;
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveFetch(`/files?q=${q}&fields=files(id,name)`);
  const json = await res.json();
  if (json.files?.length) {
    folderId = json.files[0].id;
    return folderId;
  }
  const created = await driveFetch(`/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  }).then((r) => r.json());
  folderId = created.id;
  return folderId;
}

function buildMultipart(name, parent, content) {
  const boundary = "patchwilderboundary";
  const metadata = JSON.stringify({ name, parents: [parent] });
  return (
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
    `--${boundary}--`
  );
}

async function ensureFile(name) {
  if (fileIdCache[name]) return fileIdCache[name];
  const folder = await ensureFolder();
  const q = encodeURIComponent(`name='${name}' and '${folder}' in parents and trashed=false`);
  const res = await driveFetch(`/files?q=${q}&fields=files(id,name)`);
  const json = await res.json();
  if (json.files?.length) {
    fileIdCache[name] = json.files[0].id;
    return fileIdCache[name];
  }
  const token = await getAccessToken();
  const created = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/related; boundary=patchwilderboundary",
      },
      body: buildMultipart(name, folder, "[]"),
    }
  ).then((r) => r.json());
  fileIdCache[name] = created.id;
  return created.id;
}

// Reads a whole collection (e.g. "map-points") as an array.
export async function loadCollection(name) {
  const fileId = await ensureFile(`${name}.json`);
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const text = await res.text();
  try {
    return JSON.parse(text || "[]");
  } catch {
    return [];
  }
}

// Overwrites a whole collection with the given array.
export async function saveCollection(name, data) {
  const fileId = await ensureFile(`${name}.json`);
  const token = await getAccessToken();
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function newId() {
  return crypto.randomUUID();
}
