import { randomUUID } from "node:crypto";

import type { ChatMediaCategory } from "./bambi-media-policy";

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

export const createJobPostMediaUploadIntent = ({
	actorUserId,
	byteSize,
	fileName,
	mimeType,
	organizationId,
}: JobPostMediaStorageInput): JobPostMediaUploadIntent => {
	const storageFileName = normalizeFileNameForStorage(fileName);
	const storageKey = [
		"bambi-job-post-media",
		organizationId,
		actorUserId,
		`${randomUUID()}-${storageFileName}`,
	].join("/");

	return {
		byteSize,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl: `local://upload/${storageKey}`,
	};
};
