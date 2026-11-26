/**
 * Parser hooks the browser build (wmux web) installs on every terminal it
 * mounts. The browser is a VIEWER of a pane another machine may own:
 *
 *  - Terminal queries (DA1/DA2/DA3, DSR/CPR, DECRQM, XTVERSION, DECRQSS, OSC
 *    color queries) are absorbed while the pane's owner (the desktop's
 *    terminal) answers, or while this viewer may not type. A second answer
 *    arriving from the browser reaches the shell as junk (`^[[?1;2c` on the
 *    prompt), and a viewer that stays quiet cannot type into a shell. Replayed
 *    queries are absorbed the same way, which is what keeps a snapshot from
 *    typing anything.
 *  - The exception is a LIVE query on a pane NO desktop is showing while this
 *    viewer has the input grant (`answerQueries`). There the browser is the
 *    only terminal attached: absorbing leaves a query-driven line editor
 *    (PSReadLine asks for the cursor position before every prompt) waiting
 *    out its retry timeout, which stalls echo and can spill a "terminal size
 *    too small" banner. Answering is safe there because this caller can
 *    already type. A REPLAYED query is still absorbed — it was answered when
 *    it was live, and answering it again sends the report into the shell as
 *    typing (the `[?1;2c` junk on the prompt). The caller decides which is
 *    which; this file only asks its predicate per query.
 *  - While this viewer may not type, mouse-tracking modes are absorbed too: the
 *    reports would go nowhere, and with them armed a drag selects nothing and
 *    the "app is using the mouse" hint offers a key that does nothing.
 *
 * Desktop terminals never get these hooks.
 */
import type { IDisposable, Terminal } from '@xterm/xterm';

/** DECSET/DECRST mouse-tracking and mouse-encoding modes. */
const MOUSE_MODES = new Set([9, 1000, 1001, 1002, 1003, 1005, 1006, 1015, 1016]);

type ParserTerminal = Pick<Terminal, 'parser'>;

export interface ViewerParserOptions {
  /** False while this viewer may not type (read-only device or server). */
  mayInput: () => boolean;
  /**
   * True only for a live query when this terminal is the pane's sole answerer:
   * the desktop is not showing it, this caller holds the input grant, and no
   * stored bytes are parsing. Evaluated per query, so a pane handed between
   * desk and phone changes behaviour without a remount. Defaults to never
   * answering.
   */
  answerQueries?: () => boolean;
}

const installed = new WeakSet<object>();

export function installViewerParser(term: ParserTerminal, opts: ViewerParserOptions): IDisposable[] {
  if (installed.has(term)) return [];
  installed.add(term);
  // Absorbed → true (xterm never answers). When this viewer is the answerer,
  // returning false lets xterm's own query handlers emit the report.
  const absorb = () => !opts.answerQueries?.();
  const p = term.parser;
  const out: IDisposable[] = [
    p.registerCsiHandler({ final: 'c' }, absorb), // DA1
    p.registerCsiHandler({ prefix: '>', final: 'c' }, absorb), // DA2
    p.registerCsiHandler({ prefix: '=', final: 'c' }, absorb), // DA3
    p.registerCsiHandler({ final: 'n' }, absorb), // DSR / CPR
    p.registerCsiHandler({ prefix: '?', final: 'n' }, absorb), // DECDSR
    p.registerCsiHandler({ intermediates: '$', final: 'p' }, absorb), // DECRQM (ANSI)
    p.registerCsiHandler({ prefix: '?', intermediates: '$', final: 'p' }, absorb), // DECRQM (DEC)
    p.registerCsiHandler({ prefix: '>', final: 'q' }, absorb), // XTVERSION
    p.registerDcsHandler({ intermediates: '$', final: 'q' }, absorb), // DECRQSS
  ];
  // OSC 4 / 10 / 11 / 12: a `?` spec is a query; setting a colour still applies.
  for (const ident of [4, 10, 11, 12]) {
    out.push(p.registerOscHandler(ident, (data) => data.includes('?') && absorb()));
  }
  const mouseOnly = (params: (number | number[])[]) =>
    params.length > 0 && params.every((v) => typeof v === 'number' && MOUSE_MODES.has(v));
  const readOnlyMouse = (params: (number | number[])[]) => !opts.mayInput() && mouseOnly(params);
  out.push(p.registerCsiHandler({ prefix: '?', final: 'h' }, readOnlyMouse));
  return out;
}

/** Focus reports (`?1004`) are the viewer's focus, not the owner's: never sent. */
export function isFocusReport(data: string): boolean {
  return data === '\x1b[I' || data === '\x1b[O';
}
