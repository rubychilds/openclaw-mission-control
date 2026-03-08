"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isLocalAuthMode } from "@/auth/localAuth";
import { useAuth } from "@/auth/clerk";

const PUBLIC_PATHS = ["/sign-in", "/invite"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  // In local auth mode, AuthProvider already gates on the token —
  // no additional guard needed (and Clerk hooks aren't available).
  if (isLocalAuthMode()) {
    return <>{children}</>;
  }

  return <ClerkAuthGuard>{children}</ClerkAuthGuard>;
}

function ClerkAuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) return;
    if (isPublicPath(pathname)) return;
    router.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname)}`);
  }, [isLoaded, isSignedIn, pathname, router]);

  if (!isLoaded) return null;
  if (!isSignedIn && !isPublicPath(pathname)) return null;

  return <>{children}</>;
}
