import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {TooltipArrow} from "@radix-ui/react-tooltip";
import React from "react";

export default function NotImplementedTooltip({children}: { children: React.ReactNode }) {
  return (
    <Tooltip>
    <TooltipTrigger asChild>
      <span tabIndex={-1}>
        {children}
      </span>
    </TooltipTrigger>
    <TooltipContent>
      Coming soon!
      <TooltipArrow className="fill-primary"/>
    </TooltipContent>
  </Tooltip>
  )
}