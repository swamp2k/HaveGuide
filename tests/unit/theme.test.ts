import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, isThemeId, readStoredTheme, storeTheme } from '../../src/client/theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value; },
    read: () => data,
  };
}

describe('theme persistence', () => {
  it('defaults to sage', () => {
    expect(DEFAULT_THEME).toBe('sage');
    expect(readStoredTheme(memoryStorage())).toBe('sage');
  });

  it('reads back a stored theme', () => {
    expect(readStoredTheme(memoryStorage({ 'haveguide-theme': 'blush' }))).toBe('blush');
  });

  it('ignores an unknown stored value', () => {
    expect(readStoredTheme(memoryStorage({ 'haveguide-theme': 'neon' }))).toBe('sage');
  });

  it('survives a storage that throws', () => {
    const hostile = { getItem: () => { throw new Error('blocked'); } };
    expect(readStoredTheme(hostile)).toBe('sage');
    expect(() => storeTheme('meadow', { setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });

  it('writes under the documented key', () => {
    const storage = memoryStorage();
    storeTheme('lavender', storage);
    expect(storage.read()['haveguide-theme']).toBe('lavender');
  });

  it('recognises exactly the four shipped themes', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(['sage', 'blush', 'lavender', 'meadow']);
    expect(THEMES.every((theme) => isThemeId(theme.id))).toBe(true);
    expect(isThemeId('dashboard')).toBe(false);
  });
});
