"use client";

import { useContext, useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  const containerRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);

  const scrollTo = (value: string) => {
    const ref = value === "score" ? scoreRef : accountRef;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setTab(vis[0].target.id);
      },
      { root: container, threshold: 0.3 },
    );
    if (accountRef.current) observer.observe(accountRef.current);
    if (scoreRef.current) observer.observe(scoreRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <Layout
      navbarContent={<span className="font-semibold">Settings</span>}
      hideSidebar
    >
      <div className="flex p-6">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            scrollTo(v);
          }}
          className="flex w-full"
        >
          <TabsList className="mr-8 flex w-56 flex-col gap-1 overflow-y-auto rounded-lg bg-gray-100 p-2 dark:bg-gray-850">
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
          <div ref={containerRef} className="flex-1 overflow-y-auto">
            <div ref={accountRef} id="account" className="space-y-6 pb-8">
              {account ? (
                <div className="max-w-md space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Username
                    </label>
                    <Input defaultValue={account.username} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Email
                    </label>
                    <Input type="email" defaultValue={account.email} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
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
            </div>
            <hr className="my-8" />
            <div ref={scoreRef} id="score" className="space-y-6 pb-8">
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
            </div>
          </div>
        </Tabs>
      </div>
    </Layout>
  );
}
