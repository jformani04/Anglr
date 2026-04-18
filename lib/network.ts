import { AppState, AppStateStatus } from "react-native";
import { supabaseUrl } from "@/lib/supabase";

type NetworkListener = (isOnline: boolean) => void;

const listeners = new Set<NetworkListener>();

let currentStatus: boolean | null = null;
let monitorCount = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

async function probeBackend(timeoutMs = 5000): Promise<boolean> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "HEAD",
      signal: controller?.signal,
    });

    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function emitStatus(nextStatus: boolean) {
  if (currentStatus === nextStatus) return;
  currentStatus = nextStatus;
  listeners.forEach((listener) => listener(nextStatus));
}

export async function refreshNetworkStatus(timeoutMs = 5000): Promise<boolean> {
  const nextStatus = await probeBackend(timeoutMs);
  emitStatus(nextStatus);
  return nextStatus;
}

export function getLastKnownNetworkStatus() {
  return currentStatus;
}

export function subscribeToNetworkStatus(listener: NetworkListener) {
  listeners.add(listener);
  if (currentStatus !== null) {
    listener(currentStatus);
  }

  return () => {
    listeners.delete(listener);
  };
}

export function startNetworkMonitor(pollIntervalMs = 15000) {
  monitorCount += 1;
  if (monitorCount > 1) {
    return () => stopNetworkMonitor();
  }

  void refreshNetworkStatus();

  intervalHandle = setInterval(() => {
    void refreshNetworkStatus();
  }, pollIntervalMs);

  appStateSubscription = AppState.addEventListener(
    "change",
    (state: AppStateStatus) => {
      if (state === "active") {
        void refreshNetworkStatus();
      }
    }
  );

  return () => stopNetworkMonitor();
}

function stopNetworkMonitor() {
  monitorCount = Math.max(0, monitorCount - 1);
  if (monitorCount > 0) return;

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  appStateSubscription?.remove();
  appStateSubscription = null;
}

export function isLikelyNetworkError(error: unknown) {
  const message = String(
    (error as { message?: string } | null | undefined)?.message ?? error ?? ""
  ).toLowerCase();

  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("network error") ||
    message.includes("request timed out") ||
    message.includes("timed out") ||
    message.includes("aborterror")
  );
}

