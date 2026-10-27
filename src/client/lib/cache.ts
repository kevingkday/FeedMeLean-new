import type { SavedMeal } from '../../shared/types';

const SAVED_MEALS_KEY_PREFIX = 'fml_saved_meals_v1:';
const RECENT_DESCRIPTIONS_KEY_PREFIX = 'fml_recent_desc_v1:';

export function getCachedSavedMeals(userId: string): SavedMeal[] {
  try {
    const raw = localStorage.getItem(`${SAVED_MEALS_KEY_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setCachedSavedMeals(userId: string, meals: SavedMeal[]): void {
  try {
    localStorage.setItem(`${SAVED_MEALS_KEY_PREFIX}${userId}`, JSON.stringify(meals));
  } catch {
    // Ignore storage quota errors
  }
}

export function getRecentDescriptions(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`${RECENT_DESCRIPTIONS_KEY_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentDescription(userId: string, description: string): string[] {
  const trimmed = description.trim();
  if (!trimmed) return getRecentDescriptions(userId);
  const existing = getRecentDescriptions(userId).filter(
    (d) => d.toLowerCase() !== trimmed.toLowerCase()
  );
  const updated = [trimmed, ...existing].slice(0, 8);
  try {
    localStorage.setItem(`${RECENT_DESCRIPTIONS_KEY_PREFIX}${userId}`, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
  return updated;
}

export function clearUserLocalCache(userId?: string): void {
  try {
    if (userId) {
      localStorage.removeItem(`${SAVED_MEALS_KEY_PREFIX}${userId}`);
      localStorage.removeItem(`${RECENT_DESCRIPTIONS_KEY_PREFIX}${userId}`);
    }
  } catch {
    // Ignore
  }
}

