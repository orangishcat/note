import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {LayoutGrid, X} from "lucide-react";
import React from "react";
import {NavItem} from "@/components/navbar";
import {Folder, FolderItem} from "@/components/folder";

export function Sidebar({
                          isOpen,
                          onClose,
                        }: { isOpen: boolean; onClose: () => void }) {
  const folders: Folder[] = []
  return (
    <div
      className={cn(
        "inset-y-0 w-72 mr-4 fixed xl:relative left-0 z-50 bg-gray-100 dark:bg-gray-800/50 border-r dark:border-gray-700 " +
        "transform transition-transform duration-200 ease-in-out xl:translate-x-0",
        isOpen ? "" : "-translate-x-full"
      )}
    >
      <div className="flex items-center justify-between p-4">
        <h1 className="text-xl font-bold dark:text-white">Note</h1>
        <Button variant="ghost" size="icon" onClick={onClose} className="xl:hidden">
          <X className="h-4 w-4"/>
        </Button>
      </div>
      <nav className="space-y-1 px-2">
        <NavItem href="/" icon={<LayoutGrid className="h-4 w-4"/>} active>
          All content
        </NavItem>
        <div className="py-3">
          <div className="px-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Collections</div>
          <div className="mt-2">
            {folders.map(folder => (
              <FolderItem key={folder.name} name={folder.name} files={folder.files || []}/>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
