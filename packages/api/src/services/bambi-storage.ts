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

export interface EditorMediaStorageInput {
	byteSize: number;
	fileName: string;
	mimeType: string;
	userId: string;
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

// 인텐트 응답 모양이 공고 미디어와 완전히 같다(브라우저가 서명 URL로 PUT 하고 storageKey를
// 본문에 심는 흐름이 동일). 같은 필드를 한 번 더 적는 대신 별칭으로 둔다.
export type EditorMediaUploadIntent = JobPostMediaUploadIntent;

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

// 리치텍스트 본문(Tiptap)에 삽입되는 이미지의 공용 네임스페이스. 수다방 글과 운영자 FAQ 답변이
// 같은 에디터(CommunityPostEditor)를 쓰므로 "community"가 아니라 표면 중립적인 이름을 쓴다 —
// 나중에 다른 본문 에디터가 붙어도 키 규칙을 다시 만들 필요가 없다.
const EDITOR_MEDIA_KEY_ROOT = "bambi-editor-media";

// 공고는 조직이 소유 경계이고 작성자는 별도 감사 정보라 3단(root/org/user)이지만,
// 본문 이미지는 업로드한 계정 본인이 곧 소유 경계라 2단(root/user)이면 충분하다.
const buildEditorMediaKeyPrefix = (userId: string): string =>
	`${EDITOR_MEDIA_KEY_ROOT}/${userId}/`;

// 지금은 호출자가 없다. 본문 이미지 경로는 deletePublicObjects를 부르지 않으므로 남의 키를
// 본문에 적어 봐야 공개 객체 핫링크에 그친다. 하지만 누군가 본문 파싱 기반 고아 객체 정리를
// 붙이는 순간 이 가드가 필수가 된다 — 없으면 A가 B의 이미지 URL을 자기 글에 넣고 그 글을 지워
// B의 객체를 날릴 수 있다. 그때 새로 설계하지 않도록 발급 규칙과 같은 자리에 함께 둔다.
export const isOwnedEditorMediaKey = ({
	storageKey,
	userId,
}: {
	storageKey: string;
	userId: string;
}): boolean => storageKey.startsWith(buildEditorMediaKeyPrefix(userId));

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

// ponytail: 본문에서 지워진 이미지·삭제된 글(status "deleted")의 GCS 객체는 그대로 남는다.
// 공고 미디어도 같은 구멍을 안고 가고 있고 레포 어디에도 스위퍼가 없어 지금은 감수한다.
// 필요해지면(스토리지 비용·개인정보 삭제 요구) 하드 삭제 시점에 Tiptap 문서를 훑어 image 노드의
// src에서 storageKey를 뽑아 deletePublicObjects로 넘기면 된다 — 그때 위 isOwnedEditorMediaKey로
// 남의 키를 걸러야 한다.
export const createEditorMediaUploadIntent = async ({
	byteSize,
	fileName,
	mimeType,
	userId,
}: EditorMediaStorageInput): Promise<EditorMediaUploadIntent> => {
	const storageFileName = normalizeFileNameForStorage(fileName);
	// 공고와 같은 규칙: 키를 서버가 정해 클라이언트가 경로를 고르지 못하게 한다.
	const storageKey = `${buildEditorMediaKeyPrefix(userId)}${randomUUID()}-${storageFileName}`;
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
