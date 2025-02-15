"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Bell, ChevronDown, ChevronRight, Folder, Grid, LayoutGrid, Moon, Search, Sun } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useState, useEffect } from "react"
import type React from "react"

interface NavItemProps {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  active?: boolean
}

function NavItem({ href, icon, children, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg",
        active && "bg-gray-100 dark:bg-gray-700",
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  )
}

interface FolderItemProps {
  name: string
  files: string[]
}

function FolderItem({ name, files = [] }: FolderItemProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full text-left"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Folder className="h-4 w-4" />
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

export function Sidebar({ folders = {} }: { folders: Record<string, string[]> }) {
  return (
    <div className="w-64 border-r bg-white dark:bg-gray-800 dark:border-gray-700">
      <div className="p-4">
        <h1 className="text-xl font-bold dark:text-white">Note</h1>
      </div>
      <nav className="space-y-1 px-2">
        <NavItem href="/" icon={<LayoutGrid className="h-4 w-4" />} active>
          All content
        </NavItem>
        <NavItem
          href="#"
          icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M15 3v18M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          }
        >
          Presentations
        </NavItem>
        <NavItem
          href="#"
          icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6m-3 4v6m-3-3h6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
        >
          Analytics
        </NavItem>
        <div className="py-3">
          <div className="px-3 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Collections</div>
          <div className="mt-2">
            {Object.entries(folders).map(([name, files]) => (
              <FolderItem key={name} name={name} files={files || []} />
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}

export function Navbar() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <header className="flex items-center justify-between border-b px-6 py-4 dark:border-gray-700">
      <div className="w-96">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input type="search" placeholder="Search files..." className="pl-9 dark:bg-gray-800 dark:text-white" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          disabled={!mounted}
        >
          {mounted && (resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)}
        </Button>
        <Button variant="ghost" size="icon">
          <Grid className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="h-8 w-8 overflow-hidden rounded-full">
          <Image src="/placeholder.svg" alt="Avatar" width={32} height={32} className="h-full w-full object-cover" />
        </div>
      </div>
    </header>
  )
}

export function Layout({
                           children,
                           folders = {},
                       }: {
    children: React.ReactNode,
    folders: Record<string, string[]>,
    onDrop?: (score: string, folder: string) => void
}) {
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      <Sidebar folders={folders} />
      <div className="flex-1 flex flex-col dark:bg-gray-900 overflow-y-auto">
        <Navbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}

