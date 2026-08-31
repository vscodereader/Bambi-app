import { describe, expect, it } from "vitest";

import { moderationActionLabel } from "./moderation-labels";

describe("moderation action labels", () => {
	it("labels an operator-created test account", () => {
		expect(moderationActionLabel("create_test_account")).toBe("가계정 생성");
	});
});
