import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rodeo",
  description: "Self-hosted AI coding assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-terminal-bg text-terminal-text min-h-screen">
        {children}
      </body>
    </html>
  );
}
