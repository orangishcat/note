"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Laptop2, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountContext } from "@/app/providers";
import { Layout } from "@/components/layout";

export default function SettingsPage() {
  const account = useContext(AccountContext)?.accountView;
  const { setTheme } = useTheme();
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
  const containerRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);

  return (
    <Layout>
      <div className="flex flex-col place-items-center justify-center">
        <div ref={containerRef} className="flex-1 overflow-y-auto p-6">
          <h1 className="text-2xl pb-6 text-center">Account settings</h1>
          <div ref={accountRef} id="account" className="space-y-8">
            {account ? (
              <div className="max-w-md space-y-6">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Username
                  </label>
                  <Input disabled value={account.username} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Email
                  </label>
                  <Input type="email" disabled value={account.email} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Password
                  </label>
                  <Input
                    type="password"
                    disabled
                    value="insert password here"
                    className="mb-4"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Login to view account information.
              </p>
            )}

            <div className="flex items-center gap-4">
              <span>Theme</span>
              <Button
                onClick={() => setTheme("light")}
                size="sm"
                className="px-5 py-3 flex items-center gap-2"
              >
                <Sun className="h-4 w-4" /> Light
              </Button>
              <Button
                onClick={() => setTheme("dark")}
                size="sm"
                className="px-5 py-3 flex items-center gap-2"
              >
                <Moon className="h-4 w-4" /> Dark
              </Button>
              <Button
                onClick={() => setTheme("system")}
                size="sm"
                className="px-5 py-3 flex items-center gap-2"
              >
                <Laptop2 className="h-4 w-4" /> Sync
              </Button>
            </div>
          </div>
          <hr className="my-8" />
          <h1 className="text-2xl pb-6 text-center">Score settings</h1>
          <div ref={scoreRef} id="score" className="space-y-6">
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
      </div>
    </Layout>
  );
}
