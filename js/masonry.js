// ============================================================
// A Patch Wilder — masonry layout
// Sizes each dashboard window to its own content height (via CSS grid
// row-spanning) and packs them densely, so a tall panel (e.g. an Inbox
// full of unread mail) sits alongside shorter panels instead of forcing
// a tall, half-empty row. Progressive enhancement: if ResizeObserver is
// unavailable the plain grid layout is left untouched.
// ============================================================

let grid;
let scheduled = false;

function metrics() {
  const s = getComputedStyle(grid);
  return {
    row: parseFloat(s.gridAutoRows) || 8,
    gap: parseFloat(s.rowGap) || 20,
  };
}

function layout() {
  scheduled = false;
  if (!grid) return;
  const { row, gap } = metrics();
  grid.querySelectorAll(":scope > .patch").forEach((item) => {
    // align-items:start means the item's box is its content height regardless
    // of the grid area, so this measures true content height.
    const h = item.getBoundingClientRect().height;
    const span = Math.max(1, Math.ceil((h + gap) / (row + gap)));
    item.style.gridRowEnd = "span " + span;
  });
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  // Microtask rather than rAF: fires reliably even when the tab isn't being
  // painted, and getBoundingClientRect forces the sync layout we need anyway.
  Promise.resolve().then(layout);
}

export function initMasonry() {
  grid = document.querySelector(".dashboard");
  if (!grid || !("ResizeObserver" in window)) return;

  grid.classList.add("masonry");

  const ro = new ResizeObserver(schedule);
  grid.querySelectorAll(":scope > .patch").forEach((item) => ro.observe(item));

  window.addEventListener("resize", schedule);
  window.addEventListener("load", schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  // Initial pass plus a settle pass once async panel content has landed.
  schedule();
  setTimeout(schedule, 400);
}
