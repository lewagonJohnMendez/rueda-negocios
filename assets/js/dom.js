export const qs = (s, scope=document) => scope.querySelector(s);
export const qsa = (s, scope=document) => [...scope.querySelectorAll(s)];
export const on = (el, ev, fn, opts) => { el.addEventListener(ev, fn, opts); return () => el.removeEventListener(ev, fn, opts); };
export const show = (el, yes=true) => { el.hidden = !yes; };
