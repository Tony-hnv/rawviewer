import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import type { DocumentPickerAsset } from "expo-document-picker";

import {
  type LibraryFile,
  type SupportedExtension,
  createFileName,
  getBaseName,
  getFileDescriptor,
} from "@/lib/raw-files";

const STORAGE_KEY = "raw-view-library-v1";
const LIBRARY_DIRECTORY = `${FileSystem.documentDirectory}raw-view-library/`;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureLibraryDirectory() {
  await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, {
    intermediates: true,
  });
}

async function getAvailableFileName(fileName: string): Promise<string> {
  const lastDot = fileName.lastIndexOf(".");
  const rawBaseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const extension = lastDot > 0 ? fileName.slice(lastDot) : "";
  let candidate = fileName;
  let suffix = 1;

  while ((await FileSystem.getInfoAsync(`${LIBRARY_DIRECTORY}${candidate}`)).exists) {
    candidate = `${rawBaseName} (${suffix}).${extension.replace(".", "")}`;
    suffix += 1;
  }

  return candidate;
}

export async function loadLibrary(): Promise<LibraryFile[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEY);
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue) as LibraryFile[];
    return parsed.filter((file) => Boolean(getFileDescriptor(file.fileName)));
  } catch {
    return [];
  }
}

export async function saveLibrary(files: LibraryFile[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

export async function importAssets(assets: DocumentPickerAsset[]): Promise<{
  imported: LibraryFile[];
  skipped: string[];
}> {
  await ensureLibraryDirectory();
  const imported: LibraryFile[] = [];
  const skipped: string[] = [];

  for (const asset of assets) {
    const descriptor = getFileDescriptor(asset.name);
    if (!descriptor) {
      skipped.push(asset.name);
      continue;
    }

    const uniqueName = await getAvailableFileName(asset.name);
    const destination = `${LIBRARY_DIRECTORY}${uniqueName}`;
    await FileSystem.copyAsync({ from: asset.uri, to: destination });
    const localInfo = await FileSystem.getInfoAsync(destination);
    const fileName = uniqueName;

    imported.push({
      id: makeId(),
      fileName,
      baseName: getBaseName(fileName),
      extension: descriptor.extension,
      kind: descriptor.kind,
      brand: descriptor.brand,
      uri: destination,
      size: localInfo.exists ? localInfo.size ?? asset.size ?? 0 : asset.size ?? 0,
      importedAt: Date.now(),
    });
  }

  return { imported, skipped };
}

export async function renameLibraryFile(
  file: LibraryFile,
  requestedBaseName: string,
): Promise<LibraryFile> {
  await ensureLibraryDirectory();
  const requestedName = createFileName(requestedBaseName, file.extension as SupportedExtension);
  if (requestedName === file.fileName) return file;

  const destinationName = await getAvailableFileName(requestedName);
  const destination = `${LIBRARY_DIRECTORY}${destinationName}`;
  await FileSystem.moveAsync({ from: file.uri, to: destination });

  return {
    ...file,
    fileName: destinationName,
    baseName: getBaseName(destinationName),
    uri: destination,
  };
}
