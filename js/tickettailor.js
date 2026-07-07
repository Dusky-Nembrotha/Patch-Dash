import { CONFIG } from "./config.js";
import { getAccessToken } from "./googleAuth.js";

// Events, keyed by id, so the click handler can look one up by data-event-id.
const eventsById = {};

export async function initTicketTailor() {
  const body = document.getElementById("tt-body");
  body.innerHTML = `<div class="loading-state">Loading events…</div>`;

  try {
    const token = await getAccessToken();
    const res = await fetch(
      `${CONFIG.appsScriptUrl}?action=tickettailor&token=${encodeURIComponent(token)}`
    );
    const json = await res.json();

    if (json.error) throw new Error(json.error);

    if (!json.length) {
      body.innerHTML = `<div class="empty-state">No upcoming events on Ticket Tailor.</div>`;
      return;
    }

    for (const key in eventsById) delete eventsById[key];
    json.forEach((ev) => {
      if (ev.id) eventsById[ev.id] = ev;
    });

    body.innerHTML = json.map(rowHtml).join("");
    wireRows(body);
  } catch (err) {
    body.innerHTML = errorHtml(
      "Couldn't load Ticket Tailor events.",
      "Check the Apps Script deployment and TICKET_TAILOR_API_KEY script property. See SETUP.md.\n" + err.message
    );
  }
}

function rowHtml(ev) {
  const date = ev.start?.date
    ? new Date(ev.start.date + (ev.start.time ? `T${ev.start.time}` : "")).toLocaleDateString(undefined, {
        month: "short", day: "numeric",
      })
    : "";
  // Only offer the expandable attendee list when we have an event id to query.
  const expandable = !!ev.id;
  return `
    <div class="tt-event">
      <div class="item-row${expandable ? " tt-event-head" : ""}"${
        expandable ? ` role="button" tabindex="0" aria-expanded="false" data-event-id="${escapeAttr(ev.id)}"` : ""
      }>
        <span class="${expandable ? "tt-caret" : "dot-spacer"}">${expandable ? "▸" : ""}</span>
        <div class="item-main">
          <div class="item-title">${escapeHtml(ev.name)}</div>
          <div class="item-sub">${ev.tickets_sold ?? 0} sold${ev.venue ? " · " + escapeHtml(ev.venue) : ""}</div>
        </div>
        <div class="item-time">${date}</div>
      </div>
      ${expandable ? `<div class="tt-attendees" data-for="${escapeAttr(ev.id)}" hidden></div>` : ""}
    </div>
  `;
}

function wireRows(root) {
  root.querySelectorAll(".tt-event-head").forEach((head) => {
    const toggle = () => toggleAttendees(head);
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });
}

async function toggleAttendees(head) {
  const eventId = head.dataset.eventId;
  const panel = head.parentElement.querySelector(`.tt-attendees[data-for="${CSS.escape(eventId)}"]`);
  if (!panel) return;

  const isOpen = head.getAttribute("aria-expanded") === "true";
  if (isOpen) {
    head.setAttribute("aria-expanded", "false");
    head.classList.remove("open");
    panel.hidden = true;
    return;
  }

  head.setAttribute("aria-expanded", "true");
  head.classList.add("open");
  panel.hidden = false;

  // Fetch once, then keep the rendered list cached on the element.
  if (panel.dataset.loaded === "true") return;
  panel.innerHTML = `<div class="loading-state">Loading attendees…</div>`;

  try {
    const token = await getAccessToken();
    const res = await fetch(
      `${CONFIG.appsScriptUrl}?action=attendees&event_id=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}`
    );
    const json = await res.json();

    if (json.error) throw new Error(json.error);

    if (!Array.isArray(json) || !json.length) {
      panel.innerHTML = `<div class="empty-state">No attendees yet.</div>`;
    } else {
      panel.innerHTML = attendeesHtml(json);
    }
    panel.dataset.loaded = "true";
  } catch (err) {
    panel.innerHTML = errorHtml("Couldn't load attendees.", err.message);
    // Leave unloaded so a re-open retries.
  }
}

function attendeesHtml(attendees) {
  const rows = attendees
    .map((a) => {
      const meta = [a.ticket_type, a.checked_in ? "checked in" : null]
        .filter(Boolean)
        .join(" · ");
      return `
        <div class="tt-attendee">
          <span class="tt-attendee-name">${escapeHtml(a.name)}</span>
          ${meta ? `<span class="tt-attendee-meta">${escapeHtml(meta)}</span>` : ""}
        </div>
      `;
    })
    .join("");
  const count = attendees.length;
  return `<div class="tt-attendee-count">${count} attendee${count === 1 ? "" : "s"}</div>${rows}`;
}

function errorHtml(headline, detail) {
  return `<div class="error-state">${headline}<span class="fix">${escapeHtml(detail)}</span></div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/"/g, "&quot;");
}
