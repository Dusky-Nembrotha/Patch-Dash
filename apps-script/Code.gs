// ============================================================
// A Patch Wilder — Apps Script proxy
//
// This runs on Google's servers under your account, not in the browser,
// so it's the safe place to hold your Ticket Tailor API key and (later)
// your Meta Page access token. The dashboard calls this instead of
// calling those APIs directly.
//
// SETUP:
// 1. Go to script.google.com > New project. Delete the default code and
//    paste this whole file in.
// 2. Project Settings (gear icon) > Script Properties > add:
//      OWNER_EMAIL          = the Google account email you sign in with
//      TICKET_TAILOR_API_KEY = your Ticket Tailor API key
// 3. Deploy > New deployment > type: Web app.
//      Execute as: Me
//      Who has access: Anyone
//    Click Deploy, authorize it, and copy the Web App URL.
// 4. Paste that URL into js/config.js as `appsScriptUrl`.
// ============================================================

function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const token = e.parameter.token;
  const action = e.parameter.action;

  if (!verifyCaller(token, props.getProperty("OWNER_EMAIL"))) {
    return jsonOutput({ error: "unauthorized" });
  }

  if (action === "tickettailor") {
    return jsonOutput(getTicketTailorEvents(props.getProperty("TICKET_TAILOR_API_KEY")));
  }
  if (action === "meta") {
    return jsonOutput(getMetaMessages(props));
  }
  return jsonOutput({ error: "unknown action" });
}

// Confirms the caller really is you, by checking the Google access token
// they sent matches your own account email. Prevents random internet
// traffic from using your API keys through this endpoint.
function verifyCaller(token, ownerEmail) {
  if (!token || !ownerEmail) return false;
  try {
    const res = UrlFetchApp.fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
      { muteHttpExceptions: true }
    );
    const info = JSON.parse(res.getContentText());
    return info.email === ownerEmail && (info.email_verified === "true" || info.email_verified === true);
  } catch (err) {
    return false;
  }
}

function getTicketTailorEvents(apiKey) {
  if (!apiKey) return { error: "TICKET_TAILOR_API_KEY not set in Script Properties" };

  const basicAuth = Utilities.base64Encode(apiKey + ":");
  const res = UrlFetchApp.fetch(
    "https://api.tickettailor.com/v1/events?status=published&order_by=start_date&order=asc",
    { headers: { Authorization: "Basic " + basicAuth }, muteHttpExceptions: true }
  );

  if (res.getResponseCode() !== 200) {
    return { error: "Ticket Tailor error: " + res.getContentText() };
  }

  const json = JSON.parse(res.getContentText());
  const now = Date.now();

  return (json.data || [])
    .filter((ev) => {
      const start = new Date((ev.start && (ev.start.iso || ev.start.date)) || 0).getTime();
      return start >= now;
    })
    .map((ev) => ({
      name: ev.name,
      start: ev.start,
      venue: ev.venue ? ev.venue.name : null,
      tickets_sold: ev.total_issued_tickets || null,
    }));
}

// Flip to true once Meta has approved pages_messaging / instagram_manage_messages
const META_REVIEW_APPROVED = false;

function getMetaMessages(props) {
  if (!META_REVIEW_APPROVED) {
    return { pending: true };
  }

  const pageToken = props.getProperty("META_PAGE_ACCESS_TOKEN");
  const pageId = props.getProperty("META_PAGE_ID");
  const igId = props.getProperty("META_IG_BUSINESS_ID");

  const fbRes = UrlFetchApp.fetch(
    `https://graph.facebook.com/v19.0/${pageId}/conversations?fields=participants,snippet,updated_time&access_token=${pageToken}`,
    { muteHttpExceptions: true }
  );
  const fbJson = JSON.parse(fbRes.getContentText());

  const igRes = UrlFetchApp.fetch(
    `https://graph.facebook.com/v19.0/${igId}/conversations?platform=instagram&fields=participants,snippet,updated_time&access_token=${pageToken}`,
    { muteHttpExceptions: true }
  );
  const igJson = JSON.parse(igRes.getContentText());

  function shape(list, platform) {
    return (list || []).map((c) => {
      const other = (c.participants && c.participants.data || []).find((p) => p.id !== pageId);
      return {
        platform: platform,
        from: other ? other.username || other.name : "Unknown",
        snippet: c.snippet,
        timestamp: c.updated_time,
      };
    });
  }

  const messages = shape(fbJson.data, "facebook").concat(shape(igJson.data, "instagram"));
  messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return messages;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
