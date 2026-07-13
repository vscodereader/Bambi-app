import { randomUUID } from "node:crypto";

import type { ChatMediaCategory } from "./bambi-media-policy";
import { createSignedUploadUrl, isPublicBucketConfigured } from "./gcs";

export interface ChatAttachmentStorageInput {
	byteSize: number;
	category: ChatMediaCategory;
	chatRoomId: string;
	createdByUserId: string;
	fileName: string;
	mimeType: string;
}

export interface ChatAttachmentUploadIntent {
	byteSize: number;
	category: ChatMediaCategory;
	fileName: string;
	mimeType: string;
	storageKey: string;
	uploadUrl: string;
}

interface ChatAttachmentObjectInput {
	category: ChatMediaCategory;
	fileName: string;
	storageKey: string;
}

export interface JobPostMediaStorageInput {
	actorUserId: string;
	byteSize: number;
	fileName: string;
	mimeType: string;
	organizationId: string;
}

export interface JobPostMediaUploadIntent {
	byteSize: number;
	fileName: string;
	mimeType: string;
	storageKey: string;
	uploadUrl: string;
}

const normalizeFileNameForStorage = (fileName: string): string => {
	const normalized = fileName
		.trim()
		.replaceAll(/\s+/g, "-")
		.replaceAll(/[^A-Za-z0-9._-]/g, "-")
		.replaceAll(/-+/g, "-")
		.slice(0, 96);

	return normalized || "attachment";
};

const JOB_POST_MEDIA_KEY_ROOT = "bambi-job-post-media";

const buildJobPostMediaKeyPrefix = (organizationId: string): string =>
	`${JOB_POST_MEDIA_KEY_ROOT}/${organizationId}/`;

// storageKey는 공개 API 응답에 그대로 실려 나가므로 비밀이 아니다. 공고를 저장할 때
// 클라이언트가 보낸 키를 그대로 믿으면 남의 조직 키를 자기 공고에 붙였다가 지워
// 원본 객체를 삭제할 수 있다. 그래서 발급 시점의 prefix 규칙으로 소유권을 다시 확인한다.
export const isOwnedJobPostMediaKey = ({
	organizationId,
	storageKey,
}: {
	organizationId: string;
	storageKey: string;
}): boolean =>
	storageKey.startsWith(buildJobPostMediaKeyPrefix(organizationId));

const buildLocalObjectUrl = ({
	category,
	fileName,
	storageKey,
}: ChatAttachmentObjectInput): string => {
	const params = new URLSearchParams({
		category,
		fileName,
		key: storageKey,
	});

	return `/bambi/local-chat-attachments?${params.toString()}`;
};

export const createChatAttachmentUploadIntent = ({
	byteSize,
	category,
	chatRoomId,
	createdByUserId,
	fileName,
	mimeType,
}: ChatAttachmentStorageInput): ChatAttachmentUploadIntent => {
	const storageFileName = normalizeFileNameForStorage(fileName);
	const storageKey = [
		"bambi-chat",
		chatRoomId,
		createdByUserId,
		`${randomUUID()}-${storageFileName}`,
	].join("/");

	return {
		byteSize,
		category,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl: `local://upload/${storageKey}`,
	};
};

export const getChatAttachmentObjectUrl = (
	input: ChatAttachmentObjectInput
): string => buildLocalObjectUrl(input);

export const createJobPostMediaUploadIntent = async ({
	actorUserId,
	byteSize,
	fileName,
	mimeType,
	organizationId,
}: JobPostMediaStorageInput): Promise<JobPostMediaUploadIntent> => {
	const storageFileName = normalizeFileNameForStorage(fileName);
	// 키를 서버가 정한다. 클라이언트가 경로를 고르지 못하므로 남의 객체를 덮어쓸 수 없다.
	const storageKey = `${buildJobPostMediaKeyPrefix(organizationId)}${actorUserId}/${randomUUID()}-${storageFileName}`;
	const uploadUrl = isPublicBucketConfigured()
		? await createSignedUploadUrl({ byteSize, mimeType, storageKey })
		: `local://upload/${storageKey}`;

	return {
		byteSize,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl,
	};
};
