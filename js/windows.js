// ============================================================
// A Patch Wilder — window rearranging
// Drag a window by its tab to reorder the dashboard. The order (a list of
// data-panel ids) persists to the shared store, so both users share a layout.
// Works with the masonry grid: reordering the DOM re-flows the grid, and each
// panel keeps its own row-span.
// ============================================================

import { loadCollection, saveCollection } from "./driveStore.js";

const COLLECTION = "layout";

function panels(grid) {
  return [...grid.querySelectorAll(":scope > .patch")];
}

export function initWindowDrag() {
  const grid = document.querySelector(".dashboard");
  if (!grid) return;
  let dragEl = null;

  panels(grid).forEach((p) => {
    const tab = p.querySelector(".patch-tab");
    if (!tab) return;
    tab.classList.add("drag-tab");
    tab.addEventListener("mousedown", () => (p.draggable = true));
  });

  grid.addEventListener("dragstart", (e) => {
    const p = e.target.closest(".patch");
    if (!p || !grid.contains(p)) return;
    dragEl = p;
    p.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", p.dataset.panel || "");
    } catch (_) {}
  });

  grid.addEventListener("dragover", (e) => {
    if (!dragEl) return;
    e.preventDefault();
    const target = nearest(grid, dragEl, e.clientX, e.clientY);
    if (!target) return;
    // Insert before the nearest panel when the pointer is above it, or in its
    // left half on the same row; otherwise after it.
    const before =
      e.clientY < target.cy - target.r.height / 2 ||
      (Math.abs(e.clientY - target.cy) <= target.r.height / 2 && e.clientX < target.cx);
    if (before) grid.insertBefore(dragEl, target.p);
    else grid.insertBefore(dragEl, target.p.nextSibling);
  });

  grid.addEventListener("dragend", async () => {
    if (!dragEl) return;
    dragEl.classList.remove("dragging");
    dragEl.draggable = false;
    dragEl = null;
    const order = panels(grid).map((p) => p.dataset.panel).filter(Boolean);
    try {
      await saveCollection(COLLECTION, order);
    } catch (err) {
      console.error("Couldn't save window layout:", err);
    }
  });

  // A tab click without a drag shouldn't leave the panel draggable.
  document.addEventListener("mouseup", () => {
    if (!dragEl) panels(grid).forEach((p) => (p.draggable = false));
  });
}

function nearest(grid, dragEl, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const p of panels(grid)) {
    if (p === dragEl) continue;
    const r = p.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { p, cx, cy, r };
    }
  }
  return best;
}

// Applies the saved window order (called after sign-in). Returns after the
// grid has been reordered; masonry re-flows on the resize event we fire.
export async function applySavedLayout() {
  const grid = document.querySelector(".dashboard");
  if (!grid) return;
  let order;
  try {
    order = await loadCollection(COLLECTION);
  } catch (err) {
    return;
  }
  if (!Array.isArray(order) || !order.length) return;

  const byId = {};
  panels(grid).forEach((p) => {
    if (p.dataset.panel) byId[p.dataset.panel] = p;
  });
  order.forEach((id) => {
    if (byId[id]) grid.appendChild(byId[id]);
  });
  window.dispatchEvent(new Event("resize"));
}
