// Theme logic shared by the inline <head> script (no flash of the wrong theme) and the toggle button.
export const STORAGE_KEY = 'theme';

/** 'light' | 'dark' | anything else (=system) -> 'light' | 'dark' */
export function resolveTheme(stored, prefersDark) {
  return stored === 'light' || stored === 'dark' ? stored : (prefersDark ? 'dark' : 'light');
}

/** The toggle flips the theme you currently see. */
export function nextTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}

export function readStored(storage) {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null; // storage can throw in private mode / when blocked
  }
}

export function writeStored(storage, value) {
  try {
    storage?.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}
