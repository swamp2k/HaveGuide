export const THEME_STORAGE_KEY = 'haveguide-theme';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  mood: string;
  /** Three colours used for the swatch preview: ground, accent, secondary. */
  swatch: readonly [string, string, string];
}

export const THEMES = [
  { id: 'sage', name: 'Salvie', mood: 'Rolig og grøn', swatch: ['#F3F5EE', '#66856C', '#C9B79C'] },
  { id: 'blush', name: 'Rosenhave', mood: 'Blød og varm', swatch: ['#FBF2F1', '#B97783', '#849A7B'] },
  { id: 'lavender', name: 'Lavendel', mood: 'Sen sommeraften', swatch: ['#F5F2F8', '#927BB2', '#85977A'] },
  { id: 'meadow', name: 'Blomstereng', mood: 'Frodig og gylden', swatch: ['#F4F3E9', '#4F765A', '#D2A463'] },
] as const satisfies readonly ThemeDefinition[];

export type ThemeId = 'sage' | 'blush' | 'lavender' | 'meadow';

export const DEFAULT_THEME: ThemeId = 'sage';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((theme) => theme.id === value);
}

export function readStoredTheme(storage?: Pick<Storage, 'getItem'>): ThemeId {
  try {
    const store = storage ?? globalThis.localStorage;
    const stored = store?.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: ThemeId, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const store = storage ?? globalThis.localStorage;
    store?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / blocked storage: the theme simply does not persist */
  }
}

export function applyTheme(theme: ThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}
