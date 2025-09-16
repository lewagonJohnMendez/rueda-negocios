import { store } from './store.js';
import { qs } from './dom.js';

export function initWhatsApp(){
  qs('#send-whatsapp').addEventListener('click', (e) => {
    e.preventDefault();
    const s = store.get();
    let msg = `Nuevo contacto de la Rueda de Negocios:\n\n`;
    if (s.name)     msg += `*Nombre:* ${s.name}\n`;
    if (s.company)  msg += `*Empresa:* ${s.company}\n`;
    if (s.position) msg += `*Cargo:* ${s.position}\n`;
    if (s.phone)    msg += `*Teléfono:* ${s.phone}\n`;
    if (s.email)    msg += `*Email:* ${s.email}\n`;
    if (s.notes)    msg += `*Notas:* ${s.notes}\n`;

    const encoded = encodeURIComponent(msg);
    // Si quieres enviar a un número específico, cambia '' por el número con código de país'
    const number = ''; // ej: '573XXXXXXXX'
    const url = number ? `https://wa.me/${number}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener');
  });
}
