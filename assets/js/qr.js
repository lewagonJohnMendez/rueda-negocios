// assets/js/qr.js
import { store } from './store.js';
import { qs } from './dom.js';

let stream = null;
let rafId = null;          // requestAnimationFrame id
let scanning = false;
let offscreen = null;      // canvas fuera de DOM para leer frames
let ctx = null;
let lastDecodeAt = 0;

export async function initQR(){
  const status = qs('#qr-status');
  status.textContent = 'Listo para escanear. Pulsa “Iniciar escaneo”.';

  // botones
  const btnStart = qs('#qr-start');
  const btnStop  = qs('#qr-stop');
  const fileInput = qs('#qr-file');

  btnStart.disabled = false;
  btnStop.disabled = true;

  btnStart.onclick = async () => {
    await startCamera();         // tu función mejorada abajo
    startLiveScan();             // arranca loop de decodificación
    btnStart.disabled = true;
    btnStop.disabled  = false;
    status.textContent = 'Escaneando… centra el código en el recuadro.';
  };

  btnStop.onclick = async () => {
    await stopScanAll();
    btnStart.disabled = false;
    btnStop.disabled  = true;
    status.textContent = 'Escaneo detenido.';
  };

  // Fallback: leer QR desde imagen
  fileInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      // dibujar en canvas offscreen y decodificar una vez
      ensureCanvas(img.width, img.height);
      ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
      const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) handleDecodedText(code.data);
      else qs('#qr-status').textContent = 'No se pudo leer el QR de la imagen.';
    };
    img.src = URL.createObjectURL(file);
  };
}

export async function destroyQR(){
  await stopScanAll();
}

/* === cámara === */
export async function startCamera() {
  try {
    stopCamera();
    // HTTPS/localhost es requerido
    const isSecure = location.protocol === 'https:' || ['localhost','127.0.0.1'].includes(location.hostname);
    if (!isSecure) throw new Error('La cámara requiere HTTPS o localhost');

    // preferir cámara trasera
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    const video = document.getElementById('camera-preview');
    video.srcObject = stream;
    await video.play();

    // preparar canvas offscreen del tamaño del video
    ensureCanvas(video.videoWidth || 640, video.videoHeight || 480);
  } catch (err) {
    console.error('Error al acceder a la cámara: ', err);
    setStatus('No se pudo acceder a la cámara. Revisa permisos o HTTPS.');
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

/* === loop de escaneo en vivo === */
function startLiveScan(){
  if (scanning) return;
  scanning = true;
  const video = document.getElementById('camera-preview');

  const tick = () => {
    if (!scanning) return;
    // solo si el video está listo
    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth && video.videoHeight) {
      ensureCanvas(video.videoWidth, video.videoHeight);
      ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
      const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);

      // decodificar con jsQR
      const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
      });

      if (code && code.data) {
        // debounce para evitar múltiples lecturas
        const now = Date.now();
        if (now - lastDecodeAt > 800) {
          lastDecodeAt = now;
          handleDecodedText(code.data);
          // UX tipo “otras web apps”: detenemos al leer una vez
          stopScanAll();
          return;
        }
      }
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

async function stopScanAll(){
  scanning = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  stopCamera();
}

function ensureCanvas(w, h){
  if (!offscreen) offscreen = document.createElement('canvas');
  if (offscreen.width !== w || offscreen.height !== h) {
    offscreen.width = w;
    offscreen.height = h;
  }
  if (!ctx) ctx = offscreen.getContext('2d', { willReadFrequently: true });
}

/* === manejo del resultado === */
function handleDecodedText(text){
  const out = qs('#scan-result');
  out.textContent = `Contenido escaneado: ${text}`;

  try{
    if (text.startsWith('BEGIN:VCARD')) {
      const patch = parseVCard(text);
      store.set(patch);
    } else {
      store.set({ notes: `QR: ${text}` });
    }
    alert('QR importado ✅');
  } catch {
    store.set({ notes: `QR: ${text}` });
  }
}

function parseVCard(vcard){
  const lines = vcard.split(/\r?\n/);
  const patch = {};
  for (const raw of lines){
    const line = raw.trim();
    if (line.startsWith('FN:'))    patch.name = line.slice(3).trim();
    if (line.startsWith('N:') && !patch.name) {
      const parts = line.slice(2).split(';');
      patch.name = parts.filter(Boolean).join(' ').trim();
    }
    if (line.startsWith('ORG:'))   patch.company = line.slice(4).trim();
    if (line.startsWith('TITLE:')) patch.position = line.slice(6).trim();
    if (/^TEL[:;]/.test(line))     patch.phone = line.split(':')[1]?.trim() ?? '';
    if (/^EMAIL[:;]/.test(line))   patch.email = line.split(':')[1]?.trim() ?? '';
  }
  return patch;
}

function setStatus(msg){ const el = qs('#qr-status'); if (el) el.textContent = msg; }
