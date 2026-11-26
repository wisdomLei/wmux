/**
 * Approvals on the browser client.
 *
 * A phone cannot answer the agent's own permission dialog by typing: while an
 * answerable `terminal_prompt` is up, `/api/input` refuses every key except a
 * lone Esc or Ctrl-C. This panel reads `/api/approvals` with the answer
 * capability, shows the question and the daemon's structured choices, and
 * posts the decision. It polls rather than using `/api/events` because
 * EventSource cannot send `X-Wmux-Client-Caps`, and without that header the
 * daemon only offers the informational card.
 *
 * Every rule the daemon enforces stays its own: a stale dialog answers
 * `prompt-changed`, a pressed one `already-answered`, an unsupported shape
 * `answer-in-terminal`. The panel says what happened and re-reads the list
 * instead of guessing.
 */
import { useCallback, useEffect, useState } from 'react';
import Dialog, { DialogBody, DialogHeader } from '../components/ui/Dialog';
import Button from '../components/ui/Button';
import { FOCUS_RING } from '../components/focusRing';
import { IconWarning } from '../components/icons';
import { useT } from '../hooks/useT';
import { useNarrow } from './responsive';
import { useWebInputState, webPtyHub } from './WebTerminal';
import type { ApprovalDecision, ApprovalDetail, ApprovalOutcome, ApprovalRequest } from './webPty';

/** Fast enough for a permission dialog, cheap enough for a phone on a tailnet. */
const POLL_MS = 3000;
/** The daemon refuses answers within 1.5s of the record appearing; one retry covers it. */
const TOO_SOON_RETRY_MS = 1700;

function isNoLabel(label: string): boolean {
  return /^\s*(?:\d+\s*[.)]\s*)?no\b/i.test(label);
}

function isAnswerableKind(kind: string | undefined): boolean {
  return kind === 'awaiting_input' || kind === 'awaiting_permission';
}

function kindLabel(t: ReturnType<typeof useT>, kind: string | undefined): string {
  if (kind === 'awaiting_input') return t('web.approvalsKindInput');
  if (kind === 'awaiting_permission' || kind === 'terminal_prompt') return t('web.approvalsKindPermission');
  return kind || t('web.approvalsKindOther');
}

function errorText(t: ReturnType<typeof useT>, out: ApprovalOutcome): string {
  if (out.ok) return '';
  switch (out.code) {
    case 'too-soon': return t('web.approvalsTooSoon');
    case 'changed': return t('web.approvalsChanged');
    case 'expired': return t('web.approvalsExpired');
    case 'already': return t('web.approvalsAlready');
    case 'unsupported': return t('web.approvalsUnsupported');
    case 'offline': return t('web.approvalsOffline');
    default: return t('web.approvalsFailed', { code: out.detail ?? 'error' });
  }
}

export default function ApprovalCenter() {
  const t = useT();
  const narrow = useNarrow();
  const inputState = useWebInputState();
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState('');
  const [sent, setSent] = useState<Record<string, true>>({});
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);
  const [details, setDetails] = useState<Record<string, ApprovalDetail>>({});
  const [detailBusy, setDetailBusy] = useState('');

  const refresh = useCallback(async () => {
    const list = await webPtyHub()?.listApprovals();
    if (list) setPending(list.pending);
  }, []);

  // Nothing left: do not spring the sheet open again when the next prompt
  // arrives — that one gets its own banner first.
  useEffect(() => {
    if (pending.length === 0) setOpen(false);
  }, [pending.length]);

  // Poll only while the page is visible; coming back to the tab reads at once
  // rather than waiting out the rest of the interval.
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const load = async () => {
      if (stopped || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      const list = await webPtyHub()?.listApprovals();
      inFlight = false;
      if (!stopped && list) setPending(list.pending);
    };
    void load();
    const timer = setInterval(() => { void load(); }, POLL_MS);
    const onVisible = () => { void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const answer = async (req: ApprovalRequest, decision: ApprovalDecision) => {
    const hub = webPtyHub();
    if (!hub || acting) return;
    setActing(req.id);
    setNotice(null);
    let out = await hub.decideApproval(req.id, decision);
    if (!out.ok && out.code === 'too-soon') {
      await new Promise((resolve) => setTimeout(resolve, TOO_SOON_RETRY_MS));
      out = await hub.decideApproval(req.id, decision);
    }
    if (out.ok) {
      setSent((prev) => ({ ...prev, [req.id]: true }));
    } else {
      setNotice({ id: req.id, text: errorText(t, out) });
      if (out.code === 'changed' || out.code === 'expired' || out.code === 'already') {
        setDetails((prev) => {
          const next = { ...prev };
          delete next[req.id];
          return next;
        });
      }
    }
    await refresh();
    setActing('');
  };

  const decline = async (req: ApprovalRequest) => {
    const hub = webPtyHub();
    if (!hub || acting) return;
    setActing(req.id);
    setNotice(null);
    let out = await hub.declineApproval(req.id, req.promptFingerprint);
    if (!out.ok && out.code === 'too-soon') {
      await new Promise((resolve) => setTimeout(resolve, TOO_SOON_RETRY_MS));
      out = await hub.declineApproval(req.id, req.promptFingerprint);
    }
    if (out.ok) setSent((prev) => ({ ...prev, [req.id]: true }));
    else setNotice({ id: req.id, text: errorText(t, out) });
    await refresh();
    setActing('');
  };

  const showDetail = async (req: ApprovalRequest) => {
    const hub = webPtyHub();
    if (!hub || detailBusy) return;
    setDetailBusy(req.id);
    setNotice(null);
    const detail = await hub.approvalDetail(req.id);
    if (detail) setDetails((prev) => ({ ...prev, [req.id]: detail }));
    else setNotice({ id: req.id, text: t('web.approvalsDetailFailed') });
    setDetailBusy('');
  };

  if (pending.length === 0) return null;
  const canAnswer = inputState === 'allowed';
  const critical = pending.some((req) => req.risk === 'critical');

  return (
    <>
      {!open && (
        <div
          className="web-approval-banner"
          data-inline={narrow ? 'true' : undefined}
          style={{ color: critical ? 'var(--accent-red)' : 'var(--accent-yellow)' }}
          data-web-approvals
        >
          <IconWarning size={14} />
          <span className="web-approval-banner-text">
            {t('web.approvalsWaiting', { count: pending.length })}
          </span>
          <button
            type="button"
            className={`ui-btn ui-btn-secondary ui-btn-sm ${FOCUS_RING}`}
            onClick={() => setOpen(true)}
            data-web-approvals-review
          >
            {t('web.approvalsReview')}
          </button>
        </div>
      )}
      {open && (
        <Dialog
          onClose={() => setOpen(false)}
          width={560}
          role="alertdialog"
          ariaLabel={t('web.approvalsTitle')}
          data-testid="web-approvals"
        >
          <DialogHeader
            title={t('web.approvalsTitle')}
            description={t('web.approvalsCount', { count: pending.length })}
            closeLabel={t('web.approvalsClose')}
          />
          <DialogBody>
            {pending.map((req) => {
              const terminal = req.kind === 'terminal_prompt';
              const choices = req.choices ?? [];
              const terminalAnswerable = terminal && !!req.promptFingerprint && choices.length > 0;
              const genericAnswerable = !terminal && isAnswerableKind(req.kind);
              const sentAlready = req.pressedAt !== undefined || sent[req.id] === true;
              const detail = details[req.id];
              const busy = acting === req.id;
              const autoDeny = req.autoDenyAt ? new Date(req.autoDenyAt) : null;
              const autoDenyTime = autoDeny && !Number.isNaN(autoDeny.getTime()) ? autoDeny.toLocaleTimeString() : '';
              return (
                <article
                  key={req.id}
                  className="flex flex-col gap-2 rounded-lg border p-3"
                  style={{ borderColor: 'var(--border)' }}
                  data-web-approval={req.id}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: 'var(--text-sub2)' }}>
                    <span>{kindLabel(t, req.kind)}</span>
                    {req.agent && <span>· {req.agent}</span>}
                    {req.toolName && <span>· {req.toolName}</span>}
                    {req.risk && (
                      <span style={{ color: req.risk === 'critical' ? 'var(--accent-red)' : 'var(--accent-yellow)' }}>
                        · {req.risk}
                      </span>
                    )}
                  </div>
                  {req.question && <p className="break-words text-[13px]" style={{ color: 'var(--text-main)' }}>{req.question}</p>}
                  {req.reason && <p className="break-words text-xs" style={{ color: 'var(--text-sub)' }}>{req.reason}</p>}
                  {!req.choices && req.options && req.options.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs" style={{ color: 'var(--text-sub)' }}>
                      {req.options.map((option, i) => <li key={`${i}-${option}`}>{`${i + 1}. ${option}`}</li>)}
                    </ul>
                  )}
                  {req.summary && (
                    <pre
                      className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border p-2 font-mono text-xs"
                      style={{ borderColor: 'var(--border-soft)', color: 'var(--text-main)', background: 'var(--bg-mantle)' }}
                    >
                      {req.summary}
                    </pre>
                  )}
                  {detail && (
                    <pre
                      className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border p-2 font-mono text-xs"
                      style={{ borderColor: 'var(--border-soft)', color: 'var(--text-main)', background: 'var(--bg-mantle)' }}
                      data-web-approval-detail
                    >
                      {detail.command}
                    </pre>
                  )}
                  {req.hasDetail && !detail && (
                    <button
                      type="button"
                      className={`self-start rounded border px-2 py-1 text-xs ${FOCUS_RING}`}
                      style={{ borderColor: 'var(--border)', color: 'var(--text-sub)' }}
                      disabled={detailBusy === req.id}
                      onClick={() => { void showDetail(req); }}
                      data-web-approval-detail-toggle
                    >
                      {detailBusy === req.id ? t('web.approvalsLoading') : t('web.approvalsFullCommand')}
                    </button>
                  )}
                  {autoDenyTime && (
                    <p className="text-[11px]" style={{ color: 'var(--text-sub2)' }}>
                      {t('web.approvalsAutoDeny', { time: autoDenyTime })}
                    </p>
                  )}
                  {sentAlready ? (
                    <p className="text-xs" style={{ color: 'var(--text-sub)' }} data-web-approval-pressed>
                      {t('web.approvalsPressed')}
                    </p>
                  ) : terminalAnswerable ? (
                    <div className="flex flex-wrap gap-2">
                      {choices.map((choice) => (
                        <Button
                          key={choice.key}
                          size="sm"
                          variant="secondary"
                          disabled={!canAnswer || busy}
                          onClick={() => {
                            void answer(req, {
                              decision: isNoLabel(choice.label) ? 'deny' : 'approve',
                              choiceKey: choice.key,
                              promptFingerprint: req.promptFingerprint,
                            });
                          }}
                          data-web-approval-choice={choice.key}
                        >
                          {choice.label}
                        </Button>
                      ))}
                      {!choices.some((choice) => isNoLabel(choice.label)) && webPtyHub()?.terminalPromptDecline() && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!canAnswer || busy}
                          onClick={() => { void decline(req); }}
                          data-web-approval-decline
                        >
                          {t('web.approvalsDenyEsc')}
                        </Button>
                      )}
                    </div>
                  ) : genericAnswerable ? (
                    <div className="flex flex-wrap gap-2">
                      {req.choices?.map((choice) => (
                        <Button
                          key={choice.key}
                          size="sm"
                          variant="secondary"
                          disabled={!canAnswer || busy}
                          onClick={() => { void answer(req, { decision: 'approve', choiceKey: choice.key }); }}
                          data-web-approval-choice={choice.key}
                        >
                          {choice.label}
                        </Button>
                      ))}
                      {/* A permission gate carries no choices — approving it is
                          the whole answer. Without this button the card offered
                          only Deny and the tool could never be let through. */}
                      {req.kind === 'awaiting_permission' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!canAnswer || busy}
                          onClick={() => { void answer(req, { decision: 'approve' }); }}
                          data-web-approval-approve
                        >
                          {t('web.approvalsApprove')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!canAnswer || busy}
                        onClick={() => { void answer(req, { decision: 'deny' }); }}
                        data-web-approval-deny
                      >
                        {t('web.approvalsDeny')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-sub)' }} data-web-approval-on-desk>
                      {t('web.approvalsAnswerOnDesk')}
                    </p>
                  )}
                  {notice?.id === req.id && (
                    <p className="text-xs" role="alert" style={{ color: 'var(--accent-red)' }} data-web-approval-notice>
                      {notice.text}
                    </p>
                  )}
                  {!canAnswer && (
                    <p className="text-[11px]" style={{ color: 'var(--text-sub2)' }}>{t('web.approvalsReadOnly')}</p>
                  )}
                </article>
              );
            })}
          </DialogBody>
        </Dialog>
      )}
    </>
  );
}
