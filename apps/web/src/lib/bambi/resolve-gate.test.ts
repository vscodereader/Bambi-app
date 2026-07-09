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
	it("lets /login pass without re-gating to /welcome", () => {
		expect(resolveGate({ pathname: "/login", ...fresh }).type).toBe("next");
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
	it("sends guest from job detail to signup with guestBlocked signal", () => {
		expect(resolveGate({ pathname: "/seeker/jobs/abc", ...guest })).toEqual({
			type: "redirect",
			to: "/welcome?signup&guestBlocked=1",
		});
	});
	it("sends guest from community to signup with guestBlocked signal", () => {
		expect(resolveGate({ pathname: "/seeker/community", ...guest })).toEqual({
			type: "redirect",
			to: "/welcome?signup&guestBlocked=1",
		});
	});
	it("sends guest from employer area to signup with guestBlocked signal", () => {
		expect(resolveGate({ pathname: "/employer", ...guest })).toEqual({
			type: "redirect",
			to: "/welcome?signup&guestBlocked=1",
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
	it("lets metadata/static files pass for fresh visitors", () => {
		for (const pathname of [
			"/icon.svg",
			"/apple-icon.png",
			"/og-image.png",
			"/robots.txt",
			"/sitemap.xml",
			"/favicon.ico",
		]) {
			expect(resolveGate({ pathname, ...fresh }).type).toBe("next");
		}
	});
});
