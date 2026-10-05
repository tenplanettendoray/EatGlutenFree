"use client";
import { useEffect, useState } from "react";
type Message = { id: string; email: string; message: string; createdAt: string };
async function loadMessages() {
 const response = await fetch("/api/contact", { cache: "no-store" });
 const data = await response.json() as { messages: Message[]; error?: string };
 if (!response.ok) throw new Error(data.error);
 return data.messages;
}
export function SupportInbox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  async function refresh() {
    try { setMessages(await loadMessages()); setError(""); } catch { setError("Could not load support messages."); }
  }
  useEffect(() => { let active = true; loadMessages().then(data => { if (active) setMessages(data); }).catch(() => { if (active) setError("Could not load support messages."); }); return () => { active = false; }; }, []);
  return <section className="admin-user-detail"><h2>Contact inbox · all admins</h2><button onClick={refresh}>Refresh messages</button>{error && <p role="alert">{error}</p>}<p>Latest 200 questions. Reply using the sender’s email.</p>{messages.length ? messages.map(item => <article key={item.id}><a href={`mailto:${item.email}`}>{item.email}</a><small> · {new Date(item.createdAt).toLocaleString()}</small><p style={{ whiteSpace: "pre-wrap" }}>{item.message}</p></article>) : <p>No questions yet.</p>}</section>;
}
