import { loadCollection, saveCollection, newId } from "./driveStore.js";

let ideas = [];

export async function initIdeas() {
  ideas = await loadCollection("ideas");
  render();

  document.getElementById("idea-add-btn").addEventListener("click", async () => {
    const title = document.getElementById("idea-title-input").value.trim();
    const notes = document.getElementById("idea-notes-input").value.trim();
    if (!title) return;

    ideas.unshift({ id: newId(), title, notes, created_at: new Date().toISOString() });
    await saveCollection("ideas", ideas);

    document.getElementById("idea-title-input").value = "";
    document.getElementById("idea-notes-input").value = "";
    render();
  });
}

function render() {
  const body = document.getElementById("ideas-list");

  if (!ideas.length) {
    body.innerHTML = `<div class="empty-state">No ideas logged yet.</div>`;
    return;
  }

  body.innerHTML = ideas.map(cardHtml).join("");

  ideas.forEach((idea) => {
    document.getElementById(`idea-del-${idea.id}`).addEventListener("click", async () => {
      ideas = ideas.filter((i) => i.id !== idea.id);
      await saveCollection("ideas", ideas);
      render();
    });
  });
}

function cardHtml(idea) {
  const date = new Date(idea.created_at).toLocaleDateString();
  return `
    <div class="idea-card">
      <div class="idea-title">${escapeHtml(idea.title)}</div>
      ${idea.notes ? `<div class="item-sub" style="white-space:normal;">${escapeHtml(idea.notes)}</div>` : ""}
      <div class="idea-meta">${date}
        <button class="del" id="idea-del-${idea.id}" style="float:right;">&times;</button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
