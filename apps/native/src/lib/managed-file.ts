import { Directory, File } from "expo-file-system";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import { Platform } from "react-native";
import { dataUrlToBytes, safeFileName } from "./managed-file-policy";

export type SaveManagedFileResult =
	| { status: "cancelled" }
	| { status: "failed"; message: string }
	| { status: "saved"; uri: string };

const SAVE_DIRECTORY_KEY = "bambi.managed-save-directory.v1";
let cachedSaveDirectory: Directory | null = null;

export async function forgetManagedSaveDirectory(): Promise<void> {
	cachedSaveDirectory = null;
	await deleteItemAsync(SAVE_DIRECTORY_KEY).catch(() => undefined);
}

const usableDirectory = (uri: string | null): Directory | null => {
	if (!uri) {
		return null;
	}
	try {
		const directory = new Directory(uri);
		return directory.exists ? directory : null;
	} catch {
		return null;
	}
};

const childFile = (directory: Directory, name: string): File | null => {
	for (const entry of directory.list()) {
		if (entry instanceof File && entry.name === name) {
			return entry;
		}
	}
	return null;
};

const getSaveDirectory = async (): Promise<Directory | null> => {
	if (cachedSaveDirectory?.exists) {
		return cachedSaveDirectory;
	}
	const restored = usableDirectory(await getItemAsync(SAVE_DIRECTORY_KEY));
	if (restored) {
		cachedSaveDirectory = restored;
		return restored;
	}
	await deleteItemAsync(SAVE_DIRECTORY_KEY).catch(() => undefined);
	try {
		const selected = await Directory.pickDirectoryAsync();
		cachedSaveDirectory = selected;
		await setItemAsync(SAVE_DIRECTORY_KEY, selected.uri).catch(() => undefined);
		return selected;
	} catch {
		return null;
	}
};

export async function saveManagedFile(input: {
	fileName: string;
	mimeType: string;
	url?: string;
	bytes?: Uint8Array;
}): Promise<SaveManagedFileResult> {
	if (Platform.OS !== "android") {
		return {
			status: "failed",
			message: "현재 파일 저장은 Android에서 지원해요.",
		};
	}
	try {
		let bytes = input.bytes;
		if (!bytes && input.url) {
			bytes = dataUrlToBytes(input.url) ?? undefined;
			if (!bytes) {
				const response = await fetch(input.url);
				if (!response.ok) {
					return { status: "failed", message: "파일을 내려받지 못했어요." };
				}
				bytes = new Uint8Array(await response.arrayBuffer());
			}
		}
		if (!bytes) {
			return { status: "failed", message: "저장할 파일 내용이 없습니다." };
		}
		const directory = await getSaveDirectory();
		if (!directory) {
			return { status: "cancelled" };
		}
		const fileName = safeFileName(input.fileName);
		const existing = childFile(directory, fileName);
		if (existing) {
			existing.delete();
		}
		const file = directory.createFile(fileName, input.mimeType || null);
		file.write(bytes);
		if (!file.exists || file.size !== bytes.byteLength) {
			return {
				status: "failed",
				message:
					"파일 저장 결과를 확인하지 못했어요. 저장 공간을 확인해 주세요.",
			};
		}
		return { status: "saved", uri: file.uri };
	} catch {
		return {
			status: "failed",
			message: "파일을 저장하지 못했어요. 저장 위치와 권한을 확인해 주세요.",
		};
	}
}
