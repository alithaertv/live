const NodeMediaServer = require('node-media-server');
const os = require('os');
const { exec } = require('child_process');

const NMS_HTTP_PORT = 8000;
const NMS_RTMP_PORT = 1935;

// الحصول على عنوان IP المحلي
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// فحص وجود FFmpeg
function checkFfmpeg() {
  return new Promise((resolve) => {
    exec('ffmpeg -version', (error) => resolve(!error));
  });
}

async function start() {
  const hasFfmpeg = await checkFfmpeg();
  const localIp = getLocalIp();

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║        📡 خادم البث المباشر - Live Server       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  if (hasFfmpeg) {
    console.log('  ✅ FFmpeg متوفر → دعم HLS للهواتف مفعّل');
  } else {
    console.log('  ⚠️  FFmpeg غير متوفر → FLV فقط (الحواسيب)');
    console.log('  💡 لتفعيل دعم الهواتف: winget install ffmpeg');
  }

  // إعدادات Node Media Server
  const config = {
    rtmp: {
      port: NMS_RTMP_PORT,
      chunk_size: 4096,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60
    },
    http: {
      port: NMS_HTTP_PORT,
      allow_origin: '*',
      mediaroot: './media'
    }
  };

  if (hasFfmpeg) {
    config.trans = {
      ffmpeg: 'ffmpeg',
      tasks: [{
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]'
      }]
    };
  }

  const nms = new NodeMediaServer(config);
  nms.run();

  console.log('');
  console.log('  ─────────────────────────────────────────────');
  console.log('');
  console.log('  🎥 إعدادات OBS Studio:');
  console.log(`     Server:     rtmp://${localIp}/live`);
  console.log('     Stream Key: mystream');
  console.log('');
  console.log('  ─────────────────────────────────────────────');
  console.log('');
  console.log('  🌐 الخطوة التالية: كشف الخادم للإنترنت عبر ngrok:');
  console.log(`     ngrok http ${NMS_HTTP_PORT}`);
  console.log('');
  console.log('  ثم انسخ رابط ngrok وضعه في موقعك على GitHub Pages');
  console.log('  لبدء البث المباشر للعالم! 🚀');
  console.log('');
}

start().catch(err => console.error('❌ خطأ:', err));
