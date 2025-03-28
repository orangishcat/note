import React, {useState} from "react"
import {Navbar} from "@/components/navbar";
import {Sidebar} from "@/components/sidebar";

interface LayoutProps {
  children: React.ReactNode;
  navbarProps?: {
    leftSection?: React.ReactNode;
    rightSection?: React.ReactNode;
  };
}

export function Layout({ children, navbarProps }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen)

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}/>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar 
          onMenuClick={toggleSidebar}
          leftSection={navbarProps?.leftSection}
          rightSection={navbarProps?.rightSection}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 xl:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}
    </div>
  )
}

