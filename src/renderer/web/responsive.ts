/**
 * The browser client's one responsive breakpoint.
 *
 * One Web client serves both the desktop browser and a phone: below this
 * width the shell switches to the phone layout (drawer navigation, one pane,
 * the touch key bar). Every surface reads the same constant so the shell,
 * the terminal and the dialogs cannot disagree about what "phone" means.
 */
import { useSyncExternalStore } from 'react';

export const PHONE_QUERY = '(max-width: 640px)';

function subscribeNarrow(cb: () => void): () => void {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
