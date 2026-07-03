import { describe, expect, it } from "vitest";
import { resolveGate } from "./resolve-gate";

const guest = { hasSession: false, isGuest: true };
const fresh = { hasSession: false, isGuest: false };
const authed = { hasSession: true, isGuest: false };

describe("resolveGate", () => {
	it("lets public /welcome pass for everyone", () => {
		expect(resolveGate({ pathname: "/welcome", ...fresh }).type).toBe("next");
	});
	it("lets logged-in users pass", () => {
		expect(resolveGate({ pathname: "/employer", ...authed }).type).toBe("next");
	});
	it("sends fresh visitor to /welcome", () => {
		expect(resolveGate({ pathname: "/seeker", ...fresh })).toEqual({
			type: "redirect",
			to: "/welcome",
		});
	});
	it("allows guest on seeker list root", () => {
		expect(resolveGate({ pathname: "/seeker", ...guest }).type).toBe("next");
	});
	it("sends guest from job detail to signup", () => {
		expect(resolveGate({ pathname: "/seeker/jobs/abc", ...guest })).toEqual({
			type: "redirect",
			to: "/welcome?signup",
		});
	});
	it("sends guest from employer area to signup", () => {
		expect(resolveGate({ pathname: "/employer", ...guest })).toEqual({
			type: "redirect",
			to: "/welcome?signup",
		});
	});
	it("sends guest at root to seeker", () => {
		expect(resolveGate({ pathname: "/", ...guest })).toEqual({
			type: "redirect",
			to: "/seeker",
		});
	});
	it("lets api and media pass", () => {
		expect(resolveGate({ pathname: "/api/guest", ...fresh }).type).toBe("next");
		expect(
			resolveGate({ pathname: "/bambi/local-job-media/x", ...fresh }).type
		).toBe("next");
	});
});
