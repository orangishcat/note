import { router } from "next/client";

export default function Logo() {
  return (
    <a
      onClick={() => router.push(location.href.includes("/app") ? "/app" : "/")}
    >
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Note</h1>
    </a>
  );
}
