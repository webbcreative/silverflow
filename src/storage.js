import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants.js';

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function loadSettings() {
  const stored = safeParse(localStorage.getItem(STORAGE_KEYS.settings), {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export function loadFavorites() {
  return new Set(safeParse(localStorage.getItem(STORAGE_KEYS.favorites), []));
}

export function saveFavorites(favorites) {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...favorites]));
}

export function loadOverrides() {
  return safeParse(localStorage.getItem(STORAGE_KEYS.overrides), []);
}

export function saveOverrides(overrides) {
  localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify(overrides));
}
