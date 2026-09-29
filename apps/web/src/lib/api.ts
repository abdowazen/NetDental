import type { ApiErrorBody, ErrorCode } from "@clinic/shared";
let activeRoom: number | null = null;
export function setApiRoom(roomId: number | null) {
  activeRoom = roomId;
}
export class ApiError extends Error {
  constructor(
    public code: ErrorCode | "NETWORK_ERROR",
    public status = 0,
  ) {
    super(code);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      signal: options.signal ?? AbortSignal.timeout(8000),
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        "X-Clinic-Request": "1",
        ...(activeRoom ? { "X-Clinic-Room": String(activeRoom) } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    window.dispatchEvent(new Event("clinic:unavailable"));
    throw new ApiError("NETWORK_ERROR");
  }
  if (!response.ok) {
    const data = (await response
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    if (response.status >= 500)
      window.dispatchEvent(new Event("clinic:unavailable"));
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    )
      window.dispatchEvent(new Event("clinic:unauthorized"));
    throw new ApiError(data?.error?.code ?? "INTERNAL_ERROR", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      signal: signal ?? AbortSignal.timeout(8000),
      headers: {
        "X-Clinic-Request": "1",
        ...(activeRoom ? { "X-Clinic-Room": String(activeRoom) } : {}),
      },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("NETWORK_ERROR");
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(data?.error?.code ?? "INTERNAL_ERROR", response.status);
  }
  return response.blob();
}
export const errorKey = (error: unknown) =>
  error instanceof ApiError ? error.code : "INTERNAL_ERROR";
