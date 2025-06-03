import React, {useState} from "react";
import {ChevronDown, ChevronRight, Folder as FolderIcon} from "lucide-react";

export interface Folder {
  $id: string
  name: string
  files: string[]
  file_ids: string[]
  user_id: string
}

interface FolderItemProps {
  name: string
  files: string[]
  file_ids: string[]
  id?: string
}

export function FolderDisplay({name, files = []}: FolderItemProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full text-left"
      >
        {isOpen ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
        <FolderIcon className="h-4 w-4"/>
        <span>{name}</span>
      </button>
      {isOpen && files && files.length > 0 && (
        <div className="ml-6">
          {files.map((file) => (
            <div key={file} className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
              {file}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}