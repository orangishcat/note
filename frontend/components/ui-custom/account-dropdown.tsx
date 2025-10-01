"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import React from "react";
import { logOut } from "@/lib/account";
import { User } from "lucide-react";
import { AccountContext } from "@/app/providers";
import { useQueryClient } from "@tanstack/react-query";
import log from "loglevel";

export default function AccountDropdown() {
  const qc = useQueryClient();
  const accountContext = React.useContext(AccountContext);
  if (!accountContext) return null;
  const { accountView, refreshAccount, setAccount } = accountContext;

  return accountView ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex flex-col items-end gap-0 p-2"
          variant="ghost"
          size="link"
        >
          <span className="text-md font-medium">{accountView.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuItem>
          <div className="flex items-center gap-3">
            <User className="text-2xl" />
            <div className="flex flex-col">
              <span className="text-lg font-medium">
                {accountView.username}
              </span>
              <span className="text-sm text-gray-500">{accountView.email}</span>
            </div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href="/app/settings" className="w-full hover:bg-gray-300/30">
            Settings
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            logOut().then(() => {
              log.debug("Logged out");
              void qc.invalidateQueries();
              setAccount(null);
              void refreshAccount();
            })
          }
          className="cursor-pointer hover:bg-gray-300/30"
        >
          <span className="text-primary-foreground text-md">Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;
}
