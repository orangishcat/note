"use client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderPlus, RefreshCw, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useContext, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UploadDialog } from "@/components/upload-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AccountContext, AuthModalContext } from "@/app/providers";
import { TooltipArrow } from "@radix-ui/react-tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MusicScore } from "@/types/score-types";
import FileOptionsDropdown from "@/components/ui-custom/file-options-dropdown";
import BasicTooltip from "@/components/ui-custom/basic-tooltip";
import { useSearchParams } from "next/navigation";
import { databases, storage } from "@/lib/appwrite";
import { ID, Permission, Role } from "appwrite";
import NotImplementedTooltip from "@/components/ui-custom/not-implemented-tooltip";
export default function FileManager() {
  const [activeTab, setActiveTab] = useState<"recent" | "starred">("recent");
  const [scores, setScores] = useState<MusicScore[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [loadSuccess, setLoadSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fmErr, setFMErr] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [filteredScores, setFilteredScores] = useState<MusicScore[]>([]);
  const [refetchDisabled, setRefetchDisabled] = useState(false);
  const context = React.useContext(AccountContext);
  const authModalContext = useContext(AuthModalContext);
  const account = context?.accountView;
  const searchParams = useSearchParams();
  const loadError = (reason: string) => {
    setLoadSuccess(false);
    setFMErr("Error: " + reason);
  };
  const {
    data: scoreList,
    error: scoreError,
    refetch: refetchScores,
  } = useQuery({
    queryKey: ["scores"],
    queryFn: async () => {
      const res = await databases.listDocuments<MusicScore>(
        process.env.NEXT_PUBLIC_DATABASE!,
        process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
      );
      return res.documents.map(
        (doc) =>
          ({
            ...doc,
            is_mxl: doc.mime_type?.includes("musicxml"),
            starred: false,
          }) as MusicScore,
      );
    },
  });
  useEffect(
    () =>
      setFilteredScores(
        scores.filter((score) =>
          activeTab === "recent" ? true : score.starred,
        ),
      ),
    [activeTab, scores],
  );
  useEffect(() => {
    if (context?.justLogin) void refetchScores();
  }, [context?.justLogin, refetchScores]);
  useEffect(() => {
    const loginParam = searchParams.get("login");
    if (loginParam === "true" && authModalContext) {
      authModalContext.openAuthModal("login");
    }
  }, [searchParams, authModalContext]);
  useEffect(() => {
    if (scoreList) setScores(scoreList);
    if (scoreError) loadError(scoreError.message);
    else setLoadSuccess(true);
    if (scoreList) setLoadSuccess(true);
    setIsLoading(false);
  }, [scoreList]);
  const qc = useQueryClient();
  const invalidateScores = () => {
    void qc.invalidateQueries({ queryKey: ["scores"] });
  };
  const [lastStarTime, setLastStarTime] = useState(0);
  const toggleStar = (score: MusicScore) => {
    setLastStarTime(Date.now());
    if (Date.now() - lastStarTime < 700) return;
    setScores(
      scores.map((s) =>
        s.$id === score.$id ? { ...s, starred: !s.starred } : s,
      ),
    );
    databases
      .updateDocument(
        process.env.NEXT_PUBLIC_DATABASE!,
        process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
        score.$id,
        { starred_users: [] },
      )
      .catch(() => {
        setScores(
          scores.map((s) =>
            s.$id === score.$id ? { ...s, starred: score.starred } : s,
          ),
        );
        setErrorMessage("Failed to update star status");
      });
  };
  const newFolder = async (folderName: string) => {
    try {
      return await databases.createDocument(
        process.env.NEXT_PUBLIC_DATABASE!,
        process.env.NEXT_PUBLIC_FOLDERS_COLLECTION!,
        ID.unique(),
        { name: folderName },
        [
          Permission.read(Role.user("current")),
          Permission.write(Role.user("current")),
        ],
      );
    } catch (err) {
      setErrorMessage("Failed to create folder");
      throw err;
    }
  };
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };
  const handleCreateFolder = () => {
    if (folderName.trim() === "") return setErrorMessage("Folder name empty");
    newFolder(folderName).then(() => {
      setFolderName("");
      setIsDialogOpen(false);
      setErrorMessage(undefined);
    });
  };
  const onDelete = (id: string) => {
    setScores(scores.filter((score) => score.$id !== id));
    invalidateScores();
  };
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "recent" | "starred")}
        >
          <TabsList>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="starred">Starred</TabsTrigger>
            <TabsTrigger value="shared" disabled>
              Shared
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-4">
          <BasicTooltip text="Refresh scores list">
            <Button
              variant="outline"
              className="gap-2"
              disabled={refetchDisabled}
              onClick={() => {
                setRefetchDisabled(true);
                refetchScores().then(() => setRefetchDisabled(false));
              }}
            >
              <RefreshCw
                className={`h-4 w-4 ${refetchDisabled && "animate-spin"}`}
              />
            </Button>
          </BasicTooltip>
          <UploadDialog onUpload={invalidateScores} />
          {account ? (
            <NotImplementedTooltip>
              <Button
                variant="outline"
                className="gap-2"
                disabled
                onClick={() => setIsDialogOpen(true)}
              >
                <FolderPlus className="h-4 w-4" />
                Create folder
              </Button>
            </NotImplementedTooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={-1}>
                  <Button variant="outline" className="gap-2" disabled>
                    <FolderPlus className="h-4 w-4" />
                    Create folder
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Log in or create an account first!
                <TooltipArrow className="fill-primary" />
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {scores.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-gray-500 dark:text-gray-400">
            {account
              ? loadSuccess
                ? "It's empty in here..."
                : isLoading
                  ? "Loading..."
                  : "Failed to load scores"
              : "Log in first!"}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            {account &&
              (loadSuccess
                ? activeTab === "starred"
                  ? "Starred items show up here!"
                  : "Upload some files or create a folder to get started!"
                : fmErr)}
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
          style={{ gap: "3vw" }}
        >
          {filteredScores.map((score) => (
            <ScoreCard
              key={score.$id}
              score={score}
              onStarToggle={() => toggleStar(score)}
              onDragStart={handleDragStart}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

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
            {errorMessage && (
              <p className="text-red-500 text-center text-sm">{errorMessage}</p>
            )}
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
  );
}
function ScoreCard({
  score,
  onStarToggle,
  onDragStart,
  onDelete,
}: {
  score: MusicScore;
  onStarToggle: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { $id, name, subtitle, $createdAt, starred, preview_id } = score;
  return (
    <div
      className="group relative overflow-hidden rounded-lg border bg-gray-100 dark:bg-gray-700 dark:border-gray-700
       dark:hover:border-gray-500 transition duration-200 hover:scale-105"
      draggable
      onDragStart={(e) => onDragStart(e, $id)}
    >
      <Link href={`/app/score/${$id}`} key={$id}>
        <div className="aspect-[4/3] overflow-hidden">
          <Image
            src={
              preview_id
                ? storage.getFileDownload(
                    process.env.NEXT_PUBLIC_IMAGES_BUCKET!,
                    preview_id,
                  )
                : "/static/preview.png"
            }
            alt={`Score preview for ${name}`}
            width={300}
            height={225}
            draggable={false}
            className={`mx-auto block h-auto w-4/5 object-contain ${
              preview_id ? "bg-white" : ""
            }`}
            unoptimized
          />
        </div>
      </Link>

      <div className="flex items-center justify-between bg-gray-200 dark:bg-gray-800 dark:border-gray-600 border-t border-inherit">
        <Link
          href={`/app/score/${$id}`}
          key={$id}
          style={{ maxWidth: "calc(100% - 60px)" }}
        >
          <div className="p-4 ml-4">
            <h3 className="font-medium text-gray-900 dark:text-white truncate">
              {name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 truncate">
              {subtitle} •&nbsp;
              {new Date($createdAt ?? "").toLocaleDateString()}
            </p>
          </div>
        </Link>
        <div className="flex flex-col md:flex-row xl:gap-3 gap-4 mr-4 text-gray-400">
          <Button
            variant="ghost"
            size="link"
            onClick={(e) => {
              e.preventDefault();
              onStarToggle();
            }}
          >
            <Star
              className={`xl:size-4 ${
                starred && "fill-yellow-400 text-yellow-400"
              }`}
            />
          </Button>
          <FileOptionsDropdown score={score} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}
