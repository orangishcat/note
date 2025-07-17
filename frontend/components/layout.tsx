"use client";
import { Navbar } from "@/components/navbar";
import { ReactNode, useContext, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { AuthModalContext } from "@/app/providers";
import { setAuthModalOpener, setNavigateFunction } from "@/lib/network";
import { usePathname, useRouter } from "next/navigation";
import log from "loglevel";
import { cn } from "@/lib/utils";

export interface LayoutProps {
  children: ReactNode;
  navbarContent?: ReactNode;
  showSidebar?: boolean;
}

export function Layout({ children, navbarContent, showSidebar }: LayoutProps) {
  const pathname = usePathname();
  showSidebar =
    showSidebar === undefined ? pathname.startsWith("/app") : showSidebar;

  const [isSidebarOpen, setIsSidebarOpen] = useState(showSidebar);
  const authModalContext = useContext(AuthModalContext);
  const router = useRouter();

  // Set the openAuthModal function for the API interceptor
  useEffect(() => {
    if (authModalContext) {
      setAuthModalOpener(authModalContext.openAuthModal);
    }
  }, [authModalContext]);

  // Set the navigation function for the API interceptor
  useEffect(() => {
    const navigate = (path: string) => {
      log.debug(`Navigating to ${path}`);
      // Use window.location.href for more reliable navigation after 401 errors
      if (typeof window !== "undefined") {
        window.location.href = path;
      } else {
        // Fallback to router.push if window is not available (SSR)
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
      <div className="flex overflow-auto h-full">
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
