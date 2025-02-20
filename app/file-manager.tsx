"use client"

import {Button} from "@/components/ui/button"
import {Tabs, TabsList, TabsTrigger} from "@/components/ui/tabs"
import {FileIcon, FolderPlus, Star} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import React, {useEffect, useState} from "react"
import {Layout} from "@/components/layout"
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {UploadDialog} from "@/components/upload-dialog"
import {Get, Post} from "@/lib/network";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {AccountContext} from "@/app/providers";
import {TooltipArrow} from "@radix-ui/react-tooltip";
import {useQuery} from "@tanstack/react-query";
import {Folder} from "@/components/folder";
import {MusicScore} from "@/components/score";


export default function FileManager() {
  const [activeTab, setActiveTab] = useState<"recent" | "starred">("recent")
  const [scores, setScores] = useState<MusicScore[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [loadSuccess, setLoadSuccess] = useState(false);
  const [fmErr, setFMErr] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>()
  const [filteredScores, setFilteredScores] = useState<MusicScore[]>([]);

  const loadError = (reason: string) => {
    setLoadSuccess(false);
    setFMErr("Error: " + reason);
  }
  const {data: scoreList, error: scoreError} = useQuery({
    queryKey: ["scores"],
    queryFn: () => Get<MusicScore[]>("/api/score/list"),
  });
  const {data: folderList, error: folderError} = useQuery({
    queryKey: ["folders"],
    queryFn: () => Get<Folder[]>("/api/folder/list"),
  });
  useEffect(() => {
    if (scoreList) setScores(scoreList);
    if (folderList) setFolders(folderList);
    if (scoreError) loadError(scoreError.message);
    if (folderError) loadError(folderError.message);
    if (scoreList && folderList) setLoadSuccess(true);
    if (scoreList) setFilteredScores(scoreList.filter((score) => (activeTab === "recent" ? true : score.starred)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreList, folderList]);

  const uploadScore = (file: File, score: MusicScore) => {
    const formData = new FormData()
    formData.append("file", file, file.name)
    formData.append("info", JSON.stringify(score))
    Post("/api/score/upload", formData).then(console.log).catch(console.error)
  }

  const toggleStar = (id: string) => {
    Post("/api/score/star", {'id': id}).then(() => console.log("star toggled"))
  }

  const newFolder = (folderName: string, content: string[]) => {
    Post("/api/folder/create", {folderName, content}).then(console.log)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id)
  }

  const handleCreateFolder = () => {
    if (folderName.trim() === "") return setErrorMessage("Folder name empty")
    const updatedFolders = {...folders, [folderName]: []}
    setFolders(updatedFolders)
    newFolder(folderName, [])
    setFolderName("")
    setIsDialogOpen(false)
  }

  const handleUpload = (file: File, id: string) => {
    const newScore: MusicScore = {
      id,
      title: file.name.replace(".mxl", ""),
      subtitle: "Unknown",
      upload_date: new Date().toISOString(),
      starred: false,
    }
    uploadScore(file, newScore)
    setScores([...scores, newScore])
  }

  const account = React.useContext(AccountContext)?.account;

  return (
    <Layout>
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
            <UploadDialog onUpload={handleUpload}/>
            {account ?
              <Button variant="outline" className="gap-2" onClick={() => setIsDialogOpen(true)}>
                <FolderPlus className="h-4 w-4"/>
                Create folder
              </Button> :
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={-1}>
                    <Button variant="outline" className="gap-2" disabled>
                      <FolderPlus className="h-4 w-4"/>
                      Create folder
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Log in or create an account first!
                  <TooltipArrow className="fill-primary"/>
                </TooltipContent>
              </Tooltip>}
          </div>
        </div>

        {
          scores.length === 0 ? (
            <div className="text-center py-12">
              <p
                className="text-lg text-gray-500 dark:text-gray-400">{loadSuccess ? "It's empty in here..." : "Failed to load data"}</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                {loadSuccess ? (activeTab === "starred"
                    ? "Starred items show up here!"
                    : "Upload some files or create a folder to get started!") :
                  fmErr}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredScores.map((score) => (
                <ScoreCard
                  key={score.id}
                  {...score}
                  onStarToggle={() => toggleStar(score.id)}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          )
        }

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Folder name"
                className="w-full border p-2 rounded dark:bg-gray-900/80"
              />
              {errorMessage && <p className="text-red-500 text-center text-sm">{errorMessage}</p>}
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
                     subtitle,
                     upload_date,
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
      <Link href={`/score/${id}`} className="block" key={id}>
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
            <FileIcon className="h-4 w-4 text-gray-400"/>
            <h3 className="font-medium text-gray-900 dark:text-white truncate">{title}</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          <p
            className="text-xs text-gray-500 dark:text-gray-400">Uploaded {new Date(upload_date).toLocaleDateString()}</p>
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
        <Star className={`h-5 w-5 ${starred ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}/>
      </Button>
    </div>
  )
}

