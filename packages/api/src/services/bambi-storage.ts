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
	const storageKey = [
		"bambi-job-post-media",
		organizationId,
		actorUserId,
		`${randomUUID()}-${storageFileName}`,
	].join("/");
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
