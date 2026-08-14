import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

// bambi-storage는 gcs(=env/server)를 거쳐 오므로 순수 함수만 검증해도 env가 필요하다.
dotenv.config({
	path: "../../apps/server/.env",
});

const {
	createBusinessDocumentUploadIntent,
	getBusinessDocumentViewPath,
	isOwnedBusinessDocumentKey,
	isOwnedChatAttachmentKey,
	isOwnedEditorMediaKey,
} = await import("@/services/bambi-storage");

const OWNER_ID = "user_owner";
const ROOM_ID = "11111111-1111-4111-8111-111111111111";

describe("bambi editor media key ownership", () => {
	it("본인 네임스페이스의 키만 소유로 인정한다", () => {
		expect(
			isOwnedEditorMediaKey({
				storageKey: `bambi-editor-media/${OWNER_ID}/8f0c-photo.jpg`,
				userId: OWNER_ID,
			})
		).toBe(true);

		expect(
			isOwnedEditorMediaKey({
				storageKey: "bambi-editor-media/user_other/8f0c-photo.jpg",
				userId: OWNER_ID,
			})
		).toBe(false);
	});

	it("공고 미디어 네임스페이스의 키는 소유로 인정하지 않는다", () => {
		expect(
			isOwnedEditorMediaKey({
				storageKey: `bambi-job-post-media/org_1/${OWNER_ID}/8f0c-photo.jpg`,
				userId: OWNER_ID,
			})
		).toBe(false);
	});

	// prefix 끝의 슬래시가 빠지면 "ab"가 "abc"의 키까지 소유로 통과한다(startsWith 접두 충돌).
	// userId는 랜덤 문자열이라 실제로 한쪽이 다른 쪽의 접두가 될 수 있으므로 경계를 못 박는다.
	it("다른 userId의 접두어인 userId는 소유로 인정하지 않는다", () => {
		expect(
			isOwnedEditorMediaKey({
				storageKey: "bambi-editor-media/abc/8f0c-photo.jpg",
				userId: "ab",
			})
		).toBe(false);
	});
});

describe("bambi chat attachment key ownership", () => {
	it("발급 규칙(방·업로더)에 맞는 키만 소유로 인정한다", () => {
		expect(
			isOwnedChatAttachmentKey({
				chatRoomId: ROOM_ID,
				storageKey: `bambi-chat/${ROOM_ID}/${OWNER_ID}/8f0c-photo.jpg`,
				userId: OWNER_ID,
			})
		).toBe(true);
	});

	it("다른 방·다른 사용자의 첨부 키는 거절한다", () => {
		expect(
			isOwnedChatAttachmentKey({
				chatRoomId: ROOM_ID,
				storageKey: `bambi-chat/22222222-2222-4222-8222-222222222222/${OWNER_ID}/8f0c-photo.jpg`,
				userId: OWNER_ID,
			})
		).toBe(false);

		expect(
			isOwnedChatAttachmentKey({
				chatRoomId: ROOM_ID,
				storageKey: `bambi-chat/${ROOM_ID}/user_other/8f0c-photo.jpg`,
				userId: OWNER_ID,
			})
		).toBe(false);
	});

	it("다른 네임스페이스나 상위 경로 탈출을 섞은 키는 거절한다", () => {
		expect(
			isOwnedChatAttachmentKey({
				chatRoomId: ROOM_ID,
				storageKey: `bambi-job-post-media/org_1/${OWNER_ID}/8f0c-photo.jpg`,
				userId: OWNER_ID,
			})
		).toBe(false);

		expect(
			isOwnedChatAttachmentKey({
				chatRoomId: ROOM_ID,
				storageKey: `bambi-chat/${ROOM_ID}/${OWNER_ID}/../../../other/photo.jpg`,
				userId: OWNER_ID,
			})
		).toBe(false);
	});
});

describe("business document private key ownership", () => {
	const ORG_ID = "org_1";

	it("employer/{orgId}/{userId}/ 프리픽스의 키만 소유로 인정한다", () => {
		expect(
			isOwnedBusinessDocumentKey({
				organizationId: ORG_ID,
				storageKey: `employer/${ORG_ID}/${OWNER_ID}/8f0c-doc.pdf`,
				userId: OWNER_ID,
			})
		).toBe(true);

		expect(
			isOwnedBusinessDocumentKey({
				organizationId: ORG_ID,
				storageKey: `employer/${ORG_ID}/user_other/8f0c-doc.pdf`,
				userId: OWNER_ID,
			})
		).toBe(false);

		expect(
			isOwnedBusinessDocumentKey({
				organizationId: "org_2",
				storageKey: `employer/${ORG_ID}/${OWNER_ID}/8f0c-doc.pdf`,
				userId: OWNER_ID,
			})
		).toBe(false);
	});

	it("옛 공개 버킷 규칙(bambi-business-documents/)과 상위 경로 탈출은 거절한다", () => {
		expect(
			isOwnedBusinessDocumentKey({
				organizationId: ORG_ID,
				storageKey: `bambi-business-documents/${ORG_ID}/${OWNER_ID}/8f0c-doc.pdf`,
				userId: OWNER_ID,
			})
		).toBe(false);

		expect(
			isOwnedBusinessDocumentKey({
				organizationId: ORG_ID,
				storageKey: `employer/${ORG_ID}/${OWNER_ID}/../../../etc/passwd`,
				userId: OWNER_ID,
			})
		).toBe(false);
	});
});

describe("business document upload intent (비프로덕션 = 로컬 폴백)", () => {
	it("서버가 employer/{orgId}/{userId}/ 키를 정하고 로컬 업로드 URL을 내린다", async () => {
		const intent = await createBusinessDocumentUploadIntent({
			actorUserId: OWNER_ID,
			byteSize: 1024,
			category: "pdf",
			fileName: "사업자 등록증.pdf",
			mimeType: "application/pdf",
			organizationId: "org_1",
		});

		expect(intent.storageKey.startsWith(`employer/org_1/${OWNER_ID}/`)).toBe(
			true
		);
		expect(
			isOwnedBusinessDocumentKey({
				organizationId: "org_1",
				storageKey: intent.storageKey,
				userId: OWNER_ID,
			})
		).toBe(true);
		// NODE_ENV=test는 프로덕션이 아니므로 GCS 대신 로컬 플레이스홀더 URL이어야 한다.
		expect(intent.uploadUrl.startsWith("/bambi/local-chat-attachments?")).toBe(
			true
		);
	});
});

describe("business document view path", () => {
	it("문서 id 기반 앱 조회 경로를 만든다", () => {
		expect(getBusinessDocumentViewPath("doc_1")).toBe(
			"/bambi/business-documents/doc_1"
		);
	});
});
