"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useTranscriptStore } from "@/store/transcriptStore";

function AccountWorkspace({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const accountId = session?.user?.id ?? null;
  const previousAccount = useRef(accountId);
  useLayoutEffect(() => {
    const store = useTranscriptStore.getState();
    if (previousAccount.current && previousAccount.current !== accountId) {
      store.resetAll();
    }
    store.setAccountId(accountId);
    previousAccount.current = accountId;
  }, [accountId]);

  return <Fragment key={accountId ?? "guest"}>{children}</Fragment>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AccountWorkspace>{children}</AccountWorkspace>
      </ThemeProvider>
    </SessionProvider>
  );
}
