import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

const GRADE_ICON_KEY_PREFIX = "bambi-grade-icons/";
const MAX_GIF_BYTES = 2 * 1024 * 1024;
const LOCAL_STORAGE_ROOT = path.resolve(
	process.cwd(),
	".local-storage",
	"grade-icons"
);

const getLocalFilePath = (storageKey: string): string | null => {
	if (
		!storageKey.startsWith(GRADE_ICON_KEY_PREFIX) ||
		storageKey.includes("..") ||
		storageKey.includes("\\")
	) {
		return null;
	}
	const relativeKey = storageKey.slice(GRADE_ICON_KEY_PREFIX.length);
	const filePath = path.resolve(LOCAL_STORAGE_ROOT, relativeKey);
	return filePath.startsWith(`${LOCAL_STORAGE_ROOT}${path.sep}`)
		? filePath
		: null;
};

export async function PUT(request: NextRequest) {
	if (process.env.NODE_ENV === "production") {
		return new Response("Not found", { status: 404 });
	}
	const storageKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
	const filePath = getLocalFilePath(storageKey);
	const mimeType = request.headers.get("content-type")?.split(";", 1)[0];
	const bytes = Buffer.from(await request.arrayBuffer());
	if (
		!filePath ||
		mimeType !== "image/gif" ||
		bytes.byteLength === 0 ||
		bytes.byteLength > MAX_GIF_BYTES ||
		bytes.subarray(0, 3).toString("ascii") !== "GIF"
	) {
		return new Response("Invalid grade icon", { status: 400 });
	}
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, bytes);
	return new Response(null, { status: 204 });
}

export async function GET(request: NextRequest) {
	const storageKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
	const filePath = getLocalFilePath(storageKey);
	if (!filePath) {
		return new Response("Not found", { status: 404 });
	}
	try {
		const bytes = await readFile(filePath);
		return new Response(bytes, {
			headers: {
				"Cache-Control": "no-store",
				"Content-Length": String(bytes.byteLength),
				"Content-Type": "image/gif",
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}
