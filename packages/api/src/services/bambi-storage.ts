import { randomUUID } from "node:crypto";

import type { ChatMediaCategory } from "./bambi-media-policy";
import {
	buildLocalMediaUrl,
	CHAT_ATTACHMENT_KEY_ROOT,
	EMPLOYER_PRIVATE_KEY_ROOT,
	editorMediaKeyPrefix,
	jobPostMediaKeyPrefix,
	LOCAL_EDITOR_MEDIA_PATH,
	LOCAL_JOB_MEDIA_PATH,
	LOCAL_PRIVATE_MEDIA_PATH,
	localJobPostMediaKeyPrefix,
} from "./bambi-storage-policy";
import {
	createPrivateSignedReadUrl,
	createPrivateSignedUploadUrl,
	createSignedUploadUrl,
	deletePublicObjects,
	getPublicObjectUrl,
	isProductionStorageRuntime,
	isPublicBucketConfigured,
	shouldUsePrivateBucket,
	shouldUsePublicBucket,
} from "./gcs";

export interface ChatAttachmentStorageInput {
	byteSize: number;
	category: ChatMediaCategory;
	chatRoomId: string;
	createdByUserId: string;
	fileName: string;
	mimeType: string;
}

export interface BusinessDocumentStorageInput {
	actorUserId: string;
	byteSize: number;
	category: ChatMediaCategory;
	fileName: string;
	mimeType: string;
	organizationId: string;
}

export interface BusinessDocumentUploadIntent {
	byteSize: number;
	category: ChatMediaCategory;
	fileName: string;
	mimeType: string;
	storageKey: string;
	uploadUrl: string;
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

export interface GradeIconStorageInput {
	byteSize: number;
	fileName: string;
	gradeId: string;
	mimeType: "image/gif";
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

const GRADE_ICON_KEY_ROOT = "bambi-grade-icons";
const BUILTIN_GRADE_ICON_KEY_ROOT = "builtin/";

const buildGradeIconKeyPrefix = (gradeId: string): string =>
	`${GRADE_ICON_KEY_ROOT}/${gradeId}/`;

export const isOwnedGradeIconKey = ({
	gradeId,
	storageKey,
}: {
	gradeId: string;
	storageKey: string;
}): boolean =>
	storageKey.startsWith(buildGradeIconKeyPrefix(gradeId)) &&
	!storageKey.includes("..");

export const resolveGradeIconUrl = (
	storageKey: string | null
): string | null => {
	if (!storageKey) {
		return null;
	}
	if (storageKey.startsWith(BUILTIN_GRADE_ICON_KEY_ROOT)) {
		return `/${storageKey.slice(BUILTIN_GRADE_ICON_KEY_ROOT.length)}`;
	}
	if (!isProductionStorageRuntime()) {
		return `/bambi/local-grade-icons?key=${encodeURIComponent(storageKey)}`;
	}
	return getPublicObjectUrl(storageKey);
};

export const createGradeIconUploadIntent = async ({
	byteSize,
	fileName,
	gradeId,
	mimeType,
}: GradeIconStorageInput): Promise<JobPostMediaUploadIntent> => {
	const storageFileName = normalizeFileNameForStorage(fileName);
	const storageKey = `${buildGradeIconKeyPrefix(gradeId)}${randomUUID()}-${storageFileName}`;
	return {
		byteSize,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl: shouldUsePublicBucket()
			? await createSignedUploadUrl({ byteSize, mimeType, storageKey })
			: `/bambi/local-grade-icons?key=${encodeURIComponent(storageKey)}`,
	};
};

export const deleteGradeIconObject = async (
	storageKey: string | null
): Promise<void> => {
	if (
		storageKey?.startsWith(`${GRADE_ICON_KEY_ROOT}/`) &&
		shouldUsePublicBucket()
	) {
		await deletePublicObjects([storageKey]);
	}
};

// 비공개 버킷(bambi-storage-private) 키 규칙 — 전 서비스 공통:
//   seeker/{userId}/…            구직자 민감 파일(아직 미사용, 규칙만 예약)
//   employer/{orgId}/{userId}/…  구인자 민감 파일(사업자 문서가 첫 사용자)
// 구인자 파일은 조직이 소유 경계(DB organizationId)라 키에 조직 경계를 드러내
// 조직 단위 일괄 정리·감사가 프리픽스만으로 가능하게 한다.
const buildBusinessDocumentKeyPrefix = ({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): string => `${EMPLOYER_PRIVATE_KEY_ROOT}/${organizationId}/${userId}/`;

export const isOwnedBusinessDocumentKey = ({
	organizationId,
	storageKey,
	userId,
}: {
	organizationId: string;
	storageKey: string;
	userId: string;
}): boolean =>
	storageKey.startsWith(
		buildBusinessDocumentKeyPrefix({ organizationId, userId })
	) && !storageKey.includes("..");

// storageKey는 공개 API 응답에 그대로 실려 나가므로 비밀이 아니다. 공고를 저장할 때
// 클라이언트가 보낸 키를 그대로 믿으면 남의 조직 키를 자기 공고에 붙였다가 지워
// 원본 객체를 삭제할 수 있다. 그래서 발급 시점의 prefix 규칙으로 소유권을 다시 확인한다.
export const isOwnedJobPostMediaKey = ({
	organizationId,
	storageKey,
}: {
	organizationId: string;
	storageKey: string;
}): boolean => storageKey.startsWith(jobPostMediaKeyPrefix(organizationId));

// 리치텍스트 본문(Tiptap)에 삽입되는 이미지의 공용 네임스페이스. 수다방 글과 운영자 FAQ 답변이
// 같은 에디터(CommunityPostEditor)를 쓰므로 "community"가 아니라 표면 중립적인 이름을 쓴다 —
// 나중에 다른 본문 에디터가 붙어도 키 규칙을 다시 만들 필요가 없다.
// 공고는 조직이 소유 경계이고 작성자는 별도 감사 정보라 3단(root/org/user)이지만,
// 본문 이미지는 업로드한 계정 본인이 곧 소유 경계라 2단(root/user)이면 충분하다.
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
}): boolean => storageKey.startsWith(editorMediaKeyPrefix(userId));

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

	return `${LOCAL_PRIVATE_MEDIA_PATH}?${params.toString()}`;
};

const buildChatAttachmentKeyPrefix = ({
	chatRoomId,
	userId,
}: {
	chatRoomId: string;
	userId: string;
}): string => `${CHAT_ATTACHMENT_KEY_ROOT}/${chatRoomId}/${userId}/`;

// 공고·본문 미디어와 같은 이유의 소유권 가드. 첨부 메시지는 클라이언트가 보낸 storageKey를
// 그대로 행에 심으므로, 발급 시점 prefix 규칙을 다시 확인하지 않으면 업로드 없이 남의 방
// 첨부 키나 버킷의 임의 객체를 자기 방 화면에 띄울 수 있다.
export const isOwnedChatAttachmentKey = ({
	chatRoomId,
	storageKey,
	userId,
}: {
	chatRoomId: string;
	storageKey: string;
	userId: string;
}): boolean =>
	storageKey.startsWith(buildChatAttachmentKeyPrefix({ chatRoomId, userId })) &&
	// 상위 경로 탈출(`..`)이 섞이면 prefix를 통과해도 다른 객체를 가리킬 수 있다.
	!storageKey.includes("..");

// 공고·본문 미디어와 같은 흐름: 버킷이 있으면 서명 URL을 내려 브라우저가 GCS로 직접 PUT 한다.
// 이 분기가 없던 동안 채팅 첨부만 항상 local:// 플레이스홀더를 받아 파일이 어디에도 올라가지
// 않았고, 상대는 원본 대신 아래 buildLocalObjectUrl의 안내 이미지를 봤다.
export const createChatAttachmentUploadIntent = async ({
	byteSize,
	category,
	chatRoomId,
	createdByUserId,
	fileName,
	mimeType,
}: ChatAttachmentStorageInput): Promise<ChatAttachmentUploadIntent> => {
	const storageFileName = normalizeFileNameForStorage(fileName);
	const storageKey = `${buildChatAttachmentKeyPrefix({
		chatRoomId,
		userId: createdByUserId,
	})}${randomUUID()}-${storageFileName}`;

	return {
		byteSize,
		category,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl: shouldUsePublicBucket()
			? await createSignedUploadUrl({ byteSize, mimeType, storageKey })
			: buildLocalObjectUrl({
					category,
					fileName: fileName.trim(),
					storageKey,
				}),
	};
};

export const getChatAttachmentObjectUrl = (
	input: ChatAttachmentObjectInput
): string =>
	shouldUsePublicBucket()
		? getPublicObjectUrl(input.storageKey)
		: buildLocalObjectUrl(input);

export const getBusinessDocumentViewPath = (documentId: string): string =>
	`/bambi/business-documents/${documentId}`;

// 조회 URL은 매 요청 인가를 통과한 뒤에만 만들어진다(onboarding.createBusinessDocumentViewUrl).
// 프로덕션+버킷 구성 시 60초 서명 GET, 그 외(dev)는 로컬 플레이스홀더 라우트.
export const resolveBusinessDocumentViewUrl = async ({
	category,
	download,
	fileName,
	storageKey,
}: {
	category: ChatMediaCategory;
	download: boolean;
	fileName: string;
	storageKey: string;
}): Promise<string> =>
	shouldUsePrivateBucket()
		? await createPrivateSignedReadUrl({ download, fileName, storageKey })
		: buildLocalObjectUrl({ category, fileName, storageKey });

export const createBusinessDocumentUploadIntent = async ({
	actorUserId,
	byteSize,
	category,
	fileName,
	mimeType,
	organizationId,
}: BusinessDocumentStorageInput): Promise<BusinessDocumentUploadIntent> => {
	const storageFileName = normalizeFileNameForStorage(fileName);
	const storageKey = `${buildBusinessDocumentKeyPrefix({
		organizationId,
		userId: actorUserId,
	})}${randomUUID()}-${storageFileName}`;

	return {
		byteSize,
		category,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl: isProductionStorageRuntime()
			? // 버킷 미설정이면 createPrivateSignedUploadUrl 내부 requirePrivateBucket이
				// throw 한다 — 공개 버킷·로컬 폴백 없이 업로드를 거부한다(default-deny).
				await createPrivateSignedUploadUrl({ byteSize, mimeType, storageKey })
			: buildLocalObjectUrl({
					category,
					fileName: fileName.trim(),
					storageKey,
				}),
	};
};

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
	const storageKey = `${editorMediaKeyPrefix(userId)}${randomUUID()}-${storageFileName}`;
	const uploadUrl = shouldUsePublicBucket()
		? await createSignedUploadUrl({ byteSize, mimeType, storageKey })
		: buildLocalMediaUrl(LOCAL_EDITOR_MEDIA_PATH, storageKey, fileName.trim());

	return {
		byteSize,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl,
	};
};

// 누적 광고일수 등급 아이콘. 운영자만 올리고 조직·유저 경계가 없는 서비스 전역 자산이라
// 키도 1단(root/uuid-파일명)이면 충분하다 — 소유권 가드가 필요 없는 유일한 미디어다
// (발급 자체가 adminProcedure 뒤에 있다).
const AD_PERIOD_TIER_ICON_KEY_ROOT = "bambi-ad-period-tier-icons";

export const createAdPeriodTierIconUploadIntent = async ({
	byteSize,
	fileName,
	mimeType,
}: {
	byteSize: number;
	fileName: string;
	mimeType: string;
}): Promise<JobPostMediaUploadIntent> => {
	const storageFileName = normalizeFileNameForStorage(fileName);
	const storageKey = `${AD_PERIOD_TIER_ICON_KEY_ROOT}/${randomUUID()}-${storageFileName}`;

	return {
		byteSize,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl: isPublicBucketConfigured()
			? await createSignedUploadUrl({ byteSize, mimeType, storageKey })
			: `local://upload/${storageKey}`,
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
	const usePublicBucket = shouldUsePublicBucket();
	const storageKey = `${
		usePublicBucket
			? jobPostMediaKeyPrefix(organizationId)
			: localJobPostMediaKeyPrefix(organizationId)
	}${actorUserId}/${randomUUID()}-${storageFileName}`;
	const uploadUrl = usePublicBucket
		? await createSignedUploadUrl({ byteSize, mimeType, storageKey })
		: buildLocalMediaUrl(LOCAL_JOB_MEDIA_PATH, storageKey, fileName.trim());

	return {
		byteSize,
		fileName: fileName.trim(),
		mimeType,
		storageKey,
		uploadUrl,
	};
};
