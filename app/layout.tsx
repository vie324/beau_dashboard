import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dreamland — サロン予約管理",
  description: "Dreamland salon reservation dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-base text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
