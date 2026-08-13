import { describe, expect, it } from "vitest";

import { canOpenEditForm } from "@/lib/bambi/community-edit-gate";

describe("canOpenEditForm", () => {
	it("opens for a member author without a gate password", () => {
		expect(
			canOpenEditForm({
				appliedPassword: undefined,
				isMemberAuthor: true,
				locked: false,
			})
		).toBe(true);
	});

	it("keeps the gate closed for a guest until a password is applied", () => {
		expect(
			canOpenEditForm({
				appliedPassword: undefined,
				isMemberAuthor: false,
				locked: false,
			})
		).toBe(false);
		expect(
			canOpenEditForm({
				appliedPassword: "secret",
				isMemberAuthor: false,
				locked: false,
			})
		).toBe(true);
	});

	it("never opens the form for the locked (reduced) response variant", () => {
		expect(
			canOpenEditForm({
				appliedPassword: "secret",
				isMemberAuthor: true,
				locked: true,
			})
		).toBe(false);
		expect(
			canOpenEditForm({
				appliedPassword: undefined,
				isMemberAuthor: false,
				locked: undefined,
			})
		).toBe(false);
	});
});
