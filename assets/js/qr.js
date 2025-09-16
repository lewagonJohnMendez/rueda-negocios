// assets/js/qr.js
// Escaneo QR en vivo + vCard parser robusto (usando camera.js)
import { store } from './store.js';
import { qs } from './dom.js';
import { startCamera as camStart, stopCamera as camStop, attachToVideo } from './camera.js';

let rafId = null;
let scanning = false;
let offscreen = null;
let ctx = null;
let lastDecodeAt = 0;

/* =================== API pública =================== */
export async function initQR(){
  setStatus('Listo para escanear. Pulsa “Iniciar escaneo”.');

  const btnStart  = qs('#qr-start');
  const btnStop   = qs('#qr-stop');
  const btnClear  = qs('#qr-clear');   // opcional
  const fileInput = qs('#qr-file');
  const video     = qs('#camera-preview');

  if (btnStart) {
    btnStart.disabled = false;
    btnStart.onclick = async () => {
      await startCamera();         // <- ahora usa camera.js
      startLiveScan();
      sizeQrBoxToVideo();          // ajusta overlay al video
      if (btnStop) btnStop.disabled = false;
      btnStart.disabled = true;
      setStatus('Escaneando… centra el código en el recuadro.');
    };
  }

  if (btnStop) {
    btnStop.disabled = true;
    btnStop.onclick = async () => {
      await stopScanAll();
      if (btnStart) btnStart.disabled = false;
      btnStop.disabled = true;
      setStatus('Escaneo detenido.');
    };
  }

  if (btnClear) {
    btnClear.onclick = async () => {
      await stopScanAll();
      clearQrUI();
      store.reset?.() ?? store.set({ name:'', company:'', position:'', phone:'', email:'', notes:'' });
      alert('Todo limpio ✅');
    };
  }

  if (fileInput) {
    fileInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        ensureCanvas(img.width, img.height);
        ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
        const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        const code = window.jsQR?.(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code?.data) handleDecodedText(code.data);
        else setStatus('No se pudo leer el QR de la imagen.');
      };
      img.src = URL.createObjectURL(file);
    };
  }

  // recalibrar overlay cuando cambie tamaño/orientación o cuando el video tenga meta
  window.addEventListener('resize', sizeQrBoxToVideo);
  video?.addEventListener('loadedmetadata', sizeQrBoxToVideo);
}

export async function destroyQR(){
  await stopScanAll();
  window.removeEventListener('resize', sizeQrBoxToVideo);
}

/* =================== Cámara (via camera.js) =================== */
async function startCamera(){
  try{
    // Inicia cámara con preferencia por trasera y la acopla al <video>
    const stream = await camStart({ facingMode: 'environment' });
    const video = qs('#camera-preview');
    const meta = await attachToVideo(video, stream);

    // Prepara canvas con dimensiones iniciales del video
    ensureCanvas(meta?.width || video.videoWidth || 640, meta?.height || video.videoHeight || 480);
  } catch (e){
    console.error('Error al iniciar cámara en QR:', e);
    setStatus('No se pudo acceder a la cámara. Revisa permisos o usa HTTPS.');
  }
}
function stopCamera(){ camStop(); }

/* =================== Escaneo en vivo =================== */
function startLiveScan(){
  if (scanning) return;
  scanning = true;

  const video = qs('#camera-preview');

  const tick = () => {
    if (!scanning) return;

    if (video?.readyState === video?.HAVE_ENOUGH_DATA && video.videoWidth && video.videoHeight) {
      ensureCanvas(video.videoWidth, video.videoHeight);

      const box  = document.querySelector('.qr-box');
      const wrap = document.getElementById('qr-wrap');

      if (box && wrap) {
        // Coordenadas de la caja respecto al video visible
        const rWrap = wrap.getBoundingClientRect();
        const rBox  = box.getBoundingClientRect();

        // Escala de DOM → canvas
        const sx = offscreen.width  / rWrap.width;
        const sy = offscreen.height / rWrap.height;

        const x = Math.max(0, Math.floor((rBox.left - rWrap.left) * sx));
        const y = Math.max(0, Math.floor((rBox.top  - rWrap.top ) * sy));
        const w = Math.min(offscreen.width,  Math.floor(rBox.width  * sx));
        const h = Math.min(offscreen.height, Math.floor(rBox.height * sy));

        ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

        const imageData = ctx.getImageData(x, y, w, h);
        const code = window.jsQR?.(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code?.data) {
          const now = Date.now();
          if (now - lastDecodeAt > 800) {
            lastDecodeAt = now;
            handleDecodedText(code.data);
            stopScanAll(); // detener tras 1ª lectura (si quieres continuo, comenta esta línea)
            return;
          }
        }
      } else {
        // Fallback: procesa toda la imagen
        ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
        const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        const code = window.jsQR?.(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code?.data) {
          const now = Date.now();
          if (now - lastDecodeAt > 800) {
            lastDecodeAt = now;
            handleDecodedText(code.data);
            stopScanAll();
            return;
          }
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

/* =================== Helpers UI =================== */
function ensureCanvas(w, h){
  if (!offscreen) offscreen = document.createElement('canvas');
  if (offscreen.width !== w || offscreen.height !== h) {
    offscreen.width = w;
    offscreen.height = h;
  }
  if (!ctx) ctx = offscreen.getContext('2d', { willReadFrequently: true });
}

function setStatus(msg){
  const el = qs('#qr-status');
  if (el) el.textContent = msg;
}

function clearQrUI(){
  setStatus('Listo para escanear. Pulsa “Iniciar escaneo”.');
  const result = qs('#scan-result'); if (result) result.textContent = '';
  const file   = qs('#qr-file');     if (file)   file.value = '';
}

function sizeQrBoxToVideo(){
  const wrap  = qs('#qr-wrap');
  const video = qs('#camera-preview');
  const box   = document.querySelector('.qr-box');
  if (!wrap || !video || !box) return;

  const vw = wrap.clientWidth;
  const vh = wrap.clientHeight;
  if (!vw || !vh) return;

  const size = Math.floor(Math.min(vw, vh) * 0.7);
  box.style.width  = size + 'px';
  box.style.height = size + 'px';
}

/* =================== Manejo del resultado =================== */
function handleDecodedText(text){
  const out = qs('#scan-result');
  if (out) out.textContent = `Contenido escaneado: ${text}`;

  try {
    let incoming = {};
    if (text.startsWith('BEGIN:VCARD')) {
      incoming = parseVCard(text);
    } else {
      incoming = { notes: `QR: ${text}` };
    }

    // Merge inteligente (no pisa lo ya escrito)
    const merged = mergeContact(store.get?.() ?? {}, incoming);
    store.set(merged);

    alert('QR importado ✅');
  } catch (e) {
    console.warn('Error al procesar contenido escaneado', e);
    store.set({ notes: `QR: ${text}` });
  }
}

/* =================== vCard Parser ROBUSTO =================== */
// Devuelve {name, company, position, phone, email, notes}
function parseVCard(vcardRaw){
  const unfolded = vcardRaw
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '');

  const lines = unfolded.split('\n').map(l => l.trim()).filter(Boolean);

  const patch = {};
  const phones = [];
  const emails = [];
  const extraNotes = []; // Aquí se acumula TODO lo extra

  const prefer = (types=[]) => {
    const s = types.map(x => x.toLowerCase());
    if (s.includes('pref')) return 100;
    if (s.some(x => /cell|mobile|m[oó]vil/.test(x))) return 90;
    if (s.includes('work') || s.includes('empresa')) return 70;
    if (s.includes('home') || s.includes('personal')) return 50;
    return 10;
  };

  const decodeQP = (txt) => txt
    .replace(/=\n/g, '')
    .replace(/=([A-Fa-f0-9]{2})/g, (_, h) => String.fromCharCode(parseInt(h,16)));

  const unescapeVC = (txt) => txt
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');

  for (const raw of lines){
    if (!raw || raw.startsWith('BEGIN:') || raw.startsWith('END:')) continue;

    const cleaned = raw.replace(/^item\d+\./i, ''); // item1.TEL → TEL

    const idx = cleaned.indexOf(':');
    if (idx === -1) continue;
    let left  = cleaned.slice(0, idx);
    let value = cleaned.slice(idx + 1);

    const [keyRaw, ...paramParts] = left.split(';');
    const key = keyRaw.toUpperCase();

    const params = {};
    for (const p of paramParts){
      const [k, v] = p.split('=');
      if (!k) continue;
      const K = k.toUpperCase();
      if (v) params[K] = v.split(',').map(s => s.trim());
      else (params.TYPE ??= []).push(p.toUpperCase()); // forma corta ;CELL;PREF
    }

    if ((params.ENCODING || params.ENCODING)?.some(x => /QUOTED-PRINTABLE/i.test(x))) {
      value = decodeQP(value);
    }
    value = unescapeVC(value).trim();

    // === Campos principales ===
    switch(key){
      case 'FN':
        patch.name = value;
        break;
      case 'N':
        if (!patch.name) {
          const [last, first, middle, prefix, suffix] = value.split(';').map(s => s.trim());
          patch.name = [prefix, first, middle, last, suffix].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
        }
        break;
      case 'ORG':
        patch.company = value.split(';')[0].trim();
        break;
      case 'TITLE':
      case 'ROLE':
        if (!patch.position) patch.position = value;
        break;
      case 'NOTE':
        extraNotes.push(`Nota: ${value}`);
        break;
      case 'TEL':
      case 'PHONE':
      case 'TEL;VOICE':
        const typesTel = (params.TYPE ?? []).map(t => t.toLowerCase());
        value = value.replace(/^tel:/i, '');
        phones.push({ value, types: typesTel, pref: prefer(typesTel) });
        break;
      case 'EMAIL':
        const typesEmail = (params.TYPE ?? []).map(t => t.toLowerCase());
        emails.push({ value, types: typesEmail, pref: prefer(typesEmail) + (typesEmail.includes('internet') ? 1 : 0) });
        break;
      default:
        // Todo lo que no sea un campo conocido se agrega a notas
        extraNotes.push(`${key}: ${value}`);
    }
  }

  // === Elegir mejor teléfono y email ===
  if (phones.length){
    phones.sort((a,b) => b.pref - a.pref);
    patch.phone = phones[0].value;
  }
  if (emails.length){
    emails.sort((a,b) => b.pref - a.pref);
    patch.email = emails[0].value;
  }

  // Si no hay nombre, usar parte del email
  if (!patch.name && patch.email) {
    patch.name = patch.email.split('@')[0];
  }

  // === Juntar notas con salto de línea limpio ===
  if (extraNotes.length) {
    // Cada dato extra en su línea, limpio y ordenado
    patch.notes = (patch.notes ? patch.notes + '\n' : '') + extraNotes.join('\n');
  }

  return patch;
}


/* =================== Merge inteligente =================== */
function mergeContact(existing, incoming){
  const out = { ...existing };
  for (const k of ['name','company','position','phone','email','notes']){
    if (!out[k] && incoming[k]) out[k] = incoming[k];
    if (k === 'notes' && existing?.notes && incoming?.notes){
      out.notes = `${existing.notes}\n${incoming.notes}`;
    }
  }
  return out;
}
