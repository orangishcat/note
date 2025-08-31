import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Check,
  CheckCircle,
  FileIcon,
  FileImage,
  FileMusic,
  FileText,
  Text,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AUDIO_FILE_TYPES,
  AUDIO_FILE_TYPES_TEXT,
  SCORE_FILE_TYPES,
} from "@/lib/constants";
import axios, { AxiosProgressEvent, type CancelTokenSource } from "axios";
import { Input } from "@/components/ui/input";
import api from "@/lib/network";
import log from "loglevel";

// Define file type selection options
type FileTypeOption = "mxl" | "image" | "not-selected";

// Update the UploadingFile interface to include file type information
interface UploadingFile {
  file: File;
  progress: number;
  id: string;
  cancelToken?: CancelTokenSource;
  status: "pending" | "uploading" | "completed" | "failed" | "cancelled";
  fileType?: "mxl" | "pdf" | "image" | "audio" | "other";
}

// Add metadata interface
interface ScoreMetadata {
  title: string;
  subtitle: string;
}

// Update the component to include metadata state and MXL tracking
export function UploadDialog({ onUpload }: { onUpload: () => void }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFileType, setSelectedFileType] =
    useState<FileTypeOption>("not-selected");
  const [scoreFiles, setScoreFiles] = useState<UploadingFile[]>([]);
  const [audioFiles, setAudioFiles] = useState<UploadingFile[]>([]);
  const [isDraggingScore, setIsDraggingScore] = useState(false);
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [uploadedFileNames, setUploadedFileNames] = useState<Set<string>>(
    new Set(),
  );
  const [hasMxlFile, setHasMxlFile] = useState(false);
  const [metadata, setMetadata] = useState<ScoreMetadata>({
    title: "",
    subtitle: "",
  });
  const scoreFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  // Update total steps to include file type selection step
  const totalSteps = 5;
  const progressPercentage = ((currentStep - 1) / (totalSteps - 1)) * 95 + 5;

  // Helper to determine file type
  const getFileType = (
    file: File,
  ): "mxl" | "pdf" | "image" | "audio" | "other" => {
    const name = file.name.toLowerCase();
    if (
      name.endsWith(".mxl") ||
      name.endsWith(".musicxml") ||
      name.endsWith(".xml")
    )
      return "mxl";
    if (name.endsWith(".pdf")) return "pdf";
    if (
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png")
    )
      return "image";
    if (name.endsWith(".mp3") || name.endsWith(".wav") || name.endsWith(".ogg"))
      return "audio";
    return "other";
  };

  // Get allowed file types based on selection
  const getAllowedScoreFileTypes = () => {
    if (selectedFileType === "mxl") {
      return [".mxl", ".musicxml", ".xml"];
    } else if (selectedFileType === "image") {
      return [".pdf", ".png", ".jpg", ".jpeg"];
    }
    return SCORE_FILE_TYPES;
  };

  // Update the uploadFile function to check for MXL files
  const uploadFile = async (file: File, fileId: string, isAudio = false) => {
    // Get file type
    const fileType = getFileType(file);

    // Check if file with same name is already uploaded or uploading
    if (uploadedFileNames.has(file.name)) {
      if (isAudio) {
        setAudioFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: "failed", progress: -1 } : f,
          ),
        );
      } else {
        setScoreFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: "failed", progress: -1 } : f,
          ),
        );
      }
      return;
    }

    // Block MXL upload if one already exists
    if (!isAudio && fileType === "mxl" && hasMxlFile) {
      setScoreFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, status: "failed", progress: -1, fileType }
            : f,
        ),
      );
      return;
    }

    // Add to uploaded files set
    setUploadedFileNames((prev) => new Set(prev).add(file.name));

    // Update MXL tracking
    if (!isAudio && fileType === "mxl") {
      setHasMxlFile(true);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", isAudio ? "audio" : "score");

    // Create cancel token
    const cancelToken = axios.CancelToken.source();

    // Update file with cancel token and file type
    if (isAudio) {
      setAudioFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, cancelToken, status: "uploading", fileType }
            : f,
        ),
      );
    } else {
      setScoreFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, cancelToken, status: "uploading", fileType }
            : f,
        ),
      );
    }

    try {
      // noinspection JSUnusedGlobalSymbols
      await api.post("/score/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        cancelToken: cancelToken.token,
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            if (isAudio) {
              setAudioFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId
                    ? {
                        ...f,
                        progress,
                        status: progress === 100 ? "completed" : "uploading",
                      }
                    : f,
                ),
              );
            } else {
              setScoreFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId
                    ? {
                        ...f,
                        progress,
                        status: progress === 100 ? "completed" : "uploading",
                      }
                    : f,
                ),
              );
            }
          }
        },
      });

      // Mark as completed
      if (isAudio) {
        setAudioFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  progress: 100,
                  status: "completed",
                }
              : f,
          ),
        );
      } else {
        setScoreFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  progress: 100,
                  status: "completed",
                }
              : f,
          ),
        );
      }
    } catch (error) {
      log.error("Upload failed:", error);

      // Check if it was cancelled
      if (axios.isCancel(error)) {
        if (isAudio) {
          setAudioFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, status: "cancelled" } : f,
            ),
          );
        } else {
          setScoreFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, status: "cancelled" } : f,
            ),
          );
        }
      } else {
        // Other error
        if (isAudio) {
          setAudioFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? {
                    ...f,
                    progress: -1,
                    status: "failed",
                  }
                : f,
            ),
          );
        } else {
          setScoreFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? {
                    ...f,
                    progress: -1,
                    status: "failed",
                  }
                : f,
            ),
          );
        }
      }

      // Remove from uploaded files set
      setUploadedFileNames((prev) => {
        const newSet = new Set(prev);
        newSet.delete(file.name);
        return newSet;
      });

      // Update MXL tracking if needed
      if (!isAudio && fileType === "mxl") {
        // Check if there are any other MXL files
        const hasMxl = scoreFiles.some(
          (f) =>
            f.id !== fileId &&
            f.fileType === "mxl" &&
            (f.status === "completed" || f.status === "uploading"),
        );
        setHasMxlFile(hasMxl);
      }
    }
  };

  // Update the cancelUpload function to handle MXL tracking
  const cancelUpload = async (fileId: string, isAudio = false) => {
    let fileToCancel: UploadingFile | undefined;

    if (isAudio) {
      fileToCancel = audioFiles.find((f) => f.id === fileId);
      if (fileToCancel) {
        // Cancel the axios request if it's in progress
        if (fileToCancel.cancelToken && fileToCancel.status === "uploading") {
          fileToCancel.cancelToken.cancel("Upload cancelled by user");
        }

        // Update status
        setAudioFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: "cancelled" } : f,
          ),
        );
      }
    } else {
      fileToCancel = scoreFiles.find((f) => f.id === fileId);
      if (fileToCancel) {
        // Cancel the axios request if it's in progress
        if (fileToCancel.cancelToken && fileToCancel.status === "uploading") {
          fileToCancel.cancelToken.cancel("Upload cancelled by user");
        }

        // Update status
        setScoreFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: "cancelled" } : f,
          ),
        );

        // Update MXL tracking if needed
        if (fileToCancel.fileType === "mxl") setHasMxlFile(false);
      }
    }

    // Make API call to cancel on server
    if (fileToCancel) {
      try {
        await api.post("/score/cancel-upload", {
          file_name: fileToCancel.file.name,
        });

        // Remove from uploaded files set
        setUploadedFileNames((prev) => {
          const newSet = new Set(prev);
          newSet.delete(fileToCancel!.file.name);
          return newSet;
        });
      } catch (error) {
        log.error("Failed to cancel upload on server:", error);
      }
    }
  };

  const isValidScoreFileType = (file: File) => {
    const allowedTypes = getAllowedScoreFileTypes();
    return allowedTypes.some((type) => file.name.toLowerCase().endsWith(type));
  };

  const isValidAudioFileType = (file: File) => {
    return AUDIO_FILE_TYPES.some((type) =>
      file.name.toLowerCase().endsWith(type),
    );
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.toLowerCase().endsWith(".pdf")) {
      return <FileText className="h-4 w-4 text-red-500" />;
    } else if (
      fileName.toLowerCase().endsWith(".png") ||
      fileName.toLowerCase().endsWith(".jpg") ||
      fileName.toLowerCase().endsWith(".jpeg")
    ) {
      return <FileImage className="h-4 w-4 text-blue-500" />;
    } else {
      return <FileIcon className="h-4 w-4 text-accent-500" />;
    }
  };

  const handleScoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(isValidScoreFileType);
      addScoreFiles(newFiles);
    }
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(isValidAudioFileType);
      addAudioFiles(newFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent, isAudio = false) => {
    e.preventDefault();
    if (isAudio) {
      setIsDraggingAudio(true);
    } else {
      setIsDraggingScore(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent, isAudio = false) => {
    e.preventDefault();
    if (isAudio) {
      setIsDraggingAudio(false);
    } else {
      setIsDraggingScore(false);
    }
  };

  const handleScoreFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingScore(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      isValidScoreFileType,
    );
    if (droppedFiles.length === 0) {
      // Could add a toast notification here for invalid file types
      return;
    }
    addScoreFiles(droppedFiles);
  };

  const handleAudioFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAudio(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      isValidAudioFileType,
    );
    if (droppedFiles.length === 0) {
      // Could add a toast notification here for invalid file types
      return;
    }
    addAudioFiles(droppedFiles);
  };

  // Update addScoreFiles to include file type detection
  const addScoreFiles = (newFiles: File[]) => {
    // Check if adding an MXL file when one already exists
    const hasMxlInNewFiles = newFiles.some(
      (file) => getFileType(file) === "mxl",
    );

    if (hasMxlInNewFiles && hasMxlFile) {
      // Filter out MXL files if one already exists
      newFiles = newFiles.filter((file) => getFileType(file) !== "mxl");

      // Show an alert or toast notification
      alert("Only one MXL file can be uploaded at a time.");

      // If no files left after filtering, return
      if (newFiles.length === 0) return;
    }

    const uploadingFiles = newFiles.map((file) => {
      const fileType = getFileType(file);
      return {
        file,
        progress: 0,
        id: `upload-${Date.now()}-${file.name}`,
        status: "pending" as const,
        fileType,
      };
    });

    // Set the first file's name as the default title
    if (uploadingFiles.length > 0 && metadata.title === "") {
      const fileName = uploadingFiles[0].file.name;
      // Remove extension from filename
      const titleWithoutExtension =
        fileName.substring(0, fileName.lastIndexOf(".")) || fileName;
      setMetadata((prev) => ({ ...prev, title: titleWithoutExtension }));
    }

    setScoreFiles((prev) => [...prev, ...uploadingFiles]);

    // Start uploading immediately
    uploadingFiles.forEach((file) => {
      uploadFile(file.file, file.id, false);
    });
  };

  // Modified: start upload immediately after adding files
  const addAudioFiles = (newFiles: File[]) => {
    const uploadingFiles = newFiles.map((file) => ({
      file,
      progress: 0,
      id: `upload-${Date.now()}-${file.name}`,
      status: "pending" as const,
    }));

    setAudioFiles((prev) => [...prev, ...uploadingFiles]);

    // Start uploading immediately
    uploadingFiles.forEach((file) => {
      uploadFile(file.file, file.id, true);
    });
  };

  const removeScoreFile = (fileId: string) => {
    const file = scoreFiles.find((f) => f.id === fileId);
    if (file) {
      // If file is uploading, cancel it first
      if (file.status === "uploading") {
        cancelUpload(fileId);
      }

      // Remove from uploaded files set if it was completed
      if (file.status === "completed") {
        setUploadedFileNames((prev) => {
          const newSet = new Set(prev);
          newSet.delete(file.file.name);
          return newSet;
        });
        api.post("/score/cancel-upload", { file_name: file.file.name });
      }

      // Remove from list
      setScoreFiles((prev) => prev.filter((f) => f.id !== fileId));
      setHasMxlFile(false);
    }
  };

  const removeAudioFile = (fileId: string) => {
    const file = audioFiles.find((f) => f.id === fileId);
    if (file) {
      // If file is uploading, cancel it first
      if (file.status === "uploading") {
        cancelUpload(fileId, true);
      }

      // Remove from uploaded files set if it was completed
      if (file.status === "completed") {
        setUploadedFileNames((prev) => {
          const newSet = new Set(prev);
          newSet.delete(file.file.name);
          return newSet;
        });
      }

      // Remove from list
      setAudioFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
  };

  const openScoreFileSelector = () => {
    scoreFileInputRef.current?.click();
  };

  const openAudioFileSelector = () => {
    audioFileInputRef.current?.click();
  };

  // Update the reset function to clear metadata and MXL tracking
  useEffect(() => {
    if (!isComplete) return;

    const timer = setTimeout(() => {
      setIsDialogOpen(false);
      setIsComplete(false);
      setCurrentStep(1);
      setScoreFiles([]);
      onUpload();
      setAudioFiles([]);
      setUploadedFileNames(new Set());
      setHasMxlFile(false);
      setSelectedFileType("not-selected");
      setMetadata({ title: "", subtitle: "" });
      setSubmitError("");
    }, 1000);

    return () => clearTimeout(timer);
  }, [isComplete, onUpload]);

  // Add state for tracking submission status and errors
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Update the handleNextStep function to handle the file type selection step
  const handleNextStep = async () => {
    if (currentStep === 1 && selectedFileType === "not-selected") {
      alert("Please select a file type");
      return;
    }

    if (
      currentStep === 2 &&
      scoreFiles.filter((f) => f.status === "completed").length === 0
    ) {
      return; // Don't proceed if no score files are selected
    }

    if (currentStep === 4) {
      if (metadata.title.trim() === "") {
        alert("Please enter a title for your score");
        return;
      }

      // Create a list of filenames from the scoreFiles in the visual order
      const fileNames = scoreFiles.map((file) => file.file.name);

      try {
        setIsSubmitting(true);
        await api.post("/score/confirm-upload", {
          title: metadata.title,
          subtitle: metadata.subtitle,
          fileType: selectedFileType,
          ref_order: fileNames,
        });

        setIsComplete(true);
        setCurrentStep(currentStep + 1);
        setIsSubmitting(false);
      } catch (error) {
        log.error("Failed to confirm upload:", error);
        setIsSubmitting(false);
        setSubmitError("Failed to confirm upload. Please try again.");
      }
      return;
    }

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getStatusText = (status: string, progress: number) => {
    switch (status) {
      case "completed":
        return <Check className="h-4 w-4 text-green-500" />;
      case "uploading":
        return <span className="text-xs text-blue-500">{progress}%</span>;
      case "failed":
        return <span className="text-xs text-red-500">Failed</span>;
      case "cancelled":
        return <span className="text-xs text-orange-500">Cancelled</span>;
      default:
        return <span className="text-xs text-muted-foreground">Pending</span>;
    }
  };

  const getFileSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toPrecision(3) + "MB";
    if (bytes > 1024) return (bytes / 1024).toPrecision(3) + "KB";
    return bytes.toPrecision(3) + " bytes";
  };

  // Add a new function to render the file type selection step
  const renderFileTypeSelectionStep = () => {
    return (
      <div className="space-y-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setSelectedFileType("mxl")}
            className={cn(
              "flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed transition-colors",
              selectedFileType === "mxl"
                ? "border-accent-400 bg-accent-50 dark:bg-accent-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500",
            )}
          >
            <FileIcon className="h-12 w-12 mb-3 text-accent-500" />
            <span className="font-medium">MusicXML</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              MXL, XML files
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedFileType("image")}
            className={cn(
              "flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed transition-colors",
              selectedFileType === "image"
                ? "border-accent-400 bg-accent-50 dark:bg-accent-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500",
            )}
          >
            <FileImage className="h-12 w-12 mb-3 text-blue-500" />
            <span className="font-medium">Images & PDF</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              PDF, PNG, JPG files
            </span>
          </button>
        </div>

        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
          {selectedFileType === "mxl"
            ? "MusicXML files contain structured music notation scores."
            : selectedFileType === "image"
              ? "Images and PDFs will be combined into a single score."
              : "Select the type of file you want to upload."}
        </p>
      </div>
    );
  };

  // Add a new function to render the metadata step
  const renderMetadataStep = () => {
    return (
      <div className="space-y-4 py-2">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="score-title"
              className="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-400"
            >
              Title
            </label>
            <div className="relative">
              <Text className="absolute left-3 top-1/2 transform -translate-y-1/2" />
              <Input
                id="score-title"
                type="text"
                name="score-title"
                value={metadata.title}
                onChange={(e) =>
                  setMetadata((prev) => ({ ...prev, title: e.target.value }))
                }
                className="w-full pl-11 pr-2 py-5 border rounded-md dark:bg-gray-900"
                placeholder="Enter score title"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="score-subtitle"
              className="block text-sm font-medium mb-1 text-gray-600 dark:text-gray-400"
            >
              Subtitle (optional)
            </label>
            <div className="relative">
              <Text className="absolute left-3 top-1/2 transform -translate-y-1/2" />
              <Input
                id="score-subtitle"
                type="text"
                name="score-subtitle"
                value={metadata.subtitle}
                onChange={(e) =>
                  setMetadata((prev) => ({ ...prev, subtitle: e.target.value }))
                }
                className="w-full pl-11 pr-2 py-5 border rounded-md dark:bg-gray-900"
                placeholder="Enter subtitle or composer"
                disabled={isSubmitting}
              />
            </div>
          </div>
          {submitError && (
            <div className="mt-2 text-sm text-red-500">{submitError}</div>
          )}
        </div>
      </div>
    );
  };

  // Update renderScoreUploadArea to include the message about combining files
  const renderScoreUploadArea = () => {
    const allowedTypes = getAllowedScoreFileTypes();
    const allowedTypesText = allowedTypes
      .map((t) => t.substring(1).toUpperCase())
      .join(", ");

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
          accept={getAllowedScoreFileTypes().join(",")}
          onChange={handleScoreFileChange}
          className="hidden"
          multiple
        />

        <Upload className="h-8 w-8 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground text-center">
          Drag and drop your files here, or use the&nbsp;
          <button
            type="button"
            onClick={openScoreFileSelector}
            className="text-primary hover:underline"
          >
            file browser
          </button>
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Supports {allowedTypesText} files
        </p>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {selectedFileType === "mxl"
            ? "Only one MXL file can be uploaded at a time."
            : "All images and PDFs will be combined into a single score."}
        </p>

        {isDraggingScore && (
          <div className="absolute inset-0 bg-gray-100/90 dark:bg-gray-800/90 rounded-lg flex flex-col items-center justify-center">
            <Upload className="h-8 w-8 text-primary mb-4" />
            <p className="text-sm font-medium text-center">Drop files to add</p>
          </div>
        )}
      </div>
    );
  };

  const renderScoreFilesList = () => {
    if (scoreFiles.length === 0) return renderScoreUploadArea();

    return (
      <div
        className={cn(
          "w-full space-y-3 mt-4 relative",
          isDraggingScore &&
            "border-2 border-dashed border-primary rounded-lg p-4",
        )}
        onDragOver={(e) => handleDragOver(e)}
        onDragLeave={(e) => handleDragLeave(e)}
        onDrop={handleScoreFileDrop}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Files to upload</h3>
          <div className="flex items-center gap-2">
            {
              <button
                onClick={openScoreFileSelector}
                className="text-xs text-primary hover:underline"
              >
                Add more
              </button>
            }
            <button
              onClick={() => {
                // Cancel all uploading files
                scoreFiles.forEach((file) => {
                  if (file.status === "uploading") {
                    cancelUpload(file.id);
                  }
                });
                // Clear the list
                setScoreFiles([]);
                // Clear uploaded file names
                setUploadedFileNames(new Set());
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="h-64 overflow-y-auto flex flex-col gap-4">
          {scoreFiles.map((file) => (
            <div
              key={file.id}
              className="relative bg-gray-50 dark:bg-gray-700 rounded-lg p-3 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-1">
                {getFileIcon(file.file.name)}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium truncate dark:text-gray-200">
                      {file.file.name}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {getFileSize(file.file.size)}
                      </span>
                      {getStatusText(file.status, file.progress)}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 p-0 hover:bg-transparent"
                        onClick={() =>
                          file.status === "uploading"
                            ? cancelUpload(file.id)
                            : removeScoreFile(file.id)
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
        </div>

        {isDraggingScore && (
          <div className="absolute inset-0 bg-gray-100/90 dark:bg-gray-800/90 rounded-lg flex flex-col items-center justify-center">
            <Upload className="h-8 w-8 text-primary mb-4" />
            <p className="text-sm font-medium text-center">
              Drop files to add more
            </p>
          </div>
        )}
      </div>
    );
  };

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
          accept={AUDIO_FILE_TYPES.join(",")}
          onChange={handleAudioFileChange}
          className="hidden"
        />

        <FileMusic className="h-8 w-8 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground text-center">
          Add an audio file&nbsp;
          <button
            type="button"
            onClick={openAudioFileSelector}
            className="text-primary hover:underline"
          >
            [file browser]
          </button>
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Supports {AUDIO_FILE_TYPES_TEXT} files
        </p>

        {isDraggingAudio && (
          <div className="absolute inset-0 bg-gray-100/90 dark:bg-gray-800/90 rounded-lg flex flex-col items-center justify-center">
            <FileMusic className="h-8 w-8 text-primary mb-4" />
            <p className="text-sm font-medium text-center">Drop files to add</p>
          </div>
        )}
      </div>
    );
  };

  const renderAudioFilesList = () => {
    if (audioFiles.length === 0) return renderAudioUploadArea();

    return (
      <div
        className={cn(
          "w-full space-y-3 mt-4 relative",
          isDraggingAudio &&
            "border-2 border-dashed border-primary rounded-lg p-4",
        )}
        onDragOver={(e) => handleDragOver(e, true)}
        onDragLeave={(e) => handleDragLeave(e, true)}
        onDrop={handleAudioFileDrop}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Audio files</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={openAudioFileSelector}
              className="text-xs text-primary hover:underline"
            >
              Add more
            </button>
            <button
              onClick={() => {
                // Cancel all uploading files
                audioFiles.forEach((file) => {
                  if (file.status === "uploading") {
                    cancelUpload(file.id, true);
                  }
                });
                // Clear the list
                setAudioFiles([]);
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Clear all
            </button>
          </div>
        </div>
        {audioFiles.map((file) => (
          <div
            key={file.id}
            className="relative bg-gray-50 dark:bg-gray-700 rounded-lg p-3 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-1">
              <FileMusic className="h-4 w-4 text-orange-500" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium truncate dark:text-gray-200">
                    {file.file.name}
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {getFileSize(file.file.size)}
                    </span>
                    {getStatusText(file.status, file.progress)}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0 hover:bg-transparent"
                      onClick={() =>
                        file.status === "uploading"
                          ? cancelUpload(file.id, true)
                          : removeAudioFile(file.id)
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
            <p className="text-sm font-medium text-center">
              Drop files to add more
            </p>
          </div>
        )}
      </div>
    );
  };

  // Update renderStepContent to include the file type selection step
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return renderFileTypeSelectionStep();
      case 2:
        return <div className="space-y-4">{renderScoreFilesList()}</div>;
      case 3:
        return <div className="space-y-4">{renderAudioFilesList()}</div>;
      case 4:
        return renderMetadataStep();
      case 5:
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Done!</h3>
            <p className="text-center text-sm text-muted-foreground">
              Your files have been uploaded successfully.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  // Update renderFooterButtons to handle the file type selection step
  const renderFooterButtons = () => {
    switch (currentStep) {
      case 1:
        return (
          <Button
            onClick={handleNextStep}
            disabled={selectedFileType === "not-selected"}
            className="w-full"
          >
            Next
          </Button>
        );
      case 2:
        return (
          <>
            <Button
              variant="outline"
              onClick={handlePreviousStep}
              className="w-full"
            >
              Back
            </Button>
            <Button
              onClick={handleNextStep}
              disabled={
                scoreFiles.length === 0 ||
                scoreFiles.some((f) => f.status === "uploading")
              }
              className="w-full"
            >
              Next
            </Button>
          </>
        );
      case 3:
        return (
          <>
            <Button
              variant="outline"
              onClick={handlePreviousStep}
              className="w-full"
            >
              Back
            </Button>
            <Button
              onClick={handleNextStep}
              disabled={audioFiles.some((f) => f.status === "uploading")}
              className="w-full bg-black text-white hover:bg-gray-200 dark:bg-black dark:hover:bg-gray-700"
            >
              {audioFiles.length > 0 ? "Next" : "Skip"}
            </Button>
          </>
        );
      case 4:
        return (
          <>
            <Button
              variant="outline"
              onClick={handlePreviousStep}
              className="w-full"
              disabled={isSubmitting}
            >
              Back
            </Button>
            <Button
              onClick={handleNextStep}
              disabled={metadata.title.trim() === "" || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? "Loading..." : "Finish"}
            </Button>
          </>
        );
      default:
        return null;
    }
  };

  // Get the current step description
  const getStepDescription = () => {
    switch (currentStep) {
      case 1:
        return "Choose file type";
      case 2:
        return "Upload score file";
      case 3:
        return "Upload audio file (highly recommended)";
      case 4:
        return "Enter metadata";
      case 5:
        return "Complete";
      default:
        return "";
    }
  };

  // Update the DialogDescription to include the file type selection step
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
            Step {currentStep} of {totalSteps}: {getStepDescription()}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar with light purple color and white gradient animation */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
          <div
            className="bg-accent-300 dark:bg-accent-400 h-full relative overflow-hidden rounded-full"
            style={{
              width: `${progressPercentage}%`,
              transition: "width 0.35s ease-out",
            }}
          >
            <div
              className="absolute inset-0 w-full h-full animate-[gradient_4s_ease-in-out_infinite]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                backgroundSize: "200% 100%",
                backgroundPosition: "100% 0",
              }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[200px]">{renderStepContent()}</div>

        {/* Footer buttons */}
        {currentStep < 5 && (
          <DialogFooter className="flex justify-between sm:justify-end gap-2">
            {renderFooterButtons()}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
