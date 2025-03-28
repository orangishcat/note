"use client"

import {Button} from "@/components/ui/button"
import {Tabs, TabsList, TabsTrigger} from "@/components/ui/tabs"
import {FolderPlus, RefreshCw, Star} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import React, {useEffect, useState} from "react"
import {Layout} from "@/components/layout"
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog"
import {UploadDialog} from "@/components/upload-dialog"
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {AccountContext} from "@/app/providers";
import {TooltipArrow} from "@radix-ui/react-tooltip";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {Folder} from "@/components/folder";
import {MusicScore} from "@/components/music-xml-renderer";
import FileOptionsDropdown from "@/components/ui-custom/file-options-dropdown";
import NotImplementedTooltip from "@/components/ui-custom/not-implemented-tooltip";
import BasicTooltip from "@/components/ui-custom/basic-tooltip";
import axios from "axios";


export default function FileManager() {
    const [activeTab, setActiveTab] = useState<"recent" | "starred">("recent")
    const [scores, setScores] = useState<MusicScore[]>([])
    const [folders, setFolders] = useState<Folder[]>([])
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [folderName, setFolderName] = useState("")
    const [loadSuccess, setLoadSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [fmErr, setFMErr] = useState("");
    const [errorMessage, setErrorMessage] = useState<string>()
    const [filteredScores, setFilteredScores] = useState<MusicScore[]>([]);
    const [refetchDisabled, setRefetchDisabled] = useState(false);
    const context = React.useContext(AccountContext);
    const account = context?.account;

    const loadError = (reason: string) => {
        setLoadSuccess(false);
        setFMErr("Error: " + reason);
    }
    const {data: scoreList, error: scoreError, refetch: refetchScores} = useQuery({
        queryKey: ["scores"],
        queryFn: () => axios.get<MusicScore[]>("/api/score/list").then(resp => resp.data),
    });
    const {data: folderList, error: folderError} = useQuery({
        queryKey: ["folders"],
        queryFn: () => axios.get<Folder[]>("/api/folder/list").then(resp => resp.data),
    });
    useEffect(
      () => setFilteredScores(scores.filter((score) => (activeTab === "recent" ? true : score.starred))),
      [activeTab, scores])

    useEffect(() => {
        if (context?.justLogin)
            refetchScores()
    }, [context?.justLogin, refetchScores]);

    useEffect(() => {
        if (scoreList) setScores(scoreList);
        if (folderList) setFolders(folderList);
        if (scoreError)
            loadError(scoreError.message);
        else
            setLoadSuccess(true);
        if (folderError)
            loadError(folderError.message);
        else
            setLoadSuccess(true);
        if (scoreList && folderList) setLoadSuccess(true);
        setIsLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scoreList, folderList]);

    const qc = useQueryClient();
    const invalidateScores = () => {
        qc.invalidateQueries({queryKey: ['scores']}).then(r => console.log("Scores query invalidated", r))
    };

    const [lastStarTime, setLastStarTime] = useState(0);
    const toggleStar = (score: MusicScore) => {
        setLastStarTime(Date.now())
        if (Date.now() - lastStarTime < 700) return

        setScores(scores.map((s) => (s.id === score.id ? {...s, starred: !s.starred} : s)))
        axios.post(`/api/score/star/${score.id}`, {starred: !score.starred}).catch(console.error)
    }

    const newFolder = (folderName: string, content: string[]) => {
        axios.post("/api/folder/create", {folderName, content}).then(console.log)
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

    const onDelete = (id: string) => {
        setScores(scores.filter((score) => score.id !== id))
        invalidateScores()
    };
    return (
      <Layout>
          <div className="p-6">
              <div className="mb-6 flex items-center justify-between">
                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "recent" | "starred")}>
                      <TabsList>
                          <TabsTrigger value="recent">Recent</TabsTrigger>
                          <TabsTrigger value="starred">Starred</TabsTrigger>
                          <TabsTrigger value="shared" disabled>Shared</TabsTrigger>
                      </TabsList>
                  </Tabs>
                  <div className="flex items-center gap-4">
                      <BasicTooltip text="Refresh scores list">
                          <Button variant="outline" className="gap-2" disabled={refetchDisabled} onClick={() => {
                              setRefetchDisabled(true);
                              refetchScores().then(() => setRefetchDisabled(false));
                          }}>
                              <RefreshCw className={`h-4 w-4 ${refetchDisabled && "animate-spin"}`}/>
                          </Button>
                      </BasicTooltip>
                      <UploadDialog onUpload={invalidateScores}/>
                      {account ?
                        <NotImplementedTooltip>
                            <Button variant="outline" className="gap-2" disabled onClick={() => setIsDialogOpen(true)}>
                                <FolderPlus className="h-4 w-4"/>
                                Create folder
                            </Button>
                        </NotImplementedTooltip> :
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
                        <p className="text-lg text-gray-500 dark:text-gray-400">
                            {account ? (loadSuccess ? "It's empty in here..." : (isLoading ? "Loading..." : "Failed to load data")) : "Log in first!"}
                        </p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                            {account ?
                                (loadSuccess ? (activeTab === "starred"
                                    ? "Starred items show up here!"
                                    : "Upload some files or create a folder to get started!") :
                                  fmErr)
                             : "Session expired"}
                        </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4" style={{gap: "3vw"}}>
                        {filteredScores.map((score) => (
                          <ScoreCard
                            key={score.id}
                            score={score}
                            onStarToggle={() => toggleStar(score)}
                            onDragStart={handleDragStart}
                            onDelete={onDelete}
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
                       score,
                       onStarToggle,
                       onDragStart,
                       onDelete,
                   }: {
    score: MusicScore
    onStarToggle: () => void
    onDragStart: (e: React.DragEvent, id: string) => void
    onDelete: (id: string) => void
}) {
    const {id, title, subtitle, upload_date, starred, preview_id} = score;

    return (
      <div
        className="group relative overflow-hidden rounded-lg border bg-gray-100 dark:bg-gray-700 dark:border-gray-700
       dark:hover:border-gray-500 transition-colors duration-200"
        onDragStart={(e) => onDragStart(e, id)}
      >
          <Link href={`/score/${id}`} key={id}>
              <div className="aspect-[4/3] overflow-hidden">
                  <Image
                    src={`/api/score/preview/${preview_id}`}
                    alt={`Score preview for ${title}`}
                    style={{width: "80%", height: "auto", display: "block", margin: "0 auto"}}
                    width={300} height={225} priority
                    draggable={false}
                    className={"w-full h-full object-contain " + (preview_id && "bg-white")}
                  />
              </div>
          </Link>

          <div className="flex items-center justify-between bg-gray-200 dark:bg-gray-800 dark:border-gray-600 border-t border-inherit">
              <Link href={`/score/${id}`} key={id} style={{maxWidth: "calc(100% - 60px)"}}>
                  <div className="p-4 ml-4">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">{title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 truncate">{subtitle} •&nbsp;
                          {new Date(upload_date).toLocaleDateString()}</p>
                  </div>
              </Link>
              <div className="flex flex-col md:flex-row xl:gap-3 gap-4 mr-4 text-gray-400">
                  <Button
                    variant="ghost"
                    size="link"
                    onClick={(e) => {
                        e.preventDefault()
                        onStarToggle()
                    }}
                  >
                      <Star className={`xl:size-4 ${starred && "fill-yellow-400 text-yellow-400"}`}/>
                  </Button>
                  <FileOptionsDropdown score={score} onDelete={onDelete}/>
              </div>
          </div>
      </div>
    )
}

