"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
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
import { Check, CheckCircle, FileIcon, FileImage, FileMusic, FileText, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SUPPORTED_FILE_TYPES } from "@/lib/constants"
import axios, { type CancelTokenSource } from "axios"
import {Post} from "@/lib/network";

interface UploadingFile {
  file: File
  progress: number
  id: string
  cancelToken?: CancelTokenSource
  status: "pending" | "uploading" | "completed" | "failed" | "cancelled"
}

export function UploadDialog() {
  const [currentStep, setCurrentStep] = useState(1)
  const [scoreFiles, setScoreFiles] = useState<UploadingFile[]>([])
  const [audioFiles, setAudioFiles] = useState<UploadingFile[]>([])
  const [isDraggingScore, setIsDraggingScore] = useState(false)
  const [isDraggingAudio, setIsDraggingAudio] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [uploadedFileNames, setUploadedFileNames] = useState<Set<string>>(new Set())
  const scoreFileInputRef = useRef<HTMLInputElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)

  const totalSteps = 3
  const progressPercentage = ((currentStep - 1) / (totalSteps - 1)) * 90 + 5

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        setIsDialogOpen(false)
        setIsComplete(false)
        setCurrentStep(1)
        setScoreFiles([])
        setAudioFiles([])
        setUploadedFileNames(new Set())
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [isComplete])

  const uploadFile = async (file: File, fileId: string, isAudio = false) => {
    // Check if file with same name is already uploaded or uploading
    if (uploadedFileNames.has(file.name)) {
      setScoreFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "failed", progress: -1 } : f)))
      return
    }

    // Add to uploaded files set
    setUploadedFileNames((prev) => new Set(prev).add(file.name))

    const formData = new FormData()
    formData.append("file", file)
    formData.append("info", JSON.stringify({type: isAudio ? "audio" : "score"}))

    // Create cancel token
    const cancelToken = axios.CancelToken.source()

    // Update file with cancel token
    if (isAudio) {
      setAudioFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, cancelToken, status: "uploading" } : f)))
    } else {
      setScoreFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, cancelToken, status: "uploading" } : f)))
    }

    try {
      await axios.post("/api/score/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        cancelToken: cancelToken.token,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            if (isAudio) {
              setAudioFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId ? { ...f, progress, status: progress === 100 ? "completed" : "uploading" } : f,
                ),
              )
            } else {
              setScoreFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId ? { ...f, progress, status: progress === 100 ? "completed" : "uploading" } : f,
                ),
              )
            }
          }
        },
      });

      // Mark as completed
      if (isAudio) {
        setAudioFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress: 100, status: "completed" } : f)))
      } else {
        setScoreFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress: 100, status: "completed" } : f)))
      }
    } catch (error) {
      console.error("Upload failed:", error)

      // Check if it was cancelled
      if (axios.isCancel(error)) {
        if (isAudio) {
          setAudioFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "cancelled" } : f)))
        } else {
          setScoreFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "cancelled" } : f)))
        }
      } else {
        // Other error
        if (isAudio) {
          setAudioFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress: -1, status: "failed" } : f)))
        } else {
          setScoreFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, progress: -1, status: "failed" } : f)))
        }
      }

      // Remove from uploaded files set
      setUploadedFileNames((prev) => {
        const newSet = new Set(prev)
        newSet.delete(file.name)
        return newSet
      })
    }
  }

  const cancelUpload = async (fileId: string, isAudio = false) => {
    let fileToCancel: UploadingFile | undefined

    if (isAudio) {
      fileToCancel = audioFiles.find((f) => f.id === fileId)
      if (fileToCancel) {
        // Cancel the axios request if it's in progress
        if (fileToCancel.cancelToken && fileToCancel.status === "uploading") {
          fileToCancel.cancelToken.cancel("Upload cancelled by user")
        }

        // Update status
        setAudioFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "cancelled" } : f)))
      }
    } else {
      fileToCancel = scoreFiles.find((f) => f.id === fileId)
      if (fileToCancel) {
        // Cancel the axios request if it's in progress
        if (fileToCancel.cancelToken && fileToCancel.status === "uploading") {
          fileToCancel.cancelToken.cancel("Upload cancelled by user")
        }

        // Update status
        setScoreFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "cancelled" } : f)))
      }
    }

    // Make API call to cancel on server
    if (fileToCancel) {
      try {
        await axios.post("/api/score/cancel-upload", {
          fileName: fileToCancel.file.name,
        })

        // Remove from uploaded files set
        setUploadedFileNames((prev) => {
          const newSet = new Set(prev)
          newSet.delete(fileToCancel!.file.name)
          return newSet
        })
      } catch (error) {
        console.error("Failed to cancel upload on server:", error)
      }
    }
  }

  const isValidScoreFileType = (file: File) => {
    return SUPPORTED_FILE_TYPES.some((type) => file.name.toLowerCase().endsWith(type))
  }

  const isValidAudioFileType = (file: File) => {
    return (
      file.name.toLowerCase().endsWith(".mp3") ||
      file.name.toLowerCase().endsWith(".wav") ||
      file.name.toLowerCase().endsWith(".ogg")
    )
  }

  const getFileIcon = (fileName: string) => {
    if (fileName.toLowerCase().endsWith(".pdf")) {
      return <FileText className="h-4 w-4 text-red-500" />
    } else if (
      fileName.toLowerCase().endsWith(".png") ||
      fileName.toLowerCase().endsWith(".jpg") ||
      fileName.toLowerCase().endsWith(".jpeg")
    ) {
      return <FileImage className="h-4 w-4 text-blue-500" />
    } else {
      return <FileIcon className="h-4 w-4 text-purple-500" />
    }
  }

  const handleScoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(isValidScoreFileType)
      addScoreFiles(newFiles)
    }
  }

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(isValidAudioFileType)
      addAudioFiles(newFiles)
    }
  }

  const handleDragOver = (e: React.DragEvent, isAudio = false) => {
    e.preventDefault()
    if (isAudio) {
      setIsDraggingAudio(true)
    } else {
      setIsDraggingScore(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent, isAudio = false) => {
    e.preventDefault()
    if (isAudio) {
      setIsDraggingAudio(false)
    } else {
      setIsDraggingScore(false)
    }
  }

  const handleScoreFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingScore(false)

    const droppedFiles = Array.from(e.dataTransfer.files).filter(isValidScoreFileType)
    if (droppedFiles.length === 0) {
      // Could add a toast notification here for invalid file types
      return
    }
    addScoreFiles(droppedFiles)
  }

  const handleAudioFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingAudio(false)

    const droppedFiles = Array.from(e.dataTransfer.files).filter(isValidAudioFileType)
    if (droppedFiles.length === 0) {
      // Could add a toast notification here for invalid file types
      return
    }
    addAudioFiles(droppedFiles)
  }

  // Modified: start upload immediately after adding files
  const addScoreFiles = (newFiles: File[]) => {
    const uploadingFiles = newFiles.map((file) => ({
      file,
      progress: 0,
      id: `upload-${Date.now()}-${file.name}`,
      status: "pending" as const,
    }))

    setScoreFiles((prev) => [...prev, ...uploadingFiles])

    // Start uploading immediately
    uploadingFiles.forEach((file) => {
      uploadFile(file.file, file.id, false)
    })
  }

  // Modified: start upload immediately after adding files
  const addAudioFiles = (newFiles: File[]) => {
    const uploadingFiles = newFiles.map((file) => ({
      file,
      progress: 0,
      id: `upload-${Date.now()}-${file.name}`,
      status: "pending" as const,
    }))

    setAudioFiles((prev) => [...prev, ...uploadingFiles])

    // Start uploading immediately
    uploadingFiles.forEach((file) => {
      uploadFile(file.file, file.id, true)
    })
  }

  const removeScoreFile = (fileId: string) => {
    const file = scoreFiles.find((f) => f.id === fileId)
    if (file) {
      // If file is uploading, cancel it first
      if (file.status === "uploading") {
        cancelUpload(fileId)
      }

      // Remove from uploaded files set if it was completed
      if (file.status === "completed") {
        setUploadedFileNames((prev) => {
          const newSet = new Set(prev)
          newSet.delete(file.file.name)
          return newSet
        })
        Post("/api/score/cancel-upload", {file_name: file.file.name});
      }

      // Remove from list
      setScoreFiles((prev) => prev.filter((f) => f.id !== fileId))
    }
  }

  const removeAudioFile = (fileId: string) => {
    const file = audioFiles.find((f) => f.id === fileId)
    if (file) {
      // If file is uploading, cancel it first
      if (file.status === "uploading") {
        cancelUpload(fileId, true)
      }

      // Remove from uploaded files set if it was completed
      if (file.status === "completed") {
        setUploadedFileNames((prev) => {
          const newSet = new Set(prev)
          newSet.delete(file.file.name)
          return newSet
        })
      }

      // Remove from list
      setAudioFiles((prev) => prev.filter((f) => f.id !== fileId))
    }
  }

  const openScoreFileSelector = () => {
    scoreFileInputRef.current?.click()
  }

  const openAudioFileSelector = () => {
    audioFileInputRef.current?.click()
  }

  const handleNextStep = () => {
    if (currentStep === 1 && scoreFiles.length === 0) {
      return // Don't proceed if no score files are selected
    }

    if (currentStep === 2) {
      setIsComplete(true)
    }

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }
  const getStatusText = (status: string, progress: number) => {
    switch (status) {
      case "completed":
        return <Check className="h-4 w-4 text-green-500" />
      case "uploading":
        return <span className="text-xs text-blue-500">{progress}%</span>
      case "failed":
        return <span className="text-xs text-red-500">Failed</span>
      case "cancelled":
        return <span className="text-xs text-orange-500">Cancelled</span>
      default:
        return <span className="text-xs text-muted-foreground">Pending</span>
    }
  }

  const renderScoreUploadArea = () => {
    return (
      <div
        className={cn(
          "relative mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 transition-colors",
          isDraggingScore && "border-primary bg-muted/25",
        )}
        onDragOver={(e) => handleDragOver(e)}
        onDragLeave={(e) => handleDragLeave(e)}
        onDrop={handleScoreFileDrop}
      >
        <input
          ref={scoreFileInputRef}
          type="file"
          accept={SUPPORTED_FILE_TYPES.join(",")}
          onChange={handleScoreFileChange}
          className="hidden"
          multiple
        />

        <Upload className="h-8 w-8 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground text-center">
          Drag and drop your files here, or use the{" "}
          <button type="button" onClick={openScoreFileSelector} className="text-primary hover:underline">
            file browser
          </button>
        </p>
        <p className="text-xs text-muted-foreground mt-2">Supports MXL, XML, PDF, PNG, JPG files</p>

        {isDraggingScore && (
          <div className="absolute inset-0 bg-gray-100/90 dark:bg-gray-800/90 rounded-lg flex flex-col items-center justify-center">
            <Upload className="h-8 w-8 text-primary mb-4" />
            <p className="text-sm font-medium text-center">Drop files to add</p>
          </div>
        )}
      </div>
    )
  }

  const renderScoreFilesList = () => {
    if (scoreFiles.length === 0) return renderScoreUploadArea()

    return (
      <div
        className={cn(
          "w-full space-y-3 mt-4 relative",
          isDraggingScore && "border-2 border-dashed border-primary rounded-lg p-4",
        )}
        onDragOver={(e) => handleDragOver(e)}
        onDragLeave={(e) => handleDragLeave(e)}
        onDrop={handleScoreFileDrop}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Files to upload</h3>
          <div className="flex items-center gap-2">
            <button onClick={openScoreFileSelector} className="text-xs text-primary hover:underline">
              Add more
            </button>
            <button
              onClick={() => {
                // Cancel all uploading files
                scoreFiles.forEach((file) => {
                  if (file.status === "uploading") {
                    cancelUpload(file.id)
                  }
                })
                // Clear the list
                setScoreFiles([])
                // Clear uploaded file names
                setUploadedFileNames(new Set())
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Clear all
            </button>
          </div>
        </div>
        {scoreFiles.map((file) => (
          <div key={file.id} className="relative bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              {getFileIcon(file.file.name)}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium truncate dark:text-gray-200">{file.file.name}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{Math.round(file.file.size / 1024)}kb</span>
                    {getStatusText(file.status, file.progress)}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0 hover:bg-transparent"
                      onClick={() => (file.status === "uploading" ? cancelUpload(file.id) : removeScoreFile(file.id))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mt-2">
                  <div
                    className={cn(
                      "h-full transition-all duration-200",
                      file.status === "completed"
                        ? "bg-green-500"
                        : file.status === "uploading"
                          ? "bg-blue-500"
                          : file.status === "failed"
                            ? "bg-red-500"
                            : file.status === "cancelled"
                              ? "bg-orange-500"
                              : "bg-gray-400",
                    )}
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {isDraggingScore && (
          <div className="absolute inset-0 bg-gray-100/90 dark:bg-gray-800/90 rounded-lg flex flex-col items-center justify-center">
            <Upload className="h-8 w-8 text-primary mb-4" />
            <p className="text-sm font-medium text-center">Drop files to add more</p>
          </div>
        )}
      </div>
    )
  }

  const renderAudioUploadArea = () => {
    return (
      <div
        className={cn(
          "relative mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 transition-colors",
          isDraggingAudio && "border-primary bg-muted/25",
        )}
        onDragOver={(e) => handleDragOver(e, true)}
        onDragLeave={(e) => handleDragLeave(e, true)}
        onDrop={handleAudioFileDrop}
      >
        <input
          ref={audioFileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg"
          onChange={handleAudioFileChange}
          className="hidden"
        />

        <FileMusic className="h-8 w-8 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground text-center">
          Drag and drop your audio file here, or use the{" "}
          <button type="button" onClick={openAudioFileSelector} className="text-primary hover:underline">
            file browser
          </button>
        </p>
        <p className="text-xs text-muted-foreground mt-2">Supports MP3, WAV, OGG files</p>

        {isDraggingAudio && (
          <div className="absolute inset-0 bg-gray-100/90 dark:bg-gray-800/90 rounded-lg flex flex-col items-center justify-center">
            <FileMusic className="h-8 w-8 text-primary mb-4" />
            <p className="text-sm font-medium text-center">Drop files to add</p>
          </div>
        )}
      </div>
    )
  }

  const renderAudioFilesList = () => {
    if (audioFiles.length === 0) return renderAudioUploadArea()

    return (
      <div
        className={cn(
          "w-full space-y-3 mt-4 relative",
          isDraggingAudio && "border-2 border-dashed border-primary rounded-lg p-4",
        )}
        onDragOver={(e) => handleDragOver(e, true)}
        onDragLeave={(e) => handleDragLeave(e, true)}
        onDrop={handleAudioFileDrop}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Audio files</h3>
          <div className="flex items-center gap-2">
            <button onClick={openAudioFileSelector} className="text-xs text-primary hover:underline">
              Add more
            </button>
            <button
              onClick={() => {
                // Cancel all uploading files
                audioFiles.forEach((file) => {
                  if (file.status === "uploading") {
                    cancelUpload(file.id, true)
                  }
                })
                // Clear the list
                setAudioFiles([])
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Clear all
            </button>
          </div>
        </div>
        {audioFiles.map((file) => (
          <div key={file.id} className="relative bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <FileMusic className="h-4 w-4 text-orange-500" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium truncate dark:text-gray-200">{file.file.name}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{Math.round(file.file.size / 1024)}kb</span>
                    {getStatusText(file.status, file.progress)}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0 hover:bg-transparent"
                      onClick={() =>
                        file.status === "uploading" ? cancelUpload(file.id, true) : removeAudioFile(file.id)
                      }
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mt-2">
                  <div
                    className={cn(
                      "h-full transition-all duration-200",
                      file.status === "completed"
                        ? "bg-green-500"
                        : file.status === "uploading"
                          ? "bg-blue-500"
                          : file.status === "failed"
                            ? "bg-red-500"
                            : file.status === "cancelled"
                              ? "bg-orange-500"
                              : "bg-gray-400",
                    )}
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {isDraggingAudio && (
          <div className="absolute inset-0 bg-gray-100/90 dark:bg-gray-800/90 rounded-lg flex flex-col items-center justify-center">
            <FileMusic className="h-8 w-8 text-primary mb-4" />
            <p className="text-sm font-medium text-center">Drop files to add more</p>
          </div>
        )}
      </div>
    )
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <div className="space-y-4">{renderScoreFilesList()}</div>
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground mb-4">
              Upload an audio file for your score (optional)
            </p>
            {renderAudioFilesList()}
          </div>
        )
      case 3:
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Done!</h3>
            <p className="text-center text-sm text-muted-foreground">Your files have been uploaded successfully.</p>
          </div>
        )
      default:
        return null
    }
  }

  const renderFooterButtons = () => {
    switch (currentStep) {
      case 1:
        return (
          <Button
            onClick={handleNextStep}
            disabled={scoreFiles.length === 0 || scoreFiles.some((f) => f.status === "uploading")}
            className="w-full"
          >
            Next
          </Button>
        )
      case 2:
        return (
          <>
            <Button variant="outline" onClick={handlePreviousStep} className="w-full">
              Back
            </Button>
            <Button
              onClick={handleNextStep}
              disabled={audioFiles.some((f) => f.status === "uploading")}
              className="w-full bg-black text-white hover:bg-gray-800 dark:bg-black dark:hover:bg-gray-800"
            >
              {audioFiles.length > 0 ? "Done" : "Skip"}
            </Button>
          </>
        )
      default:
        return null
    }
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-gray-50 dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle>Upload Score</DialogTitle>
          <DialogDescription>
            Step {currentStep} of {totalSteps}:{" "}
            {currentStep === 1 ? "Upload score file" : currentStep === 2 ? "Upload audio file (optional)" : "Complete"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar with light purple color and white gradient animation */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
          <div
            className="bg-purple-300 dark:bg-purple-400 h-full relative overflow-hidden rounded-full"
            style={{ width: `${progressPercentage}%`, transition: "width 0.35s ease-out" }}
          >
            <div
              className="absolute inset-0 w-full h-full animate-[gradient_8s_ease-in-out_infinite]"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                backgroundSize: "200% 100%",
                backgroundPosition: "100% 0",
              }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[200px]">{renderStepContent()}</div>

        {/* Footer buttons */}
        {currentStep < 3 && (
          <DialogFooter className="flex justify-between sm:justify-end gap-2">{renderFooterButtons()}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

