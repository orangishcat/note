import {Search} from "lucide-react";
import {Input} from "@/components/ui/input";
import React from "react";

export default function SearchBox() {
  return <div className="relative w-64 lg:w-96">
    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400"/>
    <Input
      type="search"
      placeholder="Search files..."
      className="pl-9 dark:bg-gray-800 dark:text-white"
    />
  </div>
}