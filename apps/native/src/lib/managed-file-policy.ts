const INVALID_FILE_NAME = /[\\/:*?"<>|]/g;
const BASE64_DATA_URL = /^data:[^;,]+;base64,(.+)$/s;

export const safeFileName = (value: string): string => {
	const result = Array.from(value.replace(INVALID_FILE_NAME, "_"))
		.map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
		.join("")
		.trim();
	return result || "download";
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	const chunkSize = 0x80_00;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(
			...bytes.subarray(offset, offset + chunkSize)
		);
	}
	return btoa(binary);
};

export const base64ToBytes = (value: string): Uint8Array => {
	const binary = atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const dataUrlToBytes = (value: string): Uint8Array | null => {
	const match = BASE64_DATA_URL.exec(value);
	return match ? base64ToBytes(match[1]) : null;
};
