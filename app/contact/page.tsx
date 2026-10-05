import Link from "next/link";
import { ContactForm } from "../contact-form";
export default function ContactPage() {
  return <main className="contact-page"><Link href="/premium">← Back to Premium</Link><h1>How can we help?</h1><p>Send your question to our admin team.</p><ContactForm initiallyOpen /></main>;
}
