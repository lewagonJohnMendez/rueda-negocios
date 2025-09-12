import { store } from './store.js';
import { qs } from './dom.js';

let Html5Qrcode = null;
let qrInstance = null;
let currentCameraId = null;

export async function initQR(){
  const status = qs('#qr-status');
  const sel = qs('#qr-camera-select');
  const btnStart = qs('#qr-start');
  const btnStop  = qs('#qr-stop');
  const fileInput = qs('#qr-file');

  // 1) Chequeo de contexto seguro (HTTPS/localhost)
  const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!isSecure) {
    status.textContent = '⚠️ La cámara requiere HTTPS o localhost.';
  } else {
    status.textContent = 'Listo para escanear.';
  }

  // 2) Cargar librería on-demand
  if (!Html5Qrcode) {
    const mod = await import('https://unpkg.com/html5-qrcode/minified/html5-qrcode.min.js');
    Html5Qrcode = mod.Html5Qrcode;
  }

  // 3) Listar cámaras
  try {
    const devices = await Html5Qrcode.getCameras(); // pide permiso si hace falta
    sel.innerHTML = `<option value="">${devices?.length ? 'Seleccionar cámara…' : 'No hay cámaras detectadas'}</option>`;
    (devices || []).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label || `Cámara ${sel.length}`;
      sel.appendChild(opt);
    });

    // Preseleccionar “trasera” si existe
    const back = (devices || []).find(d => /back|environment/i.test(d.label));
    if (back) { sel.value = back.id; currentCameraId = back.id; }
  } catch (e) {
    status.textContent = 'No fue posible listar cámaras. Revisa permisos.';
  }

  // 4) Botón Start (necesario por política de permisos)
  btnStart.onclick = async () => {
    try {
      await startScan(sel.value || currentCameraId);
      btnStart.disabled = true;
      btnStop.disabled = false;
      status.textContent = 'Escaneando…';
    } catch (err) {
      status.textContent = 'Error al iniciar la cámara. Revisa permisos.';
    }
  };

  // 5) Botón Stop
  btnStop.onclick = async () => {
    await stopScan();
    btnStart.disabled = false;
    btnStop.disabled = true;
    status.textContent = 'Escaneo detenido.';
  };

  // 6) Cambiar cámara sobre la marcha (si ya está escaneando)
  sel.onchange = async () => {
    currentCameraId = sel.value;
    if (qrInstance) {
      await stopScan();
      await startScan(currentCameraId);
      btnStart.disabled = true;
      btnStop.disabled = false;
      status.textContent = 'Escaneando… (cámara cambiada)';
    }
  };

  // 7) Fallback: leer QR desde imagen
  fileInput.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Instancia temporal solo para archivo
      const temp = new Html5Qrcode('qr-reader');
      const result = await temp.scanFile(file, true);
      handleDecodedText(result);
      await temp.clear();
      status.textContent = 'QR leído desde imagen ✅';
    } catch (err) {
      status.textContent = 'No se pudo leer el QR de la imagen.';
    }
  };
}

export async function destroyQR(){
  await stopScan();
}

async function startScan(cameraId){
  if (!qrInstance) qrInstance = new Html5Qrcode('qr-reader');

  // Preferir cameraId; si no, usar facingMode (para iOS que no expone ids)
  const config = cameraId
    ? { deviceId: { exact: cameraId } }
    : { facingMode: 'environment' };

  await qrInstance.start(
    config,
    { fps: 10, qrbox: calcQrBox() },
    (decodedText) => { handleDecodedText(decodedText); stopScan(); },
    () => {} // ignore scan errors
  );
}

async function stopScan(){
  if (qrInstance) {
    try { await qrInstance.stop(); } catch {}
    try { await qrInstance.clear(); } catch {}
    qrInstance = null;
  }
}

function handleDecodedText(text){
  const out = qs('#scan-result');
  out.textContent = `Contenido escaneado: ${text}`;
  try {
    if (text.startsWith('BEGIN:VCARD')) parseVCard(text);
    else store.set({ notes: `QR: ${text}` });
  } catch {
    store.set({ notes: `QR: ${text}` });
  }
  alert('QR importado ✅');
}

function parseVCard(vcard){
  const lines = vcard.split(/\r?\n/);
  const patch = {};
  for (const line of lines){
    if (line.startsWith('FN:'))    patch.name = line.slice(3).trim();
    if (line.startsWith('ORG:'))   patch.company = line.slice(4).trim();
    if (line.startsWith('TITLE:')) patch.position = line.slice(6).trim();
    if (line.startsWith('TEL'))    patch.phone = line.split(':')[1]?.trim() ?? '';
    if (line.startsWith('EMAIL'))  patch.email = line.split(':')[1]?.trim() ?? '';
  }
  store.set(patch);
}

// Calcula tamaño de qrbox según ancho del contenedor
function calcQrBox(){
  const el = qs('#qr-reader');
  const w = el?.clientWidth || 300;
  const size = Math.max(220, Math.min(320, Math.floor(w * 0.6)));
  return { width: size, height: size };
}
