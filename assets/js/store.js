// assets/js/store.js
const LS_KEY = 'elind-contact-v1';

const subscribers = new Set();
let state = {
  name: '', company: '', position: '', phone: '', email: '', notes: ''
};

export const store = {
  get: () => ({ ...state }),

  set: (patch = {}) => {
    state = { ...state, ...patch };
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
    subscribers.forEach(fn => fn(store.get()));
  },

  subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },

  load: () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) state = { ...state, ...JSON.parse(raw) };
    } catch {}
  },

  reset: () => {
    state = { name:'', company:'', position:'', phone:'', email:'', notes:'' };
    try { localStorage.removeItem(LS_KEY); } catch {}
    subscribers.forEach(fn => fn(store.get()));
  }
};
