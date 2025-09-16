// assets/js/camera.js
// Centro de control de cámara para QR/OCR

let currentStream = null;

/* =============== Seguridad =============== */
export function ensureSecure(){
  const host = location.hostname;
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1';
  const isHttps = location.protocol === 'https:';
  if (!isHttps && !isLocal) {
    throw new Error('La cámara requiere HTTPS o localhost.');
  }
}

/* ========== Listado de cámaras ========== */
export async function listVideoInputs(){
  ensureSecure();
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput');
}

/* ============== Start / Stop ============== */
export async function startCamera({ deviceId, facingMode = 'environment' } = {}){
  ensureSecure();
  stopCamera();

  // Estrategia con fallbacks
  const tries = [];
  const tryGet = async (constraints) => {
    tries.push(JSON.stringify(constraints));
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  let stream;
  try {
    // Preferido (por id o por facing)
    stream = await tryGet({
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facingMode } },
      audio: false
    });
  } catch {
    try {
      // Fallback 1: forzar environment
      stream = await tryGet({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      try {
        // Fallback 2: forzar user (frontal)
        stream = await tryGet({ video: { facingMode: 'user' }, audio: false });
      } catch {
        // Fallback 3: lo que haya
        stream = await tryGet({ video: true, audio: false });
      }
    }
  }

  currentStream = stream;
  return stream;
}

export function stopCamera(){
  if (currentStream){
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
}

export function getCurrentStream(){
  return currentStream;
}

/* ============== Helpers de video ============== */
export async function attachToVideo(videoEl, stream = currentStream){
  if (!videoEl) throw new Error('No se encontró el <video> destino');
  if (!stream) throw new Error('No hay stream de cámara activo');

  // Ayuda a evitar bloqueos de autoplay (Firefox/Safari)
  videoEl.setAttribute('playsinline', '');
  videoEl.muted = true;

  videoEl.srcObject = stream;

  // Espera a tener metadatos antes de leer dimensiones
  await waitLoadedMetadata(videoEl);

  // Intentar play tras evento de usuario normalmente no falla,
  // pero por si acaso lo reintenta.
  try {
    await videoEl.play();
  } catch {
    await new Promise(r => setTimeout(r, 0));
    await videoEl.play();
  }

  return { width: videoEl.videoWidth, height: videoEl.videoHeight };
}

function waitLoadedMetadata(videoEl){
  if (videoEl.readyState >= 1 && videoEl.videoWidth) return Promise.resolve();
  return new Promise(res => {
    const onMeta = () => { videoEl.removeEventListener('loadedmetadata', onMeta); res(); };
    videoEl.addEventListener('loadedmetadata', onMeta, { once: true });
  });
}

/* ============== Selector opcional ============== */
export async function initCameraSelector(selectId, videoId){
  const sel = document.getElementById(selectId);
  const video = document.getElementById(videoId);
  if (!sel || !video) return;

  const cams = await listVideoInputs();
  sel.innerHTML = cams.map(c => `<option value="${c.deviceId}">${c.label || 'Cámara'}</option>`).join('');

  sel.onchange = async () => {
    stopCamera();
    const stream = await startCamera({ deviceId: sel.value });
    await attachToVideo(video, stream);
  };

  if (cams.length) {
    const stream = await startCamera({ deviceId: cams[0].deviceId });
    await attachToVideo(video, stream);
  }
}
