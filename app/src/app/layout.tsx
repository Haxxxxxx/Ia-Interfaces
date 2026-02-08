import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sadary LLM Hub",
  description: "Team LLM interface powered by Kimi K2.5",
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
