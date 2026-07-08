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
// Deploy: Web app, Execute as Me, Who has access: Anyone. Re-authorize when
// prompted (it now needs Drive access). Whenever you change this file:
//   clasp push  &&  clasp redeploy <deployment-id>
// ============================================================

// Users allowed to read/write the shared store (in addition to OWNER_EMAIL
// and any ALLOWED_EMAILS script property).
var DEFAULT_ALLOWED = ["owner@example.com", "user2@example.com"];

var DATA_FOLDER = "A Patch Wilder Data";

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  if (!verifyCaller(e.parameter.token, props)) {
    return jsonOutput({ error: "unauthorized" });
  }

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
  if (action === "meta") {
    return jsonOutput(getMetaMessages(props));
  }
  return jsonOutput({ error: "unknown action" });
}

// Saves are POSTed (the JSON body can be larger than a URL allows). Sent with
// Content-Type text/plain so the browser treats it as a simple request (no
// CORS preflight, which Apps Script can't answer).
function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  if (!verifyCaller(e.parameter.token, props)) {
    return jsonOutput({ error: "unauthorized" });
  }
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
function verifyCaller(token, props) {
  if (!token) return false;
  var owner = (props.getProperty("OWNER_EMAIL") || "").toLowerCase();
  var extra = (props.getProperty("ALLOWED_EMAILS") || "")
    .split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
  var allowed = [owner].concat(extra, DEFAULT_ALLOWED).filter(Boolean);
  try {
    var res = UrlFetchApp.fetch(
      "https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=" + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    var info = JSON.parse(res.getContentText());
    var verified = info.email_verified === "true" || info.email_verified === true;
    return verified && allowed.indexOf((info.email || "").toLowerCase()) !== -1;
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
    "/conversations?fields=participants,snippet,updated_time&access_token=" + encodeURIComponent(pageToken);
  var json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  if (json.error) throw json.error.message || "Facebook API error";
  return (json.data || []).map(function (c) {
    var other = (c.participants && c.participants.data || []).find(function (p) { return p.id !== pageId; });
    return {
      platform: "facebook",
      from: other ? other.username || other.name : "Unknown",
      snippet: c.snippet,
      timestamp: c.updated_time,
    };
  });
}

function getInstagramMessages(igToken, selfId) {
  var url =
    "https://graph.instagram.com/v21.0/me/conversations?fields=participants,updated_time,messages.limit(1){message,from}" +
    "&access_token=" + encodeURIComponent(igToken);
  var json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  if (json.error) throw json.error.message || "Instagram API error";
  return (json.data || []).map(function (c) {
    var parts = (c.participants && c.participants.data) || [];
    var other = parts.find(function (p) { return String(p.id) !== String(selfId); }) || parts[parts.length - 1] || {};
    var last = (c.messages && c.messages.data && c.messages.data[0]) || {};
    return {
      platform: "instagram",
      from: other.username || other.name || "Instagram user",
      snippet: last.message || "",
      timestamp: c.updated_time,
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

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
