// ============================================================
// A Patch Wilder — assign / priority controls (reusable)
// Renders per-item "assign to Charlie/Spade" avatars + a priority toggle,
// and wires them to the shared metadata store. Used by the Inbox and the
// Messages panel.
// ============================================================

import { assignableUsers, userColor } from "./users.js";
import { setMeta } from "./meta.js";

function escAttr(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// The avatar + priority control row for one item.
export function assignControlsHtml(refId, meta) {
  meta = meta || {};
  const avatars = assignableUsers()
    .map(
      (u) =>
        `<button class="avatar${meta.assignee === u.name ? " active" : ""}" data-assign="${u.name}" data-id="${escAttr(refId)}" title="Assign to ${u.name}" style="--u:${u.color}">${u.name[0]}</button>`
    )
    .join("");
  return `<div class="mail-actions">
      <button class="prio${meta.priority ? " on" : ""}" data-prio data-id="${escAttr(refId)}" title="Toggle high priority">!</button>
      <span class="assign-avatars">${avatars}</span>
    </div>`;
}

// Item wrapper classes/style for the assignee colour + priority tint.
export function assignItemAttrs(meta) {
  meta = meta || {};
  const cls = `${meta.assignee ? " assigned" : ""}${meta.priority ? " priority" : ""}`;
  const style = meta.assignee ? ` style="--assignee:${userColor(meta.assignee)}"` : "";
  return { cls, style };
}

export function priorityTagHtml(meta) {
  return meta && meta.priority ? '<span class="prio-tag">High</span>' : "";
}

// Delegated handler for avatar/priority clicks inside `container`.
//   metaGetter(id) -> current meta record for that item
//   onChanged()    -> called after a save so the caller can redraw
export function wireAssign(container, scope, metaGetter, onChanged) {
  container.addEventListener("click", async (e) => {
    const avatar = e.target.closest(".avatar");
    if (avatar) {
      const current = metaGetter(avatar.dataset.id).assignee;
      const assignee = current === avatar.dataset.assign ? null : avatar.dataset.assign;
      await apply(scope, avatar.dataset.id, { assignee }, onChanged);
      return;
    }
    const prio = e.target.closest(".prio");
    if (prio) {
      await apply(scope, prio.dataset.id, { priority: !metaGetter(prio.dataset.id).priority }, onChanged);
    }
  });
}

async function apply(scope, id, patch, onChanged) {
  try {
    const rec = await setMeta(scope, id, patch);
    onChanged(id, rec);
  } catch (err) {
    console.error("Failed to update metadata:", err);
  }
}
