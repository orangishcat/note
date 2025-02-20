"use client"

import { ThemeProvider } from "next-themes"
import React, { useEffect, useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Get } from "@/lib/network";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export interface AccountView {
  user_id: string
  username: string;
  email: string;
}

interface AccountContextType {
  account: AccountView | null;
  setAccount: (newValue: AccountView) => void;
}

export const AccountContext = React.createContext<AccountContextType | null>(null)
const cacheTime = 7 * 24 * 60 * 60 * 1000;

export function Providers({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = React.useState<AccountView | null>(null)

  useEffect(() => {
    Get<AccountView>("/api/account/user-data").then(setAccount);
    document.title = "Note"
  }, [])

  // Initialize QueryClient and persist immediately
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: cacheTime,
          gcTime: cacheTime,
          retry: false,
        },
      },
    });

    if (typeof window !== "undefined") {
      const persister = createSyncStoragePersister({ storage: window.localStorage });
      persistQueryClient({
        queryClient: qc,
        persister: persister,
        maxAge: cacheTime,
      });
    }

    return qc;
  });

  return (
    <AccountContext.Provider value={{ account, setAccount }}>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={0}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </AccountContext.Provider>
  )
}
