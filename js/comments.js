// ============================================================
// A Patch Wilder — comments
// Reusable comment store. Comments for a given "scope" (e.g. "mail",
// "ideas") live in a Drive JSON file, each tagged with who wrote it and
// when. `refId` identifies the specific item a comment is attached to
// (an email id, an idea id, etc.).
// ============================================================

import { loadCollection, saveCollection, newId } from "./driveStore.js";
import { getCurrentEmail } from "./googleAuth.js";
import { displayName } from "./users.js";

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
    .map(
      (c) =>
        `<div class="cmt"><span class="cmt-text">${esc(c.text)}</span><span class="cmt-meta">${esc(formatAuthor(c))}</span></div>`
    )
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

// Delegated handler for a container holding .notes blocks. onAdded(comment) is
// called after a comment saves, so the caller can update state and redraw.
export function wireCommentActions(container, onAdded) {
  container.addEventListener("click", async (e) => {
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
    onAdded(comment);
  } catch (err) {
    input.disabled = false;
    console.error("Failed to save comment:", err);
  }
}
