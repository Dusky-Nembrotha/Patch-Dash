// ============================================================
// A PATCH WILDER — Configuration
// Fill in the values below. Everything here is PUBLIC-SAFE:
// no secret keys ever go in this file or anywhere in the
// front-end code. See SETUP.md for where each value comes from.
// ============================================================

export const CONFIG = {
  // --- Google Cloud OAuth client (Google Cloud Console > Credentials) ---
  // Used for: signing in, and reading/writing your Drive data.
  google: {
    clientId: "906651489690-9k89038s9ialjh2rm6bodlp0h5bf22fk.apps.googleusercontent.com",
  },

  // --- Your deployed Google Apps Script Web App URL ---
  // This holds your Ticket Tailor / Meta / Zoho keys server-side and proxies
  // requests for them, so those secrets never reach the browser.
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwPFO8IGO7cfEHLNmuTCcUsflTusj8iB5LDGN0Y1PqF7o87TVqTi5oOVvM71RE6n0Spwg/exec",
};
