import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	ALLOWED_JOB_POST_IMAGE_MIME_TYPES,
	JOB_POST_IMAGE_MAX_BYTES,
} from "@bambi-app/api/services/bambi-job-media-policy";
import type { NextRequest } from "next/server";

const ALLOWED_MIME_TYPES = new Set<string>(ALLOWED_JOB_POST_IMAGE_MIME_TYPES);

export const hasExpectedImageSignature = (
	bytes: Buffer,
	mimeType: string
): boolean => {
	switch (mimeType) {
		case "image/jpeg":
			return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
		case "image/png":
			return bytes
				.subarray(0, 8)
				.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
		case "image/webp":
			return (
				bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
				bytes.subarray(8, 12).toString("ascii") === "WEBP"
			);
		default:
			return false;
	}
};

const mimeTypeForStorageKey = (storageKey: string): string => {
	switch (path.extname(storageKey).toLowerCase()) {
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		default:
			return "image/jpeg";
	}
};

const resolveLocalFile = ({
	keyRoot,
	storageDirectory,
	storageKey,
}: {
	keyRoot: string;
	storageDirectory: string;
	storageKey: string;
}): string | null => {
	const keyPrefix = `${keyRoot}/`;
	if (
		!storageKey.startsWith(keyPrefix) ||
		storageKey.includes("..") ||
		storageKey.includes("\\")
	) {
		return null;
	}
	const storageRoot = path.resolve(
		process.cwd(),
		".local-storage",
		storageDirectory
	);
	const filePath = path.resolve(
		storageRoot,
		storageKey.slice(keyPrefix.length)
	);
	return filePath.startsWith(`${storageRoot}${path.sep}`) ? filePath : null;
};

export const putLocalImage = async ({
	keyRoot,
	request,
	storageDirectory,
}: {
	keyRoot: string;
	request: NextRequest;
	storageDirectory: string;
}): Promise<Response> => {
	if (process.env.NODE_ENV === "production") {
		return new Response("Not found", { status: 404 });
	}
	const storageKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
	const filePath = resolveLocalFile({ keyRoot, storageDirectory, storageKey });
	const mimeType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
	const contentLength = Number(request.headers.get("content-length") ?? "0");
	if (!(filePath && ALLOWED_MIME_TYPES.has(mimeType))) {
		return new Response("Invalid image", { status: 400 });
	}
	if (
		!Number.isFinite(contentLength) ||
		contentLength > JOB_POST_IMAGE_MAX_BYTES
	) {
		return new Response("Invalid image size", { status: 400 });
	}
	const bytes = Buffer.from(await request.arrayBuffer());
	if (
		bytes.byteLength === 0 ||
		bytes.byteLength > JOB_POST_IMAGE_MAX_BYTES ||
		!hasExpectedImageSignature(bytes, mimeType)
	) {
		return new Response("Invalid image", { status: 400 });
	}
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, bytes);
	return new Response(null, { status: 204 });
};

export const readLocalImage = async ({
	keyRoot,
	request,
	storageDirectory,
}: {
	keyRoot: string;
	request: NextRequest;
	storageDirectory: string;
}): Promise<Response | null> => {
	if (process.env.NODE_ENV === "production") {
		return null;
	}
	const storageKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
	const filePath = resolveLocalFile({ keyRoot, storageDirectory, storageKey });
	if (!filePath) {
		return null;
	}
	try {
		const bytes = await readFile(filePath);
		return new Response(bytes, {
			headers: {
				"Cache-Control": "no-store",
				"Content-Length": String(bytes.byteLength),
				"Content-Type": mimeTypeForStorageKey(storageKey),
			},
		});
	} catch {
		return null;
	}
};
