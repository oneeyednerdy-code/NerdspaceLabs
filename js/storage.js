import { APP_CONFIG } from '../config.js';

const key = name => APP_CONFIG.storagePrefix + name;

export const storage = {
  get(name, fallback = null) {
    try {
      const raw = localStorage.getItem(key(name));
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(name, value) {
    try { localStorage.setItem(key(name), JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(name) { try { localStorage.removeItem(key(name)); } catch {} },
  clearLocalData() {
    for (const k of Object.keys(localStorage)) if (k.startsWith(APP_CONFIG.storagePrefix)) localStorage.removeItem(k);
  }
};