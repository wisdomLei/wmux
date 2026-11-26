/**
 * Follow-system theme: in `system` mode the app shows the user's light-slot
 * theme while the OS prefers light and the dark-slot theme while it prefers
 * dark, switching live when the OS does. `fixed` mode keeps the theme the
 * user picked.
 */

export type ThemeMode = 'fixed' | 'system';

export const FOLLOW_SYSTEM_MEDIA_QUERY = '(prefers-color-scheme: dark)';

type MatchMediaHost = { matchMedia?: (query: string) => MediaQueryList } | undefined;

function defaultHost(): MatchMediaHost {
  return typeof window === 'undefined' ? undefined : window;
}

/**
 * Whether the OS currently prefers a dark scheme. A host without matchMedia
 * (tests, a stripped-down web view) reads as light: the light slot is the
 * safer answer on a page that cannot know.
 */
export function systemPrefersDark(host: MatchMediaHost = defaultHost()): boolean {
  try {
    return host?.matchMedia?.(FOLLOW_SYSTEM_MEDIA_QUERY)?.matches === true;
  } catch {
    return false;
  }
}

/** The theme a mode shows now: the matching slot in `system` mode, null in `fixed`. */
export function systemSlotTheme(
  mode: ThemeMode,
  lightTheme: string,
  darkTheme: string,
  dark: boolean,
): string | null {
  return mode === 'system' ? (dark ? darkTheme : lightTheme) : null;
}

/**
 * Call `onChange` whenever the OS appearance changes, and return the cleanup.
 * It does not apply the first value: the caller resolved the theme from the
 * session it just loaded and only needs later changes.
 */
export function installFollowSystemTheme(
  onChange: () => void,
  host: MatchMediaHost = defaultHost(),
): () => void {
  let scheme: MediaQueryList | undefined;
  try {
    scheme = host?.matchMedia?.(FOLLOW_SYSTEM_MEDIA_QUERY) ?? undefined;
  } catch {
    scheme = undefined;
  }
  if (!scheme?.addEventListener) {
    // Nothing to listen to: the host has no matchMedia, so the theme stays put.
    return () => { /* no listener was attached */ };
  }
  const run = () => onChange();
  scheme.addEventListener('change', run);
  return () => scheme.removeEventListener('change', run);
}
