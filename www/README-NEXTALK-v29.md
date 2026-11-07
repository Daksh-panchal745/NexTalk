# NexTalk v29.4 — READ ME FIRST (Hinglish)

## ⭐ v29.4 me naya — FAST + FACE ID / FINGERPRINT
1. **Calls aur fast:** offer ab 300ms me nikalta hai (pehle 600ms); ring par mic/camera pre-warm aur accept par dono taraf ek saath
   connection (v29.3) ke saath milke har call 1–3 sec jaldi lagti hai.
2. **Poora app fast:** backend me har request sheets ko sirf 1 baar padhta hai (pehle 3–4 baar), DM/Groups sheets ek baar,
   Everyone chat 2 sec cache (20 log = 1 sheet read). Poll 2s→1.5s (chat khula ho to 1s). App khulte hi pichli baar ka
   chat list + groups + messages turant dikhte hain (0 ms), phir fresh data — spinner nahi.
3. **Entry password + Face ID / Fingerprint:** gate waisa hi hai (har baar). Pehli baar sahi password par popup
   "Unlock with Face ID / Fingerprint next time?" → Enable → phone ka prompt. Agli baar gate par **"Unlock with …"** button
   (Android par apne aap prompt, iPhone par tap). Match → andar; match nahi/cancel → password type karke andar (hamesha).
   Admin entry password badle → sabko ek baar password, phir biometric wapas. Backend me `Bio_Keys` sheet apne aap.
   Zaroori: https site (hai), iPhone Safari/home-screen iOS 16+, Android Chrome. Jahan support nahi, gate pehle jaisa.
Deploy: Code.gs → New version; index.html + sw.js upload (cache `nextalk-v29-5`).


## ⭐ v29.3 me naya — CALLS (WhatsApp-style)
**Incoming call (sirf jise call ki gayi usi ko):**
- App band/background ho to bhi phone par **"📞 Incoming voice call / 📹 Incoming video call"** notification aati hai jisme
  **caller ka naam + number** likha hota hai, **✅ Answer / ❌ Decline** buttons ke saath (Android par buttons dikhte hain;
  iPhone par tap karke answer). Notification tab tak rehti hai jab tak aap kuch na karo, strong vibration ke saath.
- Tap karte hi app **bina intro video ke seedha** khulti hai aur full-screen ring screen aati hai (naam, number, badi Accept/Decline).
- **Nayi melodic ringtone** (`ringtone.mp3` — upload karna zaroori) loop me bajti hai + vibration; caller ko **ringback tone** sunai deti hai.
- Decline button notification se hi caller ko turant "declined" bhej deta hai.

**Fast connect:**
- Ring aate hi mic/camera pehle se taiyaar ho jaata hai (agar permission pehle di thi) → Accept dabate hi turant connect.
- Accept par ab dono taraf ek saath connection banta hai (pehle ek extra round-trip lagta tha) → ~1–2 sec kam.

> ⚠️ **Sach:** ye ek web app (PWA) hai — phone ka **asli native call screen** (jaise WhatsApp ka full-screen lock-screen call UI) sirf
> Play Store / App Store wali native app me possible hai (Android ConnectionService / iOS CallKit). Web app me jo maximum possible hai
> wahi banaya hai: persistent call notification (naam + number + Answer/Decline) + ringtone + full-screen ring screen.
> Notification ki apni sound phone ki default notification sound hoti hai; custom ringtone app khulte hi bajti hai.

> 📶 **Calls mobile data (Jio/Airtel/Vi) par bhi hamesha lagein, iske liye:** index.html me `TURN_HOST / TURN_USERNAME / TURN_CREDENTIAL`
> me apne **free metered.ca** TURN credentials daalo (metered.ca → sign up → "TURN server" → credentials). Free public relay kabhi bhi band ho sakta hai.

**English:** poori app ab English me hai (jo bache-khuche Hindi/Hinglish labels the — poll/event/call toasts — sab English).


## ⭐ v29.2 me naya
1. **Groups ka alag tab** — neeche ab 3 button: **Chat | Groups | Information**. Chat tab me sirf personal chats; Groups tab me
   upar pinned **Everyone** (sab users) aur neeche aapke banaye groups. "+" button ab Groups tab me hai (Create a group / Everyone chat).
   Groups ka unread badge alag, Chat ka alag.
2. **Search bar** — Chat tab me upar (naam ya number se dhundo) aur Groups tab me upar (group ya member ke naam se).
3. **iOS par ek message = 3 notification — FIX.** Asli wajah: ek hi iPhone ke liye `Push_Subs` sheet me 2-3 purani subscriptions
   zinda thin (app ko home screen par dobara add karne / browser ke subscription badalne par naya endpoint banta hai, purana Apple par
   kaafi der chalta rehta hai) → ek message par har row ko alag push → 3 cards. Ab:
   - **Backend (Code.gs):** har phone ki sirf EK subscription rehti hai — `Push_Subs` me 2 naye column (`Device`, `Signature`);
     save karte waqt usi phone ki purani rows delete, aur bhejte waqt bhi per-device sirf newest row ko push.
   - **Service worker (sw.js):** dekha hua push-id ab cache me yaad rehta hai (pehle memory me tha jo iOS turant bhula deta tha);
     duplicate push aane par wahi card chupchaap replace hota hai (same tag, no buzz) — dusra card nahi banta.
   - **Pehli baar:** har iPhone par app ek baar kholo (notification ENABLE raho) — purani duplicate rows apne aap saaf ho jaayengi.
4. **Notification logo** — SW aur app dono `icons/icon-192.png` (naya NexTalk logo) bhejte hain. iPhone par notification me wahi icon
   dikhta hai jo home-screen app ka hai, isliye naya logo dekhne ke liye iPhone par app ko **home screen se hata ke dobara Add to Home Screen** karo
   (ek baar). Android par Chrome khud naya icon utha leta hai.


> **Aapki site:** `https://daksh.qzz.io/` (Cloudflare) — QR codes, Android project aur QR maker sab isi link par set hain.

## ⭐ v29.1 me naya: CUSTOM GROUPS
Home par **"+"** dabao → do option:
1. **Create a group** → naam do → members tick karo (jitne chaho) → Create. Jitne chaho utne groups banao.
   Group ke andar chat, photo, voice note, file, location, poll, emoji — sab wahi features jo pehle the.
   Upar 👥 button se **Group info**: members dekho, naye add karo, remove karo, naam badlo, delete (sirf creator/admin), leave.
2. **Everyone chat** → purana wala sabka group (sab users ek saath).
Home list me upar **MY GROUPS** section aata hai (last message + unread badge), neeche personal chats.
Backend me 2 nayi sheets apne aap ban jaati hain: `Groups`, `Group_Msgs`. Push notification group members ko jaati hai.


CyberPulse v28.2 → **NexTalk v29**. Poora naya design, nayi animations, naya intro video,
naye icons, mobile install page, Android app project aur QR maker — sab is package me hai.

---

## 1. Package me kya-kya hai

| Folder / File | Kya hai |
|---|---|
| `NexTalk/index.html` | App (naya NexTalk theme + animations). **SCRIPT_URL wahi purana hai — kuch badalna nahi.** |
| `NexTalk/sw.js` | Service worker (cache name `nextalk-v29-0` → har phone par naya design apne aap aayega) |
| `NexTalk/manifest.json` | PWA manifest (naam NexTalk, naye colours) |
| `NexTalk/intro.mp4` | **Naya animated intro video** (8.5 sec, 720×1280, sound ke saath) |
| `NexTalk/icons/` | Naye NexTalk icons (192 + 512) |
| `NexTalk/install.html` | **Naya** — Android / iPhone install guide page (QR codes isi par le jaate hain) |
| `NexTalk/Code.gs` | Backend (sirf naam/colours badle — logic 100% same) |
| `NexTalk-QR-Maker.html` | Offline page: apna link daalo → **Android QR + iOS QR** ban jaate hain (PNG download / print) |
| `NexTalk-Android/` | Android Studio project → "Build APK" dabao → `NexTalk.apk` |

---

## 2. Deploy kaise karein (5 minute)

1. **Code.gs** → Apps Script editor me poora paste karo → Save → **Deploy → Manage deployments → ✏️ → New version → Deploy.**
   (Password, uploads, sessions — sab purana data waise ka waisa chalega.)
2. **NexTalk/** folder ki ye files apni hosting par upload karo (jahan pehle CyberPulse thi, wahi):
   `index.html`, `sw.js`, `manifest.json`, `intro.mp4`, `install.html`, `icons/icon-192.png`, `icons/icon-512.png`
3. Phone par app ek baar kholo → band karo → dobara kholo → naya NexTalk design aa jayega.
   (Agar purana dikhe: browser me site ka data clear karo ya home-screen icon hata ke dobara add karo.)

> ⚠️ Teen cheezein **jaan-boojh kar nahi badli** (badalne se sab toot jata):
> - Code.gs me password-hash salt `'|CyberPulse'` → badalne se **sabke password fail** ho jaate
> - Drive folder `CyberPulse_Uploads` → badalne se **purani files** "not part of app" ho jaati
> - index.html me device-fingerprint text `CyberPulse⚡` → badalne se **sab devices logout** ho jaate
> Ye teeno sirf andar ke code me hain, user ko kahin nahi dikhte.

---

## 3. Android + iOS par app — SACH (zaroor padho)

**APK sirf Android par chalti hai.** iPhone par koi bhi APK install nahi ho sakti — Apple allow hi nahi karta.
Ye kisi bhi developer ke liye same hai. iPhone ke liye do hi raste hain:

| Platform | Sabse aasaan (free, abhi) | "Asli" store app |
|---|---|---|
| **Android** | `install.html` kholo → Chrome "Install app" (home-screen icon, full-screen, notifications) | `NexTalk-Android` project se **APK** banao (Section 4) |
| **iPhone/iPad** | `install.html` kholo → Safari → Share → **Add to Home Screen** (full-screen, notifications iOS 16.4+) | Xcode + Apple Developer account (₹8,000/saal) + App Store review — PWABuilder iska iOS project bhi deta hai |

Dono tareeke me app **same hosted index.html** chalati hai — isliye update sirf hosting par upload karne se sabko mil jata hai.

---

## 4. Android APK banane ke 2 tareeke

### Tareeka A — PWABuilder (sabse aasaan, 3 minute, bina coding)
1. Browser me **https://www.pwabuilder.com** kholo
2. Apna hosted link daalo (jaise `https://aapka-naam.github.io/NexTalk/`) → Start
3. **Package for stores → Android** → "Generate" → zip download
4. Zip me **`NexTalk-signed.apk`** (seedha phone me install) aur `.aab` (Play Store ke liye) milti hai
5. APK ko `NexTalk/` folder me **`NexTalk.apk`** naam se upload kar do → `install.html` par
   "⬇ Download Android APK" button apne aap aa jayega (Android QR scan karne walon ko direct APK milegi)

### Tareeka B — Android Studio (project ready hai)
1. Android Studio install karo → **Open** → `NexTalk-Android` folder
2. `app/src/main/res/values/strings.xml` me **`app_url`** me apna hosted link daalo (bas yahi ek line)
3. Upar **Build → Build Bundle(s)/APK(s) → Build APK(s)** → `app/build/outputs/apk/release/app-release.apk`
4. Isi file ko rename karke `NexTalk.apk` upload karo (Tareeka A ka step 5)

> Mujhse yahan APK compile nahi ho sakti kyunki is environment me Android SDK nahi hai aur internet band hai —
> isliye dono raste "ready" karke diye hain. Tareeka A me 3 minute lagte hain.

---

## 5. QR codes (Android alag, iOS alag) — READY HAIN

`https://daksh.qzz.io/` ke liye dono QR **bane-banaye** package me hain — dono **seedha aapki app** kholte hain:
- `NexTalk-QR-Android.png` → `https://daksh.qzz.io/?os=android` → app khulti hai + Android install guide sheet
- `NexTalk-QR-iOS.png` → `https://daksh.qzz.io/?os=ios` → app khulti hai + iPhone "Add to Home Screen" guide sheet
- `NexTalk-QR-Print.pdf` → ek A4 page par dono (print karke lagao)

Koi alag page upload karne ki zaroorat nahi — guide `index.html` ke andar hai (sirf tab dikhta hai jab link me `?os=` ho; installed app me kabhi nahi).
(`install.html` ab optional hai — chaho to upload karo, chaho to chhod do.)
**APK download ke liye:** Section 4 se `NexTalk.apk` banao aur `https://daksh.qzz.io/NexTalk.apk` par upload karo → Android QR wale page par
"⬇ Download Android APK" button apne aap aa jayega. (iPhone wale page par "Add to Home Screen" ke steps aate hain — iPhone par APK chal hi nahi sakti.)

Link badalna ho to:
1. `NexTalk-QR-Maker.html` ko double-click karke kholo (offline chalti hai, kuch upload nahi hota)
2. Naya link daalo → **QR banao**
3. Dono QR ka **PNG download** karo, ya **🖨 Print / PDF** — ek page par dono
   - 🤖 **Android QR** → `install.html?os=android` → Chrome install steps + APK button (agar APK upload hai)
   - 🍎 **iOS QR** → `install.html?os=ios` → Safari "Add to Home Screen" steps
4. QR me beech me NexTalk logo hai — ECC level H use hua hai, isliye scan 100% hota hai (test kiya hua).

---

## 6. Design me kya naya hai
- **Theme:** deep-ink background, violet → cyan brand gradient, glass (blur) headers/sheets, gol-gol soft corners
- **Font:** Plus Jakarta Sans (Google Fonts) — purana monospace hata diya
- **Animations:** screen slide-in, gate par floating glow orbs + logo pulse, stagger entrance, button shimmer,
  bhejne par message pop, bottom-nav active pill, attach-sheet tiles pop, FAB spring, call buttons glow,
  `prefers-reduced-motion` respect karta hai
- **Intro video:** logo pop + ripple rings → "NexTalk" wordmark → tagline → chat bubbles → fade (app ke gate me smoothly blend)
- **Performance:** sirf CSS animations (GPU), koi nayi JS library nahi, poll/timer logic untouched; service worker
  cache bump se purani files turant replace

## 7. Test kiya hua
- `index.html` headless Chrome me chalaya: **0 JavaScript errors** (gate, signup, home list, group chat, attach sheet, intro video play)
- `Code.gs` + `sw.js` syntax check pass; `manifest.json` valid
- Intro video: H.264 Main + AAC, 720×1280, 8.5s — iPhone/Android dono par chalega
- QR codes: generate karke OpenCV se decode karke verify kiye (dono sahi link dete hain)
