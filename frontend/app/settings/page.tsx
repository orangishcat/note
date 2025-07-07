"use client";

import { useContext, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AccountContext } from "@/app/providers";
import { useSearchParams } from "next/navigation";

export default function SettingsPage() {
  const params = useSearchParams();
  const initialTab = params.get("tab") || "account";
  const [tab, setTab] = useState(initialTab);
  const account = useContext(AccountContext)?.accountView;
  const { setTheme, resolvedTheme } = useTheme();
  const [loadAll, setLoadAll] = useState(false);

  useEffect(() => {
    setLoadAll(localStorage.getItem("score.displayAllPages") === "true");
  }, []);

  const toggleLoadAll = () => {
    const newVal = !loadAll;
    setLoadAll(newVal);
    localStorage.setItem("score.displayAllPages", newVal ? "true" : "false");
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="score">Score</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="mt-4 space-y-4">
          {account ? (
            <div className="space-y-2">
              <div className="text-lg font-medium">{account.username}</div>
              <div className="text-sm text-muted-foreground">
                {account.email}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Login to view account information.
            </p>
          )}
          <div className="flex items-center gap-2">
            <span>Theme</span>
            <Button
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              size="sm"
            >
              {resolvedTheme === "dark" ? "Light" : "Dark"}
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="score" className="mt-4 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={loadAll} onChange={toggleLoadAll} />
            Load all pages and scroll vertically
          </label>
        </TabsContent>
      </Tabs>
    </div>
  );
}
