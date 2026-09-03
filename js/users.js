// ============================================================
// A Patch Wilder — known users
// Maps a Google sign-in to a short display name and a colour, used when
// attributing/colouring comments and assignments across the dashboard.
//
// The repo is public, so addresses are stored as a SHA-256 of the lowercased
// email rather than in the clear — enough to stop the repo being harvested by
// address scrapers. It is not a secret: anyone who already knows an address
// can confirm it. To add someone, hash their address and paste the hex:
//   node -e "console.log(require('crypto').createHash('sha256').update('them@example.com').digest('hex'))"
// ============================================================

const USERS = [
  { name: "Charlie", hash: "d502f1c6109d8482ed4086d0cebfedf9812ce53a5eccec67172014cd7b570bd8", color: "#2f6f7c" },
  { name: "Spade", hash: "f4c40271adc34a74646960a151f3a20d7a6dc081a9c4777c38eabf2edb5d96b5", color: "#b2497a" },
];

const byName = {};
for (const u of USERS) byName[u.name] = u;

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Short display name for a signed-in address. Async because the lookup hashes
// first; every caller already runs inside an async save. Falls back to the
// address itself so an unrecognised user still attributes correctly.
export async function displayName(email) {
  if (!email) return "Unknown";
  const hash = await sha256Hex(email.toLowerCase());
  return USERS.find((u) => u.hash === hash)?.name || email;
}

// Colour for a user by display name. Comment and metadata records store the
// resolved name, so rendering never needs to touch an address.
export function userColor(name) {
  if (!name) return "var(--muted)";
  return byName[name]?.color || "var(--muted)";
}

// The people an item can be assigned to (for assignment / filter controls).
export function assignableUsers() {
  return USERS.map((u) => ({ name: u.name, color: u.color }));
}
