// ============================================================
// A Patch Wilder — draw-on Patch Map
// A static map image with a canvas overlay you can draw and erase on.
// Strokes are stored as normalised vector paths in the shared store, so the
// drawing persists between sessions and is shared between users.
// ============================================================

import { loadCollection, saveCollection } from "./driveStore.js";

const COLLECTION = "patchmap-drawing";
const COLOURS = ["#e60000", "#1f7a1f", "#1f5fbf", "#111111", "#f5a623"];

let img, canvas, ctx;
let strokes = [];
let tool = "draw";
let colour = COLOURS[0];
let drawing = false;
let current = null;

export async function initPatchMap() {
  img = document.getElementById("pm-image");
  canvas = document.getElementById("pm-canvas");
  if (!img || !canvas) return;
  ctx = canvas.getContext("2d");

  const pal = document.querySelector(".pm-colours");
  if (pal) {
    pal.innerHTML = COLOURS.map(
      (c, i) => `<button class="pm-colour${i === 0 ? " active" : ""}" data-colour="${c}" style="--c:${c}" title="${c}"></button>`
    ).join("");
  }

  if (img.complete && img.naturalWidth) sizeCanvas();
  img.addEventListener("load", () => {
    sizeCanvas();
    redraw();
  });

  wireTools();
  wirePointer();

  try {
    strokes = await loadCollection(COLLECTION);
    if (!Array.isArray(strokes)) strokes = [];
  } catch (err) {
    strokes = [];
    console.error("Couldn't load patch map drawing:", err);
  }
  redraw();
}

function sizeCanvas() {
  canvas.width = img.naturalWidth || 1447;
  canvas.height = img.naturalHeight || 2048;
}

function wireTools() {
  document.querySelectorAll(".pm-tool").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });
  const pal = document.querySelector(".pm-colours");
  if (pal) {
    pal.addEventListener("click", (e) => {
      const b = e.target.closest(".pm-colour");
      if (!b) return;
      colour = b.dataset.colour;
      pal.querySelectorAll(".pm-colour").forEach((x) => x.classList.toggle("active", x === b));
      setTool("draw");
    });
  }
  const clear = document.getElementById("pm-clear");
  if (clear) {
    clear.addEventListener("click", async () => {
      if (!strokes.length) return;
      if (!confirm("Clear all drawings on the Patch Map?")) return;
      strokes = [];
      redraw();
      await save();
    });
  }
}

function setTool(t) {
  tool = t;
  document.querySelectorAll(".pm-tool").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
}

function wirePointer() {
  canvas.addEventListener("pointerdown", (e) => {
    drawing = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    current = { mode: tool, colour, points: [pos(e)] };
    drawStroke(current); // dot
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    current.points.push(pos(e));
    drawSegment(current);
  });
  const finish = async () => {
    if (!drawing) return;
    drawing = false;
    if (current && current.points.length) {
      strokes.push(current);
      await save();
    }
    current = null;
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}

function pos(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}

function applyStyle(s) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const base = canvas.width / 240;
  if (s.mode === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = base * 6;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = s.colour;
    ctx.lineWidth = base * 1.6;
  }
}

// Draw only the last segment of a stroke (live feedback).
function drawSegment(s) {
  const p = s.points;
  applyStyle(s);
  ctx.beginPath();
  if (p.length < 2) {
    ctx.arc(p[0][0] * canvas.width, p[0][1] * canvas.height, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = s.mode === "erase" ? "rgba(0,0,0,1)" : s.colour;
    ctx.fill();
  } else {
    const a = p[p.length - 2], b = p[p.length - 1];
    ctx.moveTo(a[0] * canvas.width, a[1] * canvas.height);
    ctx.lineTo(b[0] * canvas.width, b[1] * canvas.height);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

// Draw a whole stroke (used when replaying).
function drawStroke(s) {
  const p = s.points;
  if (!p || !p.length) return;
  applyStyle(s);
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0][0] * canvas.width, p[0][1] * canvas.height, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = s.mode === "erase" ? "rgba(0,0,0,1)" : s.colour;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(p[0][0] * canvas.width, p[0][1] * canvas.height);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] * canvas.width, p[i][1] * canvas.height);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

function redraw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach(drawStroke);
}

async function save() {
  try {
    await saveCollection(COLLECTION, strokes);
  } catch (err) {
    console.error("Couldn't save patch map drawing:", err);
  }
}
