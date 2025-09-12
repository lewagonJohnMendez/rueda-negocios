// assets/js/tabs.js
import { qs, on } from './dom.js';
import { store } from './store.js';

let current = 'manual';
let offHandlers = [];

export function initTabs(){
  const tabs = document.querySelectorAll('.tab');

  // visibilidad inicial
  updateExtrasVisibility(current);

  // refrescar visibilidad cuando cambie el contacto (evento desde ui.js)
  document.addEventListener('elind-contact-updated', () => updateExtrasVisibility(current));

  tabs.forEach(tab => {
    offHandlers.push(on(tab, 'click', async () => {
      const target = tab.dataset.tab;
      if (target === current) return;

      tabs.forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-content').forEach(c =>
        c.classList.toggle('active', c.id === `${target}-tab`)
      );

      await teardown(current);
      await setup(target);

      current = target;
      updateExtrasVisibility(current); // <- clave
    }));
  });

  // setup inicial del tab por defecto
  setup('manual');
}

function hasContact(){
  const s = store.get();
  return Boolean(s.name || s.company || s.position || s.phone || s.email || s.notes);
}

function updateExtrasVisibility(activeTab){
  const preview  = qs('.contact-preview');
  const whatsapp = qs('#send-whatsapp');
  const anyData  = hasContact();

  if (preview) {
    // Regla: mostrar en 'manual' siempre, en 'qr'/'card' solo si hay datos, ocultar en 'audio'
    if (activeTab === 'manual') preview.hidden = false;
    else if (activeTab === 'qr' || activeTab === 'card') preview.hidden = !anyData;
    else preview.hidden = true;
  }

  if (whatsapp) {
    // Botón visible solo si hay algo que enviar
    whatsapp.hidden = !anyData;
  }
}

async function setup(target){
  if (target === 'qr') {
    const { initQR } = await import('./qr.js'); await initQR();
  }
  if (target === 'card') {
    const { initCard } = await import('./ocr.js'); await initCard();
  }
}

async function teardown(prev){
  if (prev === 'qr') {
    const { destroyQR } = await import('./qr.js'); await destroyQR();
  }
  if (prev === 'card') {
    const { destroyCard } = await import('./ocr.js'); await destroyCard();
  }
}

export function destroyTabs(){
  offHandlers.forEach(off => off());
  offHandlers = [];
}
