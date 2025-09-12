// assets/js/ui.js
import { store } from './store.js';
import { qs, on } from './dom.js';
import { normalizeEmail, normalizePhone } from './validators.js';

let unsub = null;
let off = [];
let boundGlobalClear = false; // ← evita enlazar dos veces

export function initManual(){
  const form = qs('#contact-form');
  const fields = ['name','company','position','phone','email','notes'];

  // Hidratar desde store al iniciar
  const s = store.get();
  fields.forEach(f => { const el = qs('#'+f); if (el) el.value = s[f] ?? ''; });
  renderPreview(s);
  syncWhatsAppVisibility(); // ← inicial

  if (!unsub) unsub = store.subscribe((state) => {
    renderPreview(state);
    syncWhatsAppVisibility(); // ← cada vez que cambie el store
  });

  // Guardar
  off.push(on(qs('#save-contact'), 'click', () => {
    const patch = {
      name: qs('#name').value.trim(),
      company: qs('#company').value.trim(),
      position: qs('#position').value.trim(),
      phone: normalizePhone(qs('#phone').value),
      email: normalizeEmail(qs('#email').value),
      notes: qs('#notes').value.trim()
    };

    store.set(patch);              // actualiza preview y visibilidad (por subscribe)
    clearForm(form, fields);       // limpia campos
    qs('#name')?.focus();
    alert('Contacto guardado ✅  (formulario listo para el siguiente)');
  }));

  // Limpiar del tab Manual (si existe botón local)
  const clearBtn = qs('#clear-contact');
  if (clearBtn){
    off.push(on(clearBtn, 'click', () => {
      store.reset();
      clearForm(form, fields);
      renderPreview(store.get());
      syncWhatsAppVisibility();
    }));
  }

  // ← Enlazar botón global una sola vez
  if (!boundGlobalClear) {
    bindGlobalClear();
    boundGlobalClear = true;
  }
}

// ========== NUEVO: botón global "Limpiar todo" ==========
export function bindGlobalClear(){
  const btn = qs('#global-clear');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    // 1) Apagar recursos activos (QR / Tarjeta / Audio si aplica)
    try { const { destroyQR }  = await import('./qr.js');  await destroyQR();  } catch {}
    try { const { destroyCard }= await import('./ocr.js'); await destroyCard(); } catch {}
    try { const { destroyAudio}= await import('./audio.js'); await destroyAudio?.(); } catch {}

    // 2) Limpiar formularios conocidos
    document.querySelectorAll('form').forEach(f => f.reset());

    // Forzar vacío de inputs del contacto por si el navegador “recuerda”
    ['name','company','position','phone','email','notes'].forEach(id => {
      const el = qs('#'+id); if (el) el.value = '';
    });

    // 3) Limpiar UI de QR
    const scanRes  = qs('#scan-result');   if (scanRes)  scanRes.textContent = '';
    const qrStatus = qs('#qr-status');     if (qrStatus) qrStatus.textContent = 'Listo para escanear. Pulsa “Iniciar escaneo”.';
    const qrFile   = qs('#qr-file');       if (qrFile)   qrFile.value = '';

    // 4) Limpiar UI de Tarjeta (OCR)
    const imgPrev  = qs('#image-preview'); if (imgPrev){ imgPrev.removeAttribute('src'); imgPrev.hidden = true; }
    const ocrLoad  = qs('#ocr-loading');   if (ocrLoad)  ocrLoad.hidden = true;
    const ocrRes   = qs('#ocr-result');    if (ocrRes)   ocrRes.hidden = true;
    const procBtn  = qs('#process-card');  if (procBtn)  procBtn.style.display = 'none';
    const saveBtn  = qs('#save-from-card');if (saveBtn)  saveBtn.style.display = 'none';

    // 5) Reset del store (borra contacto y dispara suscriptores)
    store.reset();

    // 6) Refrescar preview y visibilidad WhatsApp
    renderPreview(store.get());
    syncWhatsAppVisibility();

    // 7) Avisar a quien escuche (ej. tabs)
    document.dispatchEvent(new CustomEvent('elind-contact-updated'));

    alert('Todo limpio ✅');
  });
}

// ========== helpers ==========
function clearForm(form, fields){
  if (!form) return;
  form.reset();
  fields.forEach(id => { const el = qs('#'+id); if (el) el.value = ''; });
}

function renderPreview(state){
  const box = qs('#contact-preview-content');
  const lines = [];
  if (state.name)     lines.push(`<p><strong>Nombre:</strong> ${state.name}</p>`);
  if (state.company)  lines.push(`<p><strong>Empresa:</strong> ${state.company}</p>`);
  if (state.position) lines.push(`<p><strong>Cargo:</strong> ${state.position}</p>`);
  if (state.phone)    lines.push(`<p><strong>Teléfono:</strong> ${state.phone}</p>`);
  if (state.email)    lines.push(`<p><strong>Email:</strong> ${state.email}</p>`);
  if (state.notes)    lines.push(`<p><strong>Notas:</strong> ${state.notes}</p>`);
  box.innerHTML = lines.join('') || 'No hay información capturada aún';
}

// Mostrar/ocultar WhatsApp según si hay datos
function syncWhatsAppVisibility(){
  const btn = qs('#send-whatsapp');
  if (!btn) return;
  const s = store.get();
  const any = Boolean(s.name || s.company || s.position || s.phone || s.email || s.notes);
  btn.hidden = !any;
}
