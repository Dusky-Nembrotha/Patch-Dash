import { loadCollection, saveCollection, newId } from "./driveStore.js";

let fundingItems = [];

export async function initFunding() {
  fundingItems = await loadCollection("funding");
  render();

  document.getElementById("funding-add-btn").addEventListener("click", async () => {
    const title = document.getElementById("funding-title-input").value.trim();
    const funder = document.getElementById("funding-funder-input").value.trim();
    const amount = document.getElementById("funding-amount-input").value.trim();
    const status = document.getElementById("funding-status-input").value;
    const deadline = document.getElementById("funding-deadline-input").value;
    if (!title) return;

    fundingItems.push({
      id: newId(),
      title,
      funder,
      amount: amount ? Number(amount) : null,
      status,
      deadline: deadline || null,
      created_at: new Date().toISOString(),
    });
    await saveCollection("funding", fundingItems);

    ["funding-title-input", "funding-funder-input", "funding-amount-input"].forEach(
      (id) => (document.getElementById(id).value = "")
    );
    document.getElementById("funding-deadline-input").value = "";
    render();
  });
}

function render() {
  const body = document.getElementById("funding-list");
  const sorted = [...fundingItems].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  if (!sorted.length) {
    body.innerHTML = `<div class="empty-state">No funding initiatives tracked yet.</div>`;
    return;
  }

  body.innerHTML = sorted.map(cardHtml).join("");

  sorted.forEach((f) => {
    document.getElementById(`funding-del-${f.id}`).addEventListener("click", async () => {
      fundingItems = fundingItems.filter((i) => i.id !== f.id);
      await saveCollection("funding", fundingItems);
      render();
    });
  });
}

function cardHtml(f) {
  const amountStr = f.amount ? `£${Number(f.amount).toLocaleString()}` : "";
  const deadlineStr = f.deadline ? new Date(f.deadline).toLocaleDateString() : "No deadline";
  return `
    <div class="funding-card">
      <div class="funding-title">${escapeHtml(f.title)}</div>
      <div class="funding-meta">${escapeHtml(f.funder || "")} ${amountStr ? "· " + amountStr : ""} · ${deadlineStr}
        <button class="del" id="funding-del-${f.id}" style="float:right;">&times;</button>
      </div>
      <span class="funding-status ${f.status}">${f.status}</span>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
