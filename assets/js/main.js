import { initTabs } from './tabs.js';
import { initManual } from './ui.js';
import { initVoice } from './voice.js';
import { initWhatsApp } from './whatsapp.js';
import { store } from './store.js';

function boot(){
  // Carga el estado guardado, pinta la vista
  store.load();
  initManual();     // listeners de form + preview reactiva
  initTabs();       // manejo de pestañas + carga bajo demanda
  initVoice();      // dictado por voz (si existe)
  initWhatsApp();   // click de enviar con encode robusto
}
document.addEventListener('DOMContentLoaded', boot);
