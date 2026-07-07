// ============================================================
// A Patch Wilder — drag-to-reorder helper (HTML5 drag & drop)
// Makes items matching itemSelector inside `container` reorderable by
// dragging a handle. onReorder() runs after a drop — read the new DOM
// order there and persist it. (Desktop pointer drag; not touch.)
// ============================================================

export function makeSortable(container, itemSelector, onReorder, opts = {}) {
  let dragEl = null;

  container.querySelectorAll(itemSelector).forEach((el) => {
    if (opts.handleSelector) {
      el.draggable = false;
      const handle = el.querySelector(opts.handleSelector);
      if (handle) {
        handle.addEventListener("mousedown", () => (el.draggable = true));
      }
    } else {
      el.draggable = true;
    }
  });

  container.addEventListener("dragstart", (e) => {
    const item = e.target.closest(itemSelector);
    if (!item || !container.contains(item)) return;
    dragEl = item;
    item.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", item.dataset.id || "");
    } catch (_) {}
  });

  container.addEventListener("dragover", (e) => {
    if (!dragEl || !container.contains(dragEl)) return;
    e.preventDefault();
    const after = afterElement(container, itemSelector, dragEl, e.clientY);
    if (after) {
      container.insertBefore(dragEl, after);
    } else if (opts.footerSelector && container.querySelector(opts.footerSelector)) {
      container.insertBefore(dragEl, container.querySelector(opts.footerSelector));
    } else {
      container.appendChild(dragEl);
    }
  });

  container.addEventListener("dragend", () => {
    if (!dragEl) return;
    dragEl.classList.remove("dragging");
    if (opts.handleSelector) dragEl.draggable = false;
    dragEl = null;
    onReorder();
  });
}

function afterElement(container, itemSelector, dragEl, y) {
  const els = [...container.querySelectorAll(itemSelector)].filter((el) => el !== dragEl);
  let closest = { offset: -Infinity, element: null };
  for (const el of els) {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: el };
  }
  return closest.element;
}
