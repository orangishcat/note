"use client";
import { ThemeProvider } from "next-themes";
import React, { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ToastProvider } from "@/components/ui/toast";
import {
  AccountContextType,
  AccountView,
  AuthModalContextType,
  ZoomContextType,
} from "@/types/provider-types";
export const AccountContext = React.createContext<AccountContextType | null>(
  null,
);
export const ZoomContext = React.createContext<ZoomContextType | null>(null);
export const AuthModalContext =
  React.createContext<AuthModalContextType | null>(null);
const cacheTime = 7 * 24 * 60 * 60 * 1000;
export function Providers({ children }: { children: React.ReactNode }) {
  const [accountView, setAccount] = React.useState<AccountView | null>(null);
  const [justLogin, setJustLogin] = useState(false);
  const [zoomLevels, setZoomLevels] = useState<Record<string, number>>({});
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalType, setAuthModalType] = useState<"login" | "signup">(
    "login",
  );
  const openAuthModal = (type: "login" | "signup") => {
    setAuthModalType(type);
    setIsAuthModalOpen(true);
  };
  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };
  const setZoomLevel = (scoreId: string, scale: number) => {
    setZoomLevels((prev) => {
      if (prev[scoreId] === scale) {
        return prev;
      }
      return {
        ...prev,
        [scoreId]: scale,
      };
    });
  };
  const getZoomLevel = (scoreId: string) => {
    return zoomLevels[scoreId] || 1;
  };
  useEffect(() => {
    document.title = "Note";
  }, []);
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
      const persister = createSyncStoragePersister({
        storage: window.localStorage,
      });
      persistQueryClient({
        queryClient: qc as any,
        persister: persister,
        maxAge: cacheTime,
      });
    }
    return qc;
  });
  return (
    <AccountContext.Provider
      value={{ accountView, setAccount, justLogin, setJustLogin }}
    >
      <ZoomContext.Provider value={{ zoomLevels, setZoomLevel, getZoomLevel }}>
        <AuthModalContext.Provider
          value={{
            isOpen: isAuthModalOpen,
            openAuthModal,
            closeAuthModal,
            authType: authModalType,
          }}
        >
          <QueryClientProvider client={client}>
            <TooltipProvider delayDuration={500}>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
              >
                <ToastProvider>{children}</ToastProvider>
              </ThemeProvider>
            </TooltipProvider>
          </QueryClientProvider>
        </AuthModalContext.Provider>
      </ZoomContext.Provider>
    </AccountContext.Provider>
  );
}
