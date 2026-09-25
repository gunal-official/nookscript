import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

// Both faces are self-hosted via @fontsource (the same Google fonts, without a
// build-time network dependency on fonts.googleapis.com). Inter is the body
// face; Plus Jakarta Sans is the display face (ui.webp language: headings,
// numbers, brand). To use next/font/google instead, swap for e.g.
// `const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })`.
const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const jakarta = localFont({
  src: "../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  variable: "--font-display",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "nookscript",
  description: "nookscript — intake, briefs, proposals, and plans for client work.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          inter.variable,
          jakarta.variable,
          "min-h-screen bg-background font-sans text-foreground antialiased"
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
