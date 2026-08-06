import { describe, expect, it } from "vitest";

import { resolveNotificationRecipients } from "./bambi-notification-recipients";

describe("resolveNotificationRecipients", () => {
	it("게스트 작성분(null)과 미조회 값(undefined)은 버린다", () => {
		expect(
			resolveNotificationRecipients([null, undefined, "user_a"], "user_actor")
		).toEqual(["user_a"]);
	});

	it("행위자 본인에게는 알리지 않는다", () => {
		expect(
			resolveNotificationRecipients(["user_actor", "user_a"], "user_actor")
		).toEqual(["user_a"]);
	});

	it("글 작성자와 부모 댓글 작성자가 같으면 한 번만 남긴다", () => {
		expect(
			resolveNotificationRecipients(["user_a", "user_a"], "user_actor")
		).toEqual(["user_a"]);
	});

	it("수신자가 하나도 없으면 빈 배열이다", () => {
		expect(
			resolveNotificationRecipients([null, "user_actor"], "user_actor")
		).toEqual([]);
	});

	it("입력 순서를 유지한다", () => {
		expect(
			resolveNotificationRecipients(["user_b", "user_a"], "user_actor")
		).toEqual(["user_b", "user_a"]);
	});
});
