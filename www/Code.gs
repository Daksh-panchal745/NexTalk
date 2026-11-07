/* ============================================================
   !!! IMPORTANT: THE V8 RUNTIME MUST BE ENABLED !!!
   ============================================================
   If you see "Syntax error / Unexpected token" when saving,
   or push does not work, your project is still on the OLD
   (Rhino) runtime. Fix (takes 10 seconds):
     Apps Script editor -> left side GEAR icon (Project Settings)
     -> turn ON the "Enable Chrome V8 runtime" checkbox.
   (On the older editor: Run menu -> "Enable new Apps Script
   runtime powered by V8")
   After that, paste this code and Save - no error will appear.
   ============================================================ */
/**
 * ============================================================
 *  NexTalk - Google Apps Script Backend
 * ============================================================
 *  This script will automatically create 2 sheets:
 *   Sheet 1: "App_Data"   -> all application data
 *   Sheet 2: "Admin_Data" -> all admin panel data
 *
 *  Deploy: Deploy > New deployment > Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 *  After deploying, paste the URL you get into
 *  SCRIPT_URL in index.html.
 * ============================================================
 */

var APP_VERSION = 'v29.4';
var DEFAULT_APP_PASSWORD = 'cyber@123'; // default entry password for the first time
var DRIVE_FOLDER = 'CyberPulse_Uploads'; // NOTE: folder name intentionally unchanged so all old uploads keep working // NOTE: folder name intentionally unchanged so all old uploads keep working (renaming it would orphan existing files)
var ONLINE_WINDOW_MS = 65000; // if no heartbeat for 65 sec -> mark as DEACTIVE

/* ---------- LOGIN APPROVAL SETTINGS ----------
   ADMIN_EMAIL: put YOUR email here - the approval email for every
   login request is delivered to this address (with GRANT / DENY buttons).
   If you leave it blank it goes to the script owner (you) instead. */
var ADMIN_EMAIL = 'panchaldaksh745@gmail.com'; // <- APKI EMAIL (approval requests yahin aayengi)

/* ============================================================
   !!! THE SINGLE MOST IMPORTANT SETTING - WEB_APP_URL !!!
   ============================================================
   Paste the SAME URL here that index.html uses as SCRIPT_URL.
   (The exact URL that is running your app - the /exec one)

   Example:
   var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycb.../exec';

   The GRANT/DENY buttons in the email are built on THIS URL, which
   is why pressing one grants access DIRECTLY, with no Google/Drive
   error page in between. */
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzsR2O_Ubmboa3rbibaW9MY2S2NnwjeesxXAU5x5yjp1vqpNLmpvT9B9nE-TkccPwRp3w/exec'; // <- PASTE THE SCRIPT_URL FROM index.html HERE
var APPROVAL_TTL_MS = 10 * 60 * 1000;    // request EXPIRES after 10 minutes
var REQ_HEADERS = ['Request_ID', 'Token', 'User_ID', 'Name', 'Email', 'Contact', 'Requested_At', 'Status', 'Decided_At'];

var APP_HEADERS = ['Timestamp', 'Type', 'User_ID', 'Name', 'Contact_Number', 'Email', 'Message_Text', 'File_Name', 'File_Type', 'File_Link'];
var PUSH_HEADERS = ['User_ID', 'Name', 'Endpoint', 'P256dh', 'Auth', 'Saved_At', 'Device', 'Signature']; // v29.2: +Device/Signature -> one push per phone
/* v16: PERSONAL CHAT (1-to-1) data - the Read column drives the unread count */
var DM_HEADERS = ['Timestamp', 'From_ID', 'From_Name', 'To_ID', 'To_Name', 'Message_Text', 'Read'];

/* ============================================================
   TEST FUNCTION - RUN THIS ONCE after pasting new code
   ============================================================
   In the editor, pick "testSetup" from the function dropdown and
   press Run. The first time Google asks for authorization -
   "Review permissions" -> your account -> Advanced ->
   "Go to ... (unsafe)" -> Allow.
   This will:
     1. Teeno sheets (App_Data, Admin_Data, Login_Requests) create/verify
     2. Send a TEST mail to your admin email
   If it runs without an error, everything is set up correctly. */
function testSetup() {
  var s = sheets_();
  var to = adminEmail_();

  // STEP 1: WEB_APP_URL check
  var w = String(WEB_APP_URL || '').trim();
  if (!w) {
    Logger.log('!! WEB_APP_URL IS EMPTY !!');
    Logger.log('Copy SCRIPT_URL from index.html into WEB_APP_URL in');
    Logger.log('Code.gs, save it, then run this function again.');
    return;
  }
  if (w.indexOf('https://script.google.com/') !== 0 || w.indexOf('/exec') === -1) {
    Logger.log('!! WEB_APP_URL LOOKS WRONG: ' + w);
    Logger.log('The URL must start with https://script.google.com/ and end with /exec.');
    return;
  }
  Logger.log('WEB_APP_URL OK: ' + w);

  // STEP 2: TEST approval request + email with REAL buttons
  // Press GRANT in this email - if you see the green ACCESS GRANTED
  // page, the system is 100% ready!
  var testUser = { id: 'TEST', name: 'TEST (System Check)', email: to, contact: '0000000000' };
  var reqId = requestApproval_(testUser, w);
  Logger.log('Test approval email sent to: ' + to);
  Logger.log('Now open the email and press GRANT ACCESS -');
  Logger.log('if you get the green "ACCESS GRANTED" page, everything is READY!');
  Logger.log('(Test request ID: ' + reqId + ')');
}
var ADMIN_HEADERS = ['App_Password', 'User_ID', 'Name', 'Contact_Number', 'Email', 'Login_Password', 'Join_Date', 'Last_Active', 'Total_Messages', 'Total_Uploads', 'Is_Admin', 'Status', 'Last_Seen'];

/* ---------- Sheet setup (auto-create) ---------- */
/* v29.4 SPEED: one request used to call sheets_() 10-20 times (every call =
   4-5 getSheetByName round-trips). Sheet handles never go stale inside one
   execution, so they are looked up once and reused. */
var _sheetsMemo = null;
function sheets_() {
  if (_sheetsMemo) return _sheetsMemo;
  _sheetsMemo = sheetsLoad_();
  return _sheetsMemo;
}
function sheetsLoad_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var app = ss.getSheetByName('App_Data');
  if (!app) {
    app = ss.insertSheet('App_Data', 0);
    app.appendRow(APP_HEADERS);
    app.getRange(1, 1, 1, APP_HEADERS.length).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD');
    app.setFrozenRows(1);
  }
  var adm = ss.getSheetByName('Admin_Data');
  if (!adm) {
    adm = ss.insertSheet('Admin_Data', 1);
    adm.appendRow(ADMIN_HEADERS);
    adm.getRange(1, 1, 1, ADMIN_HEADERS.length).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD');
    adm.setFrozenRows(1);
  }
  if (String(adm.getRange('A2').getValue()) === '') {
    adm.getRange('A2').setValue(DEFAULT_APP_PASSWORD);
    _usersMemo = null; // v29.4: Admin_Data changed
  }
  var req = ss.getSheetByName('Login_Requests');
  if (!req) {
    req = ss.insertSheet('Login_Requests', 2);
    req.appendRow(REQ_HEADERS);
    req.getRange(1, 1, 1, REQ_HEADERS.length).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD');
    req.setFrozenRows(1);
  }
  var push = ss.getSheetByName('Push_Subs');
  if (!push) {
    push = ss.insertSheet('Push_Subs', 3);
    push.appendRow(PUSH_HEADERS);
    push.getRange(1, 1, 1, PUSH_HEADERS.length).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD');
    push.setFrozenRows(1);
  }
  var dm = ss.getSheetByName('DM_Data');
  if (!dm) {
    dm = ss.insertSheet('DM_Data', 4);
    dm.appendRow(DM_HEADERS);
    dm.getRange(1, 1, 1, DM_HEADERS.length).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD');
    dm.setFrozenRows(1);
  }
  try { secSheets_(); } catch (e) {}
  return { app: app, adm: adm, req: req, push: push, dm: dm };
}

function adminEmail_() {
  if (ADMIN_EMAIL && ADMIN_EMAIL.indexOf('@') > -1) return ADMIN_EMAIL;
  // Fallback: the script owner's email (the web app runs as "Execute as: Me")
  try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; }
}

/* ---------- Working /exec URL ki memory ----------
   The GRANT/DENY buttons in the email ALWAYS use the same URL that
   the app itself is successfully talking to. The script's own
   getUrl() sometimes returns a /dev URL, which demands a Google
   login - that is why the button used to redirect to Google. */
function saveExecUrl_(url) {
  try {
    var u = String(url || '');
    if (u.indexOf('https://script.google.com/') !== 0) return; // only a real script URL
    if (u.indexOf('/exec') === -1) return;                     // only the /exec (public) URL
    u = u.split('?')[0]; // strip query params
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('CP_EXEC_URL') !== u) props.setProperty('CP_EXEC_URL', u);
  } catch (e) {}
}

function execUrl_(appUrl) {
  // Priority 0 (HIGHEST): the hardcoded WEB_APP_URL - your known-good URL
  var w = String(WEB_APP_URL || '').trim();
  if (w.indexOf('https://script.google.com/') === 0 && w.indexOf('/exec') > -1) return w.split('?')[0];
  // Priority 1: the URL that arrived with this very request
  var u = String(appUrl || '');
  if (u.indexOf('https://script.google.com/') === 0 && u.indexOf('/exec') > -1) return u.split('?')[0];
  // Priority 2: a working URL saved earlier
  try {
    var p = PropertiesService.getScriptProperties().getProperty('CP_EXEC_URL');
    if (p) return p;
  } catch (e) {}
  // Priority 3: ask the script itself - and rewrite /dev into /exec
  try {
    var g = String(ScriptApp.getService().getUrl() || '');
    if (g) return g.split('?')[0].replace(/\/dev$/, '/exec');
  } catch (e2) {}
  return '';
}

function appPassword_() {
  return String(sheets_().adm.getRange('A2').getValue());
}

/* ---------- Entry points ---------- */
function doGet(e) {
  sheets_();
  // The GRANT / DENY buttons from the email land here
  if (e && e.parameter && e.parameter.approve) {
    return approvalClick_(e.parameter);
  }
  if (e && e.parameter && e.parameter.secblock) {
    return secBlockClick_(e.parameter);
  }
  if (e && e.parameter && e.parameter.pardon) {
    return pardonClick_(e.parameter);
  }
  return json_({ ok: true, app: 'NexTalk API', time: new Date().toISOString() });
}

/* SHARED core of a decision - the email button click and the admin panel
   both use this. Authentication has already happened by this point. */
function decideRequest_(reqId, decision) {
  var sh = sheets_().req;
  var row = findRequestRow_(sh, reqId);
  if (!row) return { ok: false, error: 'Request not found (it may have expired or been deleted)' };
  if (String(row.vals[7]) !== 'PENDING') return { ok: false, error: 'Already decided: ' + row.vals[7], already: true, name: String(row.vals[3]) };
  sh.getRange(row.rowNum, 8).setValue(decision);   // Status
  sh.getRange(row.rowNum, 9).setValue(new Date()); // Decided_At
  SpreadsheetApp.flush();
  if (decision === 'APPROVED') {
    try { sendWelcomeEmail_(String(row.vals[3]), String(row.vals[4])); } catch (e2) {}
  }
  return { ok: true, name: String(row.vals[3]), email: String(row.vals[4]) };
}

/* Admin ne email me button click kiya -> token verify -> decide -> result page */
function approvalClick_(p) {
  var reqId = String(p.approve || '');
  var token = String(p.token || '');
  var decision = String(p.decision) === 'allow' ? 'APPROVED' : 'DENIED';
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  var title, msg, color;
  try {
    var sh = sheets_().req;
    var row = findRequestRow_(sh, reqId);
    if (!row) {
      title = 'Request not found'; color = '#e05d5d';
      msg = 'This request does not exist, or it has already been deleted.';
    } else if (String(row.vals[1]) !== token) {
      title = 'Invalid link'; color = '#e05d5d';
      msg = 'The security token did not match - the link looks tampered with.';
    } else {
      var r = decideRequest_(reqId, decision);
      if (!r.ok && r.already) {
        title = 'Already decided'; color = '#d8b34a';
        msg = 'A decision has already been made on this request.';
      } else if (!r.ok) {
        title = 'Error'; color = '#e05d5d'; msg = esc_(r.error || 'Try again');
      } else if (decision === 'APPROVED') {
        title = 'ACCESS GRANTED \u2713'; color = '#A78BFA';
        msg = '<b>' + esc_(r.name) + '</b> (' + esc_(r.email) + ') can now enter the app.';
      } else {
        title = 'ACCESS DENIED \u2716'; color = '#e05d5d';
        msg = '<b>' + esc_(r.name) + '</b> (' + esc_(r.email) + ') will NOT be allowed in.';
      }
    }
  } finally { lock.releaseLock(); }
  var html =
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#04060D;font-family:Consolas,Menlo,monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;">' +
    '<div style="background:#070B14;border:1px solid #1E2740;border-radius:14px;padding:34px 30px;max-width:420px;text-align:center;">' +
    '<div style="font-size:12px;letter-spacing:3px;color:#7C5CFF;margin-bottom:14px;">\uD83D\uDEE1 NEXTALK - ADMIN CONSOLE</div>' +
    '<div style="font-size:22px;font-weight:bold;color:' + color + ';margin-bottom:12px;">' + title + '</div>' +
    '<div style="font-size:13px;color:#E6E9F2;line-height:1.7;">' + msg + '</div>' +
    '<div style="margin-top:20px;font-size:11px;color:#5C6580;">You can close this tab now.</div>' +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* v27: one-click device block, straight from the alert email */
function secBlockClick_(p) {
  var devId = String(p.secblock || '');
  var tok = String(p.token || '');
  var title, msg, color;
  if (!devId || tok !== secBlockToken_(devId)) {
    title = 'Invalid link'; color = '#e05d5d';
    msg = 'The security token did not match - this link looks tampered with.';
  } else {
    var lock = LockService.getScriptLock(); lock.tryLock(10000);
    var who = '';
    try {
      var row = deviceRow_(devId);
      if (row && String(row.vals[1])) who = String(row.vals[1]) + (row.vals[2] ? ' (' + row.vals[2] + ')' : '');
      var done = blockDevice_(devId, 'Blocked from the security alert email');   // device + account + all sessions
    } finally { lock.releaseLock(); }
    if (done === false) {
      title = 'Not blocked'; color = '#d8b34a';
      msg = 'This device belongs to the <b>admin account</b> - blocking it would lock you out, so it was skipped.';
    } else {
    title = 'BLOCKED \u2716'; color = '#A78BFA';
    msg = 'Device <b>' + esc_(devId) + '</b>' + (who ? ' and the account <b>' + esc_(who) + '</b>' : '') +
          ' can no longer reach NexTalk. Every open session has been terminated - the app will lock itself ' +
          'within a few seconds wherever it is open, and this person can never log in or sign up again. ' +
          'You can undo this from Admin &rarr; Security.';
    }
  }
  var html = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#04060D;font-family:Consolas,Menlo,monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;">' +
    '<div style="background:#070B14;border:1px solid #1E2740;border-radius:14px;padding:34px 30px;max-width:440px;text-align:center;">' +
    '<div style="font-size:12px;letter-spacing:3px;color:#7C5CFF;margin-bottom:14px;">\uD83D\uDEE1 NEXTALK - INTRUSION DEFENCE</div>' +
    '<div style="font-size:22px;font-weight:bold;color:' + color + ';margin-bottom:12px;">' + title + '</div>' +
    '<div style="font-size:13px;color:#E6E9F2;line-height:1.7;">' + msg + '</div>' +
    '<div style="margin-top:20px;font-size:11px;color:#5C6580;">You can close this tab now.</div>' +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function logout_(req) {
  var t = String(req.token || '');
  var sh = secSheets_().sess;
  var last = sh.getLastRow();
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, SESS_HEADERS.length).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]) === t) { sh.deleteRow(i + 2); break; }
    }
  }
  try { CacheService.getScriptCache().remove('cp_sess_' + t.slice(0, 32)); } catch (e) {}
  return { ok: true };
}

function esc_(s) { return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function findRequestRow_(sh, reqId) {
  // Live scan - never trust a cached row number (project principle)
  var last = sh.getLastRow();
  if (last < 2) return null;
  var vals = sh.getRange(2, 1, last - 1, REQ_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === reqId) return { rowNum: i + 2, vals: vals[i] };
  }
  return null;
}

function doPost(e) {
  var res;
  try {
    var req;
    if (e.postData && e.postData.type && e.postData.type.indexOf('urlencoded') > -1) {
      req = e.parameter; // form-encoded (uploads come through this - reliable for large data)
    } else {
      req = JSON.parse(e.postData.contents);
    }
    res = handle_(req);
  } catch (err) {
    res = { ok: false, error: String(err) };
  }
  return json_(res);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Router ---------- */
function handle_(req) {
  // Whenever the app sends any request, remember its working /exec URL -
  // the approval email buttons are built on that URL.
  if (req.appUrl) saveExecUrl_(req.appUrl);
  var a = req.action;

  /* ============ v27 SECURITY GATE (runs before every action) ============ */
  if (a === 'ping') return { ok: true, v: APP_VERSION, time: new Date().toISOString() };

  // (a) flood protection
  if (!rateOk_(req)) {
    secLog_('RATE_LIMIT', 'HIGH', req, 'More than ' + RATE_LIMIT_HITS + ' requests in ' + RATE_LIMIT_WIN + 's', null);
    return { ok: false, error: 'Too many requests - slow down', throttled: true };
  }

  // (b) a device you blocked can never talk to the app again
  var devStatus = null;
  try { devStatus = touchDevice_(req, null); } catch (e) {}
  if (devStatus === 'BLOCKED') {
    /* v28: the ONLY two things a blocked device can do is say SORRY to the
       admin and poll whether the admin granted permission again. */
    if (a === 'sec_sorry') return secSorry_(req);
    if (a === 'sorry_status') return sorryStatus_(req);
    secLog_('BLOCKED_DEVICE_ATTEMPT', 'HIGH', req, 'Action: ' + a, null);
    return { ok: false, error: 'This device has been blocked by the administrator', blocked: true };
  }
  if (a === 'sec_sorry') return secSorry_(req);       // (also reachable pre-block, harmless)
  if (a === 'sorry_status') return sorryStatus_(req);

  // (c) everything except the open actions needs a valid session token
  if (!OPEN_ACTIONS[a]) {
    var su = sessionUser_(req.token, String(req.dev || ''));
    if (su && su._mismatch) {
      secLog_('SESSION_DEVICE_MISMATCH', 'CRITICAL', req,
        'A valid token for ' + su.uid + ' was replayed from a different device', null);
      return { ok: false, error: 'Session is not valid on this device - please log in again', reauth: true };
    }
    if (!su) {
      secLog_('BAD_TOKEN', 'HIGH', req, 'Action: ' + a + ', claimed userId: ' + String(req.userId || ''), null);
      return { ok: false, error: 'Session expired - please log in again', reauth: true };
    }
    // v27.1: account BLOCKED (admin ne email/panel se block kiya) -> kahin bhi ho, turant bahar
    if (su.acct === 'BLOCKED') {
      try { blockDevice_(String(req.dev || ''), 'Blocked account ' + su.id + ' tried action ' + a); } catch (e) {}
      try { killSessionsOf_(su.id); } catch (e) {}
      secLog_('BLOCKED_ACCOUNT_ATTEMPT', 'HIGH', req, 'Blocked account tried action: ' + a, su);
      return { ok: false, error: 'Your access to NexTalk has been revoked by the administrator', blocked: true };
    }
    // The token decides WHO you are. A userId in the body is never trusted again.
    if (String(req.userId || '') && String(req.userId) !== su.id) {
      secLog_('IDENTITY_SPOOF', 'CRITICAL', req,
        su.id + ' (' + su.name + ') tried to act as ' + String(req.userId), su);
      return { ok: false, error: 'Identity mismatch', reauth: true };
    }
    req.userId = su.id;
    try { touchDevice_(req, su); } catch (e) {}
  }
  /* ===================================================================== */

  if (a === 'gate') return gate_(req);
  if (a === 'gate_bio_register') return gateBioRegister_(req);  // v29.4: after a correct password, bind this device for biometric unlock
  if (a === 'gate_bio') return gateBio_(req);                    // v29.4: biometric passed on the device -> open the gate
  if (a === 'signup') return signup_(req);
  if (a === 'login') return login_(req);
  if (a === 'login_status') return loginStatus_(req); // approval poll
  if (a === 'decide_request') return decideRequestApi_(req); // admin panel se approve/deny
  if (a === 'updates') return updates_(req);
  if (a === 'typing') return typing_(req);
  if (a === 'send') return send_(req);
  if (a === 'upload') return upload_(req);
  if (a === 'uploads') return uploadsList_(req);
  if (a === 'admin_data') return adminData_(req);
  if (a === 'admin_password') return adminPassword_(req);
  if (a === 'remove_user') return removeUser_(req);
  if (a === 'remove_users') return removeUsers_(req); // v27.2: bulk delete (select all)
  if (a === 'del_message') return delMessage_(req);   // admin: ek message delete
  if (a === 'del_upload') return delUpload_(req);     // admin: screenshot/file delete (sheet + Drive)
  if (a === 'del_all_chats') return delAllChats_(req);// admin: clear all chats
  if (a === 'roster') return roster_(req);       // users list for calls
  if (a === 'sig_send') return sigSend_(req);     // send call signaling
  if (a === 'push_key') return pushKey_(req);     // VAPID public key (so the frontend can subscribe)
  if (a === 'save_sub') return saveSub_(req);     // store a push subscription
  if (a === 'push_peek') return pushPeek_(req);   // service worker: what is the latest message?
  if (a === 'dm_send') return dmSend_(req);       // v16: send a personal message (+ targeted push)
  if (a === 'dm_list') return dmList_(req);       // v16: messages of one thread (on open - also marks read)
  if (a === 'push_test') return pushTest_(req);   // v17: test push to your own devices (for debugging)
  if (a === 'sec_event') return secEvent_(req);   // v27: browser security beacon
  if (a === 'sec_list') return secList_(req);     // v27: admin security console
  if (a === 'sec_block') return secBlock_(req);   // v27: block/unblock a device
  if (a === 'push_diag') return pushDiag_(req);   // v27: why is push not arriving?
  if (a === 'logout') return logout_(req);        // v27: kill this session
  if (a === 'media') return media_(req);         // v26: stream a NexTalk file as base64 (images + voice notes)
  if (a === 'dm_upload') return dmUpload_(req);   // v21: photo/file for a personal chat (private - never shown in the group)
  if (a === 'admin_dm_list') return adminDmList_(req); // v22: admin - view all personal messages of a user
  if (a === 'admin_dm_del') return adminDmDel_(req);   // v22: admin - delete one personal message
  if (a === 'admin_dm_wipe') return adminDmWipe_(req); // v22: admin - wipe a user's ENTIRE personal chat history
  /* v29: CUSTOM GROUPS (user-created, named, chosen members) */
  if (a === 'grp_create')  return grpCreate_(req);
  if (a === 'grp_send')    return grpSend_(req);
  if (a === 'grp_msgs')    return grpMsgs_(req);
  if (a === 'grp_members') return grpMembers_(req);  // add / remove members (creator or admin)
  if (a === 'grp_leave')   return grpLeave_(req);
  if (a === 'grp_delete')  return grpDelete_(req);   // creator or admin
  if (a === 'grp_rename')  return grpRename_(req);   // creator or admin
  return { ok: false, error: 'Unknown action' };
}

/* ---------- Gate (app entry password) ---------- */
/* ================================================================
   v29: FACE ID / FINGERPRINT for the entry gate
   ----------------------------------------------------------------
   The phone itself checks the face / finger (WebAuthn platform
   authenticator, userVerification = required). We only need to know that
   THIS device had typed the correct entry password before: at that moment
   the app asks for a device-bound "bio key" (random, 48 chars) which is
   stored here against the device id. Later, after the biometric prompt
   succeeds, the app presents that key and the gate opens - no password
   typing. Changing the entry password (admin) wipes all bio keys, so
   everyone has to type the new password once again.
   Sheet: Bio_Keys = Device | Key | Created | Last_Used | UA
   ================================================================ */
var BIO_HEADERS = ['Device', 'Key', 'Created', 'Last_Used', 'User_Agent'];
function bioSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Bio_Keys');
  if (!sh) {
    sh = ss.insertSheet('Bio_Keys'); sh.appendRow(BIO_HEADERS);
    sh.getRange(1, 1, 1, BIO_HEADERS.length).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD'); sh.setFrozenRows(1);
  }
  return sh;
}
function gateBioRegister_(req) {
  // must prove the password right now (same check as the normal gate)
  if (!checkPw_(String(req.password || ''), appPassword_())) return { ok: false, error: 'Wrong password' };
  var dev = String(req.dev || '').trim();
  if (!dev) return { ok: false, error: 'No device id' };
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var sh = bioSheet_(), last = sh.getLastRow(), found = 0;
    if (last >= 2) {
      var vals = sh.getRange(2, 1, last - 1, BIO_HEADERS.length).getValues();
      for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === dev) { found = i + 2; break; }
    }
    var row = [dev, key, new Date(), new Date(), String(req.ua || '').slice(0, 200)];
    if (found) sh.getRange(found, 1, 1, BIO_HEADERS.length).setValues([row]); else sh.appendRow(row);
  } finally { lock.releaseLock(); }
  try { CacheService.getScriptCache().put('cp_bio_' + dev, key, 21600); } catch (e) {}
  return { ok: true, bioKey: key };
}
function gateBio_(req) {
  var dev = String(req.dev || '').trim(), key = String(req.bioKey || '').trim();
  if (!dev || key.length < 40) return { ok: false };
  var cached = null;
  try { cached = CacheService.getScriptCache().get('cp_bio_' + dev); } catch (e) {}
  if (cached && cached === key) return { ok: true };
  var sh = bioSheet_(), last = sh.getLastRow();
  if (last < 2) return { ok: false, stale: true };
  var vals = sh.getRange(2, 1, last - 1, BIO_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === dev && String(vals[i][1]) === key) {
      try { sh.getRange(i + 2, 4).setValue(new Date()); } catch (e) {}
      try { CacheService.getScriptCache().put('cp_bio_' + dev, key, 21600); } catch (e) {}
      return { ok: true };
    }
  }
  secLog_('GATE_BIO_FAIL', 'LOW', req, 'Biometric key not valid for this device (password changed or device reset)', null);
  return { ok: false, stale: true };
}
/* Admin changed the entry password -> everyone types it once again */
function bioKeysWipe_() {
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bio_Keys');
    if (sh && sh.getLastRow() >= 2) sh.deleteRows(2, sh.getLastRow() - 1);
  } catch (e) {}
}

function gate_(req) {
  var ok = checkPw_(String(req.password), appPassword_());
  if (!ok) {
    var c = CacheService.getScriptCache();
    var k = 'cp_gf_' + String(req.dev || 'x').slice(0, 30);
    var n = Number(c.get(k) || 0) + 1;
    c.put(k, String(n), 900);
    secLog_('GATE_PASSWORD_FAIL', n >= 4 ? 'HIGH' : 'LOW', req,
      'Wrong entry password, attempt #' + n, null);
    return { ok: false };
  }
  return { ok: true };
}

/* ---------- Users ---------- */
/* v29.4 SPEED: the user list was read from the sheet 3-4 times per poll.
   Now once per request; any write to Admin_Data clears the memo. */
var _usersMemo = null;
function usersAll_() {
  if (_usersMemo) return _usersMemo;
  _usersMemo = usersLoad_();
  return _usersMemo;
}
function usersLoad_() {
  var adm = sheets_().adm;
  var last = adm.getLastRow();
  if (last < 2) return [];
  var vals = adm.getRange(2, 1, last - 1, ADMIN_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (String(r[1]) === '') continue; // skip the empty row that only holds the app password
    out.push({
      row: i + 2, id: String(r[1]), name: String(r[2]), contact: String(r[3]),
      email: String(r[4]).toLowerCase(), password: String(r[5]), join: String(r[6]),
      lastActive: String(r[7]), messages: Number(r[8]) || 0, uploads: Number(r[9]) || 0,
      isAdmin: String(r[10]) === 'YES', lastSeen: r[12] ? new Date(r[12]).getTime() : 0,
      acct: String(r[11] || '')   // v27.1: 'BLOCKED' = admin ne is account ko permanently band kar diya
    });
  }
  return out;
}

function publicUser_(u) {
  return { id: u.id, name: u.name, contact: u.contact, email: u.email, isAdmin: u.isAdmin };
}

function signup_(req) {
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var users = usersAll_();
    var email = String(req.email || '').trim().toLowerCase();
    var name = String(req.name || '').trim();
    var contact = String(req.contact || '').trim();
    var pass = String(req.password || '');
    if (!email || !name || !contact || !pass) return { ok: false, error: 'Please fill in all fields' };
    if (isBlockedIdentity_(email, contact)) {
      try { blockDevice_(String(req.dev || ''), 'Blocked identity tried to sign up again: ' + email); } catch (e) {}
      secLog_('BLOCKED_ACCOUNT_ATTEMPT', 'HIGH', req, 'Blocked identity tried to sign up again: ' + email + ' / ' + contact, null);
      return { ok: false, error: 'Access to NexTalk has been revoked by the administrator', blocked: true };
    }
    for (var i = 0; i < users.length; i++) {
      if (users[i].email === email) return { ok: false, error: 'This email is already registered - please log in' };
    }
    // New ID must always stay unique - max existing ID number + 1
    // (it used to be users.length+1, which created duplicate IDs after a delete,
    //  and users with duplicate IDs could not be deleted)
    var maxNum = 0;
    for (var k = 0; k < users.length; k++) {
      var m = String(users[k].id).match(/^U(\d+)$/);
      if (m && Number(m[1]) > maxNum) maxNum = Number(m[1]);
    }
    var id = 'U' + ('000' + (maxNum + 1)).slice(-3);
    var isAdmin = users.length === 0 ? 'YES' : 'NO'; // first user = admin
    var now = new Date();
    var adm = sheets_().adm;
    adm.appendRow(['', id, name, contact, email, makeHash_(pass), now, now, 0, 0, isAdmin, 'ACTIVE', now]);
    _usersMemo = null; // v29.4: Admin_Data changed
    logApp_('SIGNUP', { id: id, name: name, contact: contact, email: email }, '', '', '', '');

    // First user = ADMIN (you) - straight in, otherwise who would approve?
    if (isAdmin === 'YES') {
      sendWelcomeEmail_(name, email);
      var au = { id: id, name: name, contact: contact, email: email, isAdmin: true };
      return { ok: true, user: au, token: newSession_(au, req) };
    }

    // EVERY other new user - the account is created, but ENTRY only
    // after the admin approves. The approval email goes to the admin.
    var reqId = requestApproval_({ id: id, name: name, email: email, contact: contact }, req.appUrl, req);
    return { ok: true, pending: true, requestId: reqId };
  } finally { lock.releaseLock(); }
}

/* Create a pending request + email the admin for approval.
   Both Signup and Login use this. */
function requestApproval_(u, appUrl, req) {
  if (req) { u.dev = req.dev; u.ua = req.ua; u.plat = req.plat; u.scr = req.scr; u.tz = req.tz; }
  var sh = sheets_().req;
  var reqId = 'R' + Date.now() + Math.floor(Math.random() * 900 + 100);
  var token = Utilities.getUuid().replace(/-/g, '');
  sh.appendRow([reqId, token, u.id, u.name, u.email, u.contact, new Date(), 'PENDING', '']);
  /* v27: remember WHICH device asked. Only that device may collect the
     session token when you approve - so a request id cannot be guessed
     and redeemed from somewhere else. */
  try {
    if (req && req.dev) CacheService.getScriptCache()
      .put('cp_reqdev_' + reqId, String(req.dev), Math.round(APPROVAL_TTL_MS / 1000) + 120);
  } catch (e) {}
  SpreadsheetApp.flush(); // save to the sheet first, then email - avoids a race
  sendApprovalEmail_(u, reqId, token, appUrl);
  return reqId;
}

/* ADMIN PANEL se approve/deny - POST API, 100% reliable
   (even if the email button fails, this path always works) */
function decideRequestApi_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can decide' };
  var reqId = String(req.requestId || '');
  if (!reqId) return { ok: false, error: 'Request ID missing' };
  var decision = String(req.decision) === 'allow' ? 'APPROVED' : 'DENIED';
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    return decideRequest_(reqId, decision);
  } finally { lock.releaseLock(); }
}

/* All PENDING requests (old expired ones get marked along the way) */
function pendingRequests_() {
  var sh = sheets_().req;
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, REQ_HEADERS.length).getValues();
  var out = [];
  var now = Date.now();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][7]) !== 'PENDING') continue;
    var ts = new Date(vals[i][6]).getTime();
    if (now - ts > APPROVAL_TTL_MS) {
      sh.getRange(i + 2, 8).setValue('EXPIRED');
      continue;
    }
    out.push({
      reqId: String(vals[i][0]), uid: String(vals[i][2]), name: String(vals[i][3]),
      email: String(vals[i][4]), contact: String(vals[i][5]), ts: ts
    });
  }
  out.reverse(); // newest on top
  return out;
}

/* ---------- Welcome email - Cybersecurity SOC-style alert ----------
   Table-based + inline styles so it renders correctly in Gmail/Outlook/
   Apple Mail. "Thanks, you have now joined NexTalk." is always visible. */
function sendWelcomeEmail_(name, email) {
  try {
    var now = new Date();
    var tz = Session.getScriptTimeZone() || 'GMT';
    var stamp = Utilities.formatDate(now, tz, "yyyy-MM-dd HH:mm:ss '('zzz')'");
    // Alert reference ID - a professional SOC touch
    var ref = 'CP-' + Utilities.formatDate(now, tz, 'yyyyMMdd') + '-' +
              String(Math.floor(Math.random() * 900000) + 100000);
    var safeName = String(name || 'User').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    var subject = '\uD83D\uDEE1 NexTalk Security Alert - Identity Enrolled [' + ref + ']';

    // ---- Plain-text fallback (for clients that block HTML) ----
    var plain =
      'NEXTALK - SECURITY OPERATIONS CENTER\n' +
      '========================================\n' +
      'STATUS: ACCESS GRANTED\n\n' +
      'Hi ' + name + ',\n\n' +
      'Thanks, you have now joined NexTalk.\n\n' +
      'Your secure identity has been enrolled and this device session is now\n' +
      'being monitored by the NexTalk security layer. All chats, files and\n' +
      'screenshots you share are transmitted over an encrypted channel.\n\n' +
      'ALERT DETAILS\n' +
      '  Event      : New identity enrolled / sign-in verified\n' +
      '  Account    : ' + name + '\n' +
      '  Reference  : ' + ref + '\n' +
      '  Timestamp  : ' + stamp + '\n' +
      '  Result     : SUCCESS - no threats detected\n\n' +
      'SECURITY TIPS\n' +
      '  - Never share your entry password or login password with anyone.\n' +
      '  - If this action was not performed by you, change your password immediately.\n' +
      '  - Avoid uploading sensitive files on public wifi.\n\n' +
      'This is an automated security notification - no reply is needed.\n' +
      '(c) NexTalk Security Operations Center';

    // ---- HTML (SOC alert card) ----
    var html =
'<!DOCTYPE html><html><body style="margin:0;padding:0;background:#04060D;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04060D;padding:24px 12px;">' +
  '<tr><td align="center">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#070B14;border:1px solid #1B1740;border-radius:14px;overflow:hidden;font-family:Consolas,Menlo,monospace;">' +

    // Top bar
    '<tr><td style="background:#0F1526;border-bottom:1px solid #1E2740;padding:16px 22px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:15px;color:#C4B5FD;letter-spacing:2px;font-weight:bold;">&#128737; NEXTALK</td>' +
        '<td align="right" style="font-size:10px;color:#7C5CFF;letter-spacing:2px;">SECURITY OPERATIONS CENTER</td>' +
      '</tr></table>' +
    '</td></tr>' +

    // Status banner
    '<tr><td style="background:#1B1740;border-bottom:1px solid #3B2F7A;padding:14px 22px;">' +
      '<span style="display:inline-block;background:#7C5CFF;color:#070B14;font-size:11px;font-weight:bold;letter-spacing:1px;padding:4px 12px;border-radius:20px;">&#9679; ACCESS GRANTED</span>' +
      '<span style="color:#A78BFA;font-size:13px;letter-spacing:1px;margin-left:10px;">NEW IDENTITY ENROLLED</span>' +
    '</td></tr>' +

    // Body
    '<tr><td style="padding:24px 22px;">' +
      '<p style="margin:0 0 6px;color:#E6E9F2;font-size:14px;">Hi <b style="color:#C4B5FD;">' + safeName + '</b>,</p>' +
      '<p style="margin:0 0 18px;color:#F3F4FA;font-size:17px;line-height:1.5;font-weight:bold;">Thanks, you have now joined NexTalk.</p>' +
      '<p style="margin:0 0 20px;color:#8A93AB;font-size:12.5px;line-height:1.7;">' +
        'Your secure identity has been enrolled. This device session is now being monitored by the NexTalk security layer. ' +
        'All chats, files and screenshots you share are transmitted over an <span style="color:#5DCAA5;">encrypted channel</span>.' +
      '</p>' +

      // Alert details table
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F1526;border:1px solid #1E2740;border-radius:10px;">' +
        '<tr><td style="padding:12px 16px 6px;color:#7C5CFF;font-size:10px;letter-spacing:2px;border-bottom:1px solid #1E2740;">&#9656; ALERT DETAILS</td></tr>' +
        '<tr><td style="padding:10px 16px;">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#E6E9F2;">' +
            _emailRow_('Event', 'New identity enrolled / sign-in verified') +
            _emailRow_('Account', safeName) +
            _emailRow_('Reference', ref) +
            _emailRow_('Timestamp', stamp) +
            '<tr><td style="padding:5px 0;color:#8A93AB;width:110px;">Result</td>' +
            '<td style="padding:5px 0;color:#A78BFA;font-weight:bold;">SUCCESS &mdash; no threats detected</td></tr>' +
          '</table>' +
        '</td></tr>' +
      '</table>' +

      // Security tips
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#161433;border:1px solid #3B2F7A;border-radius:10px;">' +
        '<tr><td style="padding:12px 16px;">' +
          '<div style="color:#A78BFA;font-size:10px;letter-spacing:2px;margin-bottom:8px;">&#128274; SECURITY ADVISORY</div>' +
          '<div style="color:#B7B3D9;font-size:12px;line-height:1.8;">' +
            '&bull; Never share your entry / login password with anyone.<br>' +
            '&bull; If this sign-in was not you, change your password immediately.<br>' +
            '&bull; Avoid uploading sensitive files on public wifi.' +
          '</div>' +
        '</td></tr>' +
      '</table>' +

    '</td></tr>' +

    // Footer
    '<tr><td style="background:#0B1020;border-top:1px solid #1E2740;padding:16px 22px;text-align:center;">' +
      '<div style="color:#5C6580;font-size:10.5px;line-height:1.6;">' +
        'This is an automated security notification &mdash; no reply is needed.<br>' +
        '&copy; NexTalk &bull; Security Operations Center' +
      '</div>' +
    '</td></tr>' +

  '</table>' +
  '</td></tr>' +
'</table></body></html>';

    MailApp.sendEmail({ to: email, subject: subject, body: plain, htmlBody: html, name: 'NexTalk Security' });
  } catch (err) {
    // Even if the email fails (daily quota exhausted / invalid email),
    // signup/login will NOT be blocked - just log the error.
    console.error('Welcome email failed: ' + String(err));
  }
}

// Small helper to build one row of the alert details
function _emailRow_(label, value) {
  return '<tr>' +
    '<td style="padding:5px 0;color:#8A93AB;width:110px;vertical-align:top;">' + label + '</td>' +
    '<td style="padding:5px 0;color:#E6E9F2;">' + String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</td>' +
  '</tr>';
}

/* ---------- LOGIN with ADMIN APPROVAL ----------
   Flow:
   1. Correct credentials -> create a PENDING request + email the admin
   2. The frontend keeps polling 'login_status'
   3. Admin presses GRANT in the email -> APPROVED -> user gets in
      Presses DENY or lets it time out -> user sees a "permission denied" popup */
function login_(req) {
  var email = String(req.email || '').trim().toLowerCase();
  var pass = String(req.password || '');
  var users = usersAll_();
  var u = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].email !== email) continue;
    if (!checkPw_(pass, users[i].password)) continue;
    u = users[i];
    // Silent upgrade: an old plaintext row becomes a hash the moment it is used
    if (!isHashed_(u.password)) {
      try { sheets_().adm.getRange(u.row, 6).setValue(makeHash_(pass)); } catch (e) {}
      _usersMemo = null; // v29.4: Admin_Data changed
    }
    break;
  }
  if (!u) {
    var c = CacheService.getScriptCache();
    var k = 'cp_lf_' + String(req.dev || 'x').slice(0, 30);
    var n = Number(c.get(k) || 0) + 1;
    c.put(k, String(n), 900);
    secLog_('LOGIN_FAIL', n >= 3 ? 'HIGH' : 'LOW', req,
      'Failed login for "' + email + '", attempt #' + n, null);
    return { ok: false, error: 'Email or password is incorrect' };
  }

  // v27.1: blocked account - password sahi ho tab bhi andar nahi
  if (u.acct === 'BLOCKED' || isBlockedIdentity_(u.email, u.contact)) {
    try { blockDevice_(String(req.dev || ''), 'Blocked account ' + u.id + ' tried to log in'); } catch (e) {}
    secLog_('BLOCKED_ACCOUNT_ATTEMPT', 'HIGH', req, 'Blocked account tried to log in', u);
    return { ok: false, error: 'Your access to NexTalk has been revoked by the administrator', blocked: true };
  }

  // The admin logging in themselves needs no approval - straight in
  if (u.isAdmin) {
    sendWelcomeEmail_(u.name, u.email);
    secLog_('ADMIN_LOGIN', 'LOW', req, 'Admin signed in', u);
    return { ok: true, user: publicUser_(u), token: newSession_(u, req) };
  }

  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    // do NOT send the user object yet - it is handed over only after approval
    var reqId = requestApproval_(u, req.appUrl, req);
    return { ok: true, pending: true, requestId: reqId };
  } finally { lock.releaseLock(); }
}

/* The frontend polls this every 3 seconds */
function loginStatus_(req) {
  var reqId = String(req.requestId || '');
  if (!reqId) return { ok: false, error: 'Request ID missing' };
  var sh = sheets_().req;
  var row = findRequestRow_(sh, reqId);
  if (!row) return { ok: true, status: 'DENIED' }; // no request at all -> no entry
  var status = String(row.vals[7]);
  // Expire an old pending request
  if (status === 'PENDING') {
    var reqTs = new Date(row.vals[6]).getTime();
    if (Date.now() - reqTs > APPROVAL_TTL_MS) {
      sh.getRange(row.rowNum, 8).setValue('EXPIRED');
      status = 'EXPIRED';
    }
  }
  if (status === 'APPROVED') {
    var u = findUser_(String(row.vals[2]));
    if (!u) return { ok: true, status: 'DENIED' };
    if (u.acct === 'BLOCKED') return { ok: false, error: 'Your access to NexTalk has been revoked by the administrator', blocked: true };
    try {
      var bound = CacheService.getScriptCache().get('cp_reqdev_' + reqId);
      if (bound && String(req.dev || '') !== bound) {
        secLog_('APPROVAL_HIJACK_ATTEMPT', 'CRITICAL', req,
          'Request ' + reqId + ' was created on device ' + bound + ' but claimed elsewhere', u);
        return { ok: true, status: 'DENIED' };
      }
    } catch (e) {}
    return { ok: true, status: 'APPROVED', user: publicUser_(u), token: newSession_(u, req) };
  }
  if (status === 'PENDING') return { ok: true, status: 'PENDING' };
  return { ok: true, status: 'DENIED' }; // DENIED or EXPIRED - neither one gets in
}

/* ---------- Approval email - SOC-style, with GRANT/DENY buttons ---------- */
function sendApprovalEmail_(u, reqId, token, appUrl) {
  try {
    var to = adminEmail_();
    if (!to) { console.error('Admin email not set'); return; }
    // Working /exec URL - resolved with 3-level priority (never /dev)
    var base = execUrl_(appUrl);
    if (!base) {
      // No web app URL found (rare) - still send the admin the details
      MailApp.sendEmail({
        to: to,
        subject: 'NexTalk - Login Approval Required: ' + u.name + ' [' + reqId + ']',
        body: 'A user is requesting login approval:\n\nName: ' + u.name + '\nEmail: ' + u.email +
              '\nContact: ' + u.contact + '\n\nTo approve, open the "Login_Requests" tab of the Google Sheet\nand set the Status of request (' + reqId + ') to "APPROVED".',
        name: 'NexTalk Security'
      });
      return;
    }
    var allowUrl = base + '?approve=' + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) + '&decision=allow';
    var denyUrl  = base + '?approve=' + encodeURIComponent(reqId) + '&token=' + encodeURIComponent(token) + '&decision=deny';
    var tz = Session.getScriptTimeZone() || 'GMT';
    var stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss '('zzz')'");
    var safeName = esc_(u.name), safeEmail = esc_(u.email);

    var subject = '\uD83D\uDD10 NexTalk - Login Approval Required: ' + u.name + ' [' + reqId + ']';

    var plain =
      'NEXTALK - LOGIN APPROVAL REQUIRED\n' +
      '=====================================\n\n' +
      'A user wants to log in to the app. Without your permission they cannot get in.\n\n' +
      'REQUEST DETAILS\n' +
      '  Name      : ' + u.name + '\n' +
      '  Email     : ' + u.email + '\n' +
      '  Contact   : ' + u.contact + '\n' +
      '  User ID   : ' + u.id + '\n' +
      '  Time      : ' + stamp + '\n\n' +
      'GRANT ACCESS  -> ' + allowUrl + '\n' +
      'DENY ACCESS   -> ' + denyUrl + '\n\n' +
      'This request expires automatically in ' + Math.round(APPROVAL_TTL_MS / 60000) + ' minutes.\n' +
      '(c) NexTalk Security Operations Center';

    var html =
'<!DOCTYPE html><html><body style="margin:0;padding:0;background:#04060D;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04060D;padding:24px 12px;">' +
  '<tr><td align="center">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#070B14;border:1px solid #1B1740;border-radius:14px;overflow:hidden;font-family:Consolas,Menlo,monospace;">' +
    '<tr><td style="background:#0F1526;border-bottom:1px solid #1E2740;padding:16px 22px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:15px;color:#C4B5FD;letter-spacing:2px;font-weight:bold;">&#128737; NEXTALK</td>' +
        '<td align="right" style="font-size:10px;color:#7C5CFF;letter-spacing:2px;">SECURITY OPERATIONS CENTER</td>' +
      '</tr></table>' +
    '</td></tr>' +
    '<tr><td style="background:#2a1d0e;border-bottom:1px solid #6b4a1f;padding:14px 22px;">' +
      '<span style="display:inline-block;background:#d8b34a;color:#070B14;font-size:11px;font-weight:bold;letter-spacing:1px;padding:4px 12px;border-radius:20px;">&#9888; ACTION REQUIRED</span>' +
      '<span style="color:#d8b34a;font-size:13px;letter-spacing:1px;margin-left:10px;">LOGIN APPROVAL PENDING</span>' +
    '</td></tr>' +
    '<tr><td style="padding:24px 22px;">' +
      '<p style="margin:0 0 18px;color:#F3F4FA;font-size:16px;line-height:1.5;font-weight:bold;">A user wants to enter your app.</p>' +
      '<p style="margin:0 0 20px;color:#8A93AB;font-size:12.5px;line-height:1.7;">Please verify the details below. The user can only log in once you press <b style="color:#C4B5FD;">GRANT ACCESS</b>.</p>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F1526;border:1px solid #1E2740;border-radius:10px;">' +
        '<tr><td style="padding:12px 16px 6px;color:#7C5CFF;font-size:10px;letter-spacing:2px;border-bottom:1px solid #1E2740;">&#9656; REQUEST DETAILS</td></tr>' +
        '<tr><td style="padding:10px 16px;">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#E6E9F2;">' +
            _emailRow_('Name', safeName) +
            _emailRow_('Email', safeEmail) +
            _emailRow_('Contact', u.contact) +
            _emailRow_('User ID', u.id) +
            _emailRow_('Reference', reqId) +
            _emailRow_('Device ID', String(u.dev || '\u2014')) +
            _emailRow_('Platform', String(u.plat || '\u2014')) +
            _emailRow_('Screen', String(u.scr || '\u2014')) +
            _emailRow_('Timezone', String(u.tz || '\u2014')) +
            _emailRow_('Browser', String(u.ua || '\u2014').slice(0, 150)) +
            _emailRow_('Timestamp', stamp) +
          '</table>' +
        '</td></tr>' +
      '</table>' +
      // GRANT / DENY buttons
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr>' +
        '<td align="center" style="padding:0 6px;">' +
          '<a href="' + allowUrl + '" style="display:block;background:#7C5CFF;color:#070B14;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:1px;padding:14px 10px;border-radius:10px;">&#10004; GRANT ACCESS</a>' +
        '</td>' +
        '<td align="center" style="padding:0 6px;">' +
          '<a href="' + denyUrl + '" style="display:block;background:#3a1518;color:#ff7b7b;border:1px solid #e05d5d;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:1px;padding:13px 10px;border-radius:10px;">&#10008; DENY ACCESS</a>' +
        '</td>' +
      '</tr></table>' +
      '<p style="margin:18px 0 0;color:#5C6580;font-size:11px;text-align:center;">This request expires automatically in ' + Math.round(APPROVAL_TTL_MS / 60000) + ' minutes.</p>' +
    '</td></tr>' +
    '<tr><td style="background:#0B1020;border-top:1px solid #1E2740;padding:16px 22px;text-align:center;">' +
      '<div style="color:#5C6580;font-size:10.5px;line-height:1.6;">Automated approval request &mdash; these buttons are meant only for you, please do not forward them.<br>&copy; NexTalk &bull; Security Operations Center</div>' +
    '</td></tr>' +
  '</table>' +
  '</td></tr>' +
'</table></body></html>';

    MailApp.sendEmail({ to: to, subject: subject, body: plain, htmlBody: html, name: 'NexTalk Security' });
  } catch (err) {
    console.error('Approval email failed: ' + String(err));
  }
}

function findUser_(id) {
  var users = usersAll_();
  for (var i = 0; i < users.length; i++) if (users[i].id === id) return users[i];
  return null;
}

/* ---------- Presence (Active/Deactive) ---------- */
function presenceMap_() {
  var raw = CacheService.getScriptCache().get('cp_presence');
  return raw ? JSON.parse(raw) : {};
}

function heartbeat_(userId) {
  if (!userId) return;
  var cache = CacheService.getScriptCache();
  var map = presenceMap_();
  map[userId] = Date.now();
  cache.put('cp_presence', JSON.stringify(map), 600);
  // Sheet write throttle: write only once every 40 sec
  if (!cache.get('cp_pw_' + userId)) {
    cache.put('cp_pw_' + userId, '1', 40);
    var u = findUser_(userId);
    if (u) {
      var adm = sheets_().adm;
      var now = new Date();
      adm.getRange(u.row, 8).setValue(now);       // Last_Active
      _usersMemo = null; // v29.4: Admin_Data changed
      adm.getRange(u.row, 12).setValue('ACTIVE'); // Status
      _usersMemo = null; // v29.4: Admin_Data changed
      adm.getRange(u.row, 13).setValue(now);      // Last_Seen
      _usersMemo = null; // v29.4: Admin_Data changed
    }
  }
}

function statusOf_(u, map) {
  var ts = map[u.id] || u.lastSeen || 0;
  return (Date.now() - ts) < ONLINE_WINDOW_MS ? 'ACTIVE' : 'DEACTIVE';
}

/* ---------- Typing ---------- */
function typing_(req) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('cp_typing');
  var map = raw ? JSON.parse(raw) : {};
  map[req.userId] = { name: req.name, ts: Date.now() };
  cache.put('cp_typing', JSON.stringify(map), 30);
  return { ok: true };
}

function typingNames_(exceptId) {
  var raw = CacheService.getScriptCache().get('cp_typing');
  if (!raw) return [];
  var map = JSON.parse(raw), out = [], now = Date.now();
  for (var id in map) {
    if (id !== exceptId && (now - map[id].ts) < 4500) out.push(map[id].name);
  }
  return out;
}

/* ---------- App_Data helpers ---------- */
function logApp_(type, u, msg, fname, ftype, flink) {
  sheets_().app.appendRow([new Date(), type, u.id, u.name, u.contact, u.email, msg, fname, ftype, flink]);
  if (type === 'MESSAGE') msgsCacheClear_();
}

function bump_(userId, col) { // col 9 = messages, 10 = uploads
  var u = findUser_(userId);
  if (!u) return;
  var adm = sheets_().adm;
  var cur = Number(adm.getRange(u.row, col).getValue()) || 0;
  adm.getRange(u.row, col).setValue(cur + 1);
  _usersMemo = null; // v29.4: Admin_Data changed
}

/* v29.4 SPEED: the Everyone chat is identical for all users, so the last 200
   messages are cached for 2 s in CacheService - 20 users polling = 1 sheet
   read instead of 20. Every send/delete clears the cache. */
var MSGS_CACHE_KEY = 'cp_msgs_v294';
function msgsCacheClear_() { try { CacheService.getScriptCache().remove(MSGS_CACHE_KEY); } catch (e) {} }
function messages_(limit) {
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var hit = cache.get(MSGS_CACHE_KEY);
    if (hit) { var arr = JSON.parse(hit); return arr.length > limit ? arr.slice(arr.length - limit) : arr; }
  } catch (e) {}
  var fresh = messagesLoad_(200);
  try { var js = JSON.stringify(fresh); if (cache && js.length < 95000) cache.put(MSGS_CACHE_KEY, js, 2); } catch (e) {}
  return fresh.length > limit ? fresh.slice(fresh.length - limit) : fresh;
}
function messagesLoad_(limit) {
  var app = sheets_().app;
  var last = app.getLastRow();
  if (last < 2) return [];
  var vals = app.getRange(2, 1, last - 1, 10).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (String(r[1]) !== 'MESSAGE') continue;
    out.push({
      ts: new Date(r[0]).getTime(), uid: String(r[2]), name: String(r[3]),
      contact: String(r[4]), text: String(r[6])
    });
  }
  if (out.length > limit) out = out.slice(out.length - limit);
  return out;
}

/* ---------- Chat ---------- */
function send_(req) {
  var u = findUser_(req.userId);
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var text = String(req.text || '').trim();
  if (!text) return { ok: false, error: 'Empty message' };
  logApp_('MESSAGE', u, text, '', '', '');
  bump_(u.id, 9);
  heartbeat_(u.id);
  // PUSH NOTIFICATION - to everyone except the sender, even if their app is closed.
  // Wrapped in try/catch so that a push problem can never block the CHAT.
  try {
    var lbl = dmLabel_(text);
    var px = lbl.length > 120 ? lbl.slice(0, 117) + '...' : lbl;
    sendPushAll_(u.id, { t: 'MSG', n: u.name, x: px });
  } catch (e) { console.error('Push failed: ' + String(e)); }
  return { ok: true };
}

function updates_(req) {
  // If the user has been deleted, tell them - so the app can log them out
  var me = findUser_(String(req.userId));
  if (req.userId && !me) {
    return { ok: false, removed: true, error: 'Your account has been removed by the admin' };
  }
  heartbeat_(req.userId);
  // Always drain call signals (ring/accept/offer/answer/end) - this is the single reader
  var signals = sigDrain_(String(req.userId));

  // light=1 -> only essential data during a call (skipping messages = fast + lightweight)
  if (String(req.light) === '1') {
    return { ok: true, signals: signals };
  }

  var map = presenceMap_();
  var users = usersAll_();
  var online = 0;
  for (var i = 0; i < users.length; i++) if (statusOf_(users[i], map) === 'ACTIVE') online++;
  return {
    ok: true,
    messages: messages_(200),
    typing: typingNames_(req.userId),
    online: online,
    total: users.length,
    signals: signals,
    // v16: PERSONAL CHAT - list + unread + (khule thread ke) messages, ek hi poll me
    dm: me ? dmForPoll_(me.id, String(req.dmPeer || ''), users, map) : null,
    // v29: custom groups - my group list (+ messages of the open group, if grp was sent)
    groups: me ? grpForPoll_(me.id, String(req.grp || ''), users) : null,
    // The admin gets the count of pending login requests on every poll
    pendingCount: (me && me.isAdmin) ? pendingRequests_().length : 0
  };
}

/* ================================================================
   v16: PERSONAL CHAT (WhatsApp-style 1-to-1) - DM_Data sheet
   ----------------------------------------------------------------
   Principles wahi purane: LIVE scan (no cache), append = chronological,
   read-mark is idempotent, and nothing is ever deleted here (only the admin can).
   ================================================================ */

/* Scan the whole DM sheet once (live) */
var _dmMemo = null;   // v29.4 SPEED: DM sheet read once per request
function dmAll_() {
  if (_dmMemo) return _dmMemo;
  _dmMemo = dmLoad_();
  return _dmMemo;
}
function dmLoad_() {
  var sh = sheets_().dm;
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, DM_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (String(r[1]) === '') continue;
    out.push({
      row: i + 2,
      ts: new Date(r[0]).getTime(),
      from: String(r[1]), fromName: String(r[2]),
      to: String(r[3]), toName: String(r[4]),
      text: String(r[5]),
      read: String(r[6]) === 'YES'
    });
  }
  return out;
}

/* Send a personal message -> save to the sheet + push ONLY to the recipient */
/* v21: PERSONAL ATTACHMENTS
   Attachment message = '[[CP]]' + JSON  (stored directly in Message_Text,
   so the sheet structure does not need to change). Push and previews
   show a friendly label instead of the raw JSON. */
function dmLabel_(text) {
  if (String(text).indexOf('[[CP]]') !== 0) return String(text);
  var a = null;
  try { a = JSON.parse(String(text).slice(6)); } catch (e) { return 'Attachment'; }
  if (!a || !a.k) return 'Attachment';
  if (a.k === 'img') return '\ud83d\udcf7 Photo';
  if (a.k === 'ai') return '\ud83e\ude84 AI image';
  if (a.k === 'doc') return '\ud83d\udcc4 ' + String(a.f || 'Document');
  if (a.k === 'aud') return '\ud83c\udfa4 Voice message';
  if (a.k === 'loc') return '\ud83d\udccd Location';
  if (a.k === 'con') return '\ud83d\udc64 Contact: ' + String(a.n || '');
  if (a.k === 'poll') return '\ud83d\udcca Poll: ' + String(a.q || '');
  if (a.k === 'ev') return '\ud83d\udcc5 Event: ' + String(a.t || '');
  return '\ud83d\udcce Attachment';
}

/* v21: PRIVATE file upload for DMs - saved to Drive, but NOT logged in
   the group uploads list (App_Data), and no group push is sent. The push
   goes only to the recipient, at dm_send time. */
function dmUpload_(req) {
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  if (!req.data) return { ok: false, error: 'File data not received - please try again' };
  var b64 = String(req.data).replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); }
  catch (e) { return { ok: false, error: 'File data is corrupted (decode failed) - please try again' }; }
  if (bytes.length > 16 * 1024 * 1024) return { ok: false, error: 'File is larger than 15 MB - please try a smaller one' };
  var blob = Utilities.newBlob(bytes, req.mime || 'application/octet-stream', req.filename || 'file');
  var file;
  try { file = folder_().createFile(blob); }
  catch (e) { return { ok: false, error: 'Could not save to Drive: ' + String(e) }; }
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  heartbeat_(u.id);
  var fid = file.getId();
  return {
    ok: true, id: fid,
    url: 'https://drive.google.com/uc?export=download&id=' + fid,
    // v26: the URL that actually renders inline in an <img> tag
    thumb: 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w1000'
  };
}

/* ================================================================
   v26: MEDIA STREAMING - the guaranteed way to play/show a file
   ----------------------------------------------------------------
   Google Drive's "uc?export=download" link does NOT render inside an
   <img> tag and does NOT stream inside an <audio> tag - it answers
   with a redirect/HTML interstitial instead of raw bytes. That is why
   photos showed a broken icon and voice messages would not play.
   This endpoint returns the raw bytes as base64; the frontend turns
   them into a Blob URL, which always works on every browser.
   SAFETY: only files that actually live in the NexTalk upload
   folder can be fetched, so this can never be used to read other
   files from the script owner's Drive.
   ================================================================ */
function media_(req) {
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var id = String(req.id || '').trim();
  if (!id) return { ok: false, error: 'File id is missing' };
  var file;
  try { file = DriveApp.getFileById(id); }
  catch (e) { return { ok: false, error: 'File not found (it may have been deleted)' }; }
  // Only serve files that belong to this app
  var inFolder = false;
  try {
    var ps = file.getParents();
    while (ps.hasNext()) { if (ps.next().getName() === DRIVE_FOLDER) { inFolder = true; break; } }
  } catch (e) {}
  if (!inFolder) return { ok: false, error: 'This file is not part of NexTalk' };
  var blob, bytes;
  try { blob = file.getBlob(); bytes = blob.getBytes(); }
  catch (e) { return { ok: false, error: 'Could not read the file' }; }
  if (bytes.length > 9 * 1024 * 1024) return { ok: false, error: 'File is too large to open in the chat' };
  return {
    ok: true,
    mime: blob.getContentType() || 'application/octet-stream',
    name: file.getName(),
    b64: Utilities.base64Encode(bytes)
  };
}

/* ================================================================
   v22: ADMIN - PERSONAL CHAT MODERATION
   The admin can view every personal message of any user, delete them
   one by one, or wipe that user's ENTIRE personal chat history in
   a single action.
   Deletes always use LIVE SCAN + bottom-to-top + LockService -
   cached row numbers are never trusted (standard safety rule).
   ================================================================ */
function adminDmList_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can view personal chats' };
  var target = String(req.target || '');
  if (!target) return { ok: false, error: 'No user selected' };
  var sh = sheets_().dm;
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, DM_HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var f = String(vals[i][1]), t = String(vals[i][3]);
      if (f !== target && t !== target) continue;
      out.push({
        ts: new Date(vals[i][0]).getTime(),
        from: f, fromName: String(vals[i][2]),
        to: t, toName: String(vals[i][4]),
        text: String(vals[i][5])
      });
    }
  }
  out.sort(function (a, b) { return a.ts - b.ts; });
  var total = out.length;
  if (out.length > 400) out = out.slice(out.length - 400); // safety cap - latest 400
  return { ok: true, msgs: out, total: total };
}

function adminDmDel_(req) {
  _dmMemo = null;
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can delete personal messages' };
  var ts = Number(req.ts || 0);
  var from = String(req.from || ''), to = String(req.to || '');
  if (!ts || !from || !to) return { ok: false, error: 'Could not identify the message - refresh the list and try again' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var sh = sheets_().dm;
    var last = sh.getLastRow();
    if (last < 2) return { ok: false, error: 'Message not found (it may already have been deleted)' };
    var vals = sh.getRange(2, 1, last - 1, DM_HEADERS.length).getValues();
    for (var i = vals.length - 1; i >= 0; i--) { // bottom-to-top
      if (String(vals[i][1]) !== from) continue;
      if (String(vals[i][3]) !== to) continue;
      if (new Date(vals[i][0]).getTime() !== ts) continue;
      sh.deleteRow(i + 2);
      SpreadsheetApp.flush();
      return { ok: true, deleted: 1 };
    }
    return { ok: false, error: 'Message not found (it may already have been deleted)' };
  } finally { lock.releaseLock(); }
}

function adminDmWipe_(req) {
  _dmMemo = null;
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can delete personal chats' };
  var target = String(req.target || '');
  if (!target) return { ok: false, error: 'No user selected' };
  var lock = LockService.getScriptLock(); lock.tryLock(15000);
  try {
    var sh = sheets_().dm;
    var last = sh.getLastRow();
    if (last < 2) return { ok: true, deleted: 0 };
    var vals = sh.getRange(2, 1, last - 1, DM_HEADERS.length).getValues();
    var rows = [];
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][1]) === target || String(vals[i][3]) === target) rows.push(i + 2);
    }
    rows.sort(function (a, b) { return b - a; }); // bottom-to-top delete
    for (var k = 0; k < rows.length; k++) sh.deleteRow(rows[k]);
    SpreadsheetApp.flush();
    return { ok: true, deleted: rows.length };
  } finally { lock.releaseLock(); }
}

function dmSend_(req) {
  _dmMemo = null;
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var to = findUser_(String(req.to || ''));
  if (!to) return { ok: false, error: 'This user no longer exists (the admin may have removed them)' };
  if (to.id === u.id) return { ok: false, error: 'You cannot send a message to yourself' };
  var text = String(req.text || '').trim();
  if (!text) return { ok: false, error: 'Empty message' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    sheets_().dm.appendRow([new Date(), u.id, u.name, to.id, to.name, text, '']);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  bump_(u.id, 9);
  heartbeat_(u.id);
  // TARGETED push - not to everyone like the group, ONLY to the recipient.
  // Wrapped in try/catch so that a push problem can never block the CHAT.
  try {
    var lbl = dmLabel_(text);
    var px = lbl.length > 120 ? lbl.slice(0, 117) + '...' : lbl;
    sendPushToUser_(to.id, 'cp-dm', { t: 'DM', n: u.name, x: px });
  } catch (e) { console.error('DM push failed: ' + String(e)); }
  return { ok: true };
}

/* All messages between me and the peer (both directions), in time order.
   markRead=true -> mark the messages addressed to me as Read=YES. */
function dmBetween_(meId, peerId, markRead) {
  var all = dmAll_();
  var out = [], toMark = [];
  for (var i = 0; i < all.length; i++) {
    var m = all[i];
    var mine = (m.from === meId && m.to === peerId);
    var theirs = (m.from === peerId && m.to === meId);
    if (!mine && !theirs) continue;
    if (theirs && !m.read && markRead) { toMark.push(m.row); m.read = true; }
    out.push({ ts: m.ts, from: m.from, fromName: m.fromName, text: m.text, read: m.read });
  }
  if (toMark.length) {
    var sh = sheets_().dm;
    for (var j = 0; j < toMark.length; j++) sh.getRange(toMark[j], 7).setValue('YES');
    if (toMark.length) _dmMemo = null;
  }
  if (out.length > 200) out = out.slice(out.length - 200);
  return out;
}

/* Instant load when a thread is opened (no waiting for the next poll) */
function dmList_(req) {
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var peerId = String(req.peer || '');
  if (!peerId) return { ok: false, error: 'Peer missing' };
  heartbeat_(u.id);
  return { ok: true, list: dmBetween_(u.id, peerId, true) };
}

/* Sent along with every poll:
   threads     = WhatsApp-style chat list (each user + last msg + unread + status)
   unreadTotal = for the badge on the Chat tab
   latest      = the newest INCOMING dm (for the notification/sound)
   msgs        = messages of the open thread (if dmPeer was sent; also marks read) */
function dmForPoll_(meId, peerId, users, map) {
  var all = dmAll_();
  var per = {};   // peer id -> {lastTs, lastText, lastMine, unread}
  var latest = null;
  var msgs = peerId ? [] : null;
  var toMark = [];
  for (var i = 0; i < all.length; i++) {
    var m = all[i];
    var mine = (m.from === meId), forMe = (m.to === meId);
    if (!mine && !forMe) continue;
    var peer = mine ? m.to : m.from;
    var e = per[peer] || (per[peer] = { lastTs: 0, lastText: '', lastMine: false, unread: 0 });
    if (m.ts >= e.lastTs) { e.lastTs = m.ts; e.lastText = m.text; e.lastMine = mine; }
    if (forMe && !m.read) {
      if (peer === peerId) { toMark.push(m.row); m.read = true; } // khula thread -> read
      else e.unread++;
    }
    if (forMe && (!latest || m.ts >= latest.ts)) latest = { ts: m.ts, from: m.from, fromName: m.fromName, text: m.text };
    if (peerId && (peer === peerId)) msgs.push({ ts: m.ts, from: m.from, fromName: m.fromName, text: m.text, read: m.read });
  }
  if (toMark.length) {
    var sh = sheets_().dm;
    for (var j = 0; j < toMark.length; j++) sh.getRange(toMark[j], 7).setValue('YES');
    if (toMark.length) _dmMemo = null;
  }
  if (msgs && msgs.length > 200) msgs = msgs.slice(msgs.length - 200);
  var threads = [], unreadTotal = 0;
  for (var k = 0; k < users.length; k++) {
    var u = users[k];
    if (u.id === meId) continue;
    var d = per[u.id] || { lastTs: 0, lastText: '', lastMine: false, unread: 0 };
    unreadTotal += d.unread;
    threads.push({
      id: u.id, name: u.name, contact: u.contact, status: statusOf_(u, map),
      lastTs: d.lastTs, lastText: d.lastText, lastMine: d.lastMine, unread: d.unread
    });
  }
  // WhatsApp order: people you have talked to first (newest first), then by name
  threads.sort(function (a, b) {
    if (a.lastTs !== b.lastTs) return b.lastTs - a.lastTs;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  return { threads: threads, unreadTotal: unreadTotal, latest: latest, msgs: msgs };
}

/* ---------- Call signaling (a small relay for WebRTC) ----------
   Each user has an "inbox" in CacheService: cp_sig_<userId>
   The sender pushes a signal into the inbox, and the receiver drains it
   in their updates poll. Single reader (updates_) -> no race conditions. */
function sigInboxKey_(id) { return 'cp_sig_' + id; }

function sigPush_(toId, obj) {
  var lock = LockService.getScriptLock(); lock.tryLock(5000);
  try {
    var cache = CacheService.getScriptCache();
    var key = sigInboxKey_(toId);
    var raw = cache.get(key);
    var arr = raw ? JSON.parse(raw) : [];
    arr.push(obj);
    if (arr.length > 25) arr = arr.slice(arr.length - 25); // overflow guard
    cache.put(key, JSON.stringify(arr), 120); // 2 min TTL
  } finally { lock.releaseLock(); }
}

function sigDrain_(id) {
  if (!id) return [];
  var lock = LockService.getScriptLock(); lock.tryLock(5000);
  try {
    var cache = CacheService.getScriptCache();
    var key = sigInboxKey_(id);
    var raw = cache.get(key);
    if (!raw) return [];
    cache.remove(key);
    return JSON.parse(raw);
  } finally { lock.releaseLock(); }
}

function sigSend_(req) {
  var from = findUser_(String(req.userId));
  if (!from) return { ok: false, error: 'User not found - please log in again' };
  var to = String(req.to || '');
  if (!to) return { ok: false, error: 'Target user missing' };
  var sig;
  try { sig = (typeof req.sig === 'string') ? JSON.parse(req.sig) : req.sig; }
  catch (e) { return { ok: false, error: 'Signal parse failed' }; }
  if (!sig || typeof sig !== 'object') return { ok: false, error: 'Signal is empty' };
  // Set the 'from' fields server-side (to prevent spoofing)
  sig.from = from.id;
  sig.fromName = from.name;
  sig.fromContact = from.contact;
  sig.ts = Date.now();
  sigPush_(to, sig);
  /* v17: INCOMING CALL PUSH - the person being called gets an instant
     push on their device (a WhatsApp-style "Incoming call" notification),
     even when the app is closed. The ring info is kept in cache so that
     worker push_peek se poochhe to use CALL event mile. */
  if (String(sig.type) === 'ring') {
    try {
      CacheService.getScriptCache().put('cp_ring_' + to, JSON.stringify({
        name: from.name,
        kind: (String(sig.kind) === 'video' ? 'video' : 'voice'),
        ts: Date.now()
      }), 60); // the ring is remembered for 60 sec - stale after that
      sendPushToUser_(to, 'cp-call', {
        t: 'CALL', n: from.name, c: from.contact, f: from.id, r: String(sig.room || ''),
        k: (String(sig.kind) === 'video' ? 'video' : 'voice')
      });
    } catch (e) { console.error('Call push failed: ' + String(e)); }
  }
  return { ok: true };
}

/* ---------- Roster (for the call picker - all users + status) ---------- */
function roster_(req) {
  var me = findUser_(String(req.userId));
  if (!me) return { ok: false, error: 'User not found - please log in again' };
  var map = presenceMap_();
  var users = usersAll_();
  var out = [];
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.id === me.id) continue; // do not show yourself in the list
    out.push({ id: u.id, name: u.name, contact: u.contact, status: statusOf_(u, map) });
  }
  return { ok: true, users: out };
}

/* ---------- Uploads (Screenshots + Files) ---------- */
function folder_() {
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER);
}

function upload_(req) {
  var u = findUser_(req.userId);
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var kind = req.kind === 'SCREENSHOT' ? 'SCREENSHOT' : 'FILE';
  if (!req.data) return { ok: false, error: 'File data not received - please try again' };
  // In form-encoding '+' becomes a space - fix it back, and normalize url-safe chars
  var b64 = String(req.data).replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
  var bytes;
  try {
    bytes = Utilities.base64Decode(b64);
  } catch (err) {
    return { ok: false, error: 'File data is corrupted (decode failed) - please try again' };
  }
  var blob = Utilities.newBlob(bytes, req.mime || 'application/octet-stream', req.filename || 'upload');
  var file;
  try {
    file = folder_().createFile(blob);
  } catch (err) {
    return { ok: false, error: 'Could not save to Drive: ' + String(err) };
  }
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Link-sharing is disabled on some accounts - the upload will still stay saved
  }
  var id = file.getId();
  var link = 'https://drive.google.com/uc?export=download&id=' + id;
  logApp_(kind, u, '', req.filename, req.mime, link);
  bump_(u.id, 10);
  heartbeat_(u.id);
  // PUSH NOTIFICATION - like messages, an UPLOAD now also notifies everyone
  // sent to everyone except the uploader, even if their app is closed.
  // Wrapped in try/catch so that a push problem can never block the UPLOAD.
  try {
    sendPushAll_(u.id, { t: (kind === 'SCREENSHOT' ? 'SHOT' : 'FILE'), n: u.name, f: String(req.filename || '') });
  } catch (e) { console.error('Push failed: ' + String(e)); }
  return { ok: true, id: id };
}

function uploadsList_(req) {
  var kind = req.kind === 'SCREENSHOT' ? 'SCREENSHOT' : 'FILE';
  var app = sheets_().app;
  var last = app.getLastRow();
  var out = [];
  if (last >= 2) {
    var vals = app.getRange(2, 1, last - 1, 10).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (String(r[1]) !== kind) continue;
      var link = String(r[9]);
      var m = link.match(/id=([\w-]+)/);
      out.push({
        ts: new Date(r[0]).getTime(), name: String(r[3]), contact: String(r[4]),
        filename: String(r[7]), mime: String(r[8]), link: link,
        img: m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w600' : ''
      });
    }
  }
  out.reverse(); // newest on top
  return { ok: true, list: out };
}

/* ---------- Admin panel ---------- */
function requireAdmin_(userId) {
  var u = findUser_(userId);
  if (u && u.isAdmin) return u;
  /* v27: a non-admin reaching an admin endpoint is a real attack signal,
     not a UI accident - the app never shows those buttons to them. */
  try {
    secLog_('PRIVILEGE_ESCALATION', 'CRITICAL', { userId: userId },
      'Non-admin called an admin-only endpoint', u);
  } catch (e) {}
  return null;
}

function adminData_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can access this' };
  var map = presenceMap_();
  var users = usersAll_().map(function (u) {
    return {
      id: u.id, name: u.name, contact: u.contact, email: u.email,
      join: u.join, lastActive: u.lastActive, messages: u.messages,
      uploads: u.uploads, isAdmin: u.isAdmin, status: statusOf_(u, map)
    };
  });
  var app = sheets_().app;
  var counts = { messages: 0, shots: 0, files: 0 };
  var last = app.getLastRow();
  if (last >= 2) {
    var types = app.getRange(2, 2, last - 1, 1).getValues();
    for (var i = 0; i < types.length; i++) {
      var t = String(types[i][0]);
      if (t === 'MESSAGE') counts.messages++;
      else if (t === 'SCREENSHOT') counts.shots++;
      else if (t === 'FILE') counts.files++;
    }
  }
  return {
    ok: true, users: users, counts: counts,
    /* v27 fix: password ab HASH me store hota hai - hash dikhana bekar hai.
       Hashed ho to friendly text bhejo, purana plaintext ho to wahi dikhao. */
    appPassword: isHashed_(appPassword_()) ? '•••••• (set — hidden for security)' : appPassword_(),
    messages: messages_(100),
    pending: pendingRequests_()
  };
}

function adminPassword_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can change the password' };
  var np = String(req.newPassword || '').trim();
  if (np.length < 4) return { ok: false, error: 'Password must be at least 4 characters' };
  sheets_().adm.getRange('A2').setValue(makeHash_(np));
  bioKeysWipe_();   // v29.4: new entry password -> Face ID / fingerprint keys reset, everyone types it once
  _usersMemo = null; // v29.4: Admin_Data changed
  secLog_('ENTRY_PASSWORD_CHANGED', 'LOW', req, 'Admin changed the app entry password', null);
  return { ok: true };
}

function removeUser_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can remove a user' };
  var targetId = String(req.targetId || '');
  if (!targetId) return { ok: false, error: 'No user selected' };
  if (targetId === req.userId) return { ok: false, error: 'You cannot remove your own account' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    // Do not trust cached row numbers - live-scan the sheet at delete time.
    // (Earlier, stale/duplicate row indexes caused the wrong row or no row to be deleted)
    var adm = sheets_().adm;
    var last = adm.getLastRow();
    if (last < 2) return { ok: false, error: 'User not found' };
    var ids = adm.getRange(2, 2, last - 1, 1).getValues(); // Column B = User_ID
    var rowsToDelete = [];
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === targetId) rowsToDelete.push(i + 2);
    }
    if (rowsToDelete.length === 0) return { ok: false, error: 'User not found' };
    // Delete from bottom to top so row numbers do not shift
    for (var j = rowsToDelete.length - 1; j >= 0; j--) {
      adm.deleteRow(rowsToDelete[j]);
      _usersMemo = null; // v29.4: Admin_Data changed
    }
    SpreadsheetApp.flush();
    // Verify: this ID should no longer exist in the sheet
    if (findUser_(targetId)) return { ok: false, error: 'Delete failed - please try again' };
    try { killSessionsOf_(targetId); } catch (e) {}
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* v27.2: bulk remove - several users in ONE call (select all + delete selected).
   Same rules as removeUser_: live scan, bottom-to-top delete, never yourself. */
function removeUsers_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can remove users' };
  var ids = req.targetIds;
  if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch (e) { ids = String(ids).split(','); } }
  if (!ids || !ids.length) return { ok: false, error: 'No users selected' };
  var want = {};
  for (var k = 0; k < ids.length; k++) {
    var t = String(ids[k] || '').trim();
    if (t && t !== req.userId) want[t] = true;   // never your own account
  }
  if (!Object.keys(want).length) return { ok: false, error: 'No users selected' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var adm = sheets_().adm;
    var last = adm.getLastRow();
    if (last < 2) return { ok: false, error: 'Users not found' };
    var vals = adm.getRange(2, 2, last - 1, 10).getValues(); // B..K  (User_ID .. Is_Admin)
    var rows = [], removedIds = {};
    for (var i = 0; i < vals.length; i++) {
      var id = String(vals[i][0]);
      if (!want[id]) continue;
      if (String(vals[i][9]) === 'YES') continue;             // never delete an admin row
      rows.push(i + 2); removedIds[id] = true;
    }
    if (!rows.length) return { ok: false, error: 'Users not found' };
    for (var j = rows.length - 1; j >= 0; j--) adm.deleteRow(rows[j]);
    _usersMemo = null; // v29.4: Admin_Data changed
    SpreadsheetApp.flush();
    Object.keys(removedIds).forEach(function (uid) { try { killSessionsOf_(uid); } catch (e) {} });
    try { CacheService.getScriptCache().remove('cp_presence'); } catch (e) {}
    return { ok: true, removed: Object.keys(removedIds).length };
  } finally { lock.releaseLock(); }
}

/* ---------- Admin deletes: chats + uploads ----------
   Same principle as removeUser_: never trust a cached row number -
   LIVE scan the sheet at delete time, and delete rows bottom-to-top
   so the numbering does not shift. */

// Ek message delete - identify by (timestamp + user id)
function delMessage_(req) {
  msgsCacheClear_();
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can delete' };
  var ts = Number(req.ts || 0), uid = String(req.uid || '');
  if (!ts || !uid) return { ok: false, error: 'Could not identify the message' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var app = sheets_().app;
    var last = app.getLastRow();
    if (last < 2) return { ok: false, error: 'Message not found' };
    var vals = app.getRange(2, 1, last - 1, 3).getValues(); // Timestamp, Type, User_ID
    var rows = [];
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][1]) !== 'MESSAGE') continue;
      if (String(vals[i][2]) !== uid) continue;
      var rts = new Date(vals[i][0]).getTime();
      if (Math.abs(rts - ts) < 2000) rows.push(i + 2); // 2 sec window - sheet ka ms rounding cover
    }
    if (!rows.length) return { ok: false, error: 'Message not found (it may already have been deleted)' };
    for (var j = rows.length - 1; j >= 0; j--) app.deleteRow(rows[j]);
    SpreadsheetApp.flush();
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// Delete a screenshot/file - both the sheet record and the real Drive file
function delUpload_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can delete' };
  var fid = String(req.fileId || '').trim();
  if (!fid) return { ok: false, error: 'Could not identify the file' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var app = sheets_().app;
    var last = app.getLastRow();
    var rows = [];
    if (last >= 2) {
      var vals = app.getRange(2, 1, last - 1, 10).getValues();
      for (var i = 0; i < vals.length; i++) {
        var t = String(vals[i][1]);
        if (t !== 'SCREENSHOT' && t !== 'FILE') continue;
        if (String(vals[i][9]).indexOf(fid) > -1) rows.push(i + 2); // File_Link me id match
      }
    }
    for (var j = rows.length - 1; j >= 0; j--) app.deleteRow(rows[j]);
    SpreadsheetApp.flush();
    // Remove the file from Drive too (it goes to the trash - recoverable for 30 days)
    try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) { /* fine if the file was already deleted */ }
    if (!rows.length) return { ok: false, error: 'Record not found (it may already have been deleted)' };
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// Clear all chat messages at once (leaves uploads untouched)
function delAllChats_(req) {
  msgsCacheClear_();
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Only the admin can delete' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var app = sheets_().app;
    var last = app.getLastRow();
    if (last < 2) return { ok: true, deleted: 0 };
    var types = app.getRange(2, 2, last - 1, 1).getValues();
    var rows = [];
    for (var i = 0; i < types.length; i++) {
      if (String(types[i][0]) === 'MESSAGE') rows.push(i + 2);
    }
    for (var j = rows.length - 1; j >= 0; j--) app.deleteRow(rows[j]);
    SpreadsheetApp.flush();
    return { ok: true, deleted: rows.length };
  } finally { lock.releaseLock(); }
}

/* ================================================================
   WEB PUSH NOTIFICATIONS - notifications even when the app is CLOSED!
   ================================================================
   How it works (the same system WhatsApp uses):
   1. The browser creates a "push subscription" (the frontend does this)
      and it is stored in the Push_Subs sheet via 'save_sub' here.
   2. When someone sends a message -> send_() -> sendPushAll_() sends a
      subscriber ke push service (Google FCM / Mozilla) ko ek signed
      signed request to every subscriber's push service (Google FCM / Mozilla).
   3. The push service WAKES the service worker on the user's device
      - even with the app/tab closed - and sw.js shows the notification
      (sender ka naam + message text, 'push_peek' se laakar).

   VAPID SIGNING: Web Push requires an ES256 (ECDSA P-256) signature,
   which Apps Script does NOT provide built-in - so it is implemented
   below in pure JavaScript (BigInt). The keys are generated
   automatically on first use (and stored in Script Properties) -
   you never have to generate or paste anything manually.
   ================================================================ */

/* ---------- P-256 curve constants ---------- */
var EC_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
var EC_A = EC_P - BigInt(3);
var EC_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
var EC_GX = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
var EC_GY = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');

/* ---------- BigInt / byte helpers ---------- */
function ecMod_(a, m) { a %= m; return a < BigInt(0) ? a + m : a; }

function ecInv_(a, m) { // modular inverse (extended Euclid)
  a = ecMod_(a, m);
  var lm = BigInt(1), hm = BigInt(0), low = a, high = m;
  while (low > BigInt(1)) {
    var q = high / low;
    var nm = hm - lm * q, nw = high - low * q;
    hm = lm; lm = nm; high = low; low = nw;
  }
  return ecMod_(lm, m);
}

function bnFromBytes_(u) { // unsigned byte array -> BigInt
  var x = BigInt(0);
  for (var i = 0; i < u.length; i++) x = (x << BigInt(8)) + BigInt(u[i]);
  return x;
}

function bnToBytes_(x, len) { // BigInt -> unsigned byte array (fixed length)
  var out = new Array(len);
  for (var i = len - 1; i >= 0; i--) { out[i] = Number(x & BigInt(255)); x >>= BigInt(8); }
  return out;
}

function sgnBytes_(u) { return u.map(function (v) { return v > 127 ? v - 256 : v; }); }  // 0..255 -> -128..127 (Apps Script Byte[])
function unsBytes_(s) { return s.map(function (v) { return v < 0 ? v + 256 : v; }); }    // Byte[] -> 0..255

function b64uBytes_(u) { return Utilities.base64EncodeWebSafe(sgnBytes_(u)).replace(/=+$/, ''); }
function b64uStr_(s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ''); }

function hmac256_(keyU, msgU) { // HMAC-SHA256 on unsigned arrays
  return unsBytes_(Utilities.computeHmacSha256Signature(sgnBytes_(msgU), sgnBytes_(keyU)));
}

/* ---------- Elliptic curve point math (affine) ---------- */
function ecDbl_(P) {
  if (!P) return null;
  if (P.y === BigInt(0)) return null;
  var l = ecMod_((BigInt(3) * P.x * P.x + EC_A) * ecInv_(BigInt(2) * P.y, EC_P), EC_P);
  var x = ecMod_(l * l - BigInt(2) * P.x, EC_P);
  var y = ecMod_(l * (P.x - x) - P.y, EC_P);
  return { x: x, y: y };
}

function ecAdd_(P, Q) {
  if (!P) return Q;
  if (!Q) return P;
  if (P.x === Q.x) {
    if (ecMod_(P.y + Q.y, EC_P) === BigInt(0)) return null; // point at infinity
    return ecDbl_(P);
  }
  var l = ecMod_((Q.y - P.y) * ecInv_(ecMod_(Q.x - P.x, EC_P), EC_P), EC_P);
  var x = ecMod_(l * l - P.x - Q.x, EC_P);
  var y = ecMod_(l * (P.x - x) - P.y, EC_P);
  return { x: x, y: y };
}

function ecMul_(k, P) { // double-and-add scalar multiplication
  var R = null, A = P;
  while (k > BigInt(0)) {
    if (k & BigInt(1)) R = ecAdd_(R, A);
    A = ecDbl_(A);
    k >>= BigInt(1);
  }
  return R;
}

/* ---------- ECDSA sign with RFC 6979 deterministic nonce ----------
   (A deterministic k means no random number generator is needed,
   and the classic ECDSA nonce-reuse mistake becomes impossible.) */
function ecdsaSign_(z, d) {
  var zn = ecMod_(z, EC_N);
  var x = bnToBytes_(d, 32);
  var hz = bnToBytes_(zn, 32);
  var V = [], K = [];
  for (var i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = hmac256_(K, V.concat([0], x, hz));
  V = hmac256_(K, V);
  K = hmac256_(K, V.concat([1], x, hz));
  V = hmac256_(K, V);
  for (var guard = 0; guard < 64; guard++) {
    V = hmac256_(K, V);
    var k = bnFromBytes_(V);
    if (k >= BigInt(1) && k < EC_N) {
      var P = ecMul_(k, { x: EC_GX, y: EC_GY });
      if (P) {
        var r = ecMod_(P.x, EC_N);
        if (r !== BigInt(0)) {
          var s = ecMod_(ecInv_(k, EC_N) * ecMod_(zn + ecMod_(r * d, EC_N), EC_N), EC_N);
          if (s !== BigInt(0)) return { r: r, s: s };
        }
      }
    }
    K = hmac256_(K, V.concat([0]));
    V = hmac256_(K, V);
  }
  throw new Error('ECDSA sign failed');
}

/* ---------- VAPID keys - generated AUTOMATICALLY on first use ---------- */
function vapidKeys_() {
  var props = PropertiesService.getScriptProperties();
  var pub = props.getProperty('CP_VAPID_PUB');
  var priv = props.getProperty('CP_VAPID_PRIV');
  if (pub && priv) return { pub: pub, priv: priv };
  // Entropy: kai random UUIDs + time -> SHA-256 -> private key d
  var seed = '';
  for (var i = 0; i < 8; i++) seed += Utilities.getUuid();
  seed += '|' + Date.now() + '|' + Math.random();
  var dBytes = unsBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed));
  var d = ecMod_(bnFromBytes_(dBytes), EC_N - BigInt(1)) + BigInt(1); // 1 <= d < n
  var Q = ecMul_(d, { x: EC_GX, y: EC_GY });
  var pubBytes = [4].concat(bnToBytes_(Q.x, 32), bnToBytes_(Q.y, 32)); // uncompressed point
  pub = b64uBytes_(pubBytes);
  priv = b64uBytes_(bnToBytes_(d, 32));
  props.setProperty('CP_VAPID_PUB', pub);
  props.setProperty('CP_VAPID_PRIV', priv);
  return { pub: pub, priv: priv };
}

/* ---------- VAPID JWT (per push-service, 5 ghante cache) ---------- */
function vapidJwt_(aud, keys) {
  var cache = CacheService.getScriptCache();
  var ck = 'cp_jwt_' + b64uStr_(aud);
  var hit = cache.get(ck);
  if (hit) return hit;
  var header = b64uStr_(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  var claims = b64uStr_(JSON.stringify({
    aud: aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:' + (adminEmail_() || 'admin@example.com')
  }));
  var input = header + '.' + claims;
  var hash = bnFromBytes_(unsBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input)));
  var d = bnFromBytes_(Utilities.base64DecodeWebSafe(keys.priv).map(function (v) { return v < 0 ? v + 256 : v; }));
  var sig = ecdsaSign_(hash, d);
  var jwt = input + '.' + b64uBytes_(bnToBytes_(sig.r, 32).concat(bnToBytes_(sig.s, 32)));
  cache.put(ck, jwt, 5 * 3600); // the JWT is valid 12h, 5h cache = safe margin
  return jwt;
}

/* ---------- API: hand the VAPID public key to the frontend ---------- */
function pushKey_(req) {
  try { return { ok: true, key: vapidKeys_().pub }; }
  catch (e) { return { ok: false, error: String(e) }; }
}

/* ---------- API: subscription save/update (upsert by endpoint) ---------- */
function saveSub_(req) {
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var ep = String(req.endpoint || '');
  if (ep.indexOf('https://') !== 0) return { ok: false, error: 'Invalid endpoint' };
  var keys = {};
  try { keys = JSON.parse(req.keys || '{}'); } catch (e) {}
  var dev = String(req.dev || '').trim();
  var sig = pushSig_(req);
  var isApple = ep.indexOf('push.apple.com') > -1;
  var oldEp = String(req.oldEndpoint || '');
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var sh = sheets_().push;
    pushHeadersFix_(sh);
    var last = sh.getLastRow();
    /* ============================================================
       v29.2 - ONE SUBSCRIPTION PER PHONE (iOS "3 notifications" fix)
       ------------------------------------------------------------
       Every time an iPhone re-adds the app to the home screen (or the
       browser rotates the subscription) a NEW endpoint appears while the
       OLD ones stay alive on Apple's push service for a long time. One
       message -> one push per row -> 2-3 notifications on the same phone.
       So when a device saves its subscription we DELETE every other row
       that belongs to the SAME physical device:
         - same endpoint            (plain re-save -> update in place)
         - same Device id           (same browser storage, new endpoint)
         - same Signature + Apple   (same iPhone after a reinstall)
         - the endpoint the app told us it just unsubscribed (oldEndpoint)
         - legacy Apple rows without a Device id (pre-v29.2 duplicates)
       Other phones of the same user keep their own row.
       ============================================================ */
    if (last >= 2) {
      var vals = sh.getRange(2, 1, last - 1, PUSH_HEADERS.length).getValues();
      var dead = [], updatedRow = 0;
      for (var i = 0; i < vals.length; i++) {
        var r = vals[i], rowEp = String(r[2]), rowDev = String(r[6] || ''), rowSig = String(r[7] || '');
        var rowApple = rowEp.indexOf('push.apple.com') > -1;
        if (rowEp === ep) { updatedRow = i + 2; continue; }
        if (String(r[0]) !== u.id) continue;                         // other users: never touched
        if (oldEp && rowEp === oldEp) { dead.push(i + 2); continue; }
        if (dev && rowDev && rowDev === dev) { dead.push(i + 2); continue; }
        if (isApple && rowApple && sig && rowSig && rowSig === sig) { dead.push(i + 2); continue; }
        if (isApple && rowApple && !rowDev) { dead.push(i + 2); continue; }
      }
      dead.sort(function (a, b) { return b - a; });                  // bottom-to-top delete
      for (var d = 0; d < dead.length; d++) { sh.deleteRow(dead[d]); if (updatedRow && dead[d] < updatedRow) updatedRow--; }
      if (updatedRow) {
        sh.getRange(updatedRow, 1, 1, PUSH_HEADERS.length)
          .setValues([[u.id, u.name, ep, String(keys.p256dh || ''), String(keys.auth || ''), new Date(), dev, sig]]);
        return { ok: true, updated: true, removed: dead.length };
      }
    }
    sh.appendRow([u.id, u.name, ep, String(keys.p256dh || ''), String(keys.auth || ''), new Date(), dev, sig]);
    return { ok: true, removed: 0 };
  } finally { lock.releaseLock(); }
}

/* Device signature = what stays the same on one phone even after the app is
   re-added to the home screen (new storage = new Device id): UA + screen + tz. */
function pushSig_(req) {
  var ua = String(req.ua || '').replace(/\s+/g, ' ').slice(0, 160);
  if (!ua) return '';
  return ua + '|' + String(req.scr || '') + '|' + String(req.tz || '');
}
/* Older sheets have 6 header cells - add the two new ones in place. */
function pushHeadersFix_(sh) {
  try {
    if (String(sh.getRange(1, 7).getValue()) !== 'Device') {
      sh.getRange(1, 7, 1, 2).setValues([['Device', 'Signature']]).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD');
    }
  } catch (e) {}
}

/* ---------- API: the service worker asks "what is the latest event?" ----------
   It used to look only for MESSAGE - now SCREENSHOT and FILE too.
   Whichever event is NEWEST (message/screenshot/file) is returned,
   together with the name + filename, so the notification can show
   who uploaded what. */
function pushPeek_(req) {
  var uid = String(req.userId || '');
  /* v17: if this user was called JUST NOW (within 45 sec), show the
     CALL in the notification first - messages come after. */
  if (uid) {
    try {
      var rraw = CacheService.getScriptCache().get('cp_ring_' + uid);
      if (rraw) {
        var ring = JSON.parse(rraw);
        if (ring && ring.ts && (Date.now() - ring.ts) < 45000) {
          return { ok: true, msg: {
            type: 'CALL',
            name: String(ring.name || 'Someone'),
            kind: String(ring.kind || 'voice'),
            text: (String(ring.kind) === 'video' ? 'Incoming video call' : 'Incoming voice call'),
            ts: ring.ts
          } };
        }
      }
    } catch (e) {}
  }
  // Group ka latest event (message/screenshot/file)
  var grp = null;
  var app = sheets_().app;
  var last = app.getLastRow();
  if (last >= 2) {
    var vals = app.getRange(2, 1, last - 1, 10).getValues();
    for (var i = vals.length - 1; i >= 0 && !grp; i--) { // scan from the bottom = newest first
      var t = String(vals[i][1]);
      if (t === 'MESSAGE') {
        grp = { type: 'MESSAGE', name: String(vals[i][3]), text: dmLabel_(String(vals[i][6])), ts: new Date(vals[i][0]).getTime() };
      } else if (t === 'SCREENSHOT' || t === 'FILE') {
        var fname = String(vals[i][7] || '');
        grp = {
          type: t, name: String(vals[i][3]), file: fname,
          // 'text' is a fallback for older service workers (backward compatible)
          text: (t === 'SCREENSHOT' ? 'Screenshot upload kiya: ' : 'File upload ki: ') + fname,
          ts: new Date(vals[i][0]).getTime()
        };
      }
    }
  }
  // v16: the latest INCOMING personal message for this device's user
  // (arrives as the uid query param at SW registration time)
  var dm = null;
  if (uid) {
    var sh = sheets_().dm;
    var dLast = sh.getLastRow();
    if (dLast >= 2) {
      var dv = sh.getRange(2, 1, dLast - 1, DM_HEADERS.length).getValues();
      for (var j = dv.length - 1; j >= 0; j--) { // bottom = newest
        if (String(dv[j][3]) !== uid) continue;  // only dms addressed to me
        dm = { type: 'DM', name: String(dv[j][2]), text: dmLabel_(String(dv[j][5])), ts: new Date(dv[j][0]).getTime() };
        break;
      }
    }
  }
  // Whichever one is newer is what the notification shows
  var msg = null;
  if (grp && dm) msg = (dm.ts >= grp.ts) ? dm : grp;
  else msg = dm || grp;
  return { ok: true, msg: msg };
}

/* ---------- All subscribers ---------- */
function pushSubs_() {
  var sh = sheets_().push;
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, PUSH_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var ep = String(vals[i][2]);
    if (ep.indexOf('https://') !== 0) continue;
    out.push({ row: i + 2, uid: String(vals[i][0]), endpoint: ep, p256: String(vals[i][3] || ''), auth: String(vals[i][4] || ''),
      savedAt: vals[i][5] ? new Date(vals[i][5]).getTime() : 0, dev: String(vals[i][6] || ''), sig: String(vals[i][7] || '') });
  }
  /* v29.2: even if duplicate rows exist, send ONE push per physical device:
     same endpoint -> once; same user+Device -> newest only;
     same user+Signature on Apple -> newest only. */
  var byKey = {};
  for (var k = 0; k < out.length; k++) {
    var sub = out[k], keys = ['ep:' + sub.endpoint];
    if (sub.dev) keys.push('dev:' + sub.uid + '|' + sub.dev);
    if (sub.sig && sub.endpoint.indexOf('push.apple.com') > -1) keys.push('sig:' + sub.uid + '|' + sub.sig);
    sub._keys = keys;
    for (var x = 0; x < keys.length; x++) {
      var prev = byKey[keys[x]];
      if (!prev || sub.savedAt >= prev.savedAt) byKey[keys[x]] = sub;
    }
  }
  var dedup = [];
  for (var m = 0; m < out.length; m++) {
    var sb = out[m], keep = true;
    for (var y = 0; y < sb._keys.length; y++) if (byKey[sb._keys[y]] !== sb) { keep = false; break; }
    if (keep) dedup.push(sb);
  }
  return dedup;
}


/* ================================================================
   v19: WEB PUSH PAYLOAD ENCRYPTION (RFC 8291 / aes128gcm)
   ----------------------------------------------------------------
   iOS/Safari ka push service (web.push.apple.com) bina ENCRYPTED
   payload at all - which is exactly why push worked on Android
   (FCM accepts empty pushes) but never arrived on iPhone.
   Now the notification content (name + text) is encrypted and
   travels INSIDE the push - it gets delivered on iOS, and Android
   benefits too: the service worker no longer has to call the backend,
   so the correct name/text appears the instant the push arrives.
   Crypto: ECDH (P-256, the same EC math used for VAPID) + HKDF-SHA256
   (Utilities HMAC) + AES-128-GCM (implemented in pure JS below).
   ================================================================ */

var AES_SBOX = [
  99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,
  202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,
  183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,
  4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,
  9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,
  83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,
  208,239,170,251,67,77,51,133,69,249,2,127,80,60,159,168,
  81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,210,
  205,12,19,236,95,151,68,23,196,167,126,61,100,93,25,115,
  96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,
  224,50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,
  231,200,55,109,141,213,78,169,108,86,244,234,101,122,174,8,
  186,120,37,46,28,166,180,198,232,221,116,31,75,189,139,138,
  112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,158,
  225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,
  140,161,137,13,191,230,66,104,65,153,45,15,176,84,187,22
];

function aesXt_(b) { b = b << 1; if (b & 256) b = b ^ 283; return b & 255; } // xtime: GF(2^8) me x2

function aesExpandKey_(key) { // 16-byte key -> 176-byte round keys
  var w = key.slice(), rcon = 1;
  for (var i = 16; i < 176; i += 4) {
    var t = [w[i - 4], w[i - 3], w[i - 2], w[i - 1]];
    if (i % 16 === 0) {
      t = [AES_SBOX[t[1]] ^ rcon, AES_SBOX[t[2]], AES_SBOX[t[3]], AES_SBOX[t[0]]];
      rcon = aesXt_(rcon);
    }
    for (var j = 0; j < 4; j++) w.push(w[i - 16 + j] ^ t[j]);
  }
  return w;
}

function aesEncBlock_(w, inp) { // ek 16-byte block encrypt (AES-128, 10 rounds)
  var s = inp.slice(), r, i, c;
  for (i = 0; i < 16; i++) s[i] ^= w[i];
  for (r = 1; r <= 10; r++) {
    for (i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];               // SubBytes
    var t = s.slice();                                            // ShiftRows
    for (i = 0; i < 16; i++) s[i] = t[(i + 4 * ((i % 4))) % 16];
    if (r < 10) {                                                 // MixColumns
      for (c = 0; c < 16; c += 4) {
        var a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
        s[c]     = aesXt_(a0) ^ aesXt_(a1) ^ a1 ^ a2 ^ a3;
        s[c + 1] = a0 ^ aesXt_(a1) ^ aesXt_(a2) ^ a2 ^ a3;
        s[c + 2] = a0 ^ a1 ^ aesXt_(a2) ^ aesXt_(a3) ^ a3;
        s[c + 3] = aesXt_(a0) ^ a0 ^ a1 ^ a2 ^ aesXt_(a3);
      }
    }
    for (i = 0; i < 16; i++) s[i] ^= w[16 * r + i];               // AddRoundKey
  }
  return s;
}

/* GF(2^128) multiply (for GHASH) - via BigInt, MSB-first bits */
function gfMul128_(X, Y) {
  var R = BigInt('0xe1000000000000000000000000000000');
  var Z = BigInt(0), V = Y, one = BigInt(1);
  for (var i = 127; i >= 0; i--) {
    if ((X >> BigInt(i)) & one) Z = Z ^ V;
    if (V & one) V = (V >> one) ^ R; else V = V >> one;
  }
  return Z;
}

function ghash_(H, data) { // data length must be a multiple of 16
  var Y = BigInt(0);
  for (var i = 0; i < data.length; i += 16) {
    Y = gfMul128_(Y ^ bnFromBytes_(data.slice(i, i + 16)), H);
  }
  return Y;
}

/* AES-128-GCM encrypt (no AAD needed for web push) -> ciphertext+tag(16) */
function aesGcmEnc_(keyBytes, iv12, pt) {
  var w = aesExpandKey_(keyBytes);
  var zero16 = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  var H = bnFromBytes_(aesEncBlock_(w, zero16));
  var J0 = iv12.concat([0, 0, 0, 1]);
  var ctr = J0.slice(), ct = [], i, j;
  for (i = 0; i < pt.length; i += 16) {
    for (j = 15; j >= 12; j--) { ctr[j] = (ctr[j] + 1) & 255; if (ctr[j]) break; } // counter+1
    var ks = aesEncBlock_(w, ctr);
    for (j = 0; j < 16 && i + j < pt.length; j++) ct.push(pt[i + j] ^ ks[j]);
  }
  var pad = (16 - (ct.length % 16)) % 16, padArr = [];
  for (i = 0; i < pad; i++) padArr.push(0);
  var lenBlk = bnToBytes_(BigInt(0), 8).concat(bnToBytes_(BigInt(ct.length * 8), 8)); // aadBits=0, ctBits
  var S = ghash_(H, ct.concat(padArr, lenBlk));
  var ek = aesEncBlock_(w, J0);
  var tagBytes = bnToBytes_(S, 16);
  for (i = 0; i < 16; i++) ct.push(tagBytes[i] ^ ek[i]);
  return ct;
}

function strBytes_(str) { // UTF-8 string -> unsigned bytes (Hindi/emoji safe)
  return unsBytes_(Utilities.newBlob(str).getBytes());
}
function b64uDec_(str) { // base64url -> unsigned bytes (with padding fixed up)
  var padded = str + '==='.slice(0, (4 - (str.length % 4)) % 4);
  return unsBytes_(Utilities.base64DecodeWebSafe(padded));
}
function rand16_() { // 16 random bytes (salt)
  var seed = Utilities.getUuid() + '|' + Date.now() + '|' + Math.random() + '|' + Utilities.getUuid();
  return unsBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed)).slice(0, 16);
}
function ephKey_() { // one ephemeral EC keypair per push fanout
  var seed = Utilities.getUuid() + '|' + Date.now() + '|' + Math.random() + '|' + Utilities.getUuid();
  var db = unsBytes_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed));
  var d = ecMod_(bnFromBytes_(db), EC_N - BigInt(1)) + BigInt(1);
  var Q = ecMul_(d, { x: EC_GX, y: EC_GY });
  return { d: d, pub: [4].concat(bnToBytes_(Q.x, 32), bnToBytes_(Q.y, 32)) };
}

/* RFC 8291: plaintext -> the aes128gcm body that is POSTed to the push service */
function webPushEncrypt_(ptBytes, p256dhB64u, authB64u, eph) {
  var uaPub = b64uDec_(p256dhB64u);           // the browser public key (65 bytes, starts with 0x04)
  var auth = b64uDec_(authB64u);              // browser ka auth secret (16 bytes)
  if (uaPub.length !== 65 || uaPub[0] !== 4) throw new Error('Bad p256dh');
  if (auth.length !== 16) throw new Error('Bad auth');
  // ECDH shared secret (x-coordinate)
  var uaPoint = { x: bnFromBytes_(uaPub.slice(1, 33)), y: bnFromBytes_(uaPub.slice(33, 65)) };
  var S = ecMul_(eph.d, uaPoint);
  if (!S) throw new Error('ECDH failed');
  var ecdh = bnToBytes_(S.x, 32);
  // HKDF (RFC 8291 schedule)
  var prkKey = hmac256_(auth, ecdh);
  var keyInfo = strBytes_('WebPush: info').concat([0], uaPub, eph.pub, [1]);
  var ikm = hmac256_(prkKey, keyInfo);
  var salt = rand16_();
  var prk = hmac256_(salt, ikm);
  var cek = hmac256_(prk, strBytes_('Content-Encoding: aes128gcm').concat([0, 1])).slice(0, 16);
  var nonce = hmac256_(prk, strBytes_('Content-Encoding: nonce').concat([0, 1])).slice(0, 12);
  // Single record: plaintext + 0x02 delimiter, then GCM
  var ct = aesGcmEnc_(cek, nonce, ptBytes.concat([2]));
  // aes128gcm header: salt(16) | rs(4)=4096 | idlen(1)=65 | ephemeral pub(65) | ciphertext
  return salt.concat([0, 0, 16, 0], [65], eph.pub, ct);
}

/* ---------- MAIN: send a push to all devices (except the sender) ----------
   - All requests go out in PARALLEL (UrlFetchApp.fetchAll) = fast.
   - Payload-free push: the device's service worker wakes up and fetches
     the latest message itself via 'push_peek' to build the notification.
     (Which is why payload encryption is not strictly required there.)
   - 404/410 wale (uninstall/expired) subscriptions auto-delete. */
function sendPushAll_(exceptUserId, payload) {
  // Group event -> all subscribers (except the sender)
  pushFanout_(function (sub) { return sub.uid !== String(exceptUserId); }, 'cp-msg', payload || null);
}

/* v16: TARGETED push - a personal message goes ONLY to the recipient's devices.
   A separate Topic ('cp-dm' / 'cp-call') so that group, personal and call
   notifications never replace one another. */
function sendPushToUser_(targetUserId, topic, payload) {
  var codes = pushFanout_(function (sub) { return sub.uid === String(targetUserId); }, topic || 'cp-dm', payload || null);
  /* v18: remember the result of the last targeted push (for 6 hours) -
     the "Test push" button surfaces it, so during debugging you can see
     whether the personal push was actually sent and what the server said.
     201 = the push service accepted it. Empty = that user has no
     subscription at all (they must open the app and press ALLOW). */
  try {
    CacheService.getScriptCache().put('cp_plog_' + String(targetUserId), JSON.stringify({
      topic: String(topic || 'cp-dm'), codes: codes, ts: Date.now()
    }), 21600);
  } catch (e) {}
  return codes;
}

/* v17: DEBUG - a user can send a test push to their own devices to check
   whether the push pipeline is working. The response codes come back too
   (201 = the push service accepted it = everything is fine). */
function pushTest_(req) {
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var mine = pushSubs_().filter(function (x) { return x.uid === u.id; });
  if (!mine.length) {
    return { ok: false, error: 'No push subscription found for this account. Fix: allow notifications, close the app and reopen it (on iOS, first install it via Safari > Share > Add to Home Screen), then try again.' };
  }
  var codes = pushFanout_(function (x) { return x.uid === u.id; }, 'cp-test',
    { t: 'TEST', n: 'NexTalk', x: 'Test push successful' });
  // v18: when the last personal/call push went to this user, and what happened
  var lastPush = null;
  try {
    var lp = CacheService.getScriptCache().get('cp_plog_' + u.id);
    if (lp) lastPush = JSON.parse(lp);
  } catch (e) {}
  return { ok: true, sent: mine.length, codes: codes, lastPush: lastPush };
}

function pushFanout_(filterFn, topic, payloadObj) {
  var subs = pushSubs_();
  if (!subs.length) return [];
  var keys = vapidKeys_();
  /* v19: the notification content (name + text) is now ENCRYPTED and sent
     inside the push (RFC 8291) - without this, iOS does not deliver the
     push at all. One ephemeral keypair is enough for a whole fanout. */
  var payloadStr = '';
  var eph = null;
  /* v27: a unique id per push -> the service worker uses it as the notification
     tag, so message #2 no longer overwrites message #1 on the lock screen. */
  if (payloadObj) { payloadObj.i = String(Date.now()) + String(Math.floor(Math.random() * 900 + 100)); }
  if (payloadObj) {
    try { payloadStr = JSON.stringify(payloadObj); eph = ephKey_(); }
    catch (e) { payloadStr = ''; eph = null; console.error('Payload prep fail: ' + e); }
  }
  var reqs = [], meta = [], jwts = {};
  for (var i = 0; i < subs.length; i++) {
    var sub = subs[i];
    if (!filterFn(sub)) continue;
    var m = sub.endpoint.match(/^https:\/\/[^\/]+/);
    if (!m) continue;
    var aud = m[0];
    if (!jwts[aud]) {
      try { jwts[aud] = vapidJwt_(aud, keys); } catch (e) { console.error('JWT fail: ' + e); continue; }
    }
    var isApple = sub.endpoint.indexOf('push.apple.com') > -1;
    var hdrs = {
      'Authorization': 'vapid t=' + jwts[aud] + ', k=' + keys.pub,
      'TTL': '86400',      // if the device is offline the push service holds it for 24 hours
      'Urgency': 'high'
    };
    /* v27 FIX: a Topic makes the push service REPLACE a pending push with the
       same topic. That is exactly why only the last of several quick messages
       ever arrived. Topic is now used ONLY for calls (where collapsing IS
       wanted); every chat message travels with no topic and is delivered
       individually. */
    if (!isApple && topic && topic.indexOf('call') > -1) hdrs['Topic'] = topic;
    var body = '';
    if (payloadStr && eph && sub.p256 && sub.auth) {
      try {
        var enc = webPushEncrypt_(strBytes_(payloadStr), sub.p256, sub.auth, eph);
        hdrs['Content-Encoding'] = 'aes128gcm';
        body = Utilities.newBlob(sgnBytes_(enc)).setContentType('application/octet-stream');
      } catch (e) {
        console.error('Encrypt fail (' + sub.uid + '): ' + e);
        body = ''; // Android will still show a notification for an empty push
      }
    }
    reqs.push({
      url: sub.endpoint,
      method: 'post',
      headers: hdrs,
      payload: body,
      muteHttpExceptions: true
    });
    meta.push(sub);
  }
  if (!reqs.length) return [];
  var res;
  try { res = UrlFetchApp.fetchAll(reqs); }
  catch (e) { console.error('fetchAll fail: ' + e); return []; }
  // Remove dead subscriptions (404/410) from the sheet
  var dead = [], codes = [], errs = [];
  for (var j = 0; j < res.length; j++) {
    var code = res[j].getResponseCode();
    codes.push(code);
    if (code === 404 || code === 410) dead.push(meta[j].row);
    else if (code < 200 || code > 299) {
      var body = '';
      try { body = String(res[j].getContentText() || '').slice(0, 300); } catch (e) {}
      errs.push({ uid: meta[j].uid, code: code, body: body });
      console.error('PUSH ' + code + ' for ' + meta[j].uid + ': ' + body);
    }
  }
  /* v27: remember the last real failure so push_diag can explain it in plain words */
  if (errs.length) {
    try { CacheService.getScriptCache().put('cp_pusherr', JSON.stringify({ ts: Date.now(), errs: errs }), 21600); } catch (e) {}
  }
  if (dead.length) {
    var lock = LockService.getScriptLock(); lock.tryLock(5000);
    try {
      dead.sort(function (a, b) { return b - a; }); // bottom-to-top delete
      var sh = sheets_().push;
      for (var k = 0; k < dead.length; k++) sh.deleteRow(dead[k]);
    } finally { lock.releaseLock(); }
  }
  return codes;
}

/* ---------- TEST: RUN THIS ONCE after pasting new code ----------
   This generates the VAPID keys (if they do not exist yet), verifies
   them, and prints the subscriber count. The first run asks for Google
   authorization (for UrlFetchApp) - press Allow, otherwise push will
   never be sent! */
/* ================================================================
   v28.1 DIAGNOSTIC: Run this FIRST when "mail nahi aa raha".
   Apps Script editor -> function dropdown -> testSecurityEmail -> Run.
   - Pehli baar Google authorization popup aayega -> ALLOW karna zaroori hai.
   - Neeche Execution log me साफ likha aayega kya hua.
   Ye throttle/budget ko BYPASS karke seedha mail bhejta hai.
   ================================================================ */
function testSecurityEmail() {
  var to = adminEmail_();
  Logger.log('Admin email        : ' + (to || '(EMPTY! - ADMIN_EMAIL line 38 check karo)'));
  if (!to) return;
  var quota = -1;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { Logger.log('Quota check fail: ' + e); }
  Logger.log('Gmail quota left   : ' + quota + ' mails today');
  if (quota === 0) { Logger.log('FAIL: aaj ka Gmail quota khatam - kal try karo ya alag account.'); return; }
  try {
    MailApp.sendEmail({ to: to,
      subject: '\u2705 NexTalk TEST - security email working',
      body: 'Ye test email hai. Agar ye aapko mila hai to mail system 100% kaam kar raha hai.\n' +
            'Ab website par Ctrl+U / F12 dabane par bhi alert aayega.\n\nTime: ' + new Date(),
      name: 'NexTalk Security' });
    Logger.log('SENT \u2713  -> ' + to + '  (Inbox + SPAM folder dono check karo!)');
  } catch (e) {
    Logger.log('MAIL FAIL \u2717 : ' + e);
    Logger.log('Iska matlab: authorization Allow nahi hua hai, ya quota issue hai.');
  }
  // Bonus: alert budget ki current state bhi dikha do
  try {
    var raw = String(PropertiesService.getScriptProperties().getProperty('CP_ALERT_DAY') || '(empty)');
    Logger.log('Alert budget today : ' + raw + '  (cap = ' + ALERT_DAILY_CAP + ')');
  } catch (e) {}
}

/* Testing me baar-baar Ctrl+U dabaya aur 40/day cap ya 45s gap lag gaya?
   Ye function saara throttle + daily budget reset kar deta hai. */
function resetAlertBudget() {
  try { PropertiesService.getScriptProperties().deleteProperty('CP_ALERT_DAY'); } catch (e) {}
  Logger.log('Alert daily budget reset \u2713 (45s wale cache gaps khud 45s me khatam ho jayenge)');
}

function testPushSetup() {
  var keys = vapidKeys_();
  Logger.log('VAPID public key (auto-generated, the frontend fetches it itself):');
  Logger.log(keys.pub);
  // Signing self-test: build a JWT and verify that it does not crash
  var jwt = vapidJwt_('https://fcm.googleapis.com', keys);
  Logger.log('JWT signing: OK (' + jwt.length + ' chars)');
  var subs = pushSubs_();
  Logger.log('Push subscribers right now: ' + subs.length);
  Logger.log('');
  Logger.log('READY! Now: 1) Deploy this script again (New version),');
  Logger.log('2) host the new index.html + sw.js,');
  Logger.log('3) open the app and allow notifications - that is all.');
  Logger.log('(Every device with the app open will appear in the Push_Subs sheet.)');
}


/* ================================================================
   v27 SECURITY CORE  —  sessions, hashing, intrusion alerts
   ================================================================
   WHY THIS EXISTS
   ---------------
   Until v26 every API call was trusted if it simply carried a
   userId like "U002". Anyone who guessed an ID could read another
   person's private chats. v27 issues a random SESSION TOKEN on
   login and checks it on every single request.

   Also new here:
     - passwords are stored HASHED (SHA-256 + per-user salt)
     - every device that touches the app is registered + can be BLOCKED
     - suspicious activity is written to Security_Log AND emailed to you
     - per-device rate limiting
   ================================================================ */

var SESS_HEADERS = ['Token', 'User_ID', 'Device', 'Created', 'Last_Seen', 'User_Agent'];
var SEC_HEADERS  = ['Timestamp', 'Severity', 'Event', 'User_ID', 'Name', 'Device', 'Details', 'User_Agent', 'Emailed'];
var DEV_HEADERS  = ['Device_ID', 'User_ID', 'Name', 'Status', 'First_Seen', 'Last_Seen', 'Platform', 'Screen', 'Timezone', 'User_Agent', 'Hits'];

var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
var RATE_LIMIT_HITS = 160;  // max requests per device per minute (call setup polls at 750ms, so 90 was too tight)
var RATE_LIMIT_WIN  = 60;   // seconds
var ALERT_MIN_GAP_MS = 4 * 60 * 1000;  // same alert type: at most 1 mail / 4 min
var ALERT_DAILY_CAP  = 40;             // never burn the whole Gmail quota on alerts
/* v28.1: Inspect/DevTools/Ctrl+U/tamper alerts are PRIORITY — admin ko HAR
   attempt ka mail chahiye. Inke liye gap sirf 45s (spam-guard), 4 min nahi.
   Aur key me details bhi jaati hai, taaki Ctrl+U aur F12 alag-alag mail karein. */
var ALERT_PRIORITY_GAP_MS = 45 * 1000;
function alertPriority_(ev) {
  return /DEVTOOLS|CODE_TAMPER|SESSION_DEVICE_MISMATCH|BLOCKED_ACCOUNT_ATTEMPT/i.test(String(ev || ''));
}

/* Actions that are allowed WITHOUT a session token */
var OPEN_ACTIONS = {
  gate: 1, signup: 1, login: 1, login_status: 1, push_key: 1, sec_event: 1, ping: 1,
  gate_bio_register: 1, gate_bio: 1,   // v29.4: Face ID / fingerprint unlock of the entry gate
  sec_sorry: 1, sorry_status: 1   // v28: a BLOCKED device may only apologise + poll the decision
};

/* ---------- extra sheets ---------- */
function secSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function mk(name, headers, idx) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name, idx);
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold')
        .setBackground('#1B1740').setFontColor('#C4B5FD');
      sh.setFrozenRows(1);
    }
    return sh;
  }
  return {
    sess: mk('Sessions', SESS_HEADERS, 5),
    sec:  mk('Security_Log', SEC_HEADERS, 6),
    dev:  mk('Devices', DEV_HEADERS, 7)
  };
}

/* ---------- password hashing ---------- */
function hashPw_(pw, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(salt) + '|' + String(pw) + '|CyberPulse'); // NOTE: salt intentionally unchanged - changing it would break every existing password
  return Utilities.base64Encode(raw);
}
function makeHash_(pw) {
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  return 'sha256$' + salt + '$' + hashPw_(pw, salt);
}
/* Returns true if pw matches. Handles OLD plaintext rows transparently. */
function checkPw_(pw, stored) {
  stored = String(stored || '');
  if (stored.indexOf('sha256$') === 0) {
    var p = stored.split('$');
    if (p.length !== 3) return false;
    return hashPw_(pw, p[1]) === p[2];
  }
  return stored !== '' && stored === String(pw); // legacy plaintext
}
function isHashed_(stored) { return String(stored || '').indexOf('sha256$') === 0; }

/* One-time migration: turn every plaintext password in the sheet into a hash.
   Run this ONCE from the editor after pasting v27. Safe to run again. */
function migratePasswords() {
  var adm = sheets_().adm;
  var last = adm.getLastRow();
  var n = 0;
  for (var r = 2; r <= last; r++) {
    var cur = String(adm.getRange(r, 6).getValue());
    if (cur && !isHashed_(cur)) { adm.getRange(r, 6).setValue(makeHash_(cur)); n++; }
    _usersMemo = null; // v29.4: Admin_Data changed
  }
  var gate = String(adm.getRange('A2').getValue());
  if (gate && !isHashed_(gate)) { adm.getRange('A2').setValue(makeHash_(gate)); n++; }
  _usersMemo = null; // v29.4: Admin_Data changed
  SpreadsheetApp.flush();
  Logger.log('Hashed ' + n + ' password(s). Plaintext passwords are now GONE from the sheet.');
  Logger.log('Login still works exactly as before - only the stored form changed.');
}

/* ---------- devices ---------- */
function deviceRow_(devId) {
  if (!devId) return null;
  var sh = secSheets_().dev;
  var last = sh.getLastRow();
  if (last < 2) return null;
  var vals = sh.getRange(2, 1, last - 1, DEV_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === devId) return { rowNum: i + 2, vals: vals[i] };
  }
  return null;
}

function touchDevice_(req, user) {
  var devId = String(req.dev || '').trim();
  if (!devId) return null;
  var sh = secSheets_().dev;
  var row = deviceRow_(devId);
  var now = new Date();
  if (row) {
    sh.getRange(row.rowNum, 6).setValue(now);                                   // Last_Seen
    sh.getRange(row.rowNum, 11).setValue((Number(row.vals[10]) || 0) + 1);      // Hits
    if (user && String(row.vals[1]) !== user.id) {
      sh.getRange(row.rowNum, 2).setValue(user.id);
      sh.getRange(row.rowNum, 3).setValue(user.name);
    }
    return String(row.vals[3] || 'ALLOWED');
  }
  sh.appendRow([devId, user ? user.id : '', user ? user.name : '(not logged in)', 'ALLOWED',
    now, now, String(req.plat || ''), String(req.scr || ''), String(req.tz || ''),
    String(req.ua || '').slice(0, 400), 1]);
  return 'NEW';
}

function blockDevice_(devId, why) {
  var sh = secSheets_().dev;
  var row = deviceRow_(devId);
  var uid = '';
  if (row) {
    uid = String(row.vals[1] || '');
    // Safety: the admin can never lock themselves out
    if (uid) { var au = findUser_(uid); if (au && au.isAdmin) return false; }
    sh.getRange(row.rowNum, 4).setValue('BLOCKED');
  } else if (devId) {
    sh.appendRow([devId, '', '(blocked)', 'BLOCKED', new Date(), new Date(), '', '', '',
      String(why || '').slice(0, 400), 0]);
  }
  SpreadsheetApp.flush();
  try { setPardon_(devId, 'NONE'); } catch (e) {}  // v28: clear old pardon - a fresh SORRY is required
  // v27.1: device ke saath us device par jo account tha wo bhi permanently block -
  // warna user localStorage clear karke / doosre browser se dobara aa jata tha.
  if (uid) { try { blockAccount_(uid, why); } catch (e) { console.error('blockAccount fail: ' + e); } }
  return true;
}

/* ---------- v27.1: ACCOUNT block (person-level, not just device-level) ----------
   - Admin_Data me Status = BLOCKED  (login/refresh/poll sab par turant 'blocked')
   - email + contact ek blocklist me  (dobara signup bhi nahi ho sakta)
   - us user ke SAARE devices BLOCKED
   - saare sessions khatam -> jis phone/laptop par bhi app khuli hai, agle poll (~2s) me hard-stop */
function blockAccount_(uid, why) {
  var u = findUser_(uid);
  if (!u) return false;
  var adm = sheets_().adm;
  adm.getRange(u.row, 12).setValue('BLOCKED');                       // Status column
  _usersMemo = null; // v29.4: Admin_Data changed
  addBlockedIdentity_(u.email, u.contact);
  // all devices that ever carried this account
  var dsh = secSheets_().dev, last = dsh.getLastRow();
  if (last >= 2) {
    var vals = dsh.getRange(2, 1, last - 1, DEV_HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][1]) === uid && String(vals[i][3]) !== 'BLOCKED') dsh.getRange(i + 2, 4).setValue('BLOCKED');
    }
  }
  SpreadsheetApp.flush();
  try { killSessionsOf_(uid); } catch (e) {}
  try { CacheService.getScriptCache().remove('cp_presence'); } catch (e) {}
  try { secLog_('ACCOUNT_BLOCKED', 'LOW', { userId: uid }, 'Account permanently blocked. ' + String(why || ''), u); } catch (e) {}
  return true;
}
function unblockAccount_(uid) {
  var u = findUser_(uid);
  if (!u) return false;
  sheets_().adm.getRange(u.row, 12).setValue('ACTIVE');
  _usersMemo = null; // v29.4: Admin_Data changed
  removeBlockedIdentity_(u.email, u.contact);
  SpreadsheetApp.flush();
  return true;
}
/* blocklist of identities lives in Script Properties (JSON array, lowercase) */
function blockedIdentities_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('CP_BLOCKED_IDS') || '[]') || []; }
  catch (e) { return []; }
}
function saveBlockedIdentities_(list) {
  PropertiesService.getScriptProperties().setProperty('CP_BLOCKED_IDS', JSON.stringify(list));
}
function normIdent_(x) { return String(x || '').trim().toLowerCase().replace(/\s+/g, ''); }
function addBlockedIdentity_(email, contact) {
  var list = blockedIdentities_();
  [normIdent_(email), normIdent_(contact)].forEach(function (v) { if (v && list.indexOf(v) < 0) list.push(v); });
  saveBlockedIdentities_(list);
}
function removeBlockedIdentity_(email, contact) {
  var e = normIdent_(email), c = normIdent_(contact);
  saveBlockedIdentities_(blockedIdentities_().filter(function (v) { return v !== e && v !== c; }));
}
function isBlockedIdentity_(email, contact) {
  var list = blockedIdentities_();
  if (!list.length) return false;
  var e = normIdent_(email), c = normIdent_(contact);
  return (e && list.indexOf(e) > -1) || (c && list.indexOf(c) > -1);
}

/* ---------- sessions ---------- */
function newSession_(user, req) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var sh = secSheets_().sess;
  var now = new Date();
  sh.appendRow([token, user.id, String(req && req.dev || ''), now, now,
    String(req && req.ua || '').slice(0, 400)]);
  SpreadsheetApp.flush();
  try { pruneSessions_(); } catch (e) {}
  return token;
}

function pruneSessions_() {
  var sh = secSheets_().sess;
  var last = sh.getLastRow();
  if (last < 2) return;
  var vals = sh.getRange(2, 1, last - 1, SESS_HEADERS.length).getValues();
  var now = Date.now(), dead = [];
  for (var i = 0; i < vals.length; i++) {
    var t = new Date(vals[i][4] || vals[i][3]).getTime();
    if (!t || (now - t) > SESSION_TTL_MS) dead.push(i + 2);
  }
  for (var j = dead.length - 1; j >= 0; j--) sh.deleteRow(dead[j]);
}

/* Verify a token -> returns the user object, or null.
   Cached for 5 minutes so we do not scan the sheet on every poll. */
function sessionUser_(token, devId) {
  token = String(token || '');
  if (token.length < 20) return null;
  var cache = CacheService.getScriptCache();
  var ck = 'cp_sess_' + token.slice(0, 32);
  var hit = cache.get(ck);
  var uid = null, boundDev = '';
  if (hit) {
    var h = hit.split('|');
    uid = h[0]; boundDev = h[1] || '';
  } else {
    var sh = secSheets_().sess;
    var last = sh.getLastRow();
    if (last < 2) return null;
    var vals = sh.getRange(2, 1, last - 1, SESS_HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) !== token) continue;
      var seen = new Date(vals[i][4] || vals[i][3]).getTime();
      if (Date.now() - seen > SESSION_TTL_MS) return null;
      uid = String(vals[i][1]); boundDev = String(vals[i][2] || '');
      sh.getRange(i + 2, 5).setValue(new Date());
      cache.put(ck, uid + '|' + boundDev, 300);
      break;
    }
    if (!uid) return null;
  }
  /* A token stolen from one machine and replayed on another is the
     classic session-hijack. If the device does not match, refuse. */
  if (boundDev && devId && boundDev !== devId) return { _mismatch: true, uid: uid };
  return findUser_(uid);
}

function killSessionsOf_(userId) {
  var sh = secSheets_().sess;
  var last = sh.getLastRow();
  if (last < 2) return;
  var vals = sh.getRange(2, 1, last - 1, 2).getValues(); // Token, User_ID
  var dead = [], cache = CacheService.getScriptCache();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][1]) !== String(userId)) continue;
    dead.push(i + 2);
    // v27.1: cached token bhi hatao - warna 5 min tak purana session chalta rehta tha
    try { cache.remove('cp_sess_' + String(vals[i][0]).slice(0, 32)); } catch (e) {}
  }
  for (var j = dead.length - 1; j >= 0; j--) sh.deleteRow(dead[j]);
  SpreadsheetApp.flush();
}

/* ---------- security log + email alerts ---------- */
function secLog_(ev, sev, req, details, user) {
  try {
    var sh = secSheets_().sec;
    var emailed = '';
    if (sev === 'CRITICAL' || sev === 'HIGH') emailed = secAlert_(ev, sev, req, details, user) ? 'YES' : 'throttled';
    sh.appendRow([new Date(), sev, ev,
      user ? user.id : String(req && req.userId || ''),
      user ? user.name : '',
      String(req && req.dev || ''), String(details || '').slice(0, 900),
      String(req && req.ua || '').slice(0, 400), emailed]);
  } catch (e) { console.error('secLog fail: ' + e); }
}

function alertBudgetOk_(key, gapMs) {
  var cache = CacheService.getScriptCache();
  if (cache.get('cp_al_' + key)) return false;              // same event type, too soon
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT', 'yyyyMMdd');
  var raw = String(props.getProperty('CP_ALERT_DAY') || '');
  var parts = raw.split(':');
  var n = (parts[0] === today) ? (Number(parts[1]) || 0) : 0;
  if (n >= ALERT_DAILY_CAP) return false;                   // protect the Gmail quota
  props.setProperty('CP_ALERT_DAY', today + ':' + (n + 1));
  cache.put('cp_al_' + key, '1', Math.max(10, Math.round((gapMs || ALERT_MIN_GAP_MS) / 1000)));
  return true;
}

/* v28.1: agar Gmail send FAIL ho jaye to budget wapas — warna quota bhi kat
   jaata tha AUR email bhi nahi jaata tha (double loss). */
function alertRefund_(key) {
  try { CacheService.getScriptCache().remove('cp_al_' + key); } catch (e) {}
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = String(props.getProperty('CP_ALERT_DAY') || '');
    var parts = raw.split(':');
    var n = Number(parts[1] || 0);
    if (parts[0] && n > 0) props.setProperty('CP_ALERT_DAY', parts[0] + ':' + (n - 1));
  } catch (e) {}
}

function secAlert_(ev, sev, req, details, user) {
  /* v28.1: key me details ka chhota hissa bhi — taaki "Ctrl+U" aur "F12"
     alag events ginein aur dono ka mail aaye. Priority events ka gap 45s. */
  var pr = alertPriority_(ev);
  var dtag = String(details || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  var key = ev + '_' + dtag + '_' + String(req && req.dev || 'nodev').slice(0, 12);
  try {
    if (!alertBudgetOk_(key, pr ? ALERT_PRIORITY_GAP_MS : ALERT_MIN_GAP_MS)) return false;
    var to = adminEmail_();
    if (!to) return false;
    var tz = Session.getScriptTimeZone() || 'GMT';
    var stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss '('zzz')'");
    var devId = String(req && req.dev || '(unknown)');
    var base = execUrl_(req && req.appUrl);
    var blockUrl = base ? (base + '?secblock=' + encodeURIComponent(devId) +
      '&token=' + encodeURIComponent(secBlockToken_(devId))) : '';

    var color = (sev === 'CRITICAL') ? '#e05d5d' : '#d8b34a';
    var rows =
      _emailRow_('Event', ev) +
      _emailRow_('Severity', sev) +
      _emailRow_('Account', user ? (user.name + ' (' + user.id + ')') : String(req && req.userId || '\u2014')) +
      _emailRow_('Device ID', devId) +
      _emailRow_('Platform', String(req && req.plat || '\u2014')) +
      _emailRow_('Screen', String(req && req.scr || '\u2014')) +
      _emailRow_('Timezone', String(req && req.tz || '\u2014')) +
      _emailRow_('Browser', String(req && req.ua || '\u2014').slice(0, 180)) +
      _emailRow_('Page', String(req && req.page || '\u2014').slice(0, 160)) +
      _emailRow_('Time', stamp) +
      _emailRow_('Details', String(details || '\u2014').slice(0, 400));

    var plain =
      'NEXTALK - SECURITY ALERT\n===========================\n' +
      'Severity : ' + sev + '\nEvent    : ' + ev + '\n' +
      'Device   : ' + devId + '\nBrowser  : ' + String(req && req.ua || '') + '\n' +
      'Time     : ' + stamp + '\nDetails  : ' + String(details || '') + '\n\n' +
      (blockUrl ? ('BLOCK THIS DEVICE -> ' + blockUrl + '\n\n') : '') +
      'Full history is in the Security_Log tab of your sheet.';

    var html =
'<!DOCTYPE html><html><body style="margin:0;padding:0;background:#04060D;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04060D;padding:24px 12px;"><tr><td align="center">' +
'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#070B14;border:1px solid #1B1740;border-radius:14px;overflow:hidden;font-family:Consolas,Menlo,monospace;">' +
'<tr><td style="background:#0F1526;border-bottom:1px solid #1E2740;padding:16px 22px;">' +
'<table role="presentation" width="100%"><tr><td style="font-size:15px;color:#C4B5FD;letter-spacing:2px;font-weight:bold;">&#128737; NEXTALK</td>' +
'<td align="right" style="font-size:10px;color:#7C5CFF;letter-spacing:2px;">INTRUSION DETECTION</td></tr></table></td></tr>' +
'<tr><td style="background:#2a1114;border-bottom:1px solid #6b2020;padding:14px 22px;">' +
'<span style="display:inline-block;background:' + color + ';color:#070B14;font-size:11px;font-weight:bold;letter-spacing:1px;padding:4px 12px;border-radius:20px;">&#9888; ' + sev + '</span>' +
'<span style="color:' + color + ';font-size:13px;letter-spacing:1px;margin-left:10px;">' + esc_(ev) + '</span></td></tr>' +
'<tr><td style="padding:22px;">' +
'<p style="margin:0 0 16px;color:#F3F4FA;font-size:15px;font-weight:bold;">Suspicious activity was detected on your app.</p>' +
'<table role="presentation" width="100%" style="background:#0F1526;border:1px solid #1E2740;border-radius:10px;">' +
'<tr><td style="padding:12px 16px 6px;color:#7C5CFF;font-size:10px;letter-spacing:2px;border-bottom:1px solid #1E2740;">&#9656; FORENSICS</td></tr>' +
'<tr><td style="padding:10px 16px;"><table role="presentation" width="100%" style="font-size:12px;color:#E6E9F2;">' + rows + '</table></td></tr></table>' +
(blockUrl ?
'<table role="presentation" width="100%" style="margin-top:20px;"><tr><td align="center">' +
'<a href="' + blockUrl + '" style="display:block;background:#3a1518;color:#ff7b7b;border:1px solid #e05d5d;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:1px;padding:14px 10px;border-radius:10px;">&#128683; BLOCK THIS DEVICE PERMANENTLY</a>' +
'</td></tr></table>' : '') +
'<p style="margin:16px 0 0;color:#5C6580;font-size:11px;text-align:center;">Full history: <b>Security_Log</b> tab of your Google Sheet.</p>' +
'</td></tr></table></td></tr></table></body></html>';

    MailApp.sendEmail({ to: to, subject: '\uD83D\uDEA8 NexTalk ' + sev + ' - ' + ev,
      body: plain, htmlBody: html, name: 'NexTalk Security' });
    return true;
  } catch (e) {
    console.error('secAlert fail: ' + e);
    alertRefund_(key);   // v28.1: send fail hua to budget wapas — agla attempt phir mail karega
    return false;
  }
}

/* A signed token so only YOUR email can block a device */
function secBlockToken_(devId) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('CP_BLOCK_SECRET');
  if (!secret) { secret = Utilities.getUuid(); props.setProperty('CP_BLOCK_SECRET', secret); }
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(String(devId), secret)).replace(/=+$/, '');
}

/* ================================================================
   v28: SORRY / PARDON SYSTEM
   ----------------------------------------------------------------
   Flow:
   1. A blocked device opens the site -> sees the ACCESS REVOKED page
      with a "SAY SORRY" button.
   2. Button -> action 'sec_sorry' -> YOU get an email:
      "This device says sorry and asks for permission" with
      GRANT PERMISSION / DENY buttons.
   3. The blocked page polls 'sorry_status' every few seconds.
      - You press GRANT  -> device unblocked -> the site opens again.
      - You press DENY (or ignore it) -> the device sees:
        "Sorry - the admin did not give you permission."
   The pardon decision is stored BOTH in cache and in Script
   Properties, so it survives cache eviction.
   ================================================================ */
function pardonKey_(devId) { return 'CP_PARDON_' + String(devId).slice(0, 60); }

function setPardon_(devId, status) {
  try { CacheService.getScriptCache().put('cp_pardon_' + devId, status, 21600); } catch (e) {}
  try { PropertiesService.getScriptProperties().setProperty(pardonKey_(devId), status + '|' + Date.now()); } catch (e) {}
}
function getPardon_(devId) {
  try {
    var c = CacheService.getScriptCache().get('cp_pardon_' + devId);
    if (c) return c;
  } catch (e) {}
  try {
    var p = PropertiesService.getScriptProperties().getProperty(pardonKey_(devId));
    if (p) {
      var parts = p.split('|');
      // A decision older than 24h is stale - treat as none
      if (Date.now() - Number(parts[1] || 0) < 24 * 3600 * 1000) return parts[0];
    }
  } catch (e) {}
  return '';
}

/* Blocked device presses the SORRY button */
function secSorry_(req) {
  var devId = String(req.dev || '').trim();
  if (!devId) return { ok: false, error: 'Device id missing' };
  var cache = CacheService.getScriptCache();
  // One sorry email per device per 10 min - no spamming your inbox
  if (cache.get('cp_sry_' + devId)) {
    return { ok: true, status: 'PENDING', note: 'Your request has already been sent - please wait for the admin.' };
  }
  cache.put('cp_sry_' + devId, '1', 600);
  setPardon_(devId, 'PENDING');
  secLog_('BLOCKED_DEVICE_SORRY', 'LOW', req, 'Blocked device sent a SORRY / permission request', null);
  try { sendSorryEmail_(devId, req); } catch (e) { console.error('Sorry email failed: ' + e); }
  return { ok: true, status: 'PENDING' };
}

/* Blocked page polls this every few seconds */
function sorryStatus_(req) {
  var devId = String(req.dev || '').trim();
  if (!devId) return { ok: false, error: 'Device id missing' };
  // If the device row is already ALLOWED (unblocked from panel or email) -> in
  var row = deviceRow_(devId);
  if (row && String(row.vals[3]) === 'ALLOWED') return { ok: true, status: 'ALLOWED' };
  var p = getPardon_(devId);
  if (p === 'ALLOWED') return { ok: true, status: 'ALLOWED' };
  if (p === 'DENIED') return { ok: true, status: 'DENIED' };
  if (p === 'PENDING') return { ok: true, status: 'PENDING' };
  return { ok: true, status: 'NONE' };
}

/* The GRANT PERMISSION / DENY buttons in the sorry email land here */
function pardonClick_(p) {
  var devId = String(p.pardon || '');
  var tok = String(p.token || '');
  var allow = String(p.decision) === 'allow';
  var title, msg, color;
  if (!devId || tok !== secBlockToken_(devId)) {
    title = 'Invalid link'; color = '#e05d5d';
    msg = 'The security token did not match - this link looks tampered with.';
  } else if (allow) {
    // Unblock the device AND the account that was blocked along with it
    var sh = secSheets_().dev;
    var row = deviceRow_(devId);
    if (row) {
      sh.getRange(row.rowNum, 4).setValue('ALLOWED');
      SpreadsheetApp.flush();
      try { if (String(row.vals[1])) unblockAccount_(String(row.vals[1])); } catch (e) {}
    }
    setPardon_(devId, 'ALLOWED');
    title = 'PERMISSION GRANTED \u2713'; color = '#A78BFA';
    msg = 'Device <b>' + esc_(devId) + '</b> has been forgiven and can open NexTalk again. ' +
          'If they misbehave again, a new alert email will let you re-block them with one click.';
  } else {
    setPardon_(devId, 'DENIED');
    title = 'PERMISSION DENIED \u2716'; color = '#e05d5d';
    msg = 'Device <b>' + esc_(devId) + '</b> stays BLOCKED. They will see: ' +
          '"Sorry \u2014 the admin did not give you permission."';
  }
  var html = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#04060D;font-family:Consolas,Menlo,monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;">' +
    '<div style="background:#070B14;border:1px solid #1E2740;border-radius:14px;padding:34px 30px;max-width:440px;text-align:center;">' +
    '<div style="font-size:12px;letter-spacing:3px;color:#7C5CFF;margin-bottom:14px;">\uD83D\uDEE1 NEXTALK - PARDON CONSOLE</div>' +
    '<div style="font-size:22px;font-weight:bold;color:' + color + ';margin-bottom:12px;">' + title + '</div>' +
    '<div style="font-size:13px;color:#E6E9F2;line-height:1.7;">' + msg + '</div>' +
    '<div style="margin-top:20px;font-size:11px;color:#5C6580;">You can close this tab now.</div>' +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* The "\uD83D\uDE4F Sorry" email to the admin, with GRANT PERMISSION / DENY buttons */
function sendSorryEmail_(devId, req) {
  var to = adminEmail_();
  if (!to) return;
  var base = execUrl_(req && req.appUrl);
  var tok = secBlockToken_(devId);
  var allowUrl = base ? (base + '?pardon=' + encodeURIComponent(devId) + '&token=' + encodeURIComponent(tok) + '&decision=allow') : '';
  var denyUrl  = base ? (base + '?pardon=' + encodeURIComponent(devId) + '&token=' + encodeURIComponent(tok) + '&decision=deny') : '';
  var tz = Session.getScriptTimeZone() || 'GMT';
  var stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss '('zzz')'");

  var plain =
    'NEXTALK - A BLOCKED DEVICE SAYS SORRY \uD83D\uDE4F\n' +
    '==========================================\n\n' +
    'The device you blocked has pressed the SORRY button and is asking\n' +
    'for permission to use NexTalk again.\n\n' +
    'DEVICE DETAILS\n' +
    '  Device ID : ' + devId + '\n' +
    '  Platform  : ' + String(req && req.plat || '-') + '\n' +
    '  Screen    : ' + String(req && req.scr || '-') + '\n' +
    '  Timezone  : ' + String(req && req.tz || '-') + '\n' +
    '  Browser   : ' + String(req && req.ua || '-').slice(0, 160) + '\n' +
    '  Time      : ' + stamp + '\n\n' +
    (allowUrl ? ('GRANT PERMISSION -> ' + allowUrl + '\n') : '') +
    (denyUrl ? ('KEEP BLOCKED     -> ' + denyUrl + '\n\n') : '') +
    'If you do nothing, the device simply stays blocked.\n' +
    '(c) NexTalk Security Operations Center';

  var rows =
    _emailRow_('Device ID', devId) +
    _emailRow_('Platform', String(req && req.plat || '\u2014')) +
    _emailRow_('Screen', String(req && req.scr || '\u2014')) +
    _emailRow_('Timezone', String(req && req.tz || '\u2014')) +
    _emailRow_('Browser', String(req && req.ua || '\u2014').slice(0, 160)) +
    _emailRow_('Time', stamp);

  var html =
'<!DOCTYPE html><html><body style="margin:0;padding:0;background:#04060D;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04060D;padding:24px 12px;"><tr><td align="center">' +
'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#070B14;border:1px solid #1B1740;border-radius:14px;overflow:hidden;font-family:Consolas,Menlo,monospace;">' +
'<tr><td style="background:#0F1526;border-bottom:1px solid #1E2740;padding:16px 22px;">' +
'<table role="presentation" width="100%"><tr><td style="font-size:15px;color:#C4B5FD;letter-spacing:2px;font-weight:bold;">&#128737; NEXTALK</td>' +
'<td align="right" style="font-size:10px;color:#7C5CFF;letter-spacing:2px;">PARDON REQUEST</td></tr></table></td></tr>' +
'<tr><td style="background:#2a1d0e;border-bottom:1px solid #6b4a1f;padding:14px 22px;">' +
'<span style="display:inline-block;background:#d8b34a;color:#070B14;font-size:11px;font-weight:bold;letter-spacing:1px;padding:4px 12px;border-radius:20px;">&#128591; SORRY RECEIVED</span>' +
'<span style="color:#d8b34a;font-size:13px;letter-spacing:1px;margin-left:10px;">BLOCKED DEVICE ASKS FOR PERMISSION</span></td></tr>' +
'<tr><td style="padding:22px;">' +
'<p style="margin:0 0 8px;color:#F3F4FA;font-size:16px;font-weight:bold;">&#128591; "Sorry! I will not do it again."</p>' +
'<p style="margin:0 0 18px;color:#8A93AB;font-size:12.5px;line-height:1.7;">The device you blocked for inspecting / copying has apologised and is requesting access again. ' +
'It can only get back in if you press <b style="color:#C4B5FD;">GRANT PERMISSION</b>. If you do nothing, it stays blocked.</p>' +
'<table role="presentation" width="100%" style="background:#0F1526;border:1px solid #1E2740;border-radius:10px;">' +
'<tr><td style="padding:12px 16px 6px;color:#7C5CFF;font-size:10px;letter-spacing:2px;border-bottom:1px solid #1E2740;">&#9656; DEVICE DETAILS</td></tr>' +
'<tr><td style="padding:10px 16px;"><table role="presentation" width="100%" style="font-size:12px;color:#E6E9F2;">' + rows + '</table></td></tr></table>' +
(allowUrl ?
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr>' +
'<td align="center" style="padding:0 6px;">' +
'<a href="' + allowUrl + '" style="display:block;background:#7C5CFF;color:#070B14;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:1px;padding:14px 10px;border-radius:10px;">&#10004; GRANT PERMISSION</a>' +
'</td>' +
'<td align="center" style="padding:0 6px;">' +
'<a href="' + denyUrl + '" style="display:block;background:#3a1518;color:#ff7b7b;border:1px solid #e05d5d;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:1px;padding:13px 10px;border-radius:10px;">&#10008; KEEP BLOCKED</a>' +
'</td></tr></table>' : '') +
'<p style="margin:18px 0 0;color:#5C6580;font-size:11px;text-align:center;">These buttons are meant only for you &mdash; please do not forward this email.</p>' +
'</td></tr>' +
'<tr><td style="background:#0B1020;border-top:1px solid #1E2740;padding:16px 22px;text-align:center;">' +
'<div style="color:#5C6580;font-size:10.5px;line-height:1.6;">&copy; NexTalk &bull; Security Operations Center</div>' +
'</td></tr></table></td></tr></table></body></html>';

  MailApp.sendEmail({ to: to, subject: '\uD83D\uDE4F NexTalk - Blocked device says SORRY [' + devId + ']',
    body: plain, htmlBody: html, name: 'NexTalk Security' });
}

/* ---------- rate limiting (per device) ---------- */
function rateOk_(req) {
  var id = String(req && req.dev || '') || String(req && req.userId || '');
  if (!id) return true;
  var cache = CacheService.getScriptCache();
  var k = 'cp_rl_' + id.slice(0, 40);
  var n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), RATE_LIMIT_WIN);
  return n <= RATE_LIMIT_HITS;
}

/* ---------- frontend -> backend security beacon ---------- */
function secEvent_(req) {
  var ev = String(req.ev || 'UNKNOWN').slice(0, 60).replace(/[^A-Z_0-9]/gi, '_').toUpperCase();
  var sev = String(req.sev || 'MEDIUM').toUpperCase();
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(sev) === -1) sev = 'MEDIUM';
  var u = null;
  try { u = findUser_(String(req.userId || '')); } catch (e) {}
  secLog_('CLIENT_' + ev, sev, req, String(req.info || ''), u);
  return { ok: true };
}

/* ---------- admin: read the security log from the panel ---------- */
function secList_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Admin only' };
  var sh = secSheets_().sec;
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) {
    var n = Math.min(300, last - 1);
    var vals = sh.getRange(last - n + 1, 1, n, SEC_HEADERS.length).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      out.push({
        ts: new Date(vals[i][0]).getTime(), sev: String(vals[i][1]), ev: String(vals[i][2]),
        uid: String(vals[i][3]), name: String(vals[i][4]), dev: String(vals[i][5]),
        info: String(vals[i][6]), ua: String(vals[i][7])
      });
    }
  }
  var dsh = secSheets_().dev;
  var dlast = dsh.getLastRow();
  var devs = [];
  if (dlast >= 2) {
    var dv = dsh.getRange(2, 1, dlast - 1, DEV_HEADERS.length).getValues();
    for (var j = 0; j < dv.length; j++) {
      devs.push({
        id: String(dv[j][0]), uid: String(dv[j][1]), name: String(dv[j][2]),
        status: String(dv[j][3]), last: new Date(dv[j][5]).getTime(),
        plat: String(dv[j][6]), scr: String(dv[j][7]), tz: String(dv[j][8]),
        ua: String(dv[j][9]), hits: Number(dv[j][10]) || 0
      });
    }
    devs.sort(function (a, b) { return b.last - a.last; });
  }
  return { ok: true, events: out, devices: devs };
}

function secBlock_(req) {
  if (!requireAdmin_(req.userId)) return { ok: false, error: 'Admin only' };
  var id = String(req.devId || '');
  if (!id) return { ok: false, error: 'Device id missing' };
  var sh = secSheets_().dev;
  var row = deviceRow_(id);
  if (!row) return { ok: false, error: 'Device not found' };
  var st = String(req.mode) === 'allow' ? 'ALLOWED' : 'BLOCKED';
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    if (st === 'BLOCKED') {
      blockDevice_(id, 'Blocked by admin from the Security console');   // device + account + sessions
    } else {
      sh.getRange(row.rowNum, 4).setValue('ALLOWED');
      SpreadsheetApp.flush();
      setPardon_(id, 'ALLOWED');                                         // v28: sorry page unlocks instantly
      if (String(row.vals[1])) unblockAccount_(String(row.vals[1]));     // account phir se ACTIVE
    }
  } finally { lock.releaseLock(); }
  return { ok: true, status: st };
}

/* ---------- push diagnostics ---------- */
function pushDiag_(req) {
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found' };
  var subs = pushSubs_();
  var mine = subs.filter(function (x) { return x.uid === u.id; });
  var out = { ok: true, totalSubs: subs.length, mySubs: mine.length, vapidSet: false, results: [] };
  try { out.vapidSet = !!vapidKeys_().pub; } catch (e) { out.vapidError = String(e); }
  if (!mine.length) {
    out.hint = 'This account has NO push subscription. Allow notifications, then fully close and reopen the app.';
    return out;
  }
  var codes = pushFanout_(function (x) { return x.uid === u.id; }, '',
    { t: 'TEST', n: 'NexTalk', x: 'Diagnostic push ' + new Date().toLocaleTimeString() });
  out.codes = codes;
  try {
    var lastErr = CacheService.getScriptCache().get('cp_pusherr');
    if (lastErr) out.lastError = JSON.parse(lastErr);
  } catch (e) {}
  out.hint = (codes.join(',').indexOf('201') > -1)
    ? 'The push service ACCEPTED the message (201). If nothing appeared on the device, the problem is on the device: notification permission, battery saver, or iOS not installed to the Home Screen.'
    : 'The push service REJECTED it. Look at "codes" and "lastError" above: 403 = VAPID key mismatch (re-subscribe), 401 = JWT problem, 400 = malformed payload.';
  return out;
}


/* ================================================================
   v29: CUSTOM GROUPS - user-created groups with a name + chosen members
   ----------------------------------------------------------------
   Sheets (auto-created):
     Groups      : Group_ID | Name | Created_By | Members | Created_At
     Group_Msgs  : Timestamp | Group_ID | From_ID | From_Name | Message_Text
   Members = comma separated user ids (creator is always a member).
   Same rules as the rest of the app: LIVE scan, LockService on writes,
   bottom-to-top delete, push failures never block the chat.
   ================================================================ */
var GRP_HEADERS  = ['Group_ID', 'Name', 'Created_By', 'Members', 'Created_At'];
var GMSG_HEADERS = ['Timestamp', 'Group_ID', 'From_ID', 'From_Name', 'Message_Text'];
var GRP_MAX_MSGS = 200;

function grpSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var g = ss.getSheetByName('Groups');
  if (!g) {
    g = ss.insertSheet('Groups');
    g.appendRow(GRP_HEADERS);
    g.getRange(1, 1, 1, GRP_HEADERS.length).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD');
    g.setFrozenRows(1);
  }
  var m = ss.getSheetByName('Group_Msgs');
  if (!m) {
    m = ss.insertSheet('Group_Msgs');
    m.appendRow(GMSG_HEADERS);
    m.getRange(1, 1, 1, GMSG_HEADERS.length).setFontWeight('bold').setBackground('#1B1740').setFontColor('#C4B5FD');
    m.setFrozenRows(1);
  }
  return { g: g, m: m };
}

var _grpMemo = null, _gmsgMemo = null;   // v29.4 SPEED: group sheets read once per request
function grpAll_() {
  if (_grpMemo) return _grpMemo;
  _grpMemo = grpLoad_();
  return _grpMemo;
}
function grpLoad_() {
  var sh = grpSheets_().g;
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, GRP_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!String(r[0])) continue;
    out.push({
      row: i + 2, id: String(r[0]), name: String(r[1]), by: String(r[2]),
      members: String(r[3] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
      createdAt: r[4] ? new Date(r[4]).getTime() : 0
    });
  }
  return out;
}

function grpFind_(gid) {
  var all = grpAll_();
  for (var i = 0; i < all.length; i++) if (all[i].id === gid) return all[i];
  return null;
}

function grpIsMember_(g, uid) { return g.members.indexOf(String(uid)) > -1; }
function grpCanManage_(g, u) { return u && (g.by === u.id || u.isAdmin); }

function grpMsgsAll_() {
  if (_gmsgMemo) return _gmsgMemo;
  _gmsgMemo = grpMsgsLoad_();
  return _gmsgMemo;
}
function grpMsgsLoad_() {
  var sh = grpSheets_().m;
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, GMSG_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!String(r[1])) continue;
    out.push({ row: i + 2, ts: new Date(r[0]).getTime(), gid: String(r[1]), uid: String(r[2]), name: String(r[3]), text: String(r[4]) });
  }
  return out;
}

function grpPublic_(g, users) {
  var names = {};
  for (var i = 0; i < users.length; i++) names[users[i].id] = users[i].name;
  return {
    id: g.id, name: g.name, by: g.by, byName: names[g.by] || g.by, createdAt: g.createdAt,
    members: g.members.map(function (id) { return { id: id, name: names[id] || ('(' + id + ')') }; })
  };
}

/* Create: name + members[] (ids). Creator is always included. */
function grpCreate_(req) {
  _grpMemo = null; _gmsgMemo = null;
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var name = String(req.name || '').trim().slice(0, 40);
  if (!name) return { ok: false, error: 'Group name is required' };
  var want = Array.isArray(req.members) ? req.members : [];
  var users = usersAll_(), valid = {};
  for (var i = 0; i < users.length; i++) valid[users[i].id] = true;
  var members = [u.id];
  for (var j = 0; j < want.length; j++) {
    var id = String(want[j] || '').trim();
    if (valid[id] && members.indexOf(id) === -1) members.push(id);
  }
  if (members.length < 2) return { ok: false, error: 'Pick at least one member' };
  var gid = 'G' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 46656).toString(36).toUpperCase();
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    grpSheets_().g.appendRow([gid, name, u.id, members.join(','), new Date()]);
    // first system line so the group is never empty
    grpSheets_().m.appendRow([new Date(), gid, u.id, u.name, '👥 ' + u.name + ' created the group "' + name + '"']);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  heartbeat_(u.id);
  try {
    for (var k = 0; k < members.length; k++) if (members[k] !== u.id)
      sendPushToUser_(members[k], 'cp-grp', { t: 'MSG', n: name, x: u.name + ' added you to the group' });
  } catch (e) {}
  return { ok: true, group: grpPublic_(grpFind_(gid), users) };
}

function grpSend_(req) {
  _grpMemo = null; _gmsgMemo = null;
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var g = grpFind_(String(req.gid || ''));
  if (!g) return { ok: false, error: 'This group no longer exists', gone: true };
  if (!grpIsMember_(g, u.id)) return { ok: false, error: 'You are not a member of this group', gone: true };
  var text = String(req.text || '').trim();
  if (!text) return { ok: false, error: 'Empty message' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    grpSheets_().m.appendRow([new Date(), g.id, u.id, u.name, text]);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  bump_(u.id, 9);
  heartbeat_(u.id);
  try {
    var lbl = dmLabel_(text);
    var px = lbl.length > 120 ? lbl.slice(0, 117) + '...' : lbl;
    for (var k = 0; k < g.members.length; k++) if (g.members[k] !== u.id)
      sendPushToUser_(g.members[k], 'cp-grp', { t: 'MSG', n: g.name + ' • ' + u.name, x: px });
  } catch (e) { console.error('Group push failed: ' + String(e)); }
  return { ok: true };
}

function grpMsgsOf_(gid) {
  var all = grpMsgsAll_(), out = [];
  for (var i = 0; i < all.length; i++) if (all[i].gid === gid) {
    var m = all[i];
    out.push({ ts: m.ts, uid: m.uid, name: m.name, contact: '', text: m.text });
  }
  if (out.length > GRP_MAX_MSGS) out = out.slice(out.length - GRP_MAX_MSGS);
  return out;
}

/* Instant load when a group is opened */
function grpMsgs_(req) {
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var g = grpFind_(String(req.gid || ''));
  if (!g || !grpIsMember_(g, u.id)) return { ok: false, error: 'This group is not available', gone: true };
  heartbeat_(u.id);
  return { ok: true, group: grpPublic_(g, usersAll_()), list: grpMsgsOf_(g.id) };
}

/* Sent with every poll: my groups (meta + last message + total count) and,
   if a group is open (req.grp), its messages. */
function grpForPoll_(meId, openGid, users) {
  var mine = grpAll_().filter(function (g) { return grpIsMember_(g, meId); });
  if (!mine.length) return { list: [], msgs: null, open: null };
  var stats = {}, msgs = null;
  var all = grpMsgsAll_();
  for (var i = 0; i < all.length; i++) {
    var m = all[i];
    var st = stats[m.gid] || (stats[m.gid] = { count: 0, lastTs: 0, lastText: '', lastName: '', lastUid: '' });
    st.count++;
    if (m.ts >= st.lastTs) { st.lastTs = m.ts; st.lastText = m.text; st.lastName = m.name; st.lastUid = m.uid; }
  }
  var list = [], open = null;
  for (var j = 0; j < mine.length; j++) {
    var g = mine[j], s = stats[g.id] || { count: 0, lastTs: g.createdAt, lastText: '', lastName: '', lastUid: '' };
    var pub = grpPublic_(g, users);
    pub.count = s.count; pub.lastTs = s.lastTs; pub.lastText = s.lastText; pub.lastName = s.lastName; pub.lastUid = s.lastUid;
    list.push(pub);
    if (openGid && g.id === openGid) { open = pub; msgs = grpMsgsOf_(g.id); }
  }
  list.sort(function (a, b) { return b.lastTs - a.lastTs; });
  return { list: list, msgs: msgs, open: open };
}

/* Add / remove members - creator or admin only */
function grpMembers_(req) {
  _grpMemo = null; _gmsgMemo = null;
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var g = grpFind_(String(req.gid || ''));
  if (!g || !grpIsMember_(g, u.id)) return { ok: false, error: 'This group is not available', gone: true };
  if (!grpCanManage_(g, u)) return { ok: false, error: 'Only the group creator (or admin) can change members' };
  var users = usersAll_(), valid = {};
  for (var i = 0; i < users.length; i++) valid[users[i].id] = true;
  var add = Array.isArray(req.add) ? req.add : [], remove = Array.isArray(req.remove) ? req.remove : [];
  var members = g.members.slice(), added = [];
  for (var a = 0; a < add.length; a++) { var id = String(add[a]).trim(); if (valid[id] && members.indexOf(id) === -1) { members.push(id); added.push(id); } }
  for (var r = 0; r < remove.length; r++) { var rid = String(remove[r]).trim(); if (rid !== g.by) members = members.filter(function (x) { return x !== rid; }); }
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var sh = grpSheets_().g;
    var live = grpFind_(g.id);   // live row number, never cached
    if (!live) return { ok: false, error: 'This group no longer exists', gone: true };
    sh.getRange(live.row, 4).setValue(members.join(','));
    if (added.length || remove.length) {
      var names = {}; for (var n = 0; n < users.length; n++) names[users[n].id] = users[n].name;
      var line = '';
      if (added.length) line += u.name + ' added ' + added.map(function (x) { return names[x] || x; }).join(', ');
      if (remove.length) line += (line ? ' • ' : '') + u.name + ' removed ' + remove.map(function (x) { return names[x] || x; }).join(', ');
      grpSheets_().m.appendRow([new Date(), g.id, u.id, u.name, '👥 ' + line]);
    }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  try {
    for (var k = 0; k < added.length; k++) sendPushToUser_(added[k], 'cp-grp', { t: 'MSG', n: g.name, x: u.name + ' added you to the group' });
  } catch (e) {}
  return { ok: true, group: grpPublic_(grpFind_(g.id), users) };
}

function grpLeave_(req) {
  _grpMemo = null; _gmsgMemo = null;
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var g = grpFind_(String(req.gid || ''));
  if (!g || !grpIsMember_(g, u.id)) return { ok: true };
  if (g.by === u.id) return { ok: false, error: 'You created this group - delete it instead of leaving' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var live = grpFind_(g.id);
    if (live) {
      grpSheets_().g.getRange(live.row, 4).setValue(live.members.filter(function (x) { return x !== u.id; }).join(','));
      grpSheets_().m.appendRow([new Date(), g.id, u.id, u.name, '👥 ' + u.name + ' left the group']);
      SpreadsheetApp.flush();
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function grpRename_(req) {
  _grpMemo = null; _gmsgMemo = null;
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var g = grpFind_(String(req.gid || ''));
  if (!g || !grpIsMember_(g, u.id)) return { ok: false, error: 'This group is not available', gone: true };
  if (!grpCanManage_(g, u)) return { ok: false, error: 'Only the group creator (or admin) can rename it' };
  var name = String(req.name || '').trim().slice(0, 40);
  if (!name) return { ok: false, error: 'Group name is required' };
  var lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    var live = grpFind_(g.id);
    if (!live) return { ok: false, error: 'This group no longer exists', gone: true };
    grpSheets_().g.getRange(live.row, 2).setValue(name);
    grpSheets_().m.appendRow([new Date(), g.id, u.id, u.name, '👥 ' + u.name + ' renamed the group to "' + name + '"']);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/* Delete the group + all its messages (creator or admin). Bottom-to-top delete. */
function grpDelete_(req) {
  _grpMemo = null; _gmsgMemo = null;
  var u = findUser_(String(req.userId));
  if (!u) return { ok: false, error: 'User not found - please log in again' };
  var g = grpFind_(String(req.gid || ''));
  if (!g) return { ok: true };
  if (!grpCanManage_(g, u)) return { ok: false, error: 'Only the group creator (or admin) can delete it' };
  var lock = LockService.getScriptLock(); lock.tryLock(15000);
  try {
    var sh = grpSheets_();
    var rows = grpMsgsAll_().filter(function (m) { return m.gid === g.id; }).map(function (m) { return m.row; }).sort(function (a, b) { return b - a; });
    for (var i = 0; i < rows.length; i++) sh.m.deleteRow(rows[i]);
    var live = grpFind_(g.id);
    if (live) sh.g.deleteRow(live.row);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { ok: true };
}
