import { clearAuthToken, getAuthToken } from "@/lib/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

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
      throw new ApiError(response.status, detail || "Request failed");
    }

    const message = await response.text();
    throw new ApiError(response.status, message || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function extractFilename(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const standardMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return standardMatch?.[1] ?? fallback;
}

async function download(path: string, init?: RequestInit) {
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
      const errorBody = (await response.json()) as { message?: string };
      throw new ApiError(response.status, errorBody.message || "Download failed");
    }

    throw new ApiError(response.status, (await response.text()) || "Download failed");
  }

  const blob = await response.blob();
  const filename = extractFilename(response.headers.get("content-disposition"), "download.bin");
  return { blob, filename };
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
    }),
  download: (path: string, body?: unknown, method: "GET" | "POST" = "POST") =>
    download(path, {
      method,
      body: body ? JSON.stringify(body) : undefined
    })
};
