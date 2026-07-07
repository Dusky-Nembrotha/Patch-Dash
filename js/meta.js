// ============================================================
// A Patch Wilder — per-item metadata
// Stores small attributes (assignee, priority, …) for items in a panel,
// keyed by refId (e.g. an email id), in a Drive JSON file per scope.
// One record per item, upserted.
// ============================================================

import { loadCollection, saveCollection } from "./driveStore.js";
import { getCurrentEmail } from "./googleAuth.js";
import { displayName } from "./users.js";

function collectionFor(scope) {
  return `meta-${scope}`;
}

export async function loadMeta(scope) {
  return loadCollection(collectionFor(scope));
}

// Merges `patch` into the record for `refId` (creating it if needed) and
// records who changed it and when. Returns the updated record.
export async function setMeta(scope, refId, patch) {
  const list = await loadCollection(collectionFor(scope));
  let rec = list.find((r) => r.refId === refId);
  if (!rec) {
    rec = { refId };
    list.push(rec);
  }
  Object.assign(rec, patch, {
    updated_at: new Date().toISOString(),
    updated_by: displayName(getCurrentEmail()),
  });
  await saveCollection(collectionFor(scope), list);
  return rec;
}
