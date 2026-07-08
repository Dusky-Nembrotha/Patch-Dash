# A Patch Wilder — Setup Guide

Six steps, ordered from easiest to hardest. Do them in order — later steps
depend on earlier ones. Tick each off before moving on; there's a "test it"
check at the end of every step.

---

## Step 1 — Put the site on GitHub Pages (~5 min)

1. Go to [github.com/new](https://github.com/new). Name it something like
   `patch-wilder-dashboard`. Set it to **Public** (GitHub Pages on a free
   account requires the repo to be public — that's fine, none of your
   actual data lives in this repo, only code and public-safe IDs).
2. Upload every file from the zip you have, keeping the folder structure
   exactly as-is (`index.html` at the root, `js/` folder, `assets/`
   folder, etc.) — easiest way: on the repo page, click **Add file →
   Upload files**, drag the whole unzipped folder's contents in, and
   commit.
3. Go to the repo's **Settings** tab → **Pages** (left sidebar) → under
   **Build and deployment**, set Source to **Deploy from a branch**,
   Branch to `main`, folder `/ (root)` → **Save**.
4. Wait 1–2 minutes, then refresh that Pages settings page — it'll show
   your live URL, something like:
   `https://yourname.github.io/patch-wilder-dashboard/`

**Test it:** open that URL. You should see the dashboard shell with the
"Connect Google account" box in the middle, and panels behind it showing
loading spinners. That's expected — nothing is wired up yet. Keep this
exact URL handy; you'll paste it into two places later.

---

## Step 2 — Grab your Ticket Tailor API key (~2 min)

1. Log into Ticket Tailor → **Box office settings** (usually your account
   name, top right) → left menu **Manage → API**.
2. Click **Generate a new key**. Name it "Patch Wilder Dashboard". When
   asked which endpoints it can access, tick **Events** (read access is
   enough — you don't need it to create or edit anything).
3. Copy the key somewhere safe for a moment (a note app, not committed
   anywhere) — you'll paste it into Apps Script in Step 4.

**Test it:** nothing to test yet — you're just holding the key for now.

---

## Step 3 — Create a Google OAuth Client ID (~10 min)

This is what lets the dashboard sign you in and read/write a folder in
your Drive, entirely from the browser, no server secret needed.

1. Go to [console.cloud.google.com](https://console.cloud.google.com). If
   you've never used Cloud Console before, accept the terms when prompted.
2. Top left, click the project dropdown → **New Project**. Name it "Patch
   Wilder Dashboard" → **Create**. Wait for it to finish, then make sure
   it's selected in that same dropdown.
3. Left sidebar (or search bar at top) → **APIs & Services → Library**.
   Search **Google Drive API** → click it → **Enable**.
4. Left sidebar → **APIs & Services → OAuth consent screen**.
   - User Type: **External** → Create.
   - App name: "A Patch Wilder Dashboard". User support email: your email.
     Developer contact email: your email. Save and continue through the
     Scopes screen (no changes needed) and the Test users screen.
   - On the Test users screen, click **Add users** and add your own Google
     email — while the app is in "Testing" mode, only listed test users
     can sign in, which is exactly what you want for a private dashboard.
   - Save and continue to finish.
5. Left sidebar → **APIs & Services → Credentials** → **Create
   Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: "Patch Wilder Web".
   - Under **Authorized JavaScript origins**, click **Add URI** and enter
     your GitHub Pages origin *without* the trailing path, e.g.
     `https://yourname.github.io` (no `/patch-wilder-dashboard/` on the
     end).
   - Leave Authorized redirect URIs empty — this flow doesn't use them.
   - Click **Create**. Copy the **Client ID** shown (ends in
     `.apps.googleusercontent.com`).
6. In your repo, edit `js/config.js` → paste this into
   `google.clientId`. Commit the change.

**Test it:** reload your GitHub Pages URL, click **Connect Google
account**. You should get a real Google sign-in popup, a warning screen
saying "Google hasn't verified this app" (expected, since it's just for
you — click **Advanced → Go to Patch Wilder Dashboard (unsafe)**), then a
permissions screen asking for Drive and email access. Approve it. The map,
to-do, ideas, and funding panels should now load empty (with "no data yet"
messages) — and if you drop a pin on the map or add a to-do, then reload
the page, it should still be there. Check your actual Google Drive too —
you'll see a new folder called **"A Patch Wilder Data"** with JSON files
inside.

---

## Step 4 — Deploy the Apps Script proxy (~10 min)

This is a small piece of code that runs on Google's servers (not in your
browser) and holds your Ticket Tailor key safely.

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Rename the project (top left, "Untitled project") to "Patch Wilder
   Proxy".
3. Delete everything in the code editor and paste in the entire contents
   of `apps-script/Code.gs` from your files.
4. Left sidebar, click the **gear icon** (Project Settings) → scroll to
   **Script Properties** → **Add script property**, add two rows:
   - `OWNER_EMAIL` → the exact Google email address you'll sign in with
     on the dashboard
   - `TICKET_TAILOR_API_KEY` → the key you copied in Step 2
5. Back in the editor (the `< >` icon, top left), click **Deploy → New
   deployment**. Click the gear next to "Select type" → **Web app**.
   - Description: "v1"
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**. You'll be asked to authorize it — sign in with the
     same Google account, click through the "unverified app" warning the
     same way as Step 3, and allow it.
6. Copy the **Web app URL** it gives you (ends in `/exec`).
7. In your repo, edit `js/config.js` → paste that URL into
   `appsScriptUrl`. Commit.

**Test it:** reload the dashboard. The Ticket Tailor panel should now show
your real upcoming events (or "No upcoming events" if you don't have any
published right now). If it shows an error instead, double check the two
Script Properties in step 4 are spelled exactly right and that
`OWNER_EMAIL` matches the account you signed into the dashboard with.

> Whenever you update `Code.gs` later (e.g. turning on the Meta panel in
> Step 6), you need to **Deploy → Manage deployments → edit (pencil) →
> New version → Deploy** for the change to take effect — saving the file
> alone isn't enough.

---

## Step 5 — Outlook mail & calendar (~10 min)

This one's independent of Google — it's Microsoft's own sign-in, so it
works entirely from the browser too.

1. Go to [entra.microsoft.com](https://entra.microsoft.com) (sign in with
   the Microsoft/Outlook account whose mail and calendar you want to see).
2. Left sidebar → **Applications → App registrations → New registration**.
3. Name: "Patch Wilder Dashboard". Under **Supported account types**,
   choose "Accounts in any organizational directory and personal Microsoft
   accounts" (unless you specifically only ever use a work/school
   account, in which case pick the single-tenant option instead).
4. Under **Redirect URI**: platform dropdown → **Single-page application
   (SPA)** → paste your exact GitHub Pages URL including the trailing
   slash, e.g. `https://yourname.github.io/patch-wilder-dashboard/`.
5. Click **Register**. On the Overview page, copy the **Application
   (client) ID**.
6. Left sidebar → **API permissions → Add a permission → Microsoft Graph
   → Delegated permissions** → search and tick `Mail.Read` and
   `Calendars.Read` → **Add permissions**.
   - If you're using a personal Microsoft account, that's it.
   - If it's a work/school account and you see "Admin consent required",
     click **Grant admin consent** (if you're the admin) or ask whoever
     manages your org's Microsoft 365 to click it once.
7. In your repo, edit `js/config.js` → paste the client ID into
   `microsoft.clientId`. Commit.

**Test it:** reload the dashboard. The Inbox and Calendar panels should
show a "Connect Outlook" prompt — click it, sign into Microsoft in the
popup, approve the permissions, and you should see your real flagged/
unread mail and next 14 days of calendar events.

---

## Step 6 — Facebook & Instagram messages (no App Review needed)

You do **not** need Meta's App Review or Business Verification, because
you're only reading your **own** Page/Instagram messages. Keep the Meta app
in **Development ("Unpublished") mode** — in that mode, people with a role
on the app (you) can use messaging permissions on assets you own. App
Review is only for accessing *other people's* data in production.

The proxy turns each platform on automatically the moment its token(s) are
present in Script Properties — no code change or redeploy needed.

Note Meta uses TWO different Instagram APIs; we use the newer **Instagram
Login** one (separate token), not the Facebook-Page route, for IG.

### Facebook (Page messages) — permanent token

1. [developers.facebook.com](https://developers.facebook.com) → **Create App**
   → type **Business**. Leave it **Unpublished** (Development mode).
2. **Add use cases** → **"Manage everything on your Page"** and **"Engage
   with customers on Messenger from Meta"**. Open each → connect your
   **Facebook Page**.
3. **Tools → Graph API Explorer** → select your app → add permissions
   `pages_show_list`, `pages_messaging`, `pages_read_engagement` →
   **Generate Access Token** (a short-lived *user* token).
4. Make it a **permanent Page token** (Page tokens from a long-lived user
   token never expire). In the browser:
   - Long-lived user token (App ID/Secret from **App settings → Basic**):
     `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=USER_TOKEN`
   - Then `https://graph.facebook.com/v19.0/me/accounts?fields=name,access_token&access_token=LONG_LIVED_USER_TOKEN`
     → the Page's `access_token` is your permanent token.
5. Script Properties (Apps Script → ⚙ Project Settings):
   `META_PAGE_ACCESS_TOKEN` = that Page token; `META_PAGE_ID` = the Page id
   (ours: `114162336893482`).

### Instagram (DMs) — Instagram-Login token

1. Your IG must be a **Professional** account **linked to the Page**.
2. **Add use cases** → **"Manage messaging & content on Instagram"** →
   Customize → **API setup with Instagram login**. Permissions:
   `instagram_business_basic`, `instagram_business_manage_messages`.
3. In **App roles → Roles → Instagram testers**, add the IG account, then
   **accept the invite** from the Instagram app (Settings → Apps and
   websites → Tester invites).
4. On that setup screen, **"Generate access tokens" → Add account** → it
   produces a **long-lived (~60-day) Instagram token** directly (do NOT run
   the `ig_exchange_token` step — it only works on short-lived tokens).
5. Script Properties: `IG_ACCESS_TOKEN` = that token; `IG_USER_ID` = the IG
   user id (ours: `17841431154779628`, from
   `https://graph.instagram.com/v21.0/me?fields=user_id&access_token=…`).
6. **Keep it alive:** Apps Script editor → ⏰ **Triggers** → add a
   **time-driven, weekly** trigger for **`refreshInstagramToken`** (extends
   the 60-day token automatically).

**Test it:** hard-refresh the dashboard — the Messages window fills with
Facebook conversations, and Instagram DMs appear once someone messages the
account (send a test DM to confirm).

---

## Notes on how this all fits together

- **Your data** (map pins, to-dos, ideas, funding notes) lives as JSON
  files in a folder called "A Patch Wilder Data" in your own Google
  Drive — visible to you like any other file, and it's what makes it
  sync across your phone and laptop automatically (it's just your Drive).
- **Nothing in the public GitHub repo is a secret** — the Google Client
  ID, Microsoft Client ID, and Apps Script URL are all meant to be public;
  they only work in combination with you actually signing in.
- **The real secrets** (Ticket Tailor key, Meta token) live only in Apps
  Script's Script Properties, which nobody can see from the outside.
