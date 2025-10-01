"use client";
import React, { useContext } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { AccountContext, AuthModalContext } from "./providers";
import Link from "next/link";

export default function Home() {
  const auth = useContext(AuthModalContext);
  const account = useContext(AccountContext);
  if (!account) throw new Error("Account context missing");
  if (!auth) throw new Error("Auth context missing");
  return (
    <Layout>
      <div className="container mx-auto flex flex-col items-center justify-center py-20 gap-8 text-center">
        <h1 className="text-4xl font-bold">Welcome to Note</h1>
        <p className="max-w-prose text-lg text-gray-700 dark:text-gray-300">
          What if piano was a rhythm game?
        </p>
        {account.accountView ? (
          <Link href="/app">
            <Button>Dashboard</Button>
          </Link>
        ) : (
          <div className="flex gap-4">
            <Button onClick={() => auth.openAuthModal("signup")}>
              Sign Up
            </Button>
            <Button
              variant="secondary"
              onClick={() => auth.openAuthModal("login")}
            >
              Log In
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
