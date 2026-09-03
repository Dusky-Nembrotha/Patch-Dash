import { requireGoogleAuth, signOut } from "./googleAuth.js";
import { getFolderUrl } from "./driveStore.js";
import { initMasonry } from "./masonry.js";
import { initWindowDrag, applySavedLayout } from "./windows.js";
import { initMap } from "./map.js";
import { initTodo } from "./todo.js";
import { initIdeas } from "./ideas.js";
import { initFunding } from "./funding.js";
import { initZohoMail, initZohoCalendar } from "./zoho.js";
import { initTicketTailor } from "./tickettailor.js";
import { initSocial } from "./social.js";
import { initPatchMap } from "./patchmap.js";
import { initWeather } from "./weather.js";

document.getElementById("sign-out-btn").addEventListener("click", signOut);

initMasonry();
initWindowDrag();
initWeather();

requireGoogleAuth(async () => {
  // Restore the saved window arrangement first (shared between users).
  await applySavedLayout();

  // Each widget fails independently — one broken integration
  // should never take the rest of the dashboard down with it.
  const widgets = [
    initMap,
    initTodo,
    initIdeas,
    initFunding,
    initZohoMail,
    initZohoCalendar,
    initTicketTailor,
    initSocial,
    initPatchMap,
  ];

  for (const start of widgets) {
    try {
      await start();
    } catch (err) {
      console.error("Widget failed to initialize:", err);
    }
  }

  // Point the Drive-backed windows' source links at the actual data folder.
  try {
    const folderUrl = await getFolderUrl();
    document.querySelectorAll('.patch-source[data-source="drive"]').forEach((a) => {
      a.href = folderUrl;
    });
  } catch (err) {
    console.error("Could not resolve Drive folder link:", err);
  }
});
