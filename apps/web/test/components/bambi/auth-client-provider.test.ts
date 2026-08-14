import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const IS_GUEST_HYDRATION_GUARD = /const isGuest =\s*mounted &&/;

const source = fs.readFileSync(
	srcPath("components/bambi/auth-client-provider.tsx"),
	"utf8"
);

describe("AuthClientProvider hydration", () => {
	it("keeps the first client auth snapshot equal to the server snapshot", () => {
		expect(source).toContain("const [mounted, setMounted] = useState(false)");
		expect(source).toContain(
			"const isAuthenticated = mounted && Boolean(session.data?.user)"
		);
		expect(source).toMatch(IS_GUEST_HYDRATION_GUARD);
	});
});
