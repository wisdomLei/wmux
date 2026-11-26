/**
 * Browser-build stand-in (vite.web.config.ts) for components/Terminal/Terminal:
 * it mounts the desktop's REAL TerminalComponent for a pane that is shown and
 * holds one of the page's live stream slots (webPty.ts), and a static body for
 * every other case.
 *
 *  - No ptyId → never mount TerminalComponent (its self-create path would call
 *    `pty.create`, which the browser must never reach).
 *  - Not shown (inactive tab, hidden workspace, off the phone's zoomed pane)
 *    → nothing mounted and no slot held, so no stream is open for it.
 *  - Shown without a slot → a placeholder with a button that takes a slot from
 *    the least recently activated live pane.
 *  - The grid is the desktop's (`fixedGeometry` from /api/sessions and the
 *    stream's `meta`); scrollback restore and the PTY-created callback are
 *    desktop-only and are not passed on.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import TerminalComponent from '../components/Terminal/Terminal';
import { terminalRegistry } from '../hooks/useTerminal';
import { useStore } from '../stores';
import { useT } from '../hooks/useT';
import { findLeaf, findLeafBySurfaceId, getLeafPanes } from '../../shared/paneUtils';
import { FOCUS_RING } from '../components/focusRing';
import { WEB_LIVE_STREAM_CAP, type InputHalt, type WebPtyHub } from './webPty';
import { useNarrow } from './responsive';
import { needsReadablePan, phoneTerminalGrid, readableSurfaceWidth } from './phoneTerminal';

/** How often a phone re-asks a size the desk refused. A refusal costs the desk
 *  nothing (no SIGWINCH), and the desk sends no event when it stops showing
 *  the pane, so a slow probe is the only way the phone can take the size over. */
const DESK_OWNED_PROBE_MS = 10_000;

let hub: WebPtyHub | null = null;

/** main.tsx installs the page's hub before the first render. */
export function setWebPtyHub(next: WebPtyHub | null): void {
  hub = next;
}

/** The page's hub, or null before main.tsx installed it. */
export function webPtyHub(): WebPtyHub | null {
  return hub;
}

const noopSubscribe = () => () => undefined;
const zero = () => 0;

/** Whether this page may type ('checking' until /api/config answers). */
export function useWebInputState(): 'checking' | 'allowed' | 'read-only' {
  const h = hub;
  useSyncExternalStore(h ? h.subscribe : noopSubscribe, h ? h.version : zero);
  return h ? h.inputState() : 'checking';
}

interface WebTerminalProps {
  chatView?: boolean;
  ptyId?: string;
  shell?: string;
  cwd?: string;
  onPtyCreated?: (ptyId: string) => void;
  isActive?: boolean;
  visible?: boolean;
  isWorkspaceVisible?: boolean;
  scrollbackFile?: string;
  workspaceId?: string;
  surfaceId?: string;
}

function Body({ surfaceId, children }: { surfaceId: string; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-base)] text-sm"
      style={{ color: 'var(--text-sub2)' }}
      data-surface-id={surfaceId}
      data-web-terminal-waiting
    >
      {children}
    </div>
  );
}

function haltText(t: ReturnType<typeof useT>, halt: InputHalt): string {
  if (halt.reason === 'offline') return t('web.inputPausedOffline');
  if (halt.reason === 'unauthorized') return t('web.inputPausedUnauthorized');
  if (halt.reason === 'too-large') return t('web.inputPausedTooLarge');
  if (halt.reason === 'refused:terminal-prompt-active') return t('web.inputPausedPrompt');
  return t('web.inputPausedRefused', { code: halt.reason.replace(/^refused:/, '') });
}

/** Input to this pane stopped: say why and what was not sent, never silently. */
function InputHaltBanner({ halt, onResume }: { halt: InputHalt; onResume: () => void }) {
  const t = useT();
  return (
    <div
      role="alert"
      className="absolute inset-x-2 top-2 z-20 rounded border p-3 text-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-base)', color: 'var(--text-main)' }}
      data-web-input-halt={halt.reason}
    >
      <p className="font-medium">{t('web.inputPaused')}</p>
      <p className="mt-1 break-words" style={{ color: 'var(--text-sub)' }}>{haltText(t, halt)}</p>
      {halt.dropped > 0 && (
        <p className="mt-1" style={{ color: 'var(--text-sub2)' }}>{t('web.inputDropped', { count: halt.dropped })}</p>
      )}
      <button
        type="button"
        className={`mt-2 rounded border px-3 py-1 text-xs ${FOCUS_RING}`}
        style={{ borderColor: 'var(--border)', color: 'var(--text-main)' }}
        onClick={onResume}
        data-web-input-resume
      >
        {t('web.inputResume')}
      </button>
    </div>
  );
}

export default function WebTerminal({
  ptyId, cwd, isActive = true, visible, isWorkspaceVisible = true, workspaceId, surfaceId = '',
}: WebTerminalProps) {
  const t = useT();
  const h = hub;
  useSyncExternalStore(h ? h.subscribe : noopSubscribe, h ? h.version : zero);
  const narrow = useNarrow();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [phoneBox, setPhoneBox] = useState<{ width: number; height: number } | null>(null);

  // The phone shows one pane through the app's zoom; PaneContainer hides the
  // others with CSS but still tells them they are visible.
  const zoomHidden = useStore((s) => {
    const zoomed = s.zoomedPaneId;
    if (!zoomed || !surfaceId) return false;
    const ws = s.workspaces.find((w) => w.id === (workspaceId ?? s.activeWorkspaceId));
    if (!ws || !findLeaf(ws.rootPane, zoomed)) return false;
    const leaf = findLeafBySurfaceId(ws.rootPane, surfaceId);
    return !!leaf && leaf.id !== zoomed;
  });
  const title = useStore((s) => {
    for (const ws of s.workspaces) {
      for (const leaf of getLeafPanes(ws.rootPane)) {
        const hit = leaf.surfaces.find((x) => x.id === surfaceId);
        if (hit) return hit.title;
      }
    }
    return '';
  });

  const shown = isWorkspaceVisible && (visible ?? isActive) && !zoomHidden;
  const id = ptyId ?? '';
  const geom = id ? h?.geometryOf(id) : undefined;
  const geomCols = geom?.cols ?? 0;
  const geomRows = geom?.rows ?? 0;

  useEffect(() => {
    if (!h || !shown || !id) return;
    h.request(id);
    return () => h.release(id);
  }, [h, shown, id]);

  // The phone asks the pane for the grid it can read (phoneTerminal.ts). The
  // box is measured after a layout settles, never per animation frame: every
  // accepted resize arms the daemon's redraw guard, and one loop can stop new
  // approvals from being detected. The desk keeps its own size while it is
  // actually showing the pane; its 409 then names the grid to render instead.
  useEffect(() => {
    if (!narrow || !shown) return undefined;
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { width: Math.round(r.width), height: Math.round(r.height) };
      setPhoneBox((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [narrow, shown]);

  // Touch focus and panning. xterm's document touch handler calls
  // preventDefault, so the browser never scrolls our overflow container, and
  // its screen does not take focus from a tap (only mousedown does). Track one
  // finger here: a tap focuses the terminal (opening the software keyboard, as
  // the gesture is still live), a sideways swipe pans a desk-owned surface,
  // and anything else is left to xterm's own scrollback handling.
  useEffect(() => {
    if (!narrow) return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let panning = false;
    let moved = false;
    const onTouchStart = (e: TouchEvent) => {
      panning = false;
      moved = false;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startLeft = el.scrollLeft;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
      if (el.scrollWidth <= el.clientWidth) return;
      if (!panning) {
        // Sideways, and clearly more sideways than down: a vertical swipe is
        // xterm's scrollback, not this pan.
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        panning = true;
      }
      e.preventDefault();
      el.scrollLeft = startLeft - dx;
    };
    const onTouchEnd = () => {
      if (!moved && !panning) terminalRegistry.get(id)?.focus();
    };
    const onTouchCancel = () => { panning = false; moved = false; };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [narrow, id]);

  const phoneGrid = narrow && phoneBox ? phoneTerminalGrid(phoneBox.width, phoneBox.height) : null;
  const targetCols = phoneGrid?.cols ?? 0;
  const targetRows = phoneGrid?.rows ?? 0;
  useEffect(() => {
    if (!h || !id || !shown || !narrow || !targetCols || !targetRows) return undefined;
    const current = h.geometryOf(id);
    if (current && current.cols === targetCols && current.rows === targetRows) return undefined;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (n: number) => {
      void h.requestGeometry(id, targetCols, targetRows).then((answer) => {
        if (cancelled || answer || n >= 2) return;
        retryTimer = setTimeout(() => attempt(n + 1), 500);
      });
    };
    const settleTimer = setTimeout(() => attempt(0), 350);
    return () => {
      cancelled = true;
      clearTimeout(settleTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [h, id, shown, narrow, targetCols, targetRows]);

  // The resize answer is also the only ownership signal: `409 desk-owns-size`
  // while a visible desk drives the grid, `200` when this viewer's numbers were
  // applied. The viewer parser answers terminal queries (PSReadLine asks for
  // the cursor position before every prompt) only for a pane this page owns, so
  // the signal must stay fresh: the desk can start or stop showing a pane while
  // the page stays open. Asking slowly also brings the phone's readable grid
  // back once the desk lets go, without a reload. A desktop viewer asks for the
  // grid it already has, which changes nothing when the pane is ours.
  useEffect(() => {
    if (!h || !id || !shown) return undefined;
    if (!geomCols || !geomRows) return undefined;
    const usable = narrow && targetCols > 0 && targetRows > 0;
    const cols = usable ? targetCols : geomCols;
    const rows = usable ? targetRows : geomRows;
    // The phone's own resize effect above already asks once when the grid
    // differs; do not race it at the same moment.
    const resizing = usable && (geomCols !== targetCols || geomRows !== targetRows);
    const probe = () => { void h.requestGeometry(id, cols, rows); };
    const first = resizing ? undefined : setTimeout(probe, 350);
    const timer = setInterval(probe, DESK_OWNED_PROBE_MS);
    return () => {
      if (first !== undefined) clearTimeout(first);
      clearInterval(timer);
    };
  }, [h, id, shown, narrow, targetCols, targetRows, geomCols, geomRows]);

  if (!shown || !id || !h) return null;
  const geometry = h.geometryOf(id);
  let content: React.ReactNode;
  if (!h.isLive(id)) {
    content = (
      <Body surfaceId={surfaceId}>
        <span className="truncate max-w-[80%]" style={{ color: 'var(--text-sub)' }}>{title}</span>
        <span className="text-xs">
          {h.isUnavailable(id) ? t('web.streamUnavailable') : t('web.streamWaiting', { count: WEB_LIVE_STREAM_CAP })}
        </span>
        <button
          type="button"
          className={`rounded border px-3 py-1 text-xs ${FOCUS_RING}`}
          style={{ borderColor: 'var(--border)', color: 'var(--text-main)' }}
          onClick={() => h.activate(id)}
          data-web-terminal-activate
        >
          {t('web.streamShow')}
        </button>
      </Body>
    );
  } else if (!geometry) {
    content = (
      <Body surfaceId={surfaceId}>
        <span className="text-xs">{t('web.streamConnecting')}</span>
      </Body>
    );
  } else {
    const halt = h.inputHaltOf(id);
    content = (
      <>
        <TerminalComponent
          ptyId={id}
          cwd={cwd}
          isActive={isActive}
          visible={visible}
          isWorkspaceVisible={isWorkspaceVisible}
          workspaceId={workspaceId}
          surfaceId={surfaceId}
          fixedGeometry={geometry}
        />
        {halt && halt.reason !== 'read-only' && <InputHaltBanner halt={halt} onResume={() => h.resumeInput(id)} />}
      </>
    );
  }
  if (!narrow) return content;
  // A desk-owned pane cannot be re-gridded, and fitting 151 columns into a
  // phone shrinks the font to ~4px. Draw it at the phone's target font instead
  // and let the viewer pan sideways; a grid the phone can fit is left alone.
  const pan = !!geometry && !!phoneBox && needsReadablePan(geometry.cols, phoneBox.width);
  const panWidth = pan && geometry ? readableSurfaceWidth(geometry.cols) : undefined;
  return (
    <div ref={boxRef} className="web-phone-terminal" data-web-phone-terminal>
      <div ref={scrollRef} className="web-phone-terminal-scroll" data-pan={pan ? 'true' : undefined}>
        <div
          className="web-phone-terminal-surface"
          style={panWidth !== undefined ? { width: panWidth } : undefined}
          data-web-phone-surface
        >
          {content}
        </div>
      </div>
      {pan && <div className="web-phone-desk-note" data-web-desk-owns>{t('web.deskOwnsSize')}</div>}
    </div>
  );
}
