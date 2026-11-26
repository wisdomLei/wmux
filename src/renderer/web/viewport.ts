/**
 * The phone's frame height under the software keyboard.
 *
 * The keyboard is an overlay for the phone terminal: the shell's column count
 * must not change because the user is typing, and the fixed-geometry fit must
 * not shrink the font to fit a shorter box. So the app keeps the FULL layout
 * viewport's height (initial-scale=1 fixes its width; `interactive-widget`
 * resizes-visual, not resizes-content, is what makes that possible), and the
 * part the keyboard covers is compensated for by moving the whole app up.
 * The terminal keeps its box and its grid; the key bar and the rows the user
 * is typing into stay on screen above the keyboard.
 *
 * The hook reads `visualViewport` for the covered part only. A rotation or a
 * real window resize changes the layout viewport, and that DOES change the
 * terminal box and its grid as usual.
 */
import { useEffect } from 'react';

/** How much of the app the keyboard covers, or 0 when it does not. */
export function keyboardOverlap(
  visualHeight: number,
  offsetTop: number,
  layoutHeight: number,
): number {
  if (!(visualHeight > 0) || !(layoutHeight > 0)) return 0;
  // A pinch-zoomed page has a smaller visual viewport too, but that is the
  // user's zoom, not a keyboard: shifting the app then would fight the pan.
  return Math.max(0, Math.round(layoutHeight - visualHeight - offsetTop));
}

export function useWebViewportHeight(narrow: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!narrow) {
      root.style.removeProperty('--web-viewport-height');
      root.style.removeProperty('--web-keyboard-inset');
      return undefined;
    }
    const vv = window.visualViewport;
    const apply = () => {
      // The layout viewport, not visualViewport: it does not move when the
      // keyboard opens. `interactive-widget=resizes-visual` on the page's
      // viewport meta is what keeps it the full screen height.
      const height = window.innerHeight;
      if (height > 0) root.style.setProperty('--web-viewport-height', `${Math.round(height)}px`);
      const inset = vv ? keyboardOverlap(vv.height, vv.offsetTop, height) : 0;
      if (inset > 0) root.style.setProperty('--web-keyboard-inset', `${inset}px`);
      else root.style.removeProperty('--web-keyboard-inset');
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      root.style.removeProperty('--web-viewport-height');
      root.style.removeProperty('--web-keyboard-inset');
    };
  }, [narrow]);
}
