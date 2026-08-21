import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./revamp.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-canieatit.png`;
  return {
    title: "Safe Serve | CanIEatIt?",
    description: "Discover nearby restaurants and review available dietary details before you dine.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Safe Serve | CanIEatIt?",
      description: "Research nearby restaurants around your food allergies.",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "Safe Serve | CanIEatIt?" }],
    },
    twitter: { card: "summary_large_image", title: "Safe Serve", description: "CanIEatIt? Find a table that fits you.", images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
