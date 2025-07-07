"use client";

import { useContext, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/layout";
import { AccountContext } from "@/app/providers";
import { useSearchParams } from "next/navigation";

export default function SettingsPage() {
  const params = useSearchParams();
  const initialTab = params.get("tab") || "account";
  const [tab, setTab] = useState(initialTab);
  const account = useContext(AccountContext)?.accountView;
  const { setTheme, resolvedTheme } = useTheme();
  const [loadAll, setLoadAll] = useState(false);
  const [verticalLoad, setVerticalLoad] = useState(false);

  useEffect(() => {
    setLoadAll(localStorage.getItem("score.displayAllPages") === "true");
    setVerticalLoad(localStorage.getItem("score.verticalLoad") === "true");
  }, []);

  const toggleLoadAll = () => {
    const newVal = !loadAll;
    setLoadAll(newVal);
    localStorage.setItem("score.displayAllPages", newVal ? "true" : "false");
    window.dispatchEvent(new Event("storage"));
  };

  const toggleVerticalLoad = () => {
    const newVal = !verticalLoad;
    setVerticalLoad(newVal);
    localStorage.setItem("score.verticalLoad", newVal ? "true" : "false");
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <Layout navbarContent={<span className="font-semibold">Settings</span>}>
      <div className="p-6 flex">
        <Tabs value={tab} onValueChange={setTab} className="flex w-full">
          <TabsList className="flex-col w-48 mr-8 space-y-2 bg-transparent p-0">
            <TabsTrigger className="w-full justify-start" value="account">
              Account
            </TabsTrigger>
            <TabsTrigger className="w-full justify-start" value="score">
              Score
            </TabsTrigger>
          </TabsList>
          <div className="flex-1">
            <TabsContent value="account" className="space-y-6">
              {account ? (
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Username
                    </label>
                    <Input defaultValue={account.username} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Email
                    </label>
                    <Input type="email" defaultValue={account.email} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Password
                    </label>
                    <Input type="password" placeholder="New password" />
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
            <TabsContent value="score" className="space-y-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={loadAll}
                  onChange={toggleLoadAll}
                />
                Scroll vertically (load all pages)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={verticalLoad}
                  onChange={toggleVerticalLoad}
                />
                Vertical loading bar
              </label>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </Layout>
  );
}
