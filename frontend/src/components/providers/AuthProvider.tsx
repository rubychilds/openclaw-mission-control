"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { useEffect, useState, type ReactNode } from "react";

import { isLikelyValidClerkPublishableKey } from "@/auth/clerkKey";
import {
  clearLocalAuthToken,
  getLocalAuthToken,
  isLocalAuthMode,
} from "@/auth/localAuth";
import { LocalAuthLogin } from "@/components/organisms/LocalAuthLogin";

export function AuthProvider({ children }: { children: ReactNode }) {
  const localMode = isLocalAuthMode();

  useEffect(() => {
    if (!localMode) {
      clearLocalAuthToken();
    }
  }, [localMode]);

  if (localMode) {
    return <LocalAuthGate>{children}</LocalAuthGate>;
  }

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const afterSignOutUrl =
    process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL ?? "/";

  if (!isLikelyValidClerkPublishableKey(publishableKey)) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl={afterSignOutUrl}
    >
      {children}
    </ClerkProvider>
  );
}

/**
 * Client-only gate for local auth mode.
 * Defers the sessionStorage check to avoid SSR/client hydration mismatch.
 */
function LocalAuthGate({ children }: { children: ReactNode }) {
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    setHasToken(Boolean(getLocalAuthToken()));
  }, []);

  // Still determining auth state — render nothing to avoid hydration mismatch.
  if (hasToken === null) return null;

  if (!hasToken) {
    return <LocalAuthLogin onAuthenticated={() => setHasToken(true)} />;
  }

  return <>{children}</>;
}
