"use client";
import { useState } from "react";
export function ContactForm({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="contact-admins">{!initiallyOpen && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Contact us</button>}
    {open && <form onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); setBusy(true); setStatus("");
      try { const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: fields.get("message") }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error); setStatus("Your question was sent to the shared inbox for all admins."); form.reset(); } catch (error) { setStatus(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); }
    }}><label htmlFor="contact-question">Your question</label><textarea id="contact-question" name="message" required minLength={5} maxLength={3000} rows={4} /><p>Sign in to send a question. All admins can read it and contact you at your account email.</p><button disabled={busy}>{busy ? "Sending…" : "Send to admins"}</button></form>}
    {status && <p role="status">{status}</p>}
  </section>;
}
