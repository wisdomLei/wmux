import { describe, it, expect, vi } from 'vitest';
import {
  FOLLOW_SYSTEM_MEDIA_QUERY,
  installFollowSystemTheme,
  systemPrefersDark,
  systemSlotTheme,
} from '../followSystemTheme';

const scheme = (matches: boolean, extra: Partial<MediaQueryList> = {}) =>
  ({ matches, ...extra }) as MediaQueryList;

describe('systemPrefersDark', () => {
  it('reads the dark-scheme query', () => {
    const matchMedia = vi.fn((query: string) => scheme(query === FOLLOW_SYSTEM_MEDIA_QUERY));
    expect(systemPrefersDark({ matchMedia })).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(FOLLOW_SYSTEM_MEDIA_QUERY);
  });

  it('reads light when the host has no matchMedia', () => {
    expect(systemPrefersDark({})).toBe(false);
    expect(systemPrefersDark(undefined)).toBe(false);
  });

  it('reads light when matchMedia throws', () => {
    expect(systemPrefersDark({ matchMedia: () => { throw new Error('unavailable'); } })).toBe(false);
  });
});

describe('systemSlotTheme', () => {
  it('returns the slot matching the OS appearance in system mode', () => {
    expect(systemSlotTheme('system', 'paper', 'tint', false)).toBe('paper');
    expect(systemSlotTheme('system', 'paper', 'tint', true)).toBe('tint');
  });

  it('returns null in fixed mode (the chosen theme stays)', () => {
    expect(systemSlotTheme('fixed', 'paper', 'tint', true)).toBeNull();
  });
});

describe('installFollowSystemTheme', () => {
  it('calls back when the OS appearance changes and stops after cleanup', () => {
    const onChange = vi.fn();
    let listener: (() => void) | undefined;
    const addEventListener = vi.fn((_event: string, fn: () => void) => { listener = fn; });
    const removeEventListener = vi.fn();
    const cleanup = installFollowSystemTheme(onChange, {
      matchMedia: () => scheme(false, { addEventListener, removeEventListener } as Partial<MediaQueryList>),
    });

    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(onChange).not.toHaveBeenCalled(); // the caller already resolved the first value
    listener?.();
    expect(onChange).toHaveBeenCalledTimes(1);
    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
  });

  it('is a no-op when the host cannot listen', () => {
    const noop = () => { /* the caller's callback is never used */ };
    expect(() => installFollowSystemTheme(noop, {})()).not.toThrow();
    expect(() => installFollowSystemTheme(noop, undefined)()).not.toThrow();
  });
});
