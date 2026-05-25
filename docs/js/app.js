// ============================================================
//  MyLive — Frontend Viewer (GitHub Pages compatible)
// ============================================================

const STORAGE_KEY = 'mylive_config';

// DOM Elements
const video        = document.getElementById('video');
const overlay      = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub   = document.getElementById('overlay-subtitle');
const statusBadge  = document.getElementById('status-badge');
const protocolTag  = document.getElementById('protocol-tag');
const modal        = document.getElementById('settings-modal');
const serverInput  = document.getElementById('server-url');
const keyInput     = document.getElementById('stream-key');
const btnSettings  = document.getElementById('btn-settings');
const btnClose     = document.getElementById('btn-close-modal');
const btnConnect   = document.getElementById('btn-connect');
const btnDisconnect = document.getElementById('btn-disconnect');

// State
let config     = loadConfig();
let connected  = false;
let flvPlayer  = null;
let hlsPlayer  = null;
let pollTimer  = null;
let protocol   = 'auto'; // 'auto' | 'flv' | 'hls'

// ===== Helpers =====

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function saveConfig() {
  const data = {
    serverUrl: serverInput.value.trim().replace(/\/+$/, ''),
    streamKey: keyInput.value.trim() || 'mystream',
    protocol
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

function toast(msg) {
  const el   = document.getElementById('toast');
  const text = document.getElementById('toast-text');
  text.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ===== Modal =====

function openModal() {
  modal.classList.remove('hidden');
  if (config) {
    serverInput.value = config.serverUrl || '';
    keyInput.value    = config.streamKey || 'mystream';
    setProtocolRadio(config.protocol || 'auto');
  }
  updateModalButtons();
}

function closeModal() {
  modal.classList.add('hidden');
}

function updateModalButtons() {
  if (connected) {
    btnDisconnect.classList.remove('hidden');
  } else {
    btnDisconnect.classList.add('hidden');
  }
}

btnSettings.addEventListener('click', openModal);
btnClose.addEventListener('click', closeModal);

// Close modal on backdrop click
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

// ===== Protocol Radio Buttons =====

const radioItems = document.querySelectorAll('.radio-item');
radioItems.forEach(item => {
  item.addEventListener('click', () => {
    radioItems.forEach(r => r.classList.remove('active'));
    item.classList.add('active');
    item.querySelector('input').checked = true;
    protocol = item.dataset.value;
  });
});

function setProtocolRadio(val) {
  protocol = val;
  radioItems.forEach(r => {
    const isActive = r.dataset.value === val;
    r.classList.toggle('active', isActive);
    r.querySelector('input').checked = isActive;
  });
}

// ===== Connect / Disconnect =====

btnConnect.addEventListener('click', () => {
  const url = serverInput.value.trim();
  if (!url) {
    toast('⚠️ أدخل رابط الخادم أولاً');
    serverInput.focus();
    return;
  }
  config = saveConfig();
  closeModal();
  startConnection();
  toast('✅ جاري الاتصال بالخادم...');
});

btnDisconnect.addEventListener('click', () => {
  stopConnection();
  closeModal();
  toast('🔌 تم قطع الاتصال');
});

// ===== Stream Connection Logic =====

function startConnection() {
  stopConnection(); // clean up first
  connected = true;

  overlayTitle.textContent = 'جاري البحث عن البث...';
  overlaySub.textContent   = 'يتم فحص حالة الخادم تلقائياً';
  overlay.classList.remove('hidden');

  updateStatus(false);
  checkStreamAndPlay();
  // Poll every 4s
  pollTimer = setInterval(checkStreamAndPlay, 4000);
}

function stopConnection() {
  connected = false;
  clearInterval(pollTimer);
  pollTimer = null;
  destroyPlayers();
  updateStatus(false);

  overlayTitle.textContent = 'في انتظار البث...';
  overlaySub.innerHTML     = 'قم بإدخال رابط خادم البث من زر <i class="fa-solid fa-link"></i> أعلاه';
  overlay.classList.remove('hidden');
  protocolTag.textContent = '—';
}

async function checkStreamAndPlay() {
  if (!connected || !config) return;

  try {
    const apiUrl = `${config.serverUrl}/api/streams`;
    const res = await fetch(apiUrl, { mode: 'cors' });
    const data = await res.json();

    const streams = data.live || {};
    const key = config.streamKey || 'mystream';
    const isLive = streams[key] && streams[key].publisher;

    if (isLive) {
      // Stream is live — start playing if not already
      if (overlay.classList.contains('hidden')) return; // already playing
      updateStatus(true);
      overlay.classList.add('hidden');
      initPlayer();
    } else {
      // Stream offline
      if (!overlay.classList.contains('hidden')) {
        overlayTitle.textContent = 'البث غير متاح حالياً';
        overlaySub.textContent   = 'سيتم الاتصال تلقائياً عند بدء البث من OBS';
      }
      updateStatus(false);
      destroyPlayers();
      overlay.classList.remove('hidden');
    }
  } catch (err) {
    // Server unreachable
    overlayTitle.textContent = 'تعذر الاتصال بالخادم';
    overlaySub.textContent   = 'تأكد أن الخادم يعمل وأن الرابط صحيح';
    overlay.classList.remove('hidden');
    updateStatus(false);
    destroyPlayers();
  }
}

// ===== Status Badge =====

function updateStatus(live) {
  if (live) {
    statusBadge.className = 'badge badge-live';
    statusBadge.querySelector('.badge-text').textContent = 'مباشر';
  } else {
    statusBadge.className = 'badge badge-offline';
    statusBadge.querySelector('.badge-text').textContent = 'غير متصل';
  }
}

// ===== Player Initialization =====

function initPlayer() {
  destroyPlayers();
  if (!config) return;

  const key = config.streamKey || 'mystream';
  let useProtocol = protocol;

  if (useProtocol === 'auto') {
    // iOS needs HLS, everything else prefers FLV for low latency
    useProtocol = isIOS() ? 'hls' : 'flv';
  }

  const flvUrl = `${config.serverUrl}/live/${key}.flv`;
  const hlsUrl = `${config.serverUrl}/live/${key}/index.m3u8`;

  if (useProtocol === 'flv') {
    if (typeof mpegts !== 'undefined' && mpegts.isSupported()) {
      playFLV(flvUrl);
      protocolTag.textContent = 'HTTP-FLV';
    } else {
      // Fallback to HLS
      playHLS(hlsUrl);
      protocolTag.textContent = 'HLS (fallback)';
    }
  } else {
    playHLS(hlsUrl);
    protocolTag.textContent = 'HLS';
  }
}

function playFLV(url) {
  flvPlayer = mpegts.createPlayer({
    type: 'flv',
    url: url,
    isLive: true,
    enableStashBuffer: false
  });
  flvPlayer.attachMediaElement(video);
  flvPlayer.load();
  video.muted = true; // needed for autoplay
  flvPlayer.play().catch(() => {});

  flvPlayer.on(mpegts.Events.ERROR, () => {
    setTimeout(() => {
      if (connected) {
        destroyPlayers();
        overlay.classList.remove('hidden');
        overlayTitle.textContent = 'انقطع الاتصال...';
        overlaySub.textContent   = 'جاري إعادة الاتصال تلقائياً';
      }
    }, 1500);
  });
}

function playHLS(url) {
  if (typeof Hls !== 'undefined' && Hls.isSupported()) {
    hlsPlayer = new Hls({
      maxLiveSyncPlaybackRate: 1.5,
      liveSyncDurationCount: 3
    });
    hlsPlayer.loadSource(url);
    hlsPlayer.attachMedia(video);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      video.muted = true;
      video.play().catch(() => {});
    });
    hlsPlayer.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hlsPlayer.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hlsPlayer.recoverMediaError();
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS (Safari / iOS)
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }
}

function destroyPlayers() {
  if (flvPlayer) {
    try {
      flvPlayer.pause();
      flvPlayer.unload();
      flvPlayer.detachMediaElement();
      flvPlayer.destroy();
    } catch (e) { /* ignore */ }
    flvPlayer = null;
  }
  if (hlsPlayer) {
    try { hlsPlayer.destroy(); } catch (e) { /* ignore */ }
    hlsPlayer = null;
  }
  video.removeAttribute('src');
  video.load();
}

// ===== Auto-connect on page load =====

window.addEventListener('DOMContentLoaded', () => {
  if (config && config.serverUrl) {
    serverInput.value = config.serverUrl;
    keyInput.value    = config.streamKey || 'mystream';
    setProtocolRadio(config.protocol || 'auto');
    startConnection();
  }
});
