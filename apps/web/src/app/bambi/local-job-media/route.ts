import { JOB_POST_MEDIA_KEY_ROOT } from "@bambi-app/api/services/bambi-storage-policy";
import { env } from "@bambi-app/env/web";
import type { NextRequest } from "next/server";
import {
	putLocalImage,
	readLocalImage,
} from "@/lib/server/local-image-storage";

const STORAGE_DIRECTORY = "job-media";
const TRAILING_SLASH_PATTERN = /\/$/;

export const PUT = (request: NextRequest) =>
	putLocalImage({
		keyRoot: JOB_POST_MEDIA_KEY_ROOT,
		request,
		storageDirectory: STORAGE_DIRECTORY,
	});

export async function GET(request: NextRequest) {
	const localImage = await readLocalImage({
		keyRoot: JOB_POST_MEDIA_KEY_ROOT,
		request,
		storageDirectory: STORAGE_DIRECTORY,
	});
	if (localImage) {
		return localImage;
	}
	const storageKey = request.nextUrl.searchParams.get("key")?.trim() ?? "";
	if (
		process.env.NODE_ENV !== "production" &&
		env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL &&
		storageKey.startsWith(`${JOB_POST_MEDIA_KEY_ROOT}/`)
	) {
		const publicBaseUrl = env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL.replace(
			TRAILING_SLASH_PATTERN,
			""
		);
		return Response.redirect(
			`${publicBaseUrl}/${storageKey
				.split("/")
				.map((segment) => encodeURIComponent(segment))
				.join("/")}`,
			307
		);
	}
	return new Response("Not found", { status: 404 });
}
