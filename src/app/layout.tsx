import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "X Growth Autopilot",
  description: "Automated X discovery, engagement, and posting with hard safety caps."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
