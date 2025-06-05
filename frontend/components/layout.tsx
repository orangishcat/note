import { Navbar } from "@/components/navbar";
import { ReactNode, useContext, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { AuthModalContext } from "@/app/providers";
import { setAuthModalOpener, setNavigateFunction } from "@/lib/network";
import { useRouter } from "next/navigation";
import log from "loglevel";

export interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background dark:text-white">
      <div className="xl:ml-72 transition-all duration-200">
        <Navbar onMenuClick={toggleSidebar} />
      </div>
      <div className="flex overflow-auto">
        <Sidebar
          isOpen={isSidebarOpen}
          onCloseAction={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 xl:ml-72 transition-all duration-200">
          {children}
        </main>
      </div>
    </div>
  );
}
