// ============================================================
// A Patch Wilder — comments
// Reusable comment store. Comments for a given "scope" (e.g. "mail",
// "ideas") live in a Drive JSON file, each tagged with who wrote it and
// when. `refId` identifies the specific item a comment is attached to
// (an email id, an idea id, etc.).
// ============================================================

import { loadCollection, saveCollection, newId } from "./driveStore.js";
import { getCurrentEmail } from "./googleAuth.js";
import { displayName, userColor } from "./users.js";

function collectionFor(scope) {
  return `comments-${scope}`;
}

export async function loadComments(scope) {
  return loadCollection(collectionFor(scope));
}

export async function addComment(scope, refId, text) {
  const list = await loadCollection(collectionFor(scope));
  const email = getCurrentEmail();
  const comment = {
    id: newId(),
    refId,
    text,
    author: displayName(email),
    authorEmail: email,
    created_at: new Date().toISOString(),
  };
  list.push(comment);
  await saveCollection(collectionFor(scope), list);
  return comment;
}

// e.g. "Charlie · 7 Jul, 14:30"
export function formatAuthor(comment) {
  const when = new Date(comment.created_at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${comment.author} · ${when}`;
}

// ---------- Reusable comment UI (any panel) ----------

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escAttr(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Renders existing comments for `refId` plus an expandable add-note control.
// Pair with wireCommentActions() on a containing element.
export function commentsBlockHtml(scope, refId, allComments) {
  const existing = allComments
    .filter((c) => c.refId === refId)
    .map((c) => {
      const col = userColor(c.authorEmail || c.author);
      return `<div class="cmt" style="border-left-color:${col}">
          <button class="cmt-del" data-id="${escAttr(c.id)}" title="Delete note">&times;</button>
          <span class="cmt-text">${esc(c.text)}</span>
          <span class="cmt-meta" style="color:${col}">${esc(formatAuthor(c))}</span>
        </div>`;
    })
    .join("");
  return `<div class="notes" data-scope="${escAttr(scope)}" data-ref="${escAttr(refId)}">
      ${existing}
      <button class="cmt-toggle" type="button">&#43; note</button>
      <div class="cmt-add">
        <input class="cmt-input" type="text" placeholder="Add a note…" />
        <button class="cmt-save" type="button">Save</button>
      </div>
    </div>`;
}

// Removes a comment (any user can delete any note).
export async function removeComment(scope, id) {
  const list = await loadCollection(collectionFor(scope));
  await saveCollection(collectionFor(scope), list.filter((c) => c.id !== id));
}

// Delegated handler for a container holding .notes blocks.
//  - onAdded(comment) after a note is added
//  - onRemoved(id) after a note is deleted
// Both update local state optimistically so the UI reflects the change
// immediately (saves are fire-and-forget through the proxy).
export function wireCommentActions(container, onAdded, onRemoved) {
  container.addEventListener("click", async (e) => {
    const del = e.target.closest(".cmt-del");
    if (del) {
      e.preventDefault();
      const notes = del.closest(".notes");
      const id = del.dataset.id;
      if (onRemoved) onRemoved(id);
      try {
        await removeComment(notes.dataset.scope, id);
      } catch (err) {
        console.error("Failed to delete comment:", err);
      }
      return;
    }
    const toggle = e.target.closest(".cmt-toggle");
    if (toggle) {
      const notes = toggle.closest(".notes");
      notes.classList.add("commenting");
      notes.querySelector(".cmt-input").focus();
      return;
    }
    const save = e.target.closest(".cmt-save");
    if (save) await submitFrom(save.closest(".notes"), onAdded);
  });
  container.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && e.target.matches(".cmt-input")) {
      e.preventDefault();
      await submitFrom(e.target.closest(".notes"), onAdded);
    }
  });
}

async function submitFrom(notes, onAdded) {
  const input = notes.querySelector(".cmt-input");
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    const comment = await addComment(notes.dataset.scope, notes.dataset.ref, text);
    if (onAdded) onAdded(comment);
  } catch (err) {
    input.disabled = false;
    console.error("Failed to save comment:", err);
  }
}
