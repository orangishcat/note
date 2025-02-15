"use client"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Star, FolderPlus, FileIcon } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import type React from "react"
import { useEffect, useState } from "react"
import { Layout } from "@/components/layout"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UploadDialog } from "@/components/upload-dialog"

interface MusicScore {
  id: string
  title: string
  composer: string
  metadata: string
  starred: boolean
  folder?: string
}

const SCORE_PREFIX = "score:"
const FOLDER_PREFIX = "folder:"

export default function FileManager() {
  const [activeTab, setActiveTab] = useState<"recent" | "starred">("recent")
  const [scores, setScores] = useState<MusicScore[]>([])
  const [folders, setFolders] = useState<Record<string, string[]>>({})
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [folderName, setFolderName] = useState("")

  useEffect(() => {
    loadScoresAndFolders()
  }, [])

  const loadScoresAndFolders = () => {
    const loadedScores: MusicScore[] = []
    const loadedFolders: Record<string, string[]> = {}

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(SCORE_PREFIX)) {
        const score = JSON.parse(localStorage.getItem(key) || "{}")
        loadedScores.push(score)
      } else if (key?.startsWith(FOLDER_PREFIX)) {
        const folderName = key.slice(FOLDER_PREFIX.length)
        loadedFolders[folderName] = JSON.parse(localStorage.getItem(key) || "[]")
      }
    }

    setScores(loadedScores)
    setFolders(loadedFolders)
  }

  const saveScore = (score: MusicScore) => {
    localStorage.setItem(`${SCORE_PREFIX}${score.id}`, JSON.stringify(score))
  }

  const saveFolder = (folderName: string, content: string[]) => {
    localStorage.setItem(`${FOLDER_PREFIX}${folderName}`, JSON.stringify(content))
  }

  const toggleStar = (id: string) => {
    const updatedScores = scores.map((score) => {
      if (score.id === id) {
        const updatedScore = { ...score, starred: !score.starred }
        saveScore(updatedScore)
        return updatedScore
      }
      return score
    })
    setScores(updatedScores)
  }

  const filteredScores = scores.filter((score) => (activeTab === "recent" ? true : score.starred))

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id)
  }

  const handleDrop = (scoreId: string, folderName: string) => {
    const updatedScores = scores.map((s) => {
      if (s.id === scoreId) {
        const updatedScore = { ...s, folder: folderName }
        saveScore(updatedScore)
        return updatedScore
      }
      return s
    })
    setScores(updatedScores)

    const updatedFolders = { ...folders }
    if (!updatedFolders[folderName]) {
      updatedFolders[folderName] = []
    }
    if (!updatedFolders[folderName].includes(scoreId)) {
      updatedFolders[folderName] = [...updatedFolders[folderName], scoreId]
      saveFolder(folderName, updatedFolders[folderName])
    }
    setFolders(updatedFolders)
  }

  const handleCreateFolder = () => {
    if (folderName.trim() === "") return
    const updatedFolders = { ...folders, [folderName]: [] }
    setFolders(updatedFolders)
    saveFolder(folderName, [])
    setFolderName("")
    setIsDialogOpen(false)
  }

  const handleUpload = (file: File, id: string) => {
    const reader = new FileReader()
    reader.onload = () => {
      const newScore: MusicScore = {
        id,
        title: file.name.replace(".mxl", ""),
        composer: "Unknown",
        metadata: `Personal • Uploaded on ${new Date().toLocaleDateString()}`,
        starred: false,
      }
      saveScore(newScore)
      setScores([...scores, newScore])
    }
    reader.readAsDataURL(file)
  }

  const isEmpty = filteredScores.length === 0 && Object.keys(folders).length === 0

  return (
    <Layout folders={folders} onDrop={handleDrop}>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "recent" | "starred")}>
            <TabsList>
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="starred">Starred</TabsTrigger>
              <TabsTrigger value="shared" disabled>
                Shared
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-4">
            <UploadDialog onUpload={handleUpload} />
            <Button variant="outline" className="gap-2" onClick={() => setIsDialogOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              Create folder
            </Button>
          </div>
        </div>

        {isEmpty ? (
          <div className="text-center py-12">
            <p className="text-lg text-gray-500 dark:text-gray-400">It&#39;s empty in here...</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              {activeTab === "starred"
                ? "Starred items show up here!"
                : "Upload some files or create a folder to get started!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredScores.map((score) => (
              <ScoreCard
                key={score.id}
                {...score}
                onStarToggle={() => toggleStar(score.id)}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-gray-50 dark:bg-gray-800">
            <DialogHeader>
              <DialogTitle>Create Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Folder name"
                className="w-full border p-2 rounded"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateFolder}>Create</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  )
}

function ScoreCard({
  id,
  title,
  composer,
  metadata,
  starred,
  onStarToggle,
  onDragStart,
}: MusicScore & {
  onStarToggle: () => void
  onDragStart: (e: React.DragEvent, id: string) => void
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700"
      draggable
      onDragStart={(e) => onDragStart(e, id)}
    >
      <Link href={`/score/${id}`} className="block">
        <div className="aspect-[4/3] overflow-hidden">
          <Image
            src={`/score/${id}/image`}
            alt={`Score preview for ${title}`}
            width={300}
            height={225}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <FileIcon className="h-4 w-4 text-gray-400" />
            <h3 className="font-medium text-gray-900 dark:text-white truncate">{title}</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{composer}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{metadata}</p>
        </div>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-transparent hover:bg-transparent"
        onClick={(e) => {
          e.preventDefault()
          onStarToggle()
        }}
      >
        <Star className={`h-5 w-5 ${starred ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`} />
      </Button>
    </div>
  )
}

