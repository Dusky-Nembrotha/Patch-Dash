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
