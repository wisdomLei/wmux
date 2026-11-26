/**
 * The grid a phone asks its pane for.
 *
 * A desk pane is commonly 151 columns wide; at that width a readable font can
 * never fit a 390px phone, and the wrapping happened in the PTY before the
 * browser saw a byte. The phone-client contract therefore has the viewer ask
 * for its own geometry (`POST /api/sessions/:id/resize`): the desk keeps its
 * size only while it is actually showing that pane, and a detached pane takes
 * the phone's numbers.
 *
 * This function is deliberately arithmetic-only: it does not read xterm or the
 * DOM, so it is testable, and its cell estimates only need to be close. The
 * terminal's own fixed-geometry fit still picks the exact font for the grid
 * that comes back; a slightly small estimate costs a little margin, a slightly
 * large one costs half a point of font size.
 */

/** Target font size for a phone terminal; the fit addon may settle just below. */
export const PHONE_TERMINAL_FONT = 13;
/** Estimated cell size per font pixel. xterm rounds the real values. */
export const PHONE_CELL_WIDTH_RATIO = 0.56;
export const PHONE_CELL_HEIGHT_RATIO = 1.18;
/** Room for the terminal's own 4px padding and xterm's scrollbar. */
const HORIZONTAL_CHROME = 24;
const VERTICAL_CHROME = 8;
/** The contract's floor (cols 40..1000, rows 8..1000), and a phone-sized cap. */
const MIN_COLS = 40;
const MAX_COLS = 120;
const MIN_ROWS = 8;
const MAX_ROWS = 100;

/**
 * Below this many CSS pixels per column a fitted grid is no longer readable.
 * At 390px a desk grid of 151 columns gives 2.6px per column — the fixed-fit
 * addon's 4px floor, which is why a mirror of an owned pane must not be fitted.
 */
export const PHONE_MIN_READABLE_CELL = 6;

export interface PhoneGrid {
  cols: number;
  rows: number;
}

/**
 * Whether a pane rendered at `cols` in `boxWidth` would be too small to read.
 * The answer switches the phone from "fit the desk's grid" to "render it at
 * the target font and let the viewer pan"; a grid within reach of the box is
 * still fitted, so only genuinely desk-sized panes pan.
 */
export function needsReadablePan(cols: number, boxWidth: number): boolean {
  return cols > 0 && boxWidth > 0 && boxWidth / cols < PHONE_MIN_READABLE_CELL;
}

/**
 * The width the pane's surface needs to draw `cols` at the target font. The
 * surface is wider than the phone, so the phone scrolls it sideways instead of
 * shrinking the type into illegibility.
 */
export function readableSurfaceWidth(cols: number): number {
  return Math.ceil(cols * PHONE_TERMINAL_FONT * PHONE_CELL_WIDTH_RATIO) + HORIZONTAL_CHROME;
}

/**
 * The grid to request for a terminal box, or null when the box is too small to
 * mean anything (a hidden pane, a zero-width split during a transition).
 */
export function phoneTerminalGrid(width: number, height: number): PhoneGrid | null {
  if (!(width > 0) || !(height > 0)) return null;
  const usableWidth = width - HORIZONTAL_CHROME;
  const usableHeight = height - VERTICAL_CHROME;
  if (usableWidth < 80 || usableHeight < 40) return null;
  const cellWidth = PHONE_TERMINAL_FONT * PHONE_CELL_WIDTH_RATIO;
  const cellHeight = PHONE_TERMINAL_FONT * PHONE_CELL_HEIGHT_RATIO;
  const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, Math.floor(usableWidth / cellWidth)));
  const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.floor(usableHeight / cellHeight)));
  return { cols, rows };
}
