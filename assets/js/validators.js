export const normalizeEmail = (v='') => v.trim().toLowerCase();
export const normalizePhone = (v='') => v.replace(/[^\d+]/g,'').trim();
