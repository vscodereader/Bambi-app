import { EDITOR_MEDIA_KEY_ROOT } from "@bambi-app/api/services/bambi-storage-policy";
import type { NextRequest } from "next/server";
import {
	putLocalImage,
	readLocalImage,
} from "@/lib/server/local-image-storage";

const STORAGE_DIRECTORY = "editor-media";

export const PUT = (request: NextRequest) =>
	putLocalImage({
		keyRoot: EDITOR_MEDIA_KEY_ROOT,
		request,
		storageDirectory: STORAGE_DIRECTORY,
	});

export const GET = async (request: NextRequest) =>
	(await readLocalImage({
		keyRoot: EDITOR_MEDIA_KEY_ROOT,
		request,
		storageDirectory: STORAGE_DIRECTORY,
	})) ?? new Response("Not found", { status: 404 });
