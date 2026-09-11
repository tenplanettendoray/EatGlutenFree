"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string; urgent?: boolean; answerKind?: "reference"; sources?: Array<{ id: string; title: string; url: string }> };
const suggestions = ["What should I ask restaurant staff?", "Can cooking remove allergens?", "Help me understand these search results"];

export function CustomerSupport() {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(""), [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLElement>(null), input = useRef<HTMLTextAreaElement>(null), log = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => { if (open) log.current?.scrollTo({ top: log.current.scrollHeight }); }, [open, messages, busy, error]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const restoreFocus = previous || trigger.current;
    input.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,a[href]');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); restoreFocus?.focus(); };
  }, [open]);

  async function send(text: string) {
    if (busy || !text.trim()) return;
    const next: Message[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next); setDraft(""); setError(""); setBusy(true);
    const controller = new AbortController(); pending.current = controller;
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.slice(-8).map(({ role, content }) => ({ role, content })) }), signal: controller.signal });
      const data = await response.json() as { reply?: string; error?: string; urgent?: boolean; answerKind?: "reference"; sources?: Message["sources"] };
      if (!response.ok || !data.reply) throw new Error(data.error || "The assistant could not reply. Please try again.");
      setMessages([...next, { role: "assistant", content: data.reply, urgent: data.urgent, answerKind: data.answerKind, sources: data.sources }]);
    } catch (reason) {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Could not connect. Please try again."); setDraft(text); setMessages(messages); }
    } finally { setBusy(false); pending.current = null; }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(draft); }

  return <>
    <button ref={trigger} type="button" className="support-launcher" onClick={() => setOpen(true)} aria-label="Open customer support" aria-haspopup="dialog" aria-expanded={open} aria-controls="customer-support-dialog" title="Customer support">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 12H3v6h4v-6H4Zm16 0h1v6h-4v-6h3ZM20 18c0 3-4 3-8 3" /></svg>
      <span>Customer support<small>AI allergy assistant</small></span>
    </button>
    {open && <div className="support-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialog} id="customer-support-dialog" className="support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-title" aria-describedby="support-description" onKeyDown={event => { if (event.key === "Enter") event.stopPropagation(); }}>
        <header><div><span className="support-eyebrow">Safe Serve · AI assistant</span><h2 id="support-title">A little help before <em>your next bite.</em></h2></div><button type="button" className="support-close" onClick={() => setOpen(false)} aria-label="Close customer support">×</button></header>
        <p id="support-description" className="support-description">Ask about food allergies, eating out, or Safe Serve. AI guidance, not a clinician or an emergency service.</p>
        <div ref={log} className="support-conversation" role="log" aria-live="polite" aria-relevant="additions text" aria-busy={busy}>
          {!messages.length && <div className="support-welcome"><p>What can I help you with?</p><div>{suggestions.map(question => <button key={question} type="button" onClick={() => void send(question)}>{question}<span aria-hidden="true">↗</span></button>)}</div></div>}
          {messages.map((message, index) => <article className={`support-message ${message.role}${message.urgent ? " urgent" : ""}`} key={index}>
            <strong>{message.role === "user" ? "You" : message.urgent ? "Get urgent help" : message.answerKind === "reference" ? "Allergy guide · reviewed answer" : "AI assistant"}</strong>
            <p>{message.content}</p>
            {Boolean(message.sources?.length) && <div className="support-sources">{message.sources!.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">[{source.id}] {source.title} ↗</a>)}</div>}
          </article>)}
          {busy && <p className="support-thinking" role="status"><i /><i /><i /><span>Reading your question…</span></p>}
          {error && <p className="support-error" role="alert">{error}</p>}
        </div>
        <form onSubmit={submit} className="support-composer"><label htmlFor="support-question" className="support-input-label">Your question</label><div><textarea ref={input} id="support-question" rows={2} value={draft} onChange={event => setDraft(event.target.value)} maxLength={1800} placeholder="Ask an allergy question…" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }} /><button type="submit" disabled={busy || !draft.trim()} aria-label="Send question"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v15" /></svg></button></div><small>Confirm ingredients and preparation with restaurant staff.</small></form>
      </section>
    </div>}
  </>;
}
