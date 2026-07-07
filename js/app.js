import { requireGoogleAuth, signOut } from "./googleAuth.js";
import { getFolderUrl } from "./driveStore.js";
import { initMasonry } from "./masonry.js";
import { initMap } from "./map.js";
import { initTodo } from "./todo.js";
import { initIdeas } from "./ideas.js";
import { initFunding } from "./funding.js";
import { initOutlookMail, initOutlookCalendar } from "./outlook.js";
import { initTicketTailor } from "./tickettailor.js";
import { initSocial } from "./social.js";

document.getElementById("sign-out-btn").addEventListener("click", signOut);

initMasonry();

requireGoogleAuth(async () => {
  // Each widget fails independently — one broken integration
  // should never take the rest of the dashboard down with it.
  const widgets = [
    initMap,
    initTodo,
    initIdeas,
    initFunding,
    initOutlookMail,
    initOutlookCalendar,
    initTicketTailor,
    initSocial,
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
