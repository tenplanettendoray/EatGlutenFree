import { TrialReminder } from "./trial-reminder";
import { InteractionEffects } from "./interaction-effects";
import { CustomConfetti } from "./custom-confetti";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./experience.css";
import "./mobile.css";
import "./typography.css";
import "./refinements.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-canieatit.png`;
  return {
    title: "Gluten FreEat — Can I Eat It?",
    description: "Discover nearby restaurants and review available dietary details before you dine.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Gluten FreEat — Can I Eat It?",
      description: "Research nearby restaurants around your food allergies.",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "Gluten FreEat — Can I Eat It?" }],
    },
    twitter: { card: "summary_large_image", title: "Gluten FreEat", description: "Can I Eat It? Find a table that fits you.", images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <InteractionEffects />
        <CustomConfetti />
        <TrialReminder />
        {children}
      </body>
    </html>
  );
}
