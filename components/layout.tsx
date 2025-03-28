import {Navbar} from "@/components/navbar";
import {ReactNode, useState} from "react";
import {Sidebar} from "@/components/sidebar";

export interface LayoutProps {
    children: ReactNode;
}

export function Layout({children}: LayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };
    
    return (
        <div className="flex h-screen w-full flex-col overflow-hidden bg-background dark:text-white">
            <div className="xl:ml-72 transition-all duration-200">
                <Navbar onMenuClick={toggleSidebar} />
            </div>
            <div className="flex overflow-auto">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <main className="flex-1 xl:ml-72 transition-all duration-200">
                    {children}
                </main>
            </div>
        </div>
    );
}

