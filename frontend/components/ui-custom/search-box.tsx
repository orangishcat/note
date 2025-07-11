import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import React from "react";

export default function SearchBox() {
  return (
    <div className="relative w-64 lg:w-96 p-1.5 hover:scale-105 transition-transform">
      <Search className="absolute left-4 top-4 h-4 w-4 text-gray-500 dark:text-gray-400" />
      <Input
        type="search"
        name="search"
        autoComplete="off"
        placeholder="Search files..."
        className="pl-9 dark:bg-gray-800 dark:text-white"
      />
    </div>
  );
}
