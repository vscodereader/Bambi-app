import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

// bambi-storage는 gcs(=env/server)를 거쳐 오므로 순수 함수만 검증해도 env가 필요하다.
dotenv.config({
	path: "../../apps/server/.env",
});

const { isOwnedEditorMediaKey } = await import("./bambi-storage");

const OWNER_ID = "user_owner";

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
