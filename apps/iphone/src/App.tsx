import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDraft,
  enqueue,
  freshDraft,
  loadDraft,
  loadOutbox,
  storeDraft,
  type CaptureDraft,
} from "./draft.js";
import { buildOutboxItem } from "./capture.js";
import { MobileEditor, type MobileEditorHandle } from "./MobileEditor.js";

type SaveState = "idle" | "saved" | "error";

function itemId(): string {
  return globalThis.crypto.randomUUID();
}

export function App() {
  const [draft, setDraft] = useState<CaptureDraft>(() => loadDraft(localStorage) ?? freshDraft());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(() => loadOutbox(localStorage).length);
  const title = useRef<HTMLInputElement>(null);
  const editor = useRef<MobileEditorHandle>(null);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  useEffect(() => {
    title.current?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        storeDraft(localStorage, draft);
      } catch {
        setSaveState("error");
        setMessage("This draft could not be saved on this iPhone.");
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const persistNow = (): void => {
      try {
        storeDraft(localStorage, latestDraft.current);
      } catch {
        setSaveState("error");
        setMessage("This draft could not be saved on this iPhone.");
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const update = <K extends keyof CaptureDraft>(field: K, value: CaptureDraft[K]): void => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (saveState !== "idle") setSaveState("idle");
  };

  const save = useCallback((): void => {
    const currentEditor = editor.current;
    if (currentEditor === null) return;
    const doc = currentEditor.getDoc();
    const current = latestDraft.current;
    const item = buildOutboxItem(current, doc, itemId());
    if (item === null) {
      setSaveState("error");
      setMessage("Add a title or write something before saving.");
      return;
    }

    try {
      enqueue(localStorage, item);
      clearDraft(localStorage);
    } catch {
      setSaveState("error");
      setMessage("This note could not be saved on this iPhone.");
      return;
    }

    const next = freshDraft();
    latestDraft.current = next;
    setDraft(next);
    currentEditor.reset();
    setPending(loadOutbox(localStorage).length);
    setSaveState("saved");
    setMessage("Saved on this iPhone");
    window.requestAnimationFrame(() => title.current?.focus());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  return (
    <main className="capture-shell">
      <header className="capture-header">
        <div>
          <p className="eyebrow">emqnote</p>
          <h1>Quick capture</h1>
        </div>
        <button className="save-button" type="button" onClick={save}>
          Save
        </button>
      </header>

      <section className="capture-fields" aria-label="Note details">
        <label className="title-field">
          <span>Title</span>
          <input
            ref={title}
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                editor.current?.focus();
              }
            }}
            placeholder="Optional"
          />
        </label>
        <div className="metadata-grid">
          <label>
            <span>When</span>
            <input
              type="datetime-local"
              step="1"
              value={draft.when}
              onChange={(event) => update("when", event.target.value)}
            />
          </label>
          <label>
            <span>Where</span>
            <input
              value={draft.where}
              onChange={(event) => update("where", event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="who-field">
            <span>Who</span>
            <input
              value={draft.who}
              onChange={(event) => update("who", event.target.value)}
              placeholder="Names separated by commas"
            />
          </label>
        </div>
      </section>

      <section className="body-panel" aria-label="Note body">
        <MobileEditor
          ref={editor}
          initialBody={draft.body}
          onChange={(body) => update("body", body)}
          onSave={save}
        />
      </section>

      <div className="save-status" role="status" aria-live="polite">
        {message !== "" && (
          <span className={saveState === "error" ? "status-error" : ""}>{message}</span>
        )}
        {pending > 0 && <span>{pending} waiting for OneDrive</span>}
      </div>

      <nav className="quick-bar" aria-label="Editor actions">
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => editor.current?.task()}
        >
          <span aria-hidden="true">☐</span> Task
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => editor.current?.tag()}
        >
          <span aria-hidden="true">#</span> Tag
        </button>
      </nav>
    </main>
  );
}
