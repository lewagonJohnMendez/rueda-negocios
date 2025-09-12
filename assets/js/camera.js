import { store } from './store.js';
import { qs, show } from './dom.js';
import { normalizeEmail, normalizePhone } from './validators.js';

let stream = null;
let captured = null;
let off = [];

export function initCard(){
  const select = qs('#card-option');
  const cameraSection = qs('#camera-section');
  const uploadSection = qs('#upload-section');
  const video = qs('#camera-preview');
  const img = qs('#image-preview');

  const updateMode = async () => {
    const useCam = select.value === 'camera';
    show(cameraSection, useCam);
    show(uploadSection, !useCam);
    if (useCam) await startCamera(video); else stopCamera();
  };
  select.addEventListener('change', updateMode);
  updateMode();

  qs('#capture-btn').addEventListener('click', () => {
    if (!video.videoWidth) return alert('Cámara no lista');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    captured = canvas.toDataURL('image/png');
    img.src = captured; img.hidden = false;
    show(qs('#process-card'), true);
    stopCamera();
  });

  qs('#card-upload').addEventListener('change', (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      captured = reader.result;
      img.src = captured; img.hidden = false;
      show(qs('#process-card'), true);
    };
    reader.readAsDataURL(file);
  });

  qs('#process-card').addEventListener('click', processOCR);
  qs('#save-from-card').addEventListener('click', () => alert('Información guardada ✅'));
}

export async function destroyCard(){
  stopCamera();
}

async function startCamera(video){
  stopCamera();
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
    video.srcObject = stream;
  } catch {
    alert('No se pudo acceder a la cámara. Revisa permisos.');
  }
}
function stopCamera(){
  if (stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
}

async function processOCR(){
  if (!captured) return alert('Captura o sube una imagen primero');

  const loading = qs('#ocr-loading'), resultBox = qs('#ocr-result'), pre = qs('#detected-text');
  show(loading, true); show(resultBox, false);

  try{
    const Tesseract = (await import('https://unpkg.com/tesseract.js@v2.1.0/dist/tesseract.min.js')).default;
    const { data:{ text } } = await Tesseract.recognize(captured, 'spa+eng');
    pre.textContent = text; show(resultBox, true); show(qs('#save-from-card'), true);

    // extracción simple
    const email = (text.match(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/)||[])[0];
    const phone = (text.match(/(\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{2,4}[\s-]?\d{2,4}[\s-]?\d{0,4}/)||[])[0];

    const patch = { notes:`OCR:\n${text}` };
    if (email) patch.email = normalizeEmail(email);
    if (phone) patch.phone = normalizePhone(phone);
    store.set(patch);

  } catch (e){
    alert('Error al procesar la imagen. Intenta con una más clara.');
  } finally {
    show(loading, false);
  }
}
