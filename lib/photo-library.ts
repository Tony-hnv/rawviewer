import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import type { DocumentPickerAsset } from "expo-document-picker";

import { copyFileIntoLibrary, exportLibraryCopy, renameLibraryCopy } from "@/lib/local-file-bridge";

import {
  type LibraryFile,
  type SupportedExtension,
  createFileName,
  getBaseName,
  getFileDescriptor,
} from "@/lib/raw-files";

const STORAGE_KEY = "raw-view-library-v1";
const LIBRARY_DIRECTORY = `${FileSystem.documentDirectory}raw-view-library/`;

type ImportAsset = Pick<DocumentPickerAsset, "name" | "uri" | "size">;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureLibraryDirectory() {
  await FileSystem.makeDirectoryAsync(LIBRARY_DIRECTORY, {
    intermediates: true,
  });
}

async function getAvailableFileName(fileName: string, sourceUri?: string): Promise<string> {
  const lastDot = fileName.lastIndexOf(".");
  const rawBaseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const extension = lastDot > 0 ? fileName.slice(lastDot) : "";
  let candidate = fileName;
  let suffix = 1;

  while (true) {
    const candidateUri = `${LIBRARY_DIRECTORY}${candidate}`;
    const candidateInfo = await FileSystem.getInfoAsync(candidateUri);
    if (!candidateInfo.exists || candidateUri === sourceUri) break;
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

export async function importAssets(assets: ImportAsset[]): Promise<{
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
    const localUri = await copyFileIntoLibrary(asset.uri, destination);
    const localInfo = await FileSystem.getInfoAsync(localUri);
    const fileName = uniqueName;

    imported.push({
      id: makeId(),
      fileName,
      baseName: getBaseName(fileName),
      extension: descriptor.extension,
      kind: descriptor.kind,
      brand: descriptor.brand,
      uri: localUri,
      sourceUri: asset.uri,
      size: localInfo.exists ? localInfo.size ?? asset.size ?? 0 : asset.size ?? 0,
      importedAt: Date.now(),
    });
  }

  return { imported, skipped };
}

export async function renameLibraryFile(
  file: LibraryFile,
  requestedBaseName: string,
): Promise<{ file: LibraryFile; sourceRenamed: boolean; sourceRenameError?: string | null }> {
  await ensureLibraryDirectory();
  const requestedName = createFileName(requestedBaseName, file.extension as SupportedExtension);
  if (requestedName === file.fileName) {
    return { file, sourceRenamed: file.renameSyncStatus === "original_and_copy" };
  }

  const destinationName = await getAvailableFileName(requestedName, file.uri);
  const destination = `${LIBRARY_DIRECTORY}${destinationName}`;
  const result = await renameLibraryCopy(file.uri, file.sourceUri, destinationName);
  const renamedInfo = await FileSystem.getInfoAsync(result.uri);
  const renamedSize = renamedInfo.exists ? renamedInfo.size ?? 0 : 0;
  if (!renamedInfo.exists || (file.size > 0 && renamedSize !== file.size)) {
    throw new Error("重命名结果校验失败，文件库未更新。");
  }

  const renamedFile: LibraryFile = {
    ...file,
    fileName: destinationName,
    baseName: getBaseName(destinationName),
    uri: result.uri,
    sourceUri: result.sourceRenamed && result.sourceUri ? result.sourceUri : file.sourceUri,
    renameSyncStatus: result.sourceRenamed ? "original_and_copy" : "copy_only",
  };

  const storedFiles = await loadLibrary();
  const nextStoredFiles = storedFiles.some((storedFile) => storedFile.id === file.id)
    ? storedFiles.map((storedFile) => (storedFile.id === file.id ? renamedFile : storedFile))
    : [...storedFiles, renamedFile];
  await saveLibrary(nextStoredFiles);

  const verifiedFiles = await loadLibrary();
  const verifiedFile = verifiedFiles.find((storedFile) => storedFile.id === file.id);
  if (!verifiedFile || verifiedFile.fileName !== destinationName || verifiedFile.uri !== result.uri) {
    throw new Error("重命名已执行，但文件库记录未能保存。请重新打开应用后重试。");
  }

  return {
    file: verifiedFile,
    sourceRenamed: Boolean(result.sourceRenamed),
    sourceRenameError: result.sourceRenameError,
  };
}

export async function exportLibraryFile(file: LibraryFile): Promise<string | null> {
  return exportLibraryCopy(file.uri, file.fileName);
}
