import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const BUSINESS_DOCUMENT_KEY_PREFIX = "bambi-business-documents/";
const ALLOWED_MIME_TYPES = new Set([
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
]);

const LOCAL_STORAGE_ROOT = path.resolve(
	process.cwd(),
	".local-storage",
	"business-documents"
);

const getLocalFilePath = (storageKey: string): string | null => {
	if (
		!storageKey.startsWith(BUSINESS_DOCUMENT_KEY_PREFIX) ||
		storageKey.includes("..") ||
		storageKey.includes("\\")
	) {
		return null;
	}

	const relativeKey = storageKey.slice(BUSINESS_DOCUMENT_KEY_PREFIX.length);
	const filePath = path.resolve(LOCAL_STORAGE_ROOT, relativeKey);
	return filePath.startsWith(`${LOCAL_STORAGE_ROOT}${path.sep}`)
		? filePath
		: null;
};

const getMimeType = (fileName: string): string => {
	switch (path.extname(fileName).toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		case ".pdf":
			return "application/pdf";
		default:
			return "application/octet-stream";
	}
};

const escapeSvgText = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

export async function PUT(request: NextRequest) {
	if (process.env.NODE_ENV === "production") {
		return new Response("Not found", { status: 404 });
	}

	const storageKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
	const filePath = getLocalFilePath(storageKey);
	const mimeType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
	const contentLength = Number(request.headers.get("content-length") ?? "0");
	if (!filePath) {
		return new Response("Invalid business document", { status: 400 });
	}
	if (!ALLOWED_MIME_TYPES.has(mimeType)) {
		return new Response("Invalid business document", { status: 400 });
	}
	if (!Number.isFinite(contentLength) || contentLength > MAX_FILE_BYTES) {
		return new Response("Invalid business document", { status: 400 });
	}

	const bytes = Buffer.from(await request.arrayBuffer());
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
		return new Response("Invalid business document size", { status: 400 });
	}

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, bytes);
	return new Response(null, { status: 204 });
}

export async function GET(request: NextRequest) {
	const fileName =
		request.nextUrl.searchParams.get("fileName")?.trim() || "attachment";
	const category = request.nextUrl.searchParams.get("category");
	const storageKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
	const filePath = getLocalFilePath(storageKey);
	if (process.env.NODE_ENV !== "production" && filePath) {
		try {
			const bytes = await readFile(filePath);
			return new Response(bytes, {
				headers: {
					"Cache-Control": "no-store",
					"Content-Length": String(bytes.byteLength),
					"Content-Type": getMimeType(fileName),
				},
			});
		} catch {
			// 과거 local:// 흐름에서 원본이 버려진 레코드는 아래 명시적 대체 이미지를 유지한다.
		}
	}
	const label = category === "pdf" ? "PDF" : "IMAGE";
	const safeFileName = escapeSvgText(fileName.slice(0, 48));
	// GCS가 없는 개발 환경에서만 나오는 자리표시자. 원본처럼 보이면 "내가 올린 이미지가
	// 안 나온다"는 오해를 부르므로 대체 이미지라는 사실을 그림 안에 적는다.
	const svg = `<svg width="960" height="540" viewBox="0 0 960 540" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="960" height="540" fill="#FFF7F3"/>
<rect x="48" y="48" width="864" height="444" rx="28" fill="#FFFFFF" stroke="#F4B69F" stroke-width="3"/>
<circle cx="168" cy="168" r="58" fill="#FF6B4A" fill-opacity="0.14"/>
<path d="M129 347L262 222L359 311L436 246L831 347V432H129V347Z" fill="#FF6B4A" fill-opacity="0.18"/>
<rect x="132" y="133" width="72" height="72" rx="18" fill="#FF6B4A"/>
<text x="244" y="177" fill="#1F2937" font-family="Arial, sans-serif" font-size="54" font-weight="700">${label} · 개발 환경 미리보기</text>
<text x="132" y="404" fill="#4B5563" font-family="Arial, sans-serif" font-size="30" font-weight="700">${safeFileName}</text>
<text x="132" y="446" fill="#B91C1C" font-family="Arial, sans-serif" font-size="26" font-weight="700">원본이 아닙니다 — 스토리지 미설정 상태의 대체 이미지</text>
</svg>`;

	return new Response(svg, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "image/svg+xml; charset=utf-8",
		},
	});
}
