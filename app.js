(() => {
  const startButton = document.getElementById('startButton');
  const launch = document.getElementById('launch');
  const launchStatus = document.getElementById('launchStatus');
  const hud = document.getElementById('hud');
  const hudStatus = document.getElementById('hudStatus');
  const exitButton = document.getElementById('exitButton');
  const arRoot = document.getElementById('arRoot');

  const TARGET_IMAGE = './assets/A01_master.png';
  const VIDEO_SRC = './assets/A01_kling_12s_web.mp4';
  const TARGET_HEIGHT = 1.5; // A01 target is 2:3 portrait => height/width = 1.5
  let mindBlobUrl = null;

  function status(text) {
    launchStatus.textContent = text;
  }

  async function imageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function compileTarget() {
    if (!window.MINDAR || !window.MINDAR.Compiler) {
      throw new Error('MindAR Compiler yüklenemedi. İnternet bağlantısını kontrol edin.');
    }
    status('A01 hedefi hazırlanıyor…');
    const img = await imageElement(TARGET_IMAGE);
    const compiler = new window.MINDAR.Compiler();
    await compiler.compileImageTargets([img], (progress) => {
      const pct = Math.max(0, Math.min(100, Math.round(progress)));
      status(`A01 hedefi hazırlanıyor… %${pct}`);
    });
    const buffer = await compiler.exportData();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    mindBlobUrl = URL.createObjectURL(blob);
    return mindBlobUrl;
  }

  function buildScene(targetUrl) {
    // Video element is created as a regular DOM asset so iOS can be unlocked by user gesture.
    const video = document.createElement('video');
    video.id = 'a01Video';
    video.src = VIDEO_SRC;
    video.muted = true;
    video.loop = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');
    video.style.display = 'none';
    document.body.appendChild(video);

    // Register a simple target controller once.
    if (!AFRAME.components['a01-video-controller']) {
      AFRAME.registerComponent('a01-video-controller', {
        init: function () {
          const target = this.el;
          const v = document.getElementById('a01Video');
          target.addEventListener('targetFound', async () => {
            hudStatus.textContent = 'Ağaç canlanıyor ✨';
            try {
              v.currentTime = 0;
              await v.play();
            } catch (e) {
              hudStatus.textContent = 'Videoyu başlatmak için ekrana dokunun';
              document.body.addEventListener('click', () => v.play().catch(() => {}), { once: true });
            }
          });
          target.addEventListener('targetLost', () => {
            hudStatus.textContent = 'A01 ağacını tekrar bulun…';
            v.pause();
          });
        }
      });
    }

    const scene = document.createElement('a-scene');
    scene.setAttribute('mindar-image', `imageTargetSrc: ${targetUrl}; autoStart: true; uiLoading: no; uiScanning: no; uiError: no;`);
    scene.setAttribute('color-space', 'sRGB');
    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: false; antialias: true;');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
    scene.setAttribute('embedded', '');

    scene.innerHTML = `
      <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
      <a-entity id="a01Target" mindar-image-target="targetIndex: 0" a01-video-controller>
        <a-plane
          position="0 0 0.01"
          width="1"
          height="${TARGET_HEIGHT}"
          rotation="0 0 0"
          material="shader: flat; src: #a01Video; side: double; toneMapped: false;">
        </a-plane>
      </a-entity>`;

    scene.addEventListener('arReady', () => {
      hudStatus.textContent = 'A01 ağacını bulun…';
    });
    scene.addEventListener('arError', () => {
      hudStatus.textContent = 'Kamera başlatılamadı. Kamera iznini kontrol edin.';
    });

    arRoot.appendChild(scene);
    return { scene, video };
  }

  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    try {
      // Unlock video playback inside this user gesture as much as browser allows.
      const targetUrl = await compileTarget();
      status('Kamera başlatılıyor…');
      buildScene(targetUrl);
      launch.classList.add('hidden');
      hud.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      status(err?.message || 'AR başlatılamadı.');
      startButton.disabled = false;
    }
  });

  exitButton.addEventListener('click', () => {
    location.reload();
  });
})();
