import { store } from './store.js';
import { qs } from './dom.js';

export function initVoice(){
  const TextRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!TextRec){
    qs('#audio-tab').innerHTML = '<p>Tu navegador no soporta reconocimiento de voz.</p>';
    return;
  }
  const rec = new TextRec();
  rec.continuous = true; rec.interimResults = true; rec.lang = 'es-ES';

  const notes = qs('#voice-notes');
  const startBtn = qs('#start-recording');
  const stopBtn = qs('#stop-recording');
  const saveBtn = qs('#save-voice-notes');

  rec.onresult = (ev) => {
    const text = Array.from(ev.results).map(r => r[0].transcript).join('');
    notes.value = text;
  };
  rec.onerror = () => {};

  startBtn.onclick = () => { rec.start(); startBtn.disabled = true; stopBtn.disabled = false; saveBtn.disabled = true; notes.placeholder='Escuchando…'; };
  stopBtn.onclick  = () => { rec.stop();  startBtn.disabled = false; stopBtn.disabled = true; saveBtn.disabled = false; notes.placeholder='Haz clic y comienza a hablar…'; };
  saveBtn.onclick  = () => { store.set({ notes: notes.value }); alert('Notas de voz guardadas ✅'); };
}
