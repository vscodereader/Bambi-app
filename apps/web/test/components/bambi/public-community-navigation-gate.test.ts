import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = fs.readFileSync(
	path.join(srcPath("components"), "bambi", "community-post-navigation.tsx"),
	"utf8"
);

describe("public community navigation gate", () => {
	it("blurs public neighbors and sends their links to the relative login route", () => {
		expect(source).toContain("SEEKER_LOGIN_PATH");
		expect(source).toContain('publicView ? "block truncate blur-sm"');
		expect(source).toContain("publicView ? SEEKER_LOGIN_PATH");
	});

	it("keeps member navigation on the existing item destination", () => {
		expect(source).toContain(": itemHref(item, false)");
	});
});
