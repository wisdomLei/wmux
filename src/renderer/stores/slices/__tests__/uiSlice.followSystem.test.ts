import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createUISlice, type UISlice } from '../uiSlice';

// Follow-system theme (2026-11-25): the app shows the light or dark slot as
// the OS appearance changes, and an explicit theme choice leaves the mode.

vi.mock('../../../i18n', () => ({
  setLocale: vi.fn(),
}));

vi.mock('../../../themes', () => ({
  applyCustomCssVars: vi.fn(),
  clearCustomCssVars: vi.fn(),
  DEFAULT_CUSTOM_THEME: { bgBase: '#000000', xtermPaletteId: 'catppuccin-mocha' },
  migrateCustomThemeColors: (c: unknown) => c,
  builtinToCustom: (id: string) => ({ bgBase: `seed-${id}`, xtermPaletteId: 'catppuccin-mocha' }),
  UI_THEME_TOKENS: {
    tint: {}, zinc: {}, graphite: {}, paper: {}, 'amber-line': {},
    mono: {}, 'mono-light': {}, amber: {}, 'catppuccin-mocha': {},
    monochrome: {}, 'stars-and-stripes': {}, 'red-dynasty': {},
    nightowl: {}, void: {}, hinomaru: {}, taegeuk: {},
  },
}));

let systemDark = false;
const setAttribute = vi.fn();

Object.defineProperty(globalThis, 'document', {
  value: { documentElement: { setAttribute } },
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: {
    matchMedia: () => ({ matches: systemDark }),
    electronAPI: { settings: { setToastEnabled: vi.fn(), setAutoUpdateEnabled: vi.fn() } },
  },
  writable: true,
  configurable: true,
});

function createUIStore() {
  return create<UISlice>()(
    immer((...args) => ({
      // @ts-expect-error — minimal test store doesn't match full StoreState
      ...createUISlice(...args),
    }))
  );
}

describe('UISlice — follow-system theme', () => {
  let store: ReturnType<typeof createUIStore>;

  beforeEach(() => {
    systemDark = false;
    setAttribute.mockClear();
    store = createUIStore();
  });

  it('defaults to fixed mode with Paper for light and Tint for dark', () => {
    expect(store.getState().themeMode).toBe('fixed');
    expect(store.getState().lightTheme).toBe('paper');
    expect(store.getState().darkTheme).toBe('tint');
  });

  it('applies the light slot as soon as system mode is chosen on a light OS', () => {
    store.getState().setThemeMode('system');
    expect(store.getState().theme).toBe('paper');
    expect(setAttribute).toHaveBeenCalledWith('data-theme', 'paper');
  });

  it('switches to the dark slot when the OS turns dark, and back', () => {
    store.getState().setThemeMode('system');
    systemDark = true;
    store.getState().syncSystemTheme();
    expect(store.getState().theme).toBe('tint');

    systemDark = false;
    store.getState().syncSystemTheme();
    expect(store.getState().theme).toBe('paper');
  });

  it('re-applies a slot when the active slot is changed', () => {
    store.getState().setThemeMode('system'); // light OS → paper
    systemDark = true;
    store.getState().syncSystemTheme(); // → tint
    systemDark = false;
    store.getState().setLightTheme('zinc');
    expect(store.getState().theme).toBe('zinc');

    // Changing the inactive slot leaves the shown theme alone.
    systemDark = false;
    store.getState().syncSystemTheme();
    store.getState().setDarkTheme('graphite');
    expect(store.getState().theme).toBe('zinc');
  });

  it('leaves system mode when a theme is picked, so the OS no longer moves it', () => {
    store.getState().setThemeMode('system');
    store.getState().setTheme('graphite');
    expect(store.getState().themeMode).toBe('fixed');
    expect(store.getState().theme).toBe('graphite');

    systemDark = true;
    store.getState().syncSystemTheme();
    expect(store.getState().theme).toBe('graphite');
  });
});
