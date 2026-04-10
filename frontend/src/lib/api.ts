import { clearAuthToken, getAuthToken } from "@/lib/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    headers,
    ...init
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const errorBody = (await response.json()) as { message?: string; issues?: Array<{ message?: string; path?: Array<string | number> }> };
      const detail = errorBody.issues?.[0]
        ? `${errorBody.issues[0].path?.join(".")}: ${errorBody.issues[0].message}`
        : errorBody.message;
      throw new Error(detail || "Request failed");
    }

    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined
    }),
  delete: (path: string) =>
    request<void>(path, {
      method: "DELETE"
    })
};
