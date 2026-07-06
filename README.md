# A Patch Wilder — Dashboard

A one-stop dashboard for the project: field map, inbox, calendar,
Ticket Tailor events, Facebook/Instagram messages, to-do list, ideas, and
funding tracker.

**Start here → [SETUP.md](./SETUP.md)** — six steps, ordered easiest to
hardest, with exact clicks for each.

## Structure

```
index.html                  the dashboard shell
styles.css                  design system (patch/stitch theme)
assets/topo.svg             background texture
js/config.js                <- fill this in with your keys/IDs (public-safe only)
js/app.js                   entry point
js/googleAuth.js            Google Sign-In + token management
js/driveStore.js            reads/writes your data as JSON files in Drive
js/map.js, todo.js,
   ideas.js, funding.js     widgets, all backed by Google Drive
js/outlook.js               Outlook mail + calendar (Microsoft sign-in)
js/tickettailor.js,
   social.js                call the Apps Script proxy below
apps-script/Code.gs          paste into script.google.com — holds your
                             Ticket Tailor/Meta keys server-side
```

Your data (map pins, to-dos, ideas, funding notes) lives as plain JSON
files in a folder called "A Patch Wilder Data" in your own Google Drive —
that's what keeps it synced across your devices. No secret keys ever sit
in the front-end code; Ticket Tailor and Meta credentials live only in
the Apps Script project's Script Properties.
