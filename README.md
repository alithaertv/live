# 📡 MyLive — بث مباشر من OBS إلى موقعك على GitHub Pages

موقع ويب ثابت يُرفع على **GitHub Pages** (مجاناً) لعرض البث المباشر القادم من برنامج **OBS Studio**.

---

## 🔧 كيف يعمل النظام؟

```
OBS Studio ──RTMP──▶ خادم الوسائط (جهازك) ──ngrok──▶ الإنترنت
                                                          │
                                GitHub Pages (الموقع) ◀───┘
                                  المشاهدون يفتحون الموقع ويشاهدون البث
```

1. **جهازك** يشغّل خادم الوسائط (`server.js`) الذي يستقبل بث RTMP من OBS.
2. **ngrok** يكشف هذا الخادم للإنترنت عبر رابط عام مجاني.
3. **GitHub Pages** يستضيف واجهة المشاهدة (مجلد `docs/`) — يفتحها أي شخص ويشاهد البث.

---

## 🚀 خطوات التشغيل الكاملة

### الخطوة 1: تثبيت الاعتماديات (مرة واحدة فقط)

```bash
npm install
```

### الخطوة 2: رفع المشروع على GitHub

1. أنشئ مستودع جديد على [github.com/new](https://github.com/new).
2. ارفع ملفات المشروع:

```bash
git init
git add .
git commit -m "Initial commit - MyLive streaming site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mylive.git
git push -u origin main
```

### الخطوة 3: تفعيل GitHub Pages

1. افتح إعدادات المستودع على GitHub ← **Settings** ← **Pages**.
2. في خانة **Source** اختر: **Deploy from a branch**.
3. في خانة **Branch** اختر: `main` والمجلد: `/docs`.
4. اضغط **Save**.
5. بعد دقيقة سيظهر لك رابط الموقع: `https://YOUR_USERNAME.github.io/mylive/`

### الخطوة 4: تشغيل خادم البث على جهازك

```bash
npm start
```

### الخطوة 5: كشف الخادم للإنترنت عبر ngrok

1. حمّل [ngrok](https://ngrok.com/download) (مجاني).
2. افتح نافذة أوامر جديدة وشغّل:

```bash
ngrok http 8000
```

3. انسخ الرابط الذي يظهر (مثل `https://abc123.ngrok-free.app`).

### الخطوة 6: ضبط OBS Studio

| الإعداد | القيمة |
|---------|--------|
| Service | Custom... |
| Server  | `rtmp://localhost/live` |
| Stream Key | `mystream` |

اضغط **Start Streaming** في OBS.

### الخطوة 7: المشاهدة!

1. افتح موقعك: `https://YOUR_USERNAME.github.io/mylive/`
2. اضغط زر 🔗 في الأعلى.
3. الصق رابط ngrok (مثل `https://abc123.ngrok-free.app`).
4. اضغط **اتصال** — سيظهر البث المباشر! 🎉

---

## 📁 هيكل المشروع

```
mylive/
├── server.js          ← خادم الوسائط (يعمل على جهازك)
├── package.json
├── docs/              ← هذا المجلد يُنشر على GitHub Pages
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
└── README.md
```

---

## 💡 ملاحظات مهمة

- **ngrok المجاني** يعطيك رابطاً مؤقتاً يتغير في كل مرة تشغله. للحصول على رابط ثابت، يمكنك الاشتراك في خطة ngrok المدفوعة أو استخدام بديل مثل Cloudflare Tunnel.
- **دعم الهواتف (HLS)**: لتشغيل البث على هواتف iPhone/Safari، يجب تثبيت FFmpeg على جهازك:
  ```
  winget install ffmpeg
  ```
  ثم أعد تشغيل `server.js`.
