import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	MODERATOR_MORE_GROUPS,
	MODERATOR_NAV_ITEMS,
} from "../../../../lib/bambi/moderator-navigation";

const source = readFileSync(
	fileURLToPath(new URL("./page.tsx", import.meta.url)),
	"utf8"
);

describe("moderator test account page", () => {
	it("shares the account creation destination across desktop and mobile navigation", () => {
		const desktop = MODERATOR_NAV_ITEMS.flatMap((entry) =>
			"items" in entry ? entry.items : [entry]
		);
		const mobile = MODERATOR_MORE_GROUPS.flatMap((group) => group.items);
		expect(desktop).toContainEqual({
			href: "/moderator/users/create",
			label: "계정 생성",
		});
		expect(mobile).toContainEqual({
			href: "/moderator/users/create",
			label: "계정 생성",
		});
	});

	it("renders every required field without sending the discarded name", () => {
		for (const id of [
			"test-account-name",
			"test-account-nickname",
			"test-account-birth",
			"test-account-gender",
			"test-account-role",
			"test-account-phone",
			"test-account-login-id",
			"test-account-password",
			"test-account-password-confirm",
		]) {
			expect(source).toContain(id);
		}
		expect(source.includes("name: form.name")).toBe(false);
		expect(source.includes("passwordConfirm: form.passwordConfirm")).toBe(
			false
		);
		expect(source).toContain('inputMode="numeric"');
		expect(source).toContain("showPicker");
	});
});
