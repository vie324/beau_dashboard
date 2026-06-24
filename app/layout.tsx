import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dreamland — サロン予約管理",
  description: "Dreamland salon reservation dashboard",
};

// viewport-fit=cover でノッチ/ホームバー領域の env(safe-area-inset-*) が有効になる
// （FAB の下マージン等が実際に効くようになる）。themeColor はブラウザUIの色。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4efe6",
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
