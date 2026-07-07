// ============================================================
// A Patch Wilder — known users
// Maps a Google sign-in email to a short display name, used when
// attributing comments and other actions across the dashboard.
// ============================================================

const USERS = {
  "owner@example.com": "Charlie",
  "user2@example.com": "Spade",
};

export function displayName(email) {
  if (!email) return "Unknown";
  return USERS[email.toLowerCase()] || email;
}
