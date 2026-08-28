import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = fs.readFileSync(
	path.join(srcPath("components"), "bambi", "guest-verify-card.tsx"),
	"utf8"
);

describe("guest verify card login action", () => {
	it("uses the shared login path with an outlined soft-primary button", () => {
		expect(source).toContain('variant: "outline"');
		expect(source).toContain("bg-primary/10 text-foreground");
		expect(source).toContain("hover:bg-primary/20");
		expect(source).toContain("href={SEEKER_LOGIN_PATH}");
	});
});
