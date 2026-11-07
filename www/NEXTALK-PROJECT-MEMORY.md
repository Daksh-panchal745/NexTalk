# NEXTALK — PROJECT MEMORY
_Last updated: 5 November 2026 · Current version: **v29.0 (NexTalk)** (previous: CyberPulse v28.2)_

> **Naye chat me kya karna hai:** ye poori file paste kar dijiye ya upload kar
> dijiye, phir apna sawaal likhiye. Isme project ka poora context, jo bugs mile,
> jo fix hue, aur jo abhi baaki hai — sab likha hai.

---

## 000. v29.1 — CUSTOM GROUPS (5 Nov 2026)
- Home "+" → bottom sheet: Create a group / Everyone chat.
- Sheets: `Groups` (Group_ID, Name, Created_By, Members csv, Created_At), `Group_Msgs` (Timestamp, Group_ID, From_ID, From_Name, Message_Text).
- Actions: grp_create, grp_send, grp_msgs, grp_members(add/remove), grp_leave, grp_delete, grp_rename. `updates` ab `groups:{list,open,msgs}` bhi deta hai (req.grp = khula group).
- Frontend: `GRP` (null = Everyone). pageGroup dono ke liye same; sendGroupRaw GRP hone par grp_send. System lines "👥 " prefix se. Unread device par (`nt_gseen`).
- Poll race fix: stale poll (grp:'') ka `open:null` ignore hota hai (reqGrp check).
- Hosting: https://daksh.qzz.io/ (Cloudflare). SW cache nextalk-v29-1.

## 00. v29.0 — CYBERPULSE → NEXTALK (5 Nov 2026)

- App ka naam ab **NexTalk** (UI, manifest, SW, emails, admin pages — sab jagah).
- Poora naya theme: deep-ink bg, violet→cyan gradient, Plus Jakarta Sans font, glass panels, CSS animations.
  CSS variable NAMES purane hi hain (`--green`, `--green-dk`...) — sirf values badli, taaki inline styles na tooten.
- Naya intro.mp4 (8.5s), naye icons, naya `install.html` (Android/iOS install guide + optional APK button).
- SW cache `nextalk-v29-0`, APP_VERSION v29.0.
- **Nahi badla (jaan-boojh kar):** hash salt `'|CyberPulse'`, Drive folder `CyberPulse_Uploads`,
  canvas fingerprint text `CyberPulse⚡`, localStorage/cache keys `cp_*`. Inhe kabhi mat badalna.
- Saath me: `NexTalk-Android/` (Android Studio WebView project) aur `NexTalk-QR-Maker.html`.

## 0. v27.1 ME KYA BADLA (15 Aug 2026)

1. **Admin refresh button** (Admin panel header ↻) — ab poora admin data + jo section khula
   hai (uploads / personal chats / security) sab dobara load hota hai, icon ghoomta hai,
   "Refreshing… / Refreshed" toast aata hai.
2. **"+" button neeche** — home aur Information page ka + ab bottom-right corner me
   (bottom nav ke theek upar, `bottom:14px`). Pehle 72–84px upar tha.
3. **Inspect/DevTools warning sirf laptop/desktop par** — `CP_IS_DESKTOP` flag
   (UA + touch + pointer check). Phone/tablet par: koi devtools timer nahi, long-press
   (contextmenu) block nahi, keyboard shortcut check nahi, `#secWall` popup kabhi nahi.
4. **BLOCK THIS DEVICE = poora insaan block** (email button + Admin → Security dono):
   - Devices sheet me wo device BLOCKED + us account ke **saare devices** BLOCKED
   - Admin_Data me us user ka `Status` = **BLOCKED**
   - email + contact number Script Property `CP_BLOCKED_IDS` me → dobara **signup bhi nahi**
   - saare sessions delete + session cache clear → jahan bhi app khuli hai, agle poll
     (~2 sec) me `blocked:true` → `cpHardStop()` (ACCESS REVOKED screen)
   - client `localStorage.cp_blocked` flag rakhta hai → app dobara kholte hi lock screen
   - security gate har request par account status check karta hai (naya device bhi bekaar)
   - Admin → Security → UNBLOCK karne se account phir ACTIVE + blocklist se hat jaata hai
   - Admin ka apna device kabhi block nahi hota (safety)
   - Naya event: `BLOCKED_ACCOUNT_ATTEMPT` (HIGH), `ACCOUNT_BLOCKED` (LOW)

5. **v27.2 — Users me Select all + Delete selected** — Admin → All users ke upar ek bar:
   "Select all" checkbox, "N selected" count, "Delete selected" button. Har user row me
   checkbox (admin/khud ko chhod kar). Backend naya action `remove_users` (targetIds[]) —
   ek hi call, live scan, bottom-to-top delete, admin row kabhi delete nahi, sessions kill.

   ⚠ Deploy karna zaroori: naya `Code.gs` paste → Save → **Deploy → New version**.

## 1. PROJECT KYA HAI

**NexTalk** — ek private group + personal chat PWA, cybersecurity SOC theme
(dark `#05080c` background, green `#639922` / `#C0DD97` accents, Consolas monospace).

**Owner / admin:** Daksh Panchal · `panchaldaksh745@gmail.com`
Sabhi approval aur security alert emails isi address par jaati hain.

### Architecture

| Layer | Kya hai |
|---|---|
| Frontend | Ek single `index.html` (~3,300 lines, inline CSS + JS, no framework) |
| Service worker | `sw.js` — PWA cache + web push notifications |
| Backend | Google Apps Script `Code.gs` (~2,300 lines) — Web App, POST/JSON API |
| Database | Ek Google Sheet, sheets ke tabs hi tables hain |
| File storage | Google Drive folder `CyberPulse_Uploads` |
| Calls | WebRTC peer-to-peer, signaling Apps Script polling ke through |

### Google Sheet ke tabs

| Tab | Kaam |
|---|---|
| `App_Data` | Group messages, screenshot + file uploads ka log |
| `Admin_Data` | Users (A2 cell me app entry password) |
| `Login_Requests` | Pending admin approvals |
| `Push_Subs` | Web push subscriptions |
| `DM_Data` | Personal (1-to-1) messages |
| `Sessions` | **v27 naya** — session tokens |
| `Security_Log` | **v27 naya** — intrusion events |
| `Devices` | **v27 naya** — device registry + block list |

### Features
Group chat · Personal chat (WhatsApp style, unread badges) · Screenshot/file upload ·
Voice notes · Location/contact/poll/event attachments · Voice + video calls
(group calls tak) · Push notifications · Admin panel (users, chats, uploads,
DM moderation, password, login approvals, **security console**) · Login approval
email me GRANT/DENY buttons · Intro video on load.

### Design principles (project ke apne rules — inhe todna nahi)
- **Live scan, never cached row numbers** — sheet delete/update hamesha fresh scan se
- **Bottom-to-top delete** — taaki row numbers shift na hon
- **LockService** har write operation par
- Push/email failure kabhi bhi chat ya upload ko **block nahi** karta (try/catch)

---

## 2. v26 ME JO BUGS THE (root causes)

### 📞 Calls connect nahi ho rahe the

1. **TURN server dead tha** ← asli root cause
   Config me `openrelay.metered.ca` + `openrelayproject/openrelayproject` tha.
   Open Relay Project ka free public TURN **retire ho chuka hai**. Jio/Airtel/Vi
   CGNAT par chalte hain — bina working TURN ke direct P2P **possible hi nahi**.
2. **Trickle ICE nahi tha.** `gatherComplete()` poori ICE gathering ka intezaar
   karta tha, 7 second ke timeout ke saath. TURN unreachable hone par ye 7s
   dono taraf full chalta tha → 15-25s, aur 25s ka "could not connect" timer
   pehle hi fire ho jata tha.
3. **Error message bekaar tha** — sirf "please try again", asli wajah kabhi pata nahi chalti thi.

### 🔔 Push notifications nahi aa rahi thin

1. **`Topic` header** — har chat push par same topic. Web Push spec ke hisaab se
   push service same topic wali **pending push ko replace** kar deti hai.
   3 message aaye → sirf aakhri ki notification.
2. **`tag: 'cp-live'`** — `sw.js` har message ko same tag deta tha, to message #2
   lock screen par message #1 ko **mita** deta tha.
3. **Silent push penalty (sabse bada)** — app khuli hone par `handlePush_` bina
   notification dikhaye `return` kar deta tha. Subscription `userVisibleOnly:true`
   par bana hai = browser se kiya gaya vaada. Chrome tootne wale vaade ginta hai
   aur kuch ke baad **poore origin ki push drop kar deta hai**. Yahi wajah thi
   "pehle aati thi phir band ho gayi".

> ⚠ **Push ki crypto me koi bug NAHI tha.** Maine AES-128 block cipher,
> AES-128-GCM, RFC 8291 payload encryption aur ECDSA P-256 (VAPID) signing —
> chaaron ko known test vectors ke against verify kiya. **Sab PASS.**
> Future me push debug karte waqt crypto par time waste mat karna.

### 🛡 Security khaamiyan

1. **Koi authentication nahi thi** ← sabse badi khaami.
   Har API call sirf `userId` par bharosa karti thi. Koi bhi `U002` guess karke
   **doosre ka poora personal chat padh sakta tha**, uske naam se message bhej
   sakta tha, files delete kar sakta tha.
2. **Passwords plaintext** me sheet ke andar (login + app entry dono).
3. Koi rate limiting nahi, koi device tracking nahi, koi intrusion logging nahi.

---

## 3. v27 ME JO FIX HUA

### Backend (`Code.gs`)
- **Session tokens** — `Sessions` sheet, 30-day TTL, har request par verify.
  `handle_()` me ek security gate lagaya jo har action se pehle chalta hai.
  Token hi decide karta hai user kaun hai — body ka `userId` ab kabhi trust nahi hota.
- **Token device se bandha** — dusre device par replay kiya to `SESSION_DEVICE_MISMATCH` (CRITICAL).
- **Password hashing** — SHA-256 + per-user salt, format `sha256$salt$hash`.
  Purane plaintext login par apne aap upgrade ho jaate hain.
  `migratePasswords()` function ek baar run karna hota hai.
- **Rate limiting** — 90 req/min per device (`RATE_LIMIT_HITS`).
- **Devices registry** — block/unblock, blocked device ki sessions turant khatam.
- **`Security_Log`** + throttled email alerts (4 min gap per event type, 40/day cap
  — Gmail ki 100/day limit bachane ke liye).
- **Email me BLOCK DEVICE button**, HMAC-signed token se protected.
- **Approval request device se bandhi** — request id guess karke redeem nahi kar sakte.
- **Push fixes:** Topic sirf calls ke liye; har push par unique id `m.i`;
  failure ke HTTP codes + response body capture.
- **Naye actions:** `sec_event`, `sec_list`, `sec_block`, `push_diag`, `logout`, `ping`.

### Frontend (`index.html`)
- TURN config saaf-saaf alag, `TURN_READY` flag ke saath.
- **Trickle ICE** — offer turant, candidates 400ms batches me. `gatherComplete` 7000ms → 1200ms.
- Call failure par **asli wajah** batata hai (`callFailReason()`).
- Device fingerprint (`CP_DEV`) — canvas + screen + UA + timezone se, localStorage me.
- Har request me `cpMeta()` — token, dev, ua, plat, scr, tz, page.
- `reauth` → force relogin, `blocked` → hard stop screen.
- **Security sentinel:** DevTools detection (viewport gap + debugger timing),
  F12/Ctrl+U/Ctrl+S/Ctrl+Shift+I block, right-click block, bulk copy detect,
  console warning, function tampering detection.
- **Security breach popup (`#secWall`)** — sirf inspect/Ctrl+U/right-click par.
  Red scan-line, blinking ⚠, forensics box (Event/Device ID/Browser/Timestamp/
  "REPORTED TO ADMIN"), self-XSS scam warning, 5-second countdown button.
- **Admin → Security console** — devices list + block/unblock, events feed,
  push diagnostics button.

### Service worker (`sw.js`)
- App khuli hone par bhi **hamesha** notification (quiet + 4s auto-close) — silent push penalty khatam.
- Har message ka **unique tag** — ab collapse nahi hota.
- Session token META cache me store, `push_peek` ke liye.

---

## 4. USER KO JO MANUALLY KARNA HAI (abhi tak pending?)

- [ ] **TURN credentials** — metered.ca par free signup, `index.html` ki teen
      lines badalna (`TURN_HOST`, `TURN_USERNAME`, `TURN_CREDENTIAL`).
      **Ye kiye bina calls kabhi connect nahi honge.**
- [ ] Apps Script me naya `Code.gs` paste + Save
- [ ] `migratePasswords()` ek baar Run
- [ ] `testPushSetup()` Run + Google authorization **Allow** (UrlFetchApp permission —
      iske bina push kabhi nahi jaayegi)
- [ ] **Deploy → Manage deployments → New version** (sirf save karna kaafi nahi!)
- [ ] `index.html` + `sw.js` host karna, phone par app fully close karke reopen
- [ ] Google Sheet → Share → **Restricted**

---

## 5. HONEST LIMITATIONS — inhe dobara mat poochhna, jawab nahi badlega

- **Code inspect rokna technically impossible hai.** Browser me jo code jaata hai
  wo padha ja sakta hai. `#secWall` popup ek **alarm** hai, lock nahi —
  JavaScript disable karke ya `view-source:` URL type karke bypass ho jaayega.
  Isiliye asli suraksha server par lagayi gayi (session tokens, hashing, device block).
- **"Aaj ke baad koi problem nahi aayegi" — ye promise koi nahi kar sakta.**
  Apps Script quotas, browser push policies, TURN free tiers — sab badalte rehte hain.
  v27 ka lakshya ye hai ki jab kuch toote to **pata chale** (Security console,
  push diagnostics, asli error messages) — pehle sab chup-chaap fail hota tha.
- **Apps Script user ka IP nahi de sakta.** Isliye device fingerprint use kiya.
  Ek browser ke liye stable hai, par browser badalne ya incognito me naya banega.
  Forensic clue hai, absolute identity nahi.
- **Gmail limit 100 mails/day** (free account). Isliye alerts throttled hain.
- **Apps Script polling signaling** har hop par ~1-2s. Trickle ICE se kam kiya,
  par ek dedicated WebSocket server se 3-4x aur fast hoga.

---

## 6. AGE KYA KAR SAKTE HAIN (ideas, abhi tak nahi bane)

1. **WebSocket signaling server** (Render/Railway free) — calls 3-4x fast connect
2. **End-to-end encryption** DMs ke liye — abhi sheet me plaintext hain, admin sab padh sakta hai
3. **2FA** admin login ke liye
4. **Message search**, reactions, reply-to-message
5. **Auto-delete** purane messages (sheet ki row limit bachane ke liye)
6. **Apps Script quota monitoring** — quota khatam hone se pehle warning

---

## 7. DEBUGGING CHEAT SHEET

**Push nahi aa rahi:**
→ Admin → Security → 🔔 **Push diagnostics** dabaiye.
`201` = push service ne accept kiya, problem device par hai (permission/battery
saver/iOS Home Screen install). `403` = VAPID key mismatch, logout-login se
re-subscribe. `401` = JWT problem. Blank/0 subs = us account ki subscription hi nahi hai.
**Crypto check mat kariye — wo verified hai.**

**Call connect nahi ho raha:**
→ App ab khud batati hai. "no TURN server configured" = STEP 1 baaki hai.
"TURN server rejected us" = credentials galat. "no relay route" = network UDP block kar raha hai.

**"Session expired" baar-baar:**
→ `Sessions` sheet check kariye. Device fingerprint badla hoga (browser change /
incognito / localStorage clear).

**Sab kuch "Unknown action" de raha hai:**
→ Deploy → **New version** nahi kiya. Purana code chal raha hai.

**Server invalid response:**
→ Deployment "Who has access: **Anyone**" par hona chahiye, aur `SCRIPT_URL`
(index.html) + `WEB_APP_URL` (Code.gs) **bilkul same** hone chahiye, `/exec` par khatam.
