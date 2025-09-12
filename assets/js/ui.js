// assets/js/ui.js
import { store } from './store.js';
import { qs, on } from './dom.js';
import { normalizeEmail, normalizePhone } from './validators.js';

let unsub = null;
let off = [];

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

  // Limpiar manualmente (si tienes el botón)
  const clearBtn = qs('#clear-contact');
  if (clearBtn){
    off.push(on(clearBtn, 'click', () => {
      store.reset();               // borra store + dispara subscribe → esconde botón
      clearForm(form, fields);
      renderPreview(store.get());
      syncWhatsAppVisibility();    // por si quieres forzar justo aquí también
    }));
  }
}

function clearForm(form, fields){
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

// ← NUEVO: mostrar/ocultar botón según si hay datos
function syncWhatsAppVisibility(){
  const btn = qs('#send-whatsapp');
  if (!btn) return;
  const s = store.get();
  const any = Boolean(s.name || s.company || s.position || s.phone || s.email || s.notes);
  btn.hidden = !any; // se muestra cuando hay algo que enviar
}
