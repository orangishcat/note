"use client";
import { Navbar } from "@/components/navbar";
import { ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { AuthModalContext } from "@/app/providers";
import { setAuthModalOpener, setNavigateFunction } from "@/lib/network";
import { usePathname, useRouter } from "next/navigation";
import log from "loglevel";
import { cn } from "@/lib/utils";
export interface LayoutProps {
  children: ReactNode;
  navbarContent?: ReactNode;
}
export function Layout({ children, navbarContent }: LayoutProps) {
  const pathname = usePathname();
  const showSidebar = useMemo(() => pathname !== "/", [pathname]);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(showSidebar);
  const authModalContext = useContext(AuthModalContext);
  const router = useRouter();
  useEffect(() => {
    if (authModalContext) {
      setAuthModalOpener(authModalContext.openAuthModal);
    }
  }, [authModalContext]);
  useEffect(() => {
    const navigate = (path: string) => {
      log.debug(`Navigating to ${path}`);
      if (typeof window !== "undefined") {
        window.location.href = path;
      } else {
        router.push(path);
      }
    };
    setNavigateFunction(navigate);
  }, [router]);
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-gray-900 dark:text-white">
      <div
        className={cn(
          showSidebar && isSidebarOpen ? "xl:ml-72" : "",
          "transition-all duration-200",
        )}
      >
        <Navbar onMenuClick={toggleSidebar} showSidebar={showSidebar}>
          {navbarContent}
        </Navbar>
      </div>
      <div className="flex overflow-hidden h-full">
        {showSidebar && (
          <Sidebar
            isOpen={isSidebarOpen}
            onCloseAction={() => setIsSidebarOpen(false)}
          />
        )}
        <main
          className={cn(
            "flex-1 transition-all duration-200",
            showSidebar && isSidebarOpen ? "xl:ml-72" : "",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
