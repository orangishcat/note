"use client";

import { useContext, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, FileText } from "lucide-react";
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

  const tabs = [
    { value: "account", label: "Account", icon: <User className="h-4 w-4" /> },
    { value: "score", label: "Score", icon: <FileText className="h-4 w-4" /> },
  ];

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.value === tab);
    if (e.deltaY > 0 && index < tabs.length - 1) {
      setTab(tabs[index + 1].value);
    } else if (e.deltaY < 0 && index > 0) {
      setTab(tabs[index - 1].value);
    }
  };

  return (
    <Layout
      navbarContent={<span className="font-semibold">Settings</span>}
      hideSidebar
    >
      <div className="flex p-6">
        <Tabs value={tab} onValueChange={setTab} className="flex w-full">
          <TabsList
            onWheel={handleWheel}
            className="flex max-h-[calc(100vh-5rem)] w-56 flex-col gap-1 overflow-y-auto rounded-lg bg-gray-100 p-2 dark:bg-gray-850 mr-8"
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                className="flex w-full items-center gap-3 justify-start rounded-md px-3 py-2 text-sm data-[state=active]:bg-accent-100 data-[state=active]:text-accent-800 dark:data-[state=active]:bg-accent-700 dark:data-[state=active]:text-white"
                value={t.value}
              >
                {t.icon}
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex-1 overflow-y-auto">
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
