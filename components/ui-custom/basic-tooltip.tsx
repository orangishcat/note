import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {TooltipArrow} from "@radix-ui/react-tooltip";
import {ReactNode} from "react";

export default function BasicTooltip({children, text}: {children: ReactNode, text: string}) {
  return <Tooltip>
          <TooltipTrigger asChild>
            {children}
          </TooltipTrigger>
          <TooltipContent>{text}<TooltipArrow className="fill-primary"/></TooltipContent>
        </Tooltip>
}