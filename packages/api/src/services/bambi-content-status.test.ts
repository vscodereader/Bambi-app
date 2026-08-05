import { describe, expect, it } from "vitest";

import {
	ALREADY_DELETED_MESSAGES,
	assertNotAlreadyDeleted,
	isRedundantDelete,
} from "./bambi-content-status";

describe("isRedundantDelete", () => {
	it("이미 삭제된 대상에 삭제 요청이 또 오면 참", () => {
		expect(isRedundantDelete("deleted", "deleted")).toBe(true);
	});

	it("삭제된 대상의 복구·숨김은 막지 않는다", () => {
		expect(isRedundantDelete("deleted", "published")).toBe(false);
		expect(isRedundantDelete("deleted", "hidden")).toBe(false);
	});

	it("아직 삭제되지 않은 대상의 삭제는 막지 않는다", () => {
		expect(isRedundantDelete("published", "deleted")).toBe(false);
		expect(isRedundantDelete("hidden", "deleted")).toBe(false);
	});
});

describe("assertNotAlreadyDeleted", () => {
	it("중복 삭제는 CONFLICT로 거절하고 대상별 안내 문구를 담는다", () => {
		expect(() =>
			assertNotAlreadyDeleted({
				current: "deleted",
				kind: "post",
				next: "deleted",
			})
		).toThrowError(ALREADY_DELETED_MESSAGES.post);

		expect(() =>
			assertNotAlreadyDeleted({
				current: "deleted",
				kind: "inquiry",
				next: "deleted",
			})
		).toThrowError(ALREADY_DELETED_MESSAGES.inquiry);
	});

	it("중복 삭제가 아니면 통과한다", () => {
		expect(() =>
			assertNotAlreadyDeleted({
				current: "hidden",
				kind: "comment",
				next: "deleted",
			})
		).not.toThrow();
	});
});
