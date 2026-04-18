import { isLikelyNetworkError } from "@/lib/network";

export class RequestTimeoutError extends Error {
  constructor(message = "Request timed out.") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

export async function withTimeout<T>(
  task: PromiseLike<T> | T,
  timeoutMs: number,
  message = "Request timed out."
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new RequestTimeoutError(message)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(task), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function getUserFacingErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again."
) {
  if (error instanceof RequestTimeoutError) {
    return "The request took too long. Please try again.";
  }

  if (isLikelyNetworkError(error)) {
    return "We couldn't reach the server. If you're offline, your catch can still be saved locally.";
  }

  const message = String(
    (error as { message?: string } | null | undefined)?.message ?? ""
  ).trim();

  return message || fallback;
}
