import React, { useState } from "react";
import { clsx } from "clsx";
import { databases, storage } from "@/lib/appwrite";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical, FileIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MusicScore } from "@/types/score-types";
interface FileOptionsProps {
  score: MusicScore;
  onDelete: (id: string) => void;
}
const FileOptionsDropdown: React.FC<FileOptionsProps> = ({
  score,
  onDelete,
}) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await databases.deleteDocument(
        process.env.NEXT_PUBLIC_DATABASE!,
        process.env.NEXT_PUBLIC_SCORES_COLLECTION!,
        score.$id,
      );
      if (score.file_id) {
        await storage.deleteFile(
          process.env.NEXT_PUBLIC_SCORES_BUCKET!,
          score.file_id,
        );
      }
      if (score.preview_id) {
        await storage.deleteFile(
          process.env.NEXT_PUBLIC_IMAGES_BUCKET!,
          score.preview_id,
        );
      }
      setIsConfirmOpen(false);
      onDelete(score.$id);
    } catch {
    } finally {
      setIsDeleting(false);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="link">
            <EllipsisVertical className="xl:size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="border rounded-md shadow-lg">
          <DropdownMenuItem
            onSelect={() => setIsConfirmOpen(true)}
            className={clsx("px-4 py-2 text-sm text-red-500 cursor-pointer")}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <DialogDescription asChild>
            <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-900/30 border border-gray-300 dark:border-gray-600 p-4 rounded-lg">
              <FileIcon className="h-8 w-8 text-gray-500" />
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                  {score.name}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {score.subtitle} •{" "}
                  {new Date(score.$createdAt ?? "").toLocaleDateString()}
                </p>
              </div>
            </div>
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className={clsx({ "opacity-50 cursor-not-allowed": isDeleting })}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
export default FileOptionsDropdown;
