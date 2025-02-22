import type React from "react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Check, FileIcon, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SUPPORTED_FILE_TYPES, SUPPORTED_FILE_TYPES_TEXT } from "@/lib/constants"
import axios from "axios"
import {toast} from "react-toastify";

interface UploadingFile {
  file: File
  progress: number
  id: string
}

export function UploadDialog({ onUpload }: { onUpload: (file: File, id: string, progress: number) => void }) {
  const [files, setFiles] = useState<UploadingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File, fileId: string) => {
    const formData = new FormData()
    formData.append("file", file)

    try {
      // noinspection JSUnusedGlobalSymbols
      await axios.post("/api/score/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress } : f)))
            onUpload(file, fileId, progress)
          }
        },
      })

      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch (error) {
      console.error("Upload failed:", error)
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress: -1 } : f)))
    }
  }

  const isValidFileType = (file: File) => {
    return SUPPORTED_FILE_TYPES.some((type) => file.name.toLowerCase().endsWith(type))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(isValidFileType)
      addFiles(newFiles)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files).filter(isValidFileType)
    if (droppedFiles.length === 0) {
      toast.error("Invalid file type. " + SUPPORTED_FILE_TYPES_TEXT)
      return
    }
    addFiles(droppedFiles)
  }

  const addFiles = (newFiles: File[]) => {
    const uploadingFiles = newFiles.map((file) => ({
      file,
      progress: 0,
      id: `upload-${Date.now()}-${file.name}`,
    }))
    setFiles((prev) => [...prev, ...uploadingFiles])

    // Start uploading each file
    uploadingFiles.forEach((uploadingFile) => {
      uploadFile(uploadingFile.file, uploadingFile.id).then(r => console.log("Upload finished", r))
    })
  }

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const openFileSelector = () => {
    fileInputRef.current?.click()
  }

  const handleDone = () => {
    setFiles([])
    setIsDialogOpen(false)
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-gray-50 dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle>Upload file(s)</DialogTitle>
          <DialogDescription>{SUPPORTED_FILE_TYPES_TEXT}</DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            "mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 transition-colors",
            isDragging && "border-primary bg-muted/25",
            files.length > 0 && "pb-4",
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_FILE_TYPES.join(",")}
            onChange={handleFileChange}
            className="hidden"
            multiple
          />
          <Upload className="h-8 w-8 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground text-center">
            Drag and drop the file(s) to here, or use the{" "}
            <button type="button" onClick={openFileSelector} className="text-primary hover:underline">
              file browser
            </button>
          </p>
        </div>
        {files.length > 0 && (
          <div className="mt-4 space-y-3">
            {files.map((file) => (
              <div key={file.id} className="relative">
                <div className="flex items-center gap-3 mb-1">
                  <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="text-sm truncate dark:text-gray-300">{file.file.name}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{Math.round(file.file.size / 1024)}kb</span>
                        {file.progress === 100 ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : file.progress === -1 ? (
                          <span className="text-xs text-red-500">Failed</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{file.progress}%</span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0 hover:bg-transparent"
                          onClick={() => removeFile(file.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-200"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={handleDone} className="w-full sm:w-auto">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

