import { loadCollection, saveCollection, newId } from "./driveStore.js";
import { SITE_BOUNDARY } from "./boundary.js";

let map;
let points = [];
const markers = {};

export async function initMap() {
  map = L.map("map", { zoomControl: true });

  // Google satellite imagery. (Note: this is Google's tile endpoint, not the
  // official Maps API — fine for a private dashboard. Swap lyrs=s -> lyrs=y
  // for a hybrid view with road/place labels.)
  L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "Imagery &copy; Google",
    maxZoom: 21,
  }).addTo(map);

  // Site boundary (red line), drawn from the imported KMZ.
  const boundary = L.geoJSON(SITE_BOUNDARY, {
    style: {
      color: "#e60000",
      weight: 2,
      opacity: 1,
      fill: false,
    },
  }).addTo(map);

  // Default view: fit the boundary (the red line).
  map.fitBounds(boundary.getBounds(), { padding: [20, 20] });

  map.on("click", (e) => openNewPointPopup(e.latlng));

  points = await loadCollection("map-points");
  points.forEach(renderPoint);
}

function persist() {
  return saveCollection("map-points", points);
}

function renderPoint(point) {
  const marker = L.marker([point.lat, point.lng]).addTo(map);
  marker.bindPopup(popupHtml(point));
  marker.on("popupopen", () => wirePopup(marker, point));
  markers[point.id] = marker;
}

function popupHtml(point) {
  return `
    <div class="map-popup-form">
      <strong>${escapeHtml(point.label || "Untitled point")}</strong>
      <p style="margin:6px 0; font-size:12.5px;">${escapeHtml(point.comment || "")}</p>
      <button class="ghost delete-point" data-id="${point.id}">Remove</button>
    </div>
  `;
}

function wirePopup(marker, point) {
  const btn = document.querySelector(`.delete-point[data-id="${point.id}"]`);
  btn?.addEventListener("click", async () => {
    points = points.filter((p) => p.id !== point.id);
    await persist();
    map.removeLayer(marker);
    delete markers[point.id];
  });
}

function openNewPointPopup(latlng) {
  const popup = L.popup()
    .setLatLng(latlng)
    .setContent(`
      <div class="map-popup-form">
        <input type="text" id="new-point-label" placeholder="Label (e.g. Otter holt)" />
        <textarea id="new-point-comment" placeholder="Notes / comments"></textarea>
        <button id="save-new-point">Drop pin</button>
      </div>
    `)
    .openOn(map);

  setTimeout(() => {
    document.getElementById("save-new-point")?.addEventListener("click", async () => {
      const label = document.getElementById("new-point-label").value.trim();
      const comment = document.getElementById("new-point-comment").value.trim();

      const point = {
        id: newId(),
        lat: latlng.lat,
        lng: latlng.lng,
        label,
        comment,
        created_at: new Date().toISOString(),
      };
      points.push(point);
      await persist();
      map.closePopup(popup);
      renderPoint(point);
    });
  }, 0);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
