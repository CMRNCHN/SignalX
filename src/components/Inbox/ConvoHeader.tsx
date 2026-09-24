import type { AiStatus, IvrSettings, ThreadAutoReplyStatus, ThreadIvrStatus } from "../../api";
import { formatPhone, isGroupThread } from "../../format";
import { IconBolt, IconExport, IconMenuList, IconReply, IconSparkle } from "../../navIcons";

type Props = {
  threadId: string;
  title: string;
  threadAuto: ThreadAutoReplyStatus | null;
  threadIvr: ThreadIvrStatus | null;
  ivrSettings: IvrSettings | null;
  ivrHint: string | null;
  ai: AiStatus | null;
  aiBusy: boolean;
  onToggleIvr: (next: boolean) => void;
  onResumeIvr: () => void;
  onToggleAuto: (next: boolean) => void;
  onSummarize: () => void;
  onDraft: () => void;
  onExport: () => void;
};

const AI_OFF_HINT = "AI not configured — enable Ollama in Settings.";

/** Conversation title, automation badges, and per-thread actions. */
export function ConvoHeader({
  threadId,
  title,
  threadAuto,
  threadIvr,
  ivrSettings,
  ivrHint,
  ai,
  aiBusy,
  onToggleIvr,
  onResumeIvr,
  onToggleAuto,
  onSummarize,
  onDraft,
  onExport,
}: Props) {
  const isGroup = isGroupThread(threadId);
  return (
    <header className="convo-head">
      <div className="convo-head-id">
        <h2>{title}</h2>
        <div className="convo-sub">{isGroup ? "Group" : formatPhone(threadId)}</div>
      </div>
      <div className="convo-actions">
        {threadAuto?.effective && <span className="auto-thread-badge">Auto-reply ON</span>}
        {threadIvr?.effective && <span className="auto-thread-badge">Buyer menu ON</span>}
        {threadIvr?.handed_off && <span className="auto-thread-badge warn">Waiting on you</span>}
        {ivrHint && (
          <span className="auto-thread-badge warn" title={ivrHint}>
            {ivrHint}
          </span>
        )}
        <button
          type="button"
          className={threadIvr?.enabled ? "act-btn active" : "act-btn"}
          aria-pressed={!!threadIvr?.enabled}
          disabled={isGroup}
          title="Buyer menu"
          onClick={() => onToggleIvr(!threadIvr?.enabled)}
        >
          <IconMenuList />
          <span>Buyer menu</span>
        </button>
        {threadIvr?.handed_off && (
          <button type="button" className="ghost-btn" onClick={onResumeIvr}>
            Resume menu
          </button>
        )}
        {!threadIvr?.enabled && ivrSettings?.enabled && !isGroup && (
          <span className="convo-sub inline-hint">Turn on to let this chat use the menu</span>
        )}
        <button
          type="button"
          className={threadAuto?.opted_in ? "act-btn active" : "act-btn"}
          aria-pressed={!!threadAuto?.opted_in}
          title="Opt this chat in to auto-reply"
          onClick={() => onToggleAuto(!threadAuto?.opted_in)}
        >
          <IconBolt />
          <span>Auto-reply</span>
        </button>
        <span className="act-sep" aria-hidden />
        <details className="act-more">
          <summary className="act-btn">More</summary>
          <div className="act-more-pop">
            <button
              type="button"
              className="act-btn"
              disabled={aiBusy || !ai?.configured}
              title={ai?.configured ? "Summarize this conversation" : AI_OFF_HINT}
              onClick={onSummarize}
            >
              <IconSparkle />
              <span>Summarize</span>
            </button>
            <button
              type="button"
              className="act-btn"
              disabled={aiBusy || !ai?.configured}
              title={ai?.configured ? "Draft a reply" : AI_OFF_HINT}
              onClick={onDraft}
            >
              <IconReply />
              <span>Draft</span>
            </button>
            <button type="button" className="act-btn" title="Export this thread" onClick={onExport}>
              <IconExport />
              <span>Export</span>
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
