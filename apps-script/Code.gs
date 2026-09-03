// ============================================================
// A Patch Wilder — Apps Script proxy + shared data store
//
// Runs on Google's servers under the OWNER's account (Execute as: Me), so:
//  - it safely holds the Ticket Tailor / Meta keys, and
//  - it reads/writes the dashboard's data as JSON files in the OWNER's Drive
//    ("A Patch Wilder Data"), giving every allowed user ONE shared copy.
//
// Because data goes through here, the browser never needs Drive access —
// the front-end only signs the user in (email) to prove who they are.
//
// SETUP / Script Properties (gear icon > Project Settings):
//   OWNER_EMAIL           = the account this runs as
//   ALLOWED_EMAILS        = (optional) extra comma-separated emails allowed
//   TICKET_TAILOR_API_KEY = your Ticket Tailor API key
//   ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN = Zoho mail+calendar
// Deploy: Web app, Execute as Me, Who has access: Anyone. Re-authorize when
// prompted (it now needs Drive access). Whenever you change this file:
//   clasp push  &&  clasp redeploy <deployment-id>
// ============================================================

// Users allowed to read/write the shared store. The repo is public, so the
// list itself lives in the ALLOWED_EMAILS script property (comma-separated)
// alongside OWNER_EMAIL — set that BEFORE deploying this file or everyone
// except the owner loses access.
var DEFAULT_ALLOWED = [];

var DATA_FOLDER = "A Patch Wilder Data";

// Anything thrown out of a web app handler is served as an HTML error
// page, which the browser then fails to parse as JSON. Keep every reply
// JSON so a fault arrives as a readable message instead of a stray '<'.
function doGet(e) {
  try {
    return routeGet(e);
  } catch (err) {
    return jsonOutput({ error: "server error: " + String((err && err.message) || err) });
  }
}

function routeGet(e) {
  var props = PropertiesService.getScriptProperties();
  var problem = authProblem(e.parameter.token, props);
  if (problem) return jsonOutput({ error: problem });

  var action = e.parameter.action;

  if (action === "load") {
    var name = safeName(e.parameter.collection);
    if (!name) return jsonOutput({ error: "bad collection" });
    return jsonOutput(loadCollectionData(name));
  }
  if (action === "folderurl") {
    return jsonOutput({ url: getDataFolder().getUrl() });
  }
  if (action === "tickettailor") {
    return jsonOutput(getTicketTailorEvents(props.getProperty("TICKET_TAILOR_API_KEY")));
  }
  if (action === "attendees") {
    return jsonOutput(getAttendees(props.getProperty("TICKET_TAILOR_API_KEY"), e.parameter.event_id));
  }
  if (action === "zohomail") {
    return jsonOutput(safeZoho(function () { return getZohoMail(props); }));
  }
  if (action === "zohocalendar") {
    return jsonOutput(safeZoho(function () { return getZohoCalendar(props); }));
  }
  if (action === "meta") {
    return jsonOutput(getMetaMessages(props));
  }
  return jsonOutput({ error: "unknown action" });
}

// Saves are POSTed (the JSON body can be larger than a URL allows). Sent with
// Content-Type text/plain so the browser treats it as a simple request (no
// CORS preflight, which Apps Script can't answer).
// Anything thrown out of a web app handler is served as an HTML error
// page, which the browser then fails to parse as JSON. Keep every reply
// JSON so a fault arrives as a readable message instead of a stray '<'.
function doPost(e) {
  try {
    return routePost(e);
  } catch (err) {
    return jsonOutput({ error: "server error: " + String((err && err.message) || err) });
  }
}

function routePost(e) {
  var props = PropertiesService.getScriptProperties();
  var problem = authProblem(e.parameter.token, props);
  if (problem) return jsonOutput({ error: problem });
  if (e.parameter.action === "save") {
    var name = safeName(e.parameter.collection);
    if (!name) return jsonOutput({ error: "bad collection" });
    var contents = e.postData ? e.postData.contents : "[]";
    return jsonOutput(saveCollectionData(name, contents));
  }
  if (e.parameter.action === "upload") {
    var b64 = e.postData ? e.postData.contents : "";
    return jsonOutput(
      uploadFile(e.parameter.scope, e.parameter.refId, e.parameter.filename, e.parameter.mime, e.parameter.author, b64)
    );
  }
  return jsonOutput({ error: "unknown action" });
}

// Saves a base64-encoded file to an "attachments" subfolder (link-viewable so
// both users can see it) AND appends an attachment record to the item's
// files-<scope> collection — so the browser doesn't need to read the response
// (it can't, over no-cors); it just reloads the collection.
function uploadFile(scope, refId, filename, mime, author, base64) {
  if (!base64) return { error: "no data" };
  var col = safeName("files-" + scope);
  if (!col) return { error: "bad scope" };

  var root = getDataFolder();
  var it = root.getFoldersByName("attachments");
  var folder = it.hasNext() ? it.next() : root.createFolder("attachments");
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mime || "application/octet-stream", filename || "file");
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {}

  var list = loadCollectionData(col);
  list.push({
    id: Utilities.getUuid(),
    refId: refId || "",
    fileId: file.getId(),
    name: file.getName(),
    mime: mime || "",
    created_at: new Date().toISOString(),
    author: author || "",
  });
  saveCollectionData(col, JSON.stringify(list));
  return { ok: true };
}

// Confirms the caller is one of the allowed users, by checking the Google
// access token they sent resolves to an allowed, verified email.
// The addresses permitted to use the shared store, lowercased.
function allowedEmails(props) {
  var owner = (props.getProperty("OWNER_EMAIL") || "").toLowerCase();
  var extra = (props.getProperty("ALLOWED_EMAILS") || "")
    .split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
  return [owner].concat(extra, DEFAULT_ALLOWED).filter(Boolean);
}

// null when the caller may proceed, otherwise why not. An empty allowlist is
// called out separately so a fresh deploy with no ALLOWED_EMAILS set reads as
// a configuration problem rather than everyone mysteriously losing access.
function authProblem(token, props) {
  if (!allowedEmails(props).length) {
    return "no allowlist configured: set OWNER_EMAIL and ALLOWED_EMAILS in Script Properties";
  }
  return verifyCaller(token, props) ? null : "unauthorized";
}

// One page load makes a dozen or so proxy calls, and each was asking Google
// to identify the same token again. Cache the positive answer briefly: the
// token is the credential and Google issues them for about an hour, so a few
// minutes collapses a whole page load into one check. Failures are not cached,
// so fixing OWNER_EMAIL or ALLOWED_EMAILS takes effect immediately.
function verifyCaller(token, props) {
  if (!token) return false;

  var cache = CacheService.getScriptCache();
  var key = "auth_" + Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  );
  if (cache.get(key) === "1") return true;

  var allowed = allowedEmails(props);
  try {
    var res = UrlFetchApp.fetch(
      "https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=" + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    var info = JSON.parse(res.getContentText());
    var verified = info.email_verified === "true" || info.email_verified === true;
    var ok = verified && allowed.indexOf((info.email || "").toLowerCase()) !== -1;
    if (ok) cache.put(key, "1", 300);
    return ok;
  } catch (err) {
    return false;
  }
}

// ---------- Shared data store (owner's Drive) ----------

function safeName(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name || "") ? name : null;
}

function getDataFolder() {
  var it = DriveApp.getFoldersByName(DATA_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DATA_FOLDER);
}

function loadCollectionData(name) {
  var folder = getDataFolder();
  var it = folder.getFilesByName(name + ".json");
  if (!it.hasNext()) return [];
  try {
    return JSON.parse(it.next().getBlob().getDataAsString() || "[]");
  } catch (e) {
    return [];
  }
}

function saveCollectionData(name, contents) {
  var folder = getDataFolder();
  var it = folder.getFilesByName(name + ".json");
  if (it.hasNext()) {
    it.next().setContent(contents);
  } else {
    folder.createFile(name + ".json", contents, "application/json");
  }
  return { ok: true };
}

// ---------- Ticket Tailor ----------

function getTicketTailorEvents(apiKey) {
  if (!apiKey) return { error: "TICKET_TAILOR_API_KEY not set in Script Properties" };

  var basicAuth = Utilities.base64Encode(apiKey + ":");
  var res = UrlFetchApp.fetch(
    "https://api.tickettailor.com/v1/events?status=published&order_by=start_date&order=asc",
    { headers: { Authorization: "Basic " + basicAuth }, muteHttpExceptions: true }
  );

  if (res.getResponseCode() !== 200) {
    return { error: "Ticket Tailor error: " + res.getContentText() };
  }

  var json = JSON.parse(res.getContentText());
  var now = Date.now();

  return (json.data || [])
    .filter(function (ev) {
      var start = new Date((ev.start && (ev.start.iso || ev.start.date)) || 0).getTime();
      return start >= now;
    })
    .map(function (ev) {
      return {
        id: ev.id,
        name: ev.name,
        start: ev.start,
        venue: ev.venue ? ev.venue.name : null,
        tickets_sold: ev.total_issued_tickets || null,
      };
    });
}

// Returns attendee names/ticket types for a single event. Ticket Tailor's
// exact field names for issued_tickets aren't fully documented; adjust the
// mapping below against real data if names/types show blank.
function getAttendees(apiKey, eventId) {
  if (!apiKey) return { error: "TICKET_TAILOR_API_KEY not set in Script Properties" };
  if (!eventId) return { error: "Missing event_id" };

  var basicAuth = Utilities.base64Encode(apiKey + ":");
  var res = UrlFetchApp.fetch(
    "https://api.tickettailor.com/v1/issued_tickets?event_id=" + encodeURIComponent(eventId) + "&limit=100",
    { headers: { Authorization: "Basic " + basicAuth }, muteHttpExceptions: true }
  );

  if (res.getResponseCode() !== 200) {
    return { error: "Ticket Tailor error: " + res.getContentText() };
  }

  var json = JSON.parse(res.getContentText());

  return (json.data || [])
    .filter(function (t) { return t.status !== "voided" && t.status !== "void"; })
    .map(function (t) {
      return {
        name:
          t.holder_name ||
          [t.first_name, t.last_name].filter(Boolean).join(" ") ||
          t.buyer_name ||
          "Unnamed attendee",
        ticket_type: (t.ticket_type && t.ticket_type.name) || t.ticket_type_name || null,
        status: t.status || null,
        checked_in: !!t.checked_in_at,
      };
    });
}

// ---------- Meta (Facebook / Instagram) ----------

// Reads recent conversations. Facebook uses the Page token (Messenger
// Platform); Instagram uses a separate Instagram-Login token via
// graph.instagram.com. Each turns on automatically once its token is set:
//   Facebook  -> META_PAGE_ACCESS_TOKEN + META_PAGE_ID
//   Instagram -> IG_ACCESS_TOKEN (+ IG_USER_ID to label the other participant)
function getMetaMessages(props) {
  var pageToken = props.getProperty("META_PAGE_ACCESS_TOKEN");
  var pageId = props.getProperty("META_PAGE_ID");
  var igToken = props.getProperty("IG_ACCESS_TOKEN");

  if ((!pageToken || !pageId) && !igToken) {
    return { pending: true };
  }

  var messages = [];
  var errors = [];

  if (pageToken && pageId) {
    try {
      messages = messages.concat(getFacebookMessages(pageToken, pageId));
    } catch (err) {
      errors.push("Facebook: " + err);
    }
  }
  if (igToken) {
    try {
      messages = messages.concat(getInstagramMessages(igToken, props.getProperty("IG_USER_ID")));
    } catch (err) {
      errors.push("Instagram: " + err);
    }
  }

  if (!messages.length && errors.length) {
    return { error: errors.join(" | ") };
  }
  messages.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  return messages;
}

function getFacebookMessages(pageToken, pageId) {
  var url =
    "https://graph.facebook.com/v19.0/" + pageId +
    "/conversations?fields=id,participants,snippet,updated_time,unread_count&access_token=" + encodeURIComponent(pageToken);
  var json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  if (json.error) throw json.error.message || "Facebook API error";
  return (json.data || [])
    .filter(function (c) { return c.unread_count > 0; })
    .map(function (c) {
      var other = (c.participants && c.participants.data || []).find(function (p) { return p.id !== pageId; });
      return {
        id: c.id,
        platform: "facebook",
        from: other ? other.username || other.name : "Unknown",
        snippet: c.snippet,
        timestamp: c.updated_time,
        unread: c.unread_count,
      };
    });
}

function getInstagramMessages(igToken, selfId) {
  var url =
    "https://graph.instagram.com/v21.0/me/conversations?fields=id,participants,updated_time,unread_count,messages.limit(1){message,from}" +
    "&access_token=" + encodeURIComponent(igToken);
  var json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  if (json.error) throw json.error.message || "Instagram API error";
  return (json.data || [])
    .filter(function (c) { return c.unread_count > 0; })
    .map(function (c) {
      var parts = (c.participants && c.participants.data) || [];
      var other = parts.find(function (p) { return String(p.id) !== String(selfId); }) || parts[parts.length - 1] || {};
      var last = (c.messages && c.messages.data && c.messages.data[0]) || {};
      return {
        id: c.id,
        platform: "instagram",
        from: other.username || other.name || "Instagram user",
        snippet: last.message || "",
        timestamp: c.updated_time,
        unread: c.unread_count,
      };
    });
}

// Extends the Instagram long-lived token (they expire after 60 days). Set a
// weekly time-driven trigger for this function so IG never goes stale.
function refreshInstagramToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("IG_ACCESS_TOKEN");
  if (!token) return;
  var res = UrlFetchApp.fetch(
    "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(token),
    { muteHttpExceptions: true }
  );
  var json = JSON.parse(res.getContentText());
  if (json.access_token) props.setProperty("IG_ACCESS_TOKEN", json.access_token);
}

// ---------- Zoho (mail + calendar) ----------

// Auth lives here rather than in the browser: Zoho's Mail and Calendar APIs
// mint access tokens with a client secret, which a static GitHub Pages site
// can't hold. So this shows the OWNER's mail and calendar to every allowed
// user, the same way the Ticket Tailor and Meta panels already work. (The old
// Outlook panels signed each user in individually; Zoho can't do that here.)
//
// Script Properties:
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN  (required)
//   ZOHO_DC           = data-centre suffix: eu (default), com, in, com.au, …
//   ZOHO_ACCOUNT_ID   = optional; looked up once and cached here
//   ZOHO_CALENDAR_UID = optional; looked up once and cached here

function zohoDc(props) {
  return props.getProperty("ZOHO_DC") || "eu";
}

function zohoConfigured(props) {
  return !!(
    props.getProperty("ZOHO_CLIENT_ID") &&
    props.getProperty("ZOHO_CLIENT_SECRET") &&
    props.getProperty("ZOHO_REFRESH_TOKEN")
  );
}

// Runs fn, turning a thrown Zoho/network error into the { error } shape the
// panels already know how to display.
function safeZoho(fn) {
  try {
    return fn();
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

// Access tokens last an hour, so cache one rather than minting a fresh token
// on every dashboard load. Refresh tokens themselves don't expire.
function getZohoAccessToken(props) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("zoho_access_token");
  if (hit) return hit;

  var res = UrlFetchApp.fetch(
    "https://accounts.zoho." + zohoDc(props) + "/oauth/v2/token" +
      "?refresh_token=" + encodeURIComponent(props.getProperty("ZOHO_REFRESH_TOKEN")) +
      "&client_id=" + encodeURIComponent(props.getProperty("ZOHO_CLIENT_ID")) +
      "&client_secret=" + encodeURIComponent(props.getProperty("ZOHO_CLIENT_SECRET")) +
      "&grant_type=refresh_token",
    { method: "post", muteHttpExceptions: true }
  );

  var json = JSON.parse(res.getContentText());
  if (!json.access_token) {
    throw new Error("Zoho token refresh failed: " + res.getContentText());
  }
  // Expire a little early so a request can't race the hour boundary.
  cache.put("zoho_access_token", json.access_token, 3300);
  return json.access_token;
}

function zohoFetch(url, token) {
  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Zoho-oauthtoken " + token },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error("Zoho API " + res.getResponseCode() + ": " + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

function zohoAccountId(props, token) {
  var saved = props.getProperty("ZOHO_ACCOUNT_ID");
  if (saved) return saved;

  var json = zohoFetch("https://mail.zoho." + zohoDc(props) + "/api/accounts", token);
  var acc = (json.data || [])[0];
  if (!acc) throw new Error("No Zoho Mail account found for this token");

  var id = String(acc.accountId);
  props.setProperty("ZOHO_ACCOUNT_ID", id);
  return id;
}

function getZohoMail(props) {
  if (!zohoConfigured(props)) return { pending: true };

  var token = getZohoAccessToken(props);
  var base =
    "https://mail.zoho." + zohoDc(props) + "/api/accounts/" + zohoAccountId(props, token) + "/messages/view";

  // Two passes, mirroring what the Outlook panel showed: unread, and anything
  // flagged for follow-up. A message can be both, so they're merged by id.
  var byId = {};
  function tag(list, key) {
    (list || []).forEach(function (m) {
      var mid = String(m.messageId);
      if (!byId[mid]) {
        byId[mid] = {
          id: mid,
          subject: m.subject || "",
          from: m.sender || m.fromAddress || "",
          receivedTime: Number(m.receivedTime) || null,
          // Best-effort deep link — Zoho don't document the per-message web
          // URL. Worst case it opens the folder; check against a real message
          // and adjust if so.
          webLink:
            "https://mail.zoho." + zohoDc(props) + "/zm/#mail/folder/" + m.folderId + "/" + mid,
          unread: false,
          flagged: false,
        };
      }
      byId[mid][key] = true;
    });
  }

  tag(zohoFetch(base + "?status=unread&limit=15&sortBy=date", token).data, "unread");
  tag(zohoFetch(base + "?flagid=3&limit=15&sortBy=date", token).data, "flagged");

  return Object.keys(byId)
    .map(function (k) { return byId[k]; })
    .sort(function (a, b) { return (b.receivedTime || 0) - (a.receivedTime || 0); });
}

function zohoCalendarUid(props, token) {
  var saved = props.getProperty("ZOHO_CALENDAR_UID");
  if (saved) return saved;

  var json = zohoFetch("https://calendar.zoho." + zohoDc(props) + "/api/v1/calendars", token);
  var cals = json.calendars || json.data || [];
  var chosen = null;
  for (var i = 0; i < cals.length; i++) {
    if (cals[i].isdefault || cals[i].default) { chosen = cals[i]; break; }
  }
  chosen = chosen || cals[0];
  if (!chosen) throw new Error("No Zoho calendar found for this token");

  var uid = chosen.uid || chosen.calendarUid;
  props.setProperty("ZOHO_CALENDAR_UID", uid);
  return uid;
}

function getZohoCalendar(props) {
  if (!zohoConfigured(props)) return { pending: true };

  var token = getZohoAccessToken(props);
  var now = new Date();
  var end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  // Zoho caps a range query at 31 days; the panel only wants the next 14.
  var range = JSON.stringify({ start: zohoStamp(now), end: zohoStamp(end) });

  var json = zohoFetch(
    "https://calendar.zoho." + zohoDc(props) +
      "/api/v1/calendars/" + encodeURIComponent(zohoCalendarUid(props, token)) +
      "/events?range=" + encodeURIComponent(range),
    token
  );

  return (json.events || json.data || [])
    .map(function (ev) {
      var dt = ev.dateandtime || {};
      return {
        id: ev.uid,
        title: ev.title || "",
        start: zohoParseStamp(dt.start),
        location: ev.location || "",
        webLink: "https://calendar.zoho." + zohoDc(props) + "/zc/ui/#eventdetails/" + ev.uid,
      };
    })
    .sort(function (a, b) { return (a.start || 0) - (b.start || 0); });
}

// Zoho's range parameter wants yyyyMMdd'T'HHmmss'Z'.
function zohoStamp(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// …and event times come back the same way. Convert to epoch ms so the browser
// can just do new Date(n). All-day events have no time part.
function zohoParseStamp(s) {
  var m = String(s || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
