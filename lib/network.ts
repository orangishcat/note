"use client"

export async function Get<T>(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {method: 'GET', headers});
  if (!response.ok) throw new Error(`GET request ${response.status}: ${JSON.stringify(await response.json())}`);
  return await response.json() as T;
}

export async function Post<T>(url: string, data: object = {}, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: data instanceof FormData ? {...headers} : {'Content-Type': 'application/json', ...headers},
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`POST request ${response.status}: ${JSON.stringify(await response.json())}`);
  return await response.json() as T;
}
