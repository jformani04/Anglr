import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { withTimeout } from "@/lib/errorHandling";

export function isLocalFileUri(uri: string) {
  return /^(file|content|asset|ph):/i.test(uri);
}

export async function fileUriToUploadBody(fileUri: string): Promise<ArrayBuffer> {
  if (!fileUri) {
    throw new Error("Missing file URI.");
  }

  if (isLocalFileUri(fileUri)) {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return decode(base64);
  }

  const response = await withTimeout(
    fetch(fileUri),
    10000,
    "Timed out while reading the selected image."
  );

  if (!response.ok) {
    throw new Error("Unable to read the selected image.");
  }

  return await response.arrayBuffer();
}
