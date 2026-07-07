// ============================================================
// A Patch Wilder — known users
// Maps a Google sign-in email to a short display name and a colour, used
// when attributing/colouring comments and assignments across the dashboard.
// ============================================================

const USERS = [
  { name: "Charlie", email: "owner@example.com", color: "#2f6f7c" },
  { name: "Spade", email: "user2@example.com", color: "#b2497a" },
];

const byEmail = {};
const byName = {};
for (const u of USERS) {
  byEmail[u.email] = u;
  byName[u.name] = u;
}

export function displayName(email) {
  if (!email) return "Unknown";
  return byEmail[email.toLowerCase()]?.name || email;
}

// Colour for a user, looked up by name or email. Falls back to muted grey.
export function userColor(nameOrEmail) {
  if (!nameOrEmail) return "var(--muted)";
  return (
    byName[nameOrEmail]?.color ||
    byEmail[nameOrEmail.toLowerCase()]?.color ||
    "var(--muted)"
  );
}

// The people an item can be assigned to (for assignment / filter controls).
export function assignableUsers() {
  return USERS.map((u) => ({ name: u.name, color: u.color }));
}
