import { Providers } from "./providers";
import React from "react";
import "./globals.css";
import "webrtc-adapter";

// Force dynamic rendering so SSR adapters (e.g., Appwrite Sites SSR)
// correctly detect this app as server-rendered rather than fully static.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
