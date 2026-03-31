"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";

export function AppShell({ children }: { children: ReactNode }) {
  const { token, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!token && pathname !== "/login") {
      router.replace("/login");
    }
  }, [token, ready, pathname, router]);

  if (!ready) return null;

  if (pathname === "/login") return <>{children}</>;

  if (!token) return null;

  return (
    <>
      <Navbar />
      <main className="relative mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {children}
      </main>
    </>
  );
}
