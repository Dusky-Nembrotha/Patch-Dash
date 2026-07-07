// ============================================================
// A Patch Wilder — attachments (photos & files)
// Uploads files through the proxy into the shared Drive and records them
// per item (scope + refId) so both users see the same attachments.
// ============================================================

import { getAccessToken, getCurrentEmail } from "./googleAuth.js";
import { CONFIG } from "./config.js";
import { loadCollection, saveCollection } from "./driveStore.js";
import { displayName } from "./users.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function collectionFor(scope) {
  return `files-${scope}`;
}

export async function loadAttachments(scope) {
  return loadCollection(collectionFor(scope));
}

// Uploads a file. Because the POST is no-cors (unreadable response), the
// proxy records the attachment itself; we fire the upload and let the caller
// reload the collection to see it.
export async function uploadAttachment(scope, refId, file) {
  if (file.size > MAX_BYTES) throw new Error("File too large (max 8 MB)");
  const base64 = await fileToBase64(file);
  const token = await getAccessToken();
  const qs = new URLSearchParams({
    action: "upload",
    scope,
    refId,
    filename: file.name,
    mime: file.type || "application/octet-stream",
    author: displayName(getCurrentEmail()),
    token,
  });
  await fetch(`${CONFIG.appsScriptUrl}?${qs.toString()}`, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: base64,
  });
}

export async function removeAttachment(scope, id) {
  const list = await loadCollection(collectionFor(scope));
  await saveCollection(collectionFor(scope), list.filter((a) => a.id !== id));
}

// Renders the attachments for an item plus an "add" control.
export function attachmentsHtml(scope, refId, all) {
  const mine = all.filter((a) => a.refId === refId);
  return `<div class="attachments" data-scope="${escAttr(scope)}" data-ref="${escAttr(refId)}">
      ${mine.map(thumbHtml).join("")}
      <label class="attach-add" title="Add photo or file">+<input type="file" class="attach-input" hidden /></label>
    </div>`;
}

function thumbHtml(a) {
  const isImg = (a.mime || "").startsWith("image/");
  const viewUrl = `https://drive.google.com/file/d/${a.fileId}/view`;
  const inner = isImg
    ? `<img src="https://drive.google.com/thumbnail?id=${a.fileId}&sz=w160" alt="${escAttr(a.name)}" />`
    : `<span class="attach-file">${escHtml(a.name)}</span>`;
  return `<span class="attachment" data-id="${a.id}">
      <a href="${viewUrl}" target="_blank" rel="noopener" title="${escAttr(a.name)}">${inner}</a>
      <button class="attach-del" data-id="${a.id}" title="Remove">×</button>
    </span>`;
}

// Delegated handlers for a container holding .attachments blocks. onChange()
// runs after an upload or delete so the caller can reload + re-render.
export function wireAttachments(container, scope, onChange) {
  container.addEventListener("change", async (e) => {
    const input = e.target.closest(".attach-input");
    if (!input || !input.files || !input.files[0]) return;
    const block = input.closest(".attachments");
    const refId = block.dataset.ref;
    const add = block.querySelector(".attach-add");
    if (add) add.classList.add("busy");
    const before = (await countFor(scope, refId));
    try {
      await uploadAttachment(scope, refId, input.files[0]);
    } catch (err) {
      alert("Upload failed: " + err.message);
      if (add) add.classList.remove("busy");
      return;
    }
    // The upload is fire-and-forget; poll until the proxy has recorded it.
    for (let i = 0; i < 10; i++) {
      await sleep(1200);
      if ((await countFor(scope, refId)) > before) break;
    }
    await onChange();
  });
  container.addEventListener("click", async (e) => {
    const del = e.target.closest(".attach-del");
    if (!del) return;
    e.preventDefault();
    try {
      await removeAttachment(scope, del.dataset.id);
      await sleep(1000);
      await onChange();
    } catch (err) {
      console.error("Couldn't remove attachment:", err);
    }
  });
}

async function countFor(scope, refId) {
  const list = await loadAttachments(scope);
  return list.filter((a) => a.refId === refId).length;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function escHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escAttr(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
