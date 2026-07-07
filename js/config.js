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
  // This holds your Ticket Tailor / Meta keys server-side and proxies
  // requests for them, so those secrets never reach the browser.
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwPFO8IGO7cfEHLNmuTCcUsflTusj8iB5LDGN0Y1PqF7o87TVqTi5oOVvM71RE6n0Spwg/exec",

  // --- Microsoft Entra ID (Azure AD) app registration for Outlook ---
  // App registration > Overview. Redirect URI must be your GitHub Pages
  // URL exactly, e.g. https://yourname.github.io/patch-wilder/
  microsoft: {
    clientId: "a434f2c0-4ae1-4cc6-9a8c-35806710ff5a",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin + window.location.pathname,
    scopes: ["Mail.Read", "Calendars.Read"],
  },
};
