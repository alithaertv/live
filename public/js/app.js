// متغيرات التطبيق
let streamConfig = null;
let isStreamOnline = false;
let checkInterval = null;
let mpegtsPlayer = null;
let hlsPlayer = null;
let currentProtocol = 'auto'; // 'auto', 'flv', 'hls'
let selectedProtocol = 'FLV'; // البروتوكول الفعلي المستخدم حالياً
const videoElement = document.getElementById('video-player');

// اكتشاف هل الجهاز يعمل بنظام iOS (iPhone/iPad)
function checkIsIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const isIOS = checkIsIOS();

// جلب الإعدادات ومعلومات الخادم عند بدء التشغيل
async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    streamConfig = await response.json();
    
    // تحديث حقول التعليمات والنسخ
    document.getElementById('rtmp-url').value = streamConfig.urls.rtmpServer;
    document.getElementById('lan-url').innerText = `http://${streamConfig.localIp}:${streamConfig.ports.express}`;
    
    // تحديث كارت دعم الهواتف (FFmpeg)
    updateFfmpegCard(streamConfig.hasFfmpeg);
    
    // بدء فحص حالة البث
    startStatusPolling();
  } catch (error) {
    console.error('Error fetching server status:', error);
  }
}

// تحديث كارت الـ FFmpeg بناءً على توفره في النظام
function updateFfmpegCard(hasFfmpeg) {
  const card = document.getElementById('ffmpeg-card');
  const icon = document.getElementById('ffmpeg-icon');
  const title = document.getElementById('ffmpeg-title');
  const body = document.getElementById('ffmpeg-body');
  
  if (hasFfmpeg) {
    card.className = "glass-panel info-card";
    icon.className = "fa-solid fa-circle-check header-icon text-success";
    title.innerText = "دعم الهواتف (HLS) مفعّل";
    body.innerHTML = `
      <p>✅ تم العثور على أداة <strong>FFmpeg</strong> بنجاح!</p>
      <p>يتم الآن توليد بث HLS تلقائياً، مما يسمح لهواتف <strong>iPhone</strong> ومتصفح <strong>Safari</strong> وأي أجهزة ذكية أخرى بمشاهدة البث مباشرة وسلاسة.</p>
    `;
    document.getElementById('stat-mobile-support').innerText = "مفعّل (HLS)";
    document.getElementById('stat-mobile-support').className = "stat-value text-success";
  } else {
    card.className = "glass-panel info-card warning-ffmpeg";
    icon.className = "fa-solid fa-triangle-exclamation header-icon text-danger";
    title.innerText = "دعم الهواتف (HLS) غير مفعّل";
    body.innerHTML = `
      <p>⚠️ لم يتم العثور على أداة <strong>FFmpeg</strong> على هذا الحاسوب.</p>
      <p>لتشغيل البث على هواتف <strong>iPhone</strong> أو متصفح <strong>Safari</strong>، نحتاج لتقسيم البث بصيغة HLS والتي تتطلب FFmpeg.</p>
      <p><strong>طريقة التفعيل سهلة جداً:</strong></p>
      <ol style="margin-right: 20px; font-size: 0.8rem; margin-top: 5px;">
        <li>افتح سطر الأوامر (PowerShell) كمسؤول (Administrator).</li>
        <li>انسخ الأمر التالي واضغط Enter لتثبيت الأداة:</li>
      </ol>
      <code style="cursor:pointer;" onclick="copyText('winget install ffmpeg')">winget install ffmpeg</code>
      <p style="font-size: 0.78rem;">3. بعد اكتمال التثبيت، <strong>أعد تشغيل خادم البث (node server.js)</strong>.</p>
    `;
    document.getElementById('stat-mobile-support').innerText = "معطل (متاح FLV فقط)";
    document.getElementById('stat-mobile-support').className = "stat-value text-danger";
  }
}

// فحص دوري لحالة البث من خادم NMS
function startStatusPolling() {
  checkStreamStatus();
  // فحص كل 3 ثواني
  checkInterval = setInterval(checkStreamStatus, 3000);
}

async function checkStreamStatus() {
  if (!streamConfig) return;
  
  try {
    // الاتصال بمنفذ NMS HTTP لجلب حالة القنوات النشطة
    const response = await fetch(`http://${streamConfig.localIp}:${streamConfig.ports.nmsHttp}/api/streams`);
    const data = await response.json();
    
    // التحقق مما إذا كان هناك بث نشط باسم mystream
    const liveStreams = data.live || {};
    const isLive = liveStreams.mystream && liveStreams.mystream.publisher;
    
    if (isLive) {
      if (!isStreamOnline) {
        // البث تحول من مغلق إلى مفتوح
        isStreamOnline = true;
        updateStatusUI(true);
        initPlayer();
      }
    } else {
      if (isStreamOnline) {
        // البث تحول من مفتوح إلى مغلق
        isStreamOnline = false;
        updateStatusUI(false);
        destroyPlayer();
      }
    }
  } catch (error) {
    // في حال فشل الخادم أو حدوث مشكلة اتصال، نعتبر البث غير متصل
    if (isStreamOnline) {
      isStreamOnline = false;
      updateStatusUI(false);
      destroyPlayer();
    }
  }
}

// تحديث الواجهة عند تغيير الحالة
function updateStatusUI(online) {
  const statusBadge = document.getElementById('stream-status');
  const overlay = document.getElementById('offline-overlay');
  
  if (online) {
    statusBadge.className = "status-badge live";
    statusBadge.querySelector('.text').innerText = "مباشر الآن";
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);
  } else {
    statusBadge.className = "status-badge offline";
    statusBadge.querySelector('.text').innerText = "غير متصل";
    overlay.style.display = 'flex';
    setTimeout(() => {
      overlay.style.opacity = '1';
    }, 50);
  }
}

// تشغيل وتجهيز مشغل الفيديو المناسب للجهاز والمتصفح
function initPlayer() {
  destroyPlayer(); // مسح أي مشغلات قديمة
  
  if (!streamConfig) return;

  // تحديد البروتوكول المناسب
  let protocolToUse = 'FLV';
  
  if (currentProtocol === 'auto') {
    if (isIOS) {
      protocolToUse = 'HLS';
    } else {
      // إذا كان الجهاز يدعم MediaSource فسنفضل FLV للتأخير المنخفض جداً
      if (mpegts.isSupported()) {
        protocolToUse = 'FLV';
      } else if (Hls.isSupported() && streamConfig.hasFfmpeg) {
        protocolToUse = 'HLS';
      } else {
        // إذا كان يدعم HLS نيتيفلي
        protocolToUse = 'HLS';
      }
    }
  } else {
    protocolToUse = currentProtocol.toUpperCase();
  }

  // إذا تم اختيار HLS ولكن FFmpeg غير متوفر
  if (protocolToUse === 'HLS' && !streamConfig.hasFfmpeg) {
    // محاولة الرجوع لـ FLV إذا أمكن
    if (mpegts.isSupported()) {
      protocolToUse = 'FLV';
    }
  }

  selectedProtocol = protocolToUse;
  document.getElementById('player-protocol-badge').innerText = protocolToUse;
  
  const latencyStat = document.getElementById('stat-latency');
  if (protocolToUse === 'FLV') {
    latencyStat.innerText = "منخفض جداً (~1 ثانية)";
    latencyStat.className = "stat-value text-success";
    playFLV(streamConfig.urls.flvStream);
  } else {
    latencyStat.innerText = "متوسط (~5-8 ثواني)";
    latencyStat.className = "stat-value";
    playHLS(streamConfig.urls.hlsStream);
  }
}

// تشغيل بث FLV
function playFLV(url) {
  console.log("Playing via HTTP-FLV:", url);
  if (mpegts.isSupported()) {
    mpegtsPlayer = mpegts.createPlayer({
      type: 'flv',
      url: url,
      isLive: true,
      enableStashBuffer: false // لتقليل التأخير إلى أقصى حد
    });
    mpegtsPlayer.attachMediaElement(videoElement);
    mpegtsPlayer.load();
    
    // تشغيل تلقائي وتخطي أي أخطاء التشغيل التلقائي الصامتة
    mpegtsPlayer.play().catch(error => {
      console.log("Auto-play was prevented. Waiting for user interaction.");
    });

    // معالجة أخطاء البث وإعادة الاتصال التلقائي
    mpegtsPlayer.on(mpegts.Events.ERROR, (type, detail, info) => {
      console.error("Player Error:", type, detail, info);
      setTimeout(() => {
        if (isStreamOnline) initPlayer();
      }, 2000);
    });
  }
}

// تشغيل بث HLS
function playHLS(url) {
  console.log("Playing via HLS:", url);
  
  // 1. الدعم عبر مكتبة hls.js (متصفحات أندرويد والحاسوب غير Safari)
  if (Hls.isSupported()) {
    hlsPlayer = new Hls({
      maxLiveSyncPlaybackRate: 1.5,
      liveSyncDurationCount: 3
    });
    hlsPlayer.loadSource(url);
    hlsPlayer.attachMediaElement(videoElement);
    
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      videoElement.play().catch(e => console.log("Auto-play prevented"));
    });
    
    hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hlsPlayer.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hlsPlayer.recoverMediaError();
            break;
          default:
            setTimeout(() => {
              if (isStreamOnline) initPlayer();
            }, 2000);
            break;
        }
      }
    });
  } 
  // 2. الدعم النيتيف (مثل Safari على iOS و MacOS)
  else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
    videoElement.src = url;
    videoElement.addEventListener('loadedmetadata', () => {
      videoElement.play().catch(e => console.log("Auto-play prevented"));
    });
  } else {
    console.error("HLS not supported on this device/browser.");
  }
}

// تدمير مشغل الفيديو الجاري تشغيله وتنظيف الذاكرة
function destroyPlayer() {
  if (mpegtsPlayer) {
    try {
      mpegtsPlayer.pause();
      mpegtsPlayer.unload();
      mpegtsPlayer.detachMediaElement();
      mpegtsPlayer.destroy();
    } catch (e) { console.error(e); }
    mpegtsPlayer = null;
  }
  
  if (hlsPlayer) {
    try {
      hlsPlayer.destroy();
    } catch (e) { console.error(e); }
    hlsPlayer = null;
  }
  
  videoElement.src = '';
  videoElement.removeAttribute('src');
  videoElement.load();
}

// التبديل بين الصيغ يدوياً للمستخدمين المتقدمين
document.getElementById('btn-toggle-protocol').addEventListener('click', () => {
  if (currentProtocol === 'auto') {
    currentProtocol = 'flv';
  } else if (currentProtocol === 'flv') {
    currentProtocol = 'hls';
  } else {
    currentProtocol = 'auto';
  }
  
  document.getElementById('current-protocol-text').innerText = 
    currentProtocol === 'auto' ? 'تلقائي' : currentProtocol.toUpperCase();
    
  // إذا كان البث يعمل، نقوم بإعادة تهيئة المشغل بالخيار الجديد
  if (isStreamOnline) {
    initPlayer();
  }
});

// نسخ النصوص إلى الحافظة وتأكيد العملية
function copyToClipboard(inputId) {
  const input = document.getElementById(inputId);
  input.select();
  input.setSelectionRange(0, 99999); // للهواتف
  
  navigator.clipboard.writeText(input.value).then(() => {
    showToast();
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast();
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.className = "toast show";
  setTimeout(() => {
    toast.className = "toast";
  }, 2000);
}

// بدء التطبيق عند فتح الصفحة
window.addEventListener('DOMContentLoaded', fetchStatus);
