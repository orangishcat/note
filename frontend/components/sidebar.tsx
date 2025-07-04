"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LayoutGrid, X } from "lucide-react";
import React from "react";
import { NavItem } from "@/components/navbar";
import { Folder, FolderDisplay } from "@/components/folder";
import { useQuery } from "@tanstack/react-query";
import { databases } from "@/lib/appwrite";

export function Sidebar({
  isOpen,
  onCloseAction,
}: {
  isOpen: boolean;
  onCloseAction: () => void;
}) {
  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: async () => {
      const res = await databases.listDocuments(
        process.env.NEXT_PUBLIC_DATABASE!,
        process.env.NEXT_PUBLIC_FOLDERS_COLLECTION!,
      );
      return res.documents as unknown[] as Folder[];
    },
  });

  return (
    <div
      className={cn(
        "fixed top-0 left-0 h-full w-72 z-40 bg-gray-100 dark:bg-gray-850 backdrop-blur border-r dark:border-gray-700 " +
          "transform transition-transform duration-200 ease-in-out xl:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex items-center justify-between p-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Note</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCloseAction}
          className="xl:hidden"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <nav className="space-y-1 px-2">
        <NavItem href="/" icon={<LayoutGrid className="h-4 w-4" />} active>
          All content
        </NavItem>
        <div className="py-3">
          <div className="px-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            Collections
          </div>
          <div className="mt-2">
            {folders.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">
                No folders yet
              </div>
            ) : (
              folders.map((folder: Folder) => (
                <FolderDisplay
                  key={folder.$id}
                  name={folder.name}
                  files={folder.files || []}
                />
              ))
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
