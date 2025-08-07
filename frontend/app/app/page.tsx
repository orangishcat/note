"use client";

import FileManager from "./file-manager";
import { Layout } from "@/components/layout";
import SearchBox from "@/components/ui-custom/search-box";
import { Suspense } from "react";

export default function Page() {
  return (
    <Layout navbarContent={<SearchBox />}>
      <Suspense>
        <FileManager />
      </Suspense>
    </Layout>
  );
}
