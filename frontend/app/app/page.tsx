"use client";

import FileManager from "./file-manager";
import { Layout } from "@/components/layout";
import SearchBox from "@/components/ui-custom/search-box";

export default function Page() {
  return (
    <Layout showSidebar={true} navbarContent={<SearchBox />}>
      <FileManager />
    </Layout>
  );
}
