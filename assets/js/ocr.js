// assets/js/ocr.js
// Cámara + captura recortada a tarjeta + preproceso + OCR (Tesseract global) + extracción + merge
import { store } from './store.js';
import { qs } from './dom.js';
import { normalizeEmail, normalizePhone } from './validators.js';
import { startCamera as camStart, stopCamera as camStop, attachToVideo } from './camera.js';

const CARD_RATIO = 85.6 / 54; // ≈ 1.586 (landscape business card)

let capturedDataUrl = null;
let offscreen = null;
let ctx = null;

/* ===================== Utils UI ===================== */
function hide(el, v = true){ if (el) el.hidden = v; }
function disable(el, v = true){ if (el) el.disabled = v; }
function setOcrStatus(msg){ const s = qs('#ocr-status'); if (s) s.textContent = msg; }

/* ===================== Tesseract (Global + Worker) ===================== */
let _tessReady = null;
async function ensureTesseractGlobal() {
  if (_tessReady) return _tessReady;
  _tessReady = new Promise((resolve, reject) => {
    if (window.Tesseract && window.Tesseract.createWorker) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@2.1.5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => window.Tesseract ? resolve() : reject(new Error('No se pudo inicializar Tesseract'));
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _tessReady;
}

let _workerPromise = null;
async function getWorker(logger){
  await ensureTesseractGlobal();
  if (_workerPromise) return _workerPromise;

  _workerPromise = (async () => {
    const { createWorker } = window.Tesseract;
    try {
      const worker = createWorker({
        logger,
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@2.1.5/dist/worker.min.js',
        corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@2.2.0/tesseract-core.wasm.js',
        langPath:   'https://tessdata.projectnaptha.com/4.0.0',
      });
      await worker.load();
      await worker.loadLanguage('spa');
      await worker.loadLanguage('eng');
      await worker.initialize('spa+eng');
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      console.log('[OCR] Worker listo (primario)');
      return worker;
    } catch (e1) {
      console.warn('[OCR] Worker primario falló, probando alterno…', e1);
      const worker = createWorker({
        logger,
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@2.1.5/dist/worker.min.js',
        corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@2.2.0/tesseract-core.wasm.js',
        langPath:   'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0',
      });
      await worker.load();
      await worker.loadLanguage('spa');
      await worker.loadLanguage('eng');
      await worker.initialize('spa+eng');
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      console.log('[OCR] Worker listo (alterno)');
      return worker;
    }
  })();

  return _workerPromise;
}

/* ===================== API pública ===================== */
export async function initCard(){
  setOcrStatus('Listo para procesar tarjeta. Inicia la cámara o sube una imagen.');

  const btnStart   = qs('#card-start');
  const btnStop    = qs('#card-stop');
  const btnCapture = qs('#capture-btn');
  const fileInput  = qs('#card-upload');
  const btnProcess = qs('#process-card');
  const btnSave    = qs('#save-from-card');
  const imgPrev    = qs('#image-preview');
  const video      = qs('#ocr-video');

  // Estado limpio inicial
  resetOcrUI();

  // Botonera base
  disable(btnStart, false);
  disable(btnStop, true);
  disable(btnCapture, true);
  hide(btnProcess, true);
  hide(btnSave, true);
  hide(imgPrev, true);

  // Ajuste de alto/ratio para el contenedor del video (tarjeta)
  applyCardAspect();
  window.addEventListener('resize', applyCardAspect);
  video?.addEventListener('loadedmetadata', applyCardAspect);

  if (btnStart){
    btnStart.onclick = async () => {
      resetOcrUI();                 // limpia todo antes de encender
      await startOcrCamera();
      await waitForVideoReady(video);
      setTimeout(() => { disable(btnCapture, !video.videoWidth); }, 120);
      disable(btnStop, false);
      disable(btnStart, true);
      setOcrStatus('Cámara activa. Alinea la tarjeta y captura.');
    };
  }

  if (btnStop){
    btnStop.onclick = () => {
      stopOcrCamera();
      disable(btnStart, false);
      disable(btnStop, true);
      disable(btnCapture, true);
      setOcrStatus('Cámara detenida.');
    };
  }

  if (btnCapture){
    btnCapture.onclick = async () => {
      if (!video) return alert('No encuentro el video 😅');
      await waitForVideoReady(video);
      if (!video.videoWidth) return alert('Cámara aún no está lista. Intenta de nuevo.');

      capturedDataUrl = grabFrameCard(video, CARD_RATIO, 1200);
      showPreview(capturedDataUrl);

      hide(btnProcess, false);      // habilita “Procesar OCR”

      // Opcional: paramos la cámara después de la captura
      stopOcrCamera();
      disable(btnStart, false);
      disable(btnStop, true);

      setOcrStatus('Imagen capturada. Lista para OCR.');
    };
  }

  if (fileInput){
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        // Nota: no recortamos el archivo subido; lo mostraremos tal cual
        capturedDataUrl = reader.result;
        showPreview(capturedDataUrl);
        hide(btnProcess, false);
        setOcrStatus('Imagen cargada. Lista para OCR.');
      };
      reader.readAsDataURL(file);
    };
  }

  if (btnProcess){
    btnProcess.onclick = async () => {
      if (!capturedDataUrl) return alert('Captura o sube una imagen primero');

      const loading  = qs('#ocr-loading');
      const resultEl = qs('#ocr-result');
      const preText  = qs('#detected-text');

      hide(loading, false);
      hide(resultEl, false);
      disable(btnProcess, true); // para evitar doble clic

      try{
        const preprocessed = await preprocessForOCR(capturedDataUrl);
        const text = await runOCR(preprocessed);
        if (preText) preText.textContent = text;

        const extracted = extractContactInfo(text);
        const merged = mergeContact(store.get?.() ?? {}, extracted);
        store.set(merged);

        hide(btnSave, false);
        setOcrStatus('OCR completado ✅. Revisa y guarda.');
      } catch (e){
        console.error('Error en OCR:', e);
        alert('Error al procesar la imagen. Intenta con una foto más clara.');
        setOcrStatus('Error de OCR. Revisa consola.');
      } finally {
        hide(loading, true);
        disable(btnProcess, false); // lo dejamos disponible por si reintenta
        // lo mantenemos visible (no hide) para que pueda reprocesar
      }
    };
  }

  if (btnSave){
    btnSave.onclick = () => {
      alert('Información guardada ✅');
    };
  }
}

export async function destroyCard(){
  stopOcrCamera();
  window.removeEventListener('resize', applyCardAspect);
}

/* ===================== Cámara (vía camera.js) ===================== */
async function startOcrCamera(){
  try{
    const stream = await camStart({ facingMode: 'environment' });
    const video = qs('#ocr-video');
    await attachToVideo(video, stream);
    video.style.objectFit = 'cover';
    console.log('[OCR] Cámara OK');
    setOcrStatus('Cámara activa.');
  } catch (e){
    console.error('[OCR] Error al iniciar cámara:', e);
    alert('No se pudo acceder a la cámara. Revisa permisos o usa HTTPS/localhost.');
    setOcrStatus('Permiso de cámara fallido.');
  }
}
function stopOcrCamera(){ camStop(); }

/* ===================== Layout: relación de aspecto tarjeta ===================== */
function applyCardAspect(){
  const video = qs('#ocr-video');
  if (!video) return;
  const wrap = video.parentElement; // contenedor .camera-container de esta sección
  if (!wrap) return;

  // Ajusta el alto del contenedor según el ancho y la relación de una tarjeta
  const w = wrap.clientWidth || 640;
  const h = Math.round(w / CARD_RATIO);
  wrap.style.height = h + 'px';

  // El video ocupa todo el contenedor, centrado y recortado
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
}

/* ===================== Captura + Canvas helpers ===================== */
function waitForVideoReady(video){
  if (video && video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise(res => {
    const done = () => {
      if (video.videoWidth && video.videoHeight) {
        video.removeEventListener('loadedmetadata', done);
        res();
      }
    };
    video.addEventListener('loadedmetadata', done, { once:true });
    setTimeout(done, 100);
  });
}

function ensureCanvas(w, h){
  if (!offscreen) offscreen = document.createElement('canvas');
  if (offscreen.width !== w || offscreen.height !== h){
    offscreen.width = w; offscreen.height = h;
  }
  if (!ctx) ctx = offscreen.getContext('2d', { willReadFrequently:true });
}

/**
 * Captura del frame de video recortando al centro con relación de tarjeta (ratio),
 * y escalando a un ancho máximo (maxW).
 */
function grabFrameCard(videoEl, ratio = CARD_RATIO, maxW = 1200){
  const vw = videoEl.videoWidth || 1280;
  const vh = videoEl.videoHeight || 720;
  const videoRatio = vw / vh;

  // Área a recortar del frame para cumplir el ratio objetivo
  let rw, rh;
  if (videoRatio > ratio) {
    // Video es "más ancho": limitamos por alto
    rh = vh;
    rw = Math.round(rh * ratio);
  } else {
    // Video “más alto”: limitamos por ancho
    rw = vw;
    rh = Math.round(rw / ratio);
  }

  // Coordenadas para centrar el recorte
  const sx = Math.floor((vw - rw) / 2);
  const sy = Math.floor((vh - rh) / 2);

  // Escala de salida
  const outW = Math.min(maxW, rw);
  const outH = Math.round(outW / ratio);

  ensureCanvas(outW, outH);
  ctx.drawImage(videoEl, sx, sy, rw, rh, 0, 0, outW, outH);
  return offscreen.toDataURL('image/png');
}

/* ===================== Preproceso ===================== */
/**
 * Escala máx 1200px de ancho (manteniendo ratio), gris + contraste + umbral rápido.
 */
async function preprocessForOCR(dataUrl, maxW = 1200){
  const img = await loadImage(dataUrl);

  const ratio = img.width > maxW ? maxW / img.width : 1;
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  ensureCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // Gris + contraste
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;
  const contrast = 1.35, brightness = 8;

  for (let i = 0; i < data.length; i += 4){
    const r = data[i], g = data[i+1], b = data[i+2];
    let y = 0.299*r + 0.587*g + 0.114*b;
    y = (y - 128) * contrast + 128 + brightness;
    if (y < 0) y = 0; if (y > 255) y = 255;
    data[i] = data[i+1] = data[i+2] = y;
  }
  ctx.putImageData(id, 0, 0);

  // Umbral binario rápido (por media)
  const id2 = ctx.getImageData(0, 0, w, h);
  const px = id2.data;
  let sum = 0, count = 0;
  for (let i = 0; i < px.length; i += 4){ sum += px[i]; count++; }
  const mean = sum / count;
  for (let i = 0; i < px.length; i += 4){
    const v = px[i] > mean ? 255 : 0;
    px[i] = px[i+1] = px[i+2] = v;
  }
  ctx.putImageData(id2, 0, 0);

  return offscreen.toDataURL('image/png');
}

function loadImage(src){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/* ===================== OCR (worker + fallback) ===================== */
async function runOCR(dataUrl){
  const logger = (m) => {
    if (m.status === 'recognizing text'){
      setOcrStatus(`Reconociendo… ${Math.round((m.progress || 0)*100)}%`);
    }
  };

  try {
    const worker = await getWorker(logger);
    console.log('[OCR] Reconociendo con worker…');
    const { data: { text } } = await worker.recognize(dataUrl);
    return text;
  } catch (e) {
    console.warn('[OCR] Worker falló, usando fallback simple:', e);
    await ensureTesseractGlobal();
    const { recognize } = window.Tesseract;
    const { data: { text } } = await recognize(dataUrl, 'spa+eng', { logger });
    return text;
  }
}

/* ===================== Extracción + Notas enriquecidas ===================== */
function extractContactInfo(text){
  const patch = {};

  // Emails (principal + extras a notas)
  const emails = [...text.matchAll(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g)].map(m => m[0]);
  if (emails.length) patch.email = normalizeEmail(emails[0]);

  // Teléfono (muy permisivo)
  const phoneMatch = text.match(/(\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/);
  if (phoneMatch && phoneMatch[0].replace(/\D/g,'').length >= 7) {
    patch.phone = normalizePhone(phoneMatch[0]);
  }

  // Cargo y empresa (heurísticas simples)
  const roleLine = findLine(text, /(gerente|director|jefe|coordinador|analista|ingeniero|ventas|marketing|compras|ceo|cto|coo|founder|manager|head|lead)/i);
  if (roleLine) patch.position = clean(roleLine);

  const companyLine = findLine(text, /\b(sas|s\.a\.|s\.a|srl|ltda|corp|inc|company|industria|manufact|fabric|group|grupo)\b/i);
  if (companyLine) patch.company = clean(companyLine);

  // Nombre probable
  if (!patch.name){
    const lines = linesFrom(text);
    for (const ln of lines){
      if (emails.some(e => ln.includes(e))) continue;
      if (phoneMatch && ln.includes(phoneMatch[0])) continue;
      if (/https?:\/\//i.test(ln)) continue;
      if (ln.length >= 4 && ln.length <= 48){
        patch.name = clean(ln);
        break;
      }
    }
  }

  // Notas: URLs y redes en líneas separadas
  const noteLines = [];
  const urls = [...text.matchAll(/\bhttps?:\/\/[^\s]+/gi)].map(m => m[0]);
  urls.forEach(u => noteLines.push(`URL: ${u}`));

  const socialPatterns = [
    { key: 'Instagram', re: /\binstagram\.com\/[^\s]+/i },
    { key: 'TikTok',    re: /\btiktok\.com\/@[^\s]+/i },
    { key: 'YouTube',   re: /\byoutube\.com\/[^\s]+|youtu\.be\/[^\s]+/i },
    { key: 'Facebook',  re: /\bfacebook\.com\/[^\s]+/i },
    { key: 'LinkedIn',  re: /\blinkedin\.com\/in\/[^\s]+/i },
    { key: 'Twitter',   re: /\b(?:twitter|x)\.com\/[^\s]+/i },
    { key: 'WhatsApp',  re: /\bwa\.me\/\d+/i }
  ];
  for (const { key, re } of socialPatterns){
    const m = text.match(re);
    if (m) noteLines.push(`${key}: https://${m[0].replace(/^https?:\/\//i,'')}`);
  }

  if (emails.length > 1){
    emails.slice(1).forEach(e => noteLines.push(`Email extra: ${e}`));
  }
  const phonesExtra = [...text.matchAll(/(\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/g)]
    .map(m => m[0])
    .filter(ph => !patch.phone || ph !== patch.phone);
  const uniqPhones = Array.from(new Set(phonesExtra)).filter(ph => ph.replace(/\D/g,'').length >= 7);
  uniqPhones.forEach(ph => noteLines.push(`Tel extra: ${normalizePhone(ph)}`));

  if (text && text.trim()){
    noteLines.push('—— OCR ——');
    noteLines.push(text.trim());
  }
  if (noteLines.length) patch.notes = noteLines.join('\n');

  return patch;
}

/* ===================== Merge ===================== */
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

/* ===================== Limpieza UI ===================== */
function resetOcrUI(){
  const btnCapture = qs('#capture-btn');
  const btnProcess = qs('#process-card');
  const btnSave    = qs('#save-from-card');
  const imgPrev    = qs('#image-preview');
  const resultEl   = qs('#ocr-result');
  const preText    = qs('#detected-text');
  const fileInput  = qs('#card-upload');

  capturedDataUrl = null;
  if (fileInput) fileInput.value = '';

  hide(imgPrev, true);
  hide(btnProcess, true);
  hide(btnSave, true);
  hide(resultEl, true);
  if (preText) preText.textContent = '';

  disable(btnCapture, true);
}

/* ===================== Helpers varios ===================== */
function linesFrom(text){ return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean); }
function findLine(text, re){ return linesFrom(text).find(ln => re.test(ln)); }
function clean(s){ return s.replace(/\s{2,}/g,' ').replace(/[|•·]+/g,'').trim(); }

function showPreview(dataUrl){
  const img = qs('#image-preview');
  if (img){
    img.src = dataUrl;
    img.style.objectFit = 'cover';
    img.hidden = false;
    // Mantén el mismo alto que el contenedor del video (ya ajustado a CARD_RATIO)
    const video = qs('#ocr-video');
    if (video && video.parentElement){
      img.style.width = '100%';
      img.style.height = video.parentElement.style.height || 'auto';
    }
  }
}
