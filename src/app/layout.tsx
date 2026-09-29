import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { publicEnv } from "@/lib/env";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: "Escuela Visible",
    template: "%s · Escuela Visible",
  },
  description:
    "Las necesidades de nuestras escuelas rurales no deberían ser invisibles. Necesidades, compromisos de ayuda y confirmaciones de las escuelas rurales de Santander, con historial verificable.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CO"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
