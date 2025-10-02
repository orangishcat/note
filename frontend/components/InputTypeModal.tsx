"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, Cable, Piano } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoreInputType } from "@/types/input-types";

interface InputTypeOption {
  id: ScoreInputType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const OPTIONS: InputTypeOption[] = [
  {
    id: "keyboard",
    title: "On-Screen Keyboard",
    description:
      "You can play on this but it's not recommended, get a MIDI keyboard or something",
    icon: Piano,
  },
  {
    id: "midi",
    title: "MIDI Keyboard",
    description: "Connect a MIDI device to record your performance",
    icon: Cable,
  },
  {
    id: "audio",
    title: "Audio Recording",
    description:
      "Use your device microphone to record performances (if this doesn't work check back later)",
    icon: Mic,
  },
];

interface InputTypeModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (input: ScoreInputType) => void;
  current?: ScoreInputType | null;
}

const InputTypeModal: React.FC<InputTypeModalProps> = ({
  open,
  onClose,
  onSelect,
  current,
}) => {
  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">
            Choose Input
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground">
            Select how you want to enter notes for this score. You can change
            this later from the dock.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = option.id === current;
            return (
              <Button
                key={option.id}
                type="button"
                variant="outline"
                className={cn(
                  "h-24 justify-start rounded-3xl border-2 text-left px-5 py-4 hover:scale-1" +
                    "transition-colors duration-75 bg-gray-50 dark:bg-gray-850",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted text-foreground hover:border-primary",
                )}
                onClick={() => {
                  onSelect(option.id);
                  onClose();
                }}
              >
                <Icon className="h-10 w-10 flex-shrink-0" />
                <span className="ml-4 flex flex-col">
                  <span className="text-lg font-semibold">{option.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InputTypeModal;
