import {useQuery} from "@tanstack/react-query";

export function Get<T>(url: string, headers: Record<string, string> = {}) {
  return useQuery<T>({
    queryKey: [url],
    queryFn: async () => {
      const response = await fetch(url, {method: 'GET', headers});
      if (!response.ok) throw new Error(`GET request failed: ${response.statusText}`);
      return response.json();
    },
    retry: false,
  }).promise;
}

export async function Post<U>(url: string, data: U, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...headers},
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`POST request failed: ${response.statusText}`);
  return response.json();
}
