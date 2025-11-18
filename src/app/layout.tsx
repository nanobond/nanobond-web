import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/app-shell";
import { HederaWalletProvider } from "@/lib/wallet/HederaWalletContext";
import { UnifiedWalletProvider } from "@/lib/wallet/UnifiedWalletContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nanobond",
  description: "Secure authentication and modern web experience by nanobond",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <HederaWalletProvider>
            <UnifiedWalletProvider>
              <AppShell>{children}</AppShell>
              <Toaster position="top-right" richColors closeButton />
            </UnifiedWalletProvider>
          </HederaWalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
