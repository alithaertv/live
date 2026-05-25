const express = require('express');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const EXPRESS_PORT = 3000;
const NMS_HTTP_PORT = 8000;
const NMS_RTMP_PORT = 1935;

// الحصول على عنوان IP الخاص بالجهاز في الشبكة المحلية (LAN)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // البحث عن عنوان IPv4 داخلي غير افتراضي (non-loopback)
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();

// دالة لفحص هل FFmpeg مثبت ومتاح في سطر الأوامر
function checkFfmpeg() {
  return new Promise((resolve) => {
    exec('ffmpeg -version', (error) => {
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

async function startServer() {
  const hasFfmpeg = await checkFfmpeg();
  
  console.log('--------------------------------------------------');
  console.log('📡 فحص متطلبات النظام...');
  if (hasFfmpeg) {
    console.log('✅ تم العثور على FFmpeg بنجاح! سيتم تفعيل دعم البث للهواتف (HLS).');
  } else {
    console.log('⚠️ لم يتم العثور على FFmpeg.');
    console.log('💡 لتشغيل البث على هواتف iPhone/Safari، يرجى تثبيت FFmpeg باستخدام الأمر:');
    console.log('   winget install ffmpeg');
    console.log('   ثم قم بإعادة تشغيل هذا الخادم.');
  }
  console.log('--------------------------------------------------');

  // إعدادات Node Media Server
  const nmsConfig = {
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

  // تفعيل تحويل HLS فقط إذا كان FFmpeg متوفراً
  if (hasFfmpeg) {
    nmsConfig.trans = {
      ffmpeg: 'ffmpeg',
      tasks: [
        {
          app: 'live',
          hls: true,
          hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
          dash: true,
          dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
        }
      ]
    };
  }

  // تشغيل خادم البث
  const nms = new NodeMediaServer(nmsConfig);
  nms.run();

  // إعداد Express لتقديم ملفات الواجهة الأمامية
  app.use(express.static(path.join(__dirname, 'public')));

  // نقطة نهاية (API) لتوفير معلومات البث للواجهة الأمامية
  app.get('/api/status', (req, res) => {
    res.json({
      hasFfmpeg,
      localIp,
      ports: {
        express: EXPRESS_PORT,
        rtmp: NMS_RTMP_PORT,
        nmsHttp: NMS_HTTP_PORT
      },
      urls: {
        rtmpServer: `rtmp://${localIp}/live`,
        flvStream: `http://${localIp}:${NMS_HTTP_PORT}/live/mystream.flv`,
        hlsStream: `http://${localIp}:${NMS_HTTP_PORT}/live/mystream/index.m3u8`
      }
    });
  });

  // تشغيل خادم ويب الواجهة الأمامية
  app.listen(EXPRESS_PORT, () => {
    console.log('\n==================================================');
    console.log('🚀 خادم واجهة المستخدم يعمل بنجاح!');
    console.log(`💻 للحاسوب: http://localhost:${EXPRESS_PORT}`);
    console.log(`📱 للهاتف (في نفس الشبكة): http://${localIp}:${EXPRESS_PORT}`);
    console.log('==================================================\n');
  });
}

startServer().catch(err => {
  console.error('❌ خطأ أثناء تشغيل الخادم:', err);
});
