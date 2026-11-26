/**
 * The phone's terminal key bar.
 *
 * A software keyboard has no Esc, Tab, Ctrl or arrows, and those are exactly
 * the keys a CLI agent asks for. The bar sends raw bytes through the page's
 * own PTY hub, so it obeys the same input grant, ordering and halt rules as
 * the terminal itself: read-only pages never render it, and a refused write
 * pauses input the same way a typed key does.
 *
 * Buttons act on pointerdown with the default prevented, so pressing one does
 * not blur xterm's hidden textarea (and close the software keyboard) before
 * the byte is sent.
 */
import { useState } from 'react';
import { terminalRegistry } from '../hooks/useTerminal';
import { IconChevron, IconKeyboard } from '../components/icons';
import { FOCUS_RING } from '../components/focusRing';
import { useT } from '../hooks/useT';
import { webPtyHub } from './WebTerminal';

interface KeyDef {
  /** What the keycap says. These are key legends, not chrome glyphs. */
  label: string;
  /** The bytes the shell or agent expects. */
  seq: string;
}

const CORE_KEYS: readonly KeyDef[] = [
  { label: 'Esc', seq: '\x1b' },
  { label: 'Tab', seq: '\t' },
  // Enter and Ctrl-C sit early so a 360px phone still shows them without a
  // sideways swipe; the arrows and ⇧Tab are the ones that may scroll.
  { label: '⏎', seq: '\r' },
  { label: '⌃C', seq: '\x03' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
];

const MORE_KEYS: readonly KeyDef[] = [
  { label: '⇧Tab', seq: '\x1b[Z' },
  { label: '/', seq: '/' },
  { label: '-', seq: '-' },
  { label: '|', seq: '|' },
  { label: '~', seq: '~' },
  { label: 'Home', seq: '\x1b[H' },
  { label: 'End', seq: '\x1b[F' },
  { label: 'PgUp', seq: '\x1b[5~' },
  { label: 'PgDn', seq: '\x1b[6~' },
  { label: '⌃D', seq: '\x04' },
  { label: '⌃Z', seq: '\x1a' },
];

export default function MobileKeyBar({ ptyId }: { ptyId: string }) {
  const t = useT();
  const [more, setMore] = useState(false);

  const send = (seq: string) => {
    void webPtyHub()?.pty.write(ptyId, seq);
  };

  const key = (k: KeyDef) => (
    <button
      key={k.label}
      type="button"
      className={`web-keybar-key ${FOCUS_RING}`}
      // Pointerdown keeps focus on xterm's textarea (and the software
      // keyboard) while the byte is sent; onClick is the keyboard path.
      onPointerDown={(e) => {
        e.preventDefault();
        send(k.seq);
      }}
      onClick={(e) => {
        // A keyboard activation has no pointerdown; a pointer click already
        // sent its byte there.
        if (e.detail === 0) send(k.seq);
      }}
      data-web-key={k.label}
    >
      {k.label}
    </button>
  );

  return (
    <div className="web-keybar" data-web-keybar>
      {more && (
        <div className="web-keybar-row web-keybar-more" role="toolbar" aria-label={t('web.moreKeys')}>
          <div className="web-keybar-keys">{MORE_KEYS.map(key)}</div>
        </div>
      )}
      <div className="web-keybar-row">
        <div className="web-keybar-keys" role="toolbar" aria-label={t('web.terminalKeys')}>
          {CORE_KEYS.map(key)}
        </div>
        <div className="web-keybar-tail">
          <button
            type="button"
            className={`web-keybar-key web-keybar-toggle ${FOCUS_RING}`}
            aria-label={more ? t('web.fewerKeys') : t('web.moreKeys')}
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
            data-web-keybar-more
          >
            <span className="web-keybar-chevron" data-expanded={more ? 'true' : undefined}>
              <IconChevron size={14} />
            </span>
          </button>
          <button
            type="button"
            className={`web-keybar-key web-keybar-keyboard ${FOCUS_RING}`}
            aria-label={t('web.showKeyboard')}
            title={t('web.showKeyboard')}
            onClick={() => terminalRegistry.get(ptyId)?.focus()}
            data-web-keybar-keyboard
          >
            <IconKeyboard size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
