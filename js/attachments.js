// ============================================================
// A Patch Wilder — attachments (photos & files)
// Uploads files through the proxy into the shared Drive and records them
// per item (scope + refId) so both users see the same attachments.
// ============================================================

import { getAccessToken, getCurrentEmail } from "./googleAuth.js";
import { CONFIG } from "./config.js";
import { loadCollection, saveCollection, newId } from "./driveStore.js";
import { displayName } from "./users.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function collectionFor(scope) {
  return `files-${scope}`;
}

export async function loadAttachments(scope) {
  return loadCollection(collectionFor(scope));
}

export async function uploadAttachment(scope, refId, file) {
  if (file.size > MAX_BYTES) throw new Error("File too large (max 8 MB)");
  const base64 = await fileToBase64(file);
  const token = await getAccessToken();
  const qs = new URLSearchParams({
    action: "upload",
    filename: file.name,
    mime: file.type || "application/octet-stream",
    token,
  });
  const res = await fetch(`${CONFIG.appsScriptUrl}?${qs.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: base64,
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);

  const list = await loadCollection(collectionFor(scope));
  const rec = {
    id: newId(),
    refId,
    fileId: json.id,
    name: json.name,
    mime: json.mime || file.type || "",
    created_at: new Date().toISOString(),
    author: displayName(getCurrentEmail()),
  };
  list.push(rec);
  await saveCollection(collectionFor(scope), list);
  return rec;
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
    input.disabled = true;
    try {
      await uploadAttachment(scope, block.dataset.ref, input.files[0]);
      await onChange();
    } catch (err) {
      alert("Upload failed: " + err.message);
      input.disabled = false;
    }
  });
  container.addEventListener("click", async (e) => {
    const del = e.target.closest(".attach-del");
    if (!del) return;
    e.preventDefault();
    try {
      await removeAttachment(scope, del.dataset.id);
      await onChange();
    } catch (err) {
      console.error("Couldn't remove attachment:", err);
    }
  });
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
