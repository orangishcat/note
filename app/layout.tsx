import {Providers} from "./providers"
import React from "react"
import './globals.css'

export default function RootLayout({children}: { children: React.ReactNode }) {
    return (
      <html lang="en" suppressHydrationWarning>
      <body>
      <Providers>{children}</Providers>
      </body>
      </html>
    )
}

export const metadata = {
    generator: 'v0.dev'
};
