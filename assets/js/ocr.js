// assets/js/ocr.js
// Cámara + captura + preproceso + OCR (Tesseract) + extracción + merge (con notas enriquecidas)
import { store } from './store.js';
import { qs } from './dom.js';
import { normalizeEmail, normalizePhone } from './validators.js';
import { startCamera as camStart, stopCamera as camStop, attachToVideo } from './camera.js';

let capturedDataUrl = null;
let offscreen = null;
let ctx = null;

/* =================== API pública =================== */
export async function initCard(){
  setOcrStatus('Listo para procesar tarjeta. Inicia la cámara o sube una imagen.');

  const btnStart   = qs('#card-start');     // Iniciar cámara
  const btnStop    = qs('#card-stop');      // Detener cámara
  const btnCapture = qs('#capture-btn');    // Capturar frame
  const fileInput  = qs('#card-upload');    // Subir imagen
  const btnProcess = qs('#process-card');   // Ejecutar OCR
  const btnSave    = qs('#save-from-card'); // Guardar (opcional)
  const imgPrev    = qs('#image-preview');  // <img> preview
  const video      = qs('#ocr-video');      // <video> cámara

  // Estado inicial
  if (btnStart)   btnStart.disabled = false;
  if (btnStop)    btnStop.disabled  = true;
  if (btnCapture) btnCapture.disabled = true;
  if (btnProcess) btnProcess.hidden = true;
  if (btnSave)    btnSave.hidden    = true;
  if (imgPrev)    imgPrev.hidden    = true;

  // Iniciar cámara
  if (btnStart){
    btnStart.onclick = async () => {
      await startOcrCamera();
      await waitForVideoReady(video);
      if (btnCapture) btnCapture.disabled = false;
      if (btnStop) btnStop.disabled = false;
      btnStart.disabled = true;
      setOcrStatus('Cámara activa. Alinea la tarjeta y captura.');
    };
  }

  // Detener cámara
  if (btnStop){
    btnStop.onclick = () => {
      stopOcrCamera();
      if (btnStart)  btnStart.disabled = false;
      btnStop.disabled = true;
      if (btnCapture) btnCapture.disabled = true;
      setOcrStatus('Cámara detenida.');
    };
  }

  // Capturar frame de la cámara
  if (btnCapture){
    btnCapture.onclick = async () => {
      if (!video) return alert('No encuentro el video 😅');
      await waitForVideoReady(video);
      if (!video.videoWidth) return alert('Cámara aún no está lista. Intenta de nuevo.');

      capturedDataUrl = grabFrame(video);
      showPreview(capturedDataUrl);

      if (btnProcess) btnProcess.hidden = false;

      // UX: paramos la cámara tras capturar (así ahorramos batería y liberamos el stream)
      stopOcrCamera();
      if (btnStart) btnStart.disabled = false;
      if (btnStop)  btnStop.disabled  = true;

      setOcrStatus('Imagen capturada. Lista para OCR.');
    };
  }

  // Subir imagen desde archivo
  if (fileInput){
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        capturedDataUrl = reader.result;
        showPreview(capturedDataUrl);
        if (btnProcess) btnProcess.hidden = false;
        setOcrStatus('Imagen cargada. Lista para OCR.');
      };
      reader.readAsDataURL(file);
    };
  }

  // Procesar OCR
  if (btnProcess){
    btnProcess.onclick = async () => {
      if (!capturedDataUrl) return alert('Captura o sube una imagen primero');

      const loading  = qs('#ocr-loading');
      const resultEl = qs('#ocr-result');
      const preText  = qs('#detected-text');

      if (loading)  loading.hidden = false;
      if (resultEl) resultEl.hidden = true;

      try{
        const preprocessed = await preprocessForOCR(capturedDataUrl);
        const text = await runTesseract(preprocessed, 'spa+eng');

        if (preText) { preText.textContent = text; }
        if (resultEl) resultEl.hidden = false;

        // Extraer datos + notas enriquecidas (URLs/redes)
        const extracted = extractContactInfo(text);

        // Merge inteligente (no pisa campos ya existentes)
        const merged = mergeContact(store.get?.() ?? {}, extracted);
        store.set(merged);

        const btnSave2 = qs('#save-from-card');
        if (btnSave2) btnSave2.hidden = false;

        setOcrStatus('OCR completado ✅. Revisa y guarda.');
      } catch (e){
        console.error('Error en OCR:', e);
        alert('Error al procesar la imagen. Intenta con una foto más clara.');
        setOcrStatus('Error de OCR. Intenta nuevamente.');
      } finally {
        if (loading) loading.hidden = true;
      }
    };
  }

  // Guardar (opcional, ya hicimos merge arriba)
  if (btnSave){
    btnSave.onclick = () => {
      alert('Información guardada ✅');
    };
  }

  // Por si quieres ajustar algo responsivo
  window.addEventListener('resize', fitPreviewMaxWidth);
}

export async function destroyCard(){
  stopOcrCamera();
}

/* =================== Cámara (vía camera.js) =================== */
async function startOcrCamera(){
  try{
    const stream = await camStart({ facingMode: 'environment' });
    const video = qs('#ocr-video');
    await attachToVideo(video, stream);
    console.log('[OCR] Cámara OK');
    setOcrStatus('Cámara activa.');
  } catch (e){
    console.error('[OCR] Error al iniciar cámara:', e);
    alert('No se pudo acceder a la cámara. Revisa permisos o usa HTTPS/localhost.');
    setOcrStatus('Permiso de cámara fallido.');
  }
}
function stopOcrCamera(){ camStop(); }

/* =================== Captura y preproceso =================== */
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
    setTimeout(done, 60);
  });
}

function ensureCanvas(w, h){
  if (!offscreen) offscreen = document.createElement('canvas');
  if (offscreen.width !== w || offscreen.height !== h){
    offscreen.width = w; offscreen.height = h;
  }
  if (!ctx) ctx = offscreen.getContext('2d', { willReadFrequently:true });
}

function grabFrame(videoEl){
  ensureCanvas(videoEl.videoWidth || 1280, videoEl.videoHeight || 720);
  ctx.drawImage(videoEl, 0, 0, offscreen.width, offscreen.height);
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

/**
 * Escala (máx ancho), convierte a grises y aumenta contraste (mejora OCR).
 */
async function preprocessForOCR(dataUrl, maxW = 1400){
  const img = await loadImage(dataUrl);

  // Escalado proporcional
  const ratio = img.width > maxW ? maxW / img.width : 1;
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  ensureCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // Gris + contraste simple
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;
  const contrast = 1.25, brightness = 5;

  for (let i = 0; i < data.length; i += 4){
    const r = data[i], g = data[i+1], b = data[i+2];
    let y = 0.299*r + 0.587*g + 0.114*b; // luma
    y = (y - 128) * contrast + 128 + brightness;
    if (y < 0) y = 0; if (y > 255) y = 255;
    data[i] = data[i+1] = data[i+2] = y;
  }
  ctx.putImageData(id, 0, 0);

  return offscreen.toDataURL('image/png');
}

/* =================== OCR (Tesseract) =================== */
async function runTesseract(dataUrl, lang = 'spa+eng'){
  const mod = await import('https://unpkg.com/tesseract.js@v2.1.0/dist/tesseract.min.js');
  const Tesseract = mod.default || mod;
  const onProgress = (m) => {
    if (m.status === 'recognizing text'){
      setOcrStatus(`Reconociendo… ${Math.round((m.progress || 0)*100)}%`);
    }
  };
  const { data: { text } } = await Tesseract.recognize(dataUrl, lang, { logger: onProgress });
  return text;
}

/* =================== Extracción + Notas enriquecidas =================== */
function extractContactInfo(text){
  const patch = {};

  // Correos (toma el primero como principal)
  const emails = [...text.matchAll(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g)].map(m => m[0]);
  if (emails.length) patch.email = normalizeEmail(emails[0]);

  // Teléfono (muy permisivo, toma el primero como principal)
  const phoneMatch = text.match(/(\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/);
  if (phoneMatch && phoneMatch[0].replace(/\D/g,'').length >= 7) {
    patch.phone = normalizePhone(phoneMatch[0]);
  }

  // Cargo y empresa (heurísticas simples)
  const roleLine = findLine(text, /(gerente|director|jefe|coordinador|analista|ingeniero|ventas|marketing|compras|ceo|cto|coo|founder|manager|head|lead)/i);
  if (roleLine) patch.position = clean(roleLine);

  const companyLine = findLine(text, /\b(sas|s\.a\.|s\.a|srl|ltda|corp|inc|company|industria|manufact|fabric|group|grupo)\b/i);
  if (companyLine) patch.company = clean(companyLine);

  // Nombre probable (línea destacada que no sea email/teléfono/url)
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

  // ===== Notas enriquecidas: todas las URLs + redes sociales (cada una en su línea) =====
  const noteLines = [];

  // Todas las URLs encontradas
  const urls = [...text.matchAll(/\bhttps?:\/\/[^\s]+/gi)].map(m => m[0]);
  for (const u of urls){
    noteLines.push(`URL: ${u}`);
  }

  // Detectar redes aunque no vengan como URL completa
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

  // Emails y teléfonos extra → a notas
  if (emails.length > 1){
    emails.slice(1).forEach(e => noteLines.push(`Email extra: ${e}`));
  }
  const phonesExtra = [...text.matchAll(/(\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/g)]
    .map(m => m[0])
    .filter(ph => !patch.phone || ph !== patch.phone);
  const uniqPhones = Array.from(new Set(phonesExtra)).filter(ph => ph.replace(/\D/g,'').length >= 7);
  uniqPhones.forEach(ph => noteLines.push(`Tel extra: ${normalizePhone(ph)}`));

  // Dump completo del OCR al final (útil para revisar)
  if (text && text.trim()){
    noteLines.push('—— OCR ——');
    noteLines.push(text.trim());
  }

  if (noteLines.length){
    patch.notes = noteLines.join('\n');
  }

  return patch;
}

/* =================== Utilidades =================== */
function linesFrom(text){
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
function findLine(text, re){
  return linesFrom(text).find(ln => re.test(ln));
}
function clean(s){
  return s.replace(/\s{2,}/g,' ').replace(/[|•·]+/g,'').trim();
}

/* =================== Merge =================== */
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

/* =================== UI helpers =================== */
function showPreview(dataUrl){
  const img = qs('#image-preview');
  if (img){ img.src = dataUrl; img.hidden = false; }
  fitPreviewMaxWidth();
}
function fitPreviewMaxWidth(){
  const img = qs('#image-preview');
  if (!img) return;
}
function setOcrStatus(msg){
  const s = qs('#ocr-status');
  if (s) s.textContent = msg;
}
