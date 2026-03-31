"use client";

import { AuthProvider } from "@/lib/auth";
import { DownloadProvider } from "@/lib/download-context";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <DownloadProvider>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="bottom-right" />
        </DownloadProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
