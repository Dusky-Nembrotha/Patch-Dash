import { loadCollection, saveCollection, newId } from "./driveStore.js";

let items = [];

export async function initTodo() {
  items = await loadCollection("todos");
  render();

  document.getElementById("todo-add-section").addEventListener("click", async () => {
    const name = prompt("New section name (e.g. Fencing, Grants, Volunteers):");
    if (!name) return;
    items.push({
      id: newId(),
      section: name.trim(),
      text: "",
      done: false,
      is_placeholder: true,
      created_at: new Date().toISOString(),
    });
    await persist();
    render();
  });
}

function persist() {
  return saveCollection("todos", items);
}

function render() {
  const body = document.getElementById("todo-body");

  if (!items.length) {
    body.innerHTML = `<div class="empty-state">No sections yet. Add one to get started.</div>`;
    return;
  }

  const sections = {};
  items.forEach((item) => {
    sections[item.section] = sections[item.section] || [];
    sections[item.section].push(item);
  });

  body.innerHTML = Object.entries(sections)
    .map(([section, sectionItems]) => sectionHtml(section, sectionItems))
    .join("");

  wireEvents();
}

function sectionHtml(section, sectionItems) {
  const real = sectionItems.filter((i) => !i.is_placeholder);
  return `
    <div class="todo-section" data-section="${escapeHtml(section)}">
      <h3>${escapeHtml(section)}</h3>
      ${real.map(itemHtml).join("")}
      <div class="field-row" style="margin-top:6px;">
        <input type="text" class="new-todo-text" placeholder="Add a task…" data-section="${escapeHtml(section)}" />
      </div>
    </div>
  `;
}

function itemHtml(item) {
  return `
    <div class="todo-item ${item.done ? "done" : ""}" data-id="${item.id}">
      <input type="checkbox" class="todo-check" data-id="${item.id}" ${item.done ? "checked" : ""} />
      <span class="todo-text">${escapeHtml(item.text)}</span>
      <button class="del todo-del" data-id="${item.id}">&times;</button>
    </div>
  `;
}

function wireEvents() {
  document.querySelectorAll(".todo-check").forEach((box) => {
    box.addEventListener("change", async (e) => {
      const item = items.find((i) => i.id === e.target.dataset.id);
      if (item) item.done = e.target.checked;
      await persist();
      render();
    });
  });

  document.querySelectorAll(".todo-del").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      items = items.filter((i) => i.id !== e.target.dataset.id);
      await persist();
      render();
    });
  });

  document.querySelectorAll(".new-todo-text").forEach((input) => {
    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter" || !e.target.value.trim()) return;
      items.push({
        id: newId(),
        section: e.target.dataset.section,
        text: e.target.value.trim(),
        done: false,
        is_placeholder: false,
        created_at: new Date().toISOString(),
      });
      await persist();
      render();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
