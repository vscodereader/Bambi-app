import { describe, expect, it } from "vitest";
import { resolveGate } from "./resolve-gate";

// guest = 인증은 마쳤지만 수다방 자격은 없는 게스트(남성·gid 없는 옛 토큰),
// communityGuest = 여성 + gid까지 있는 게스트(수다방만 열린다).
const guest = { hasSession: false, isCommunityGuest: false, isGuest: true };
const communityGuest = {
	hasSession: false,
	isCommunityGuest: true,
	isGuest: true,
};
const fresh = { hasSession: false, isCommunityGuest: false, isGuest: false };
const authed = { hasSession: true, isCommunityGuest: false, isGuest: false };

describe("resolveGate", () => {
	it("lets logged-in users pass", () => {
		expect(resolveGate({ pathname: "/employer", ...authed }).type).toBe("next");
	});
	it("lets anonymous visitors reach the seeker list root", () => {
		expect(resolveGate({ pathname: "/seeker", ...fresh }).type).toBe("next");
	});
	it("sends anonymous visitors elsewhere to the login overlay", () => {
		expect(resolveGate({ pathname: "/seeker/jobs/abc", ...fresh })).toEqual({
			type: "redirect",
			to: "/seeker?auth=login",
		});
		expect(resolveGate({ pathname: "/", ...fresh })).toEqual({
			type: "redirect",
			to: "/seeker?auth=login",
		});
	});
	it("no longer treats /welcome or /login as public", () => {
		expect(resolveGate({ pathname: "/welcome", ...fresh }).type).toBe(
			"redirect"
		);
		expect(resolveGate({ pathname: "/login", ...fresh }).type).toBe("redirect");
	});
	it("allows guest on seeker list root", () => {
		expect(resolveGate({ pathname: "/seeker", ...guest }).type).toBe("next");
	});
	it("sends guest from job detail to signup with guestBlocked signal", () => {
		expect(resolveGate({ pathname: "/seeker/jobs/abc", ...guest })).toEqual({
			type: "redirect",
			to: "/seeker?auth=signup&guestBlocked=1",
		});
	});
	it("sends an unqualified guest from community to signup with guestBlocked signal", () => {
		expect(resolveGate({ pathname: "/seeker/community", ...guest })).toEqual({
			type: "redirect",
			to: "/seeker?auth=signup&guestBlocked=1",
		});
	});
	it("lets a verified female guest into the member community area", () => {
		for (const pathname of [
			"/seeker/community",
			"/seeker/community/free",
			"/seeker/community/free/abc",
			"/seeker/community/free/write",
			"/seeker/community/crawled/abc",
		]) {
			expect(resolveGate({ pathname, ...communityGuest }).type).toBe("next");
		}
	});
	it("keeps other seeker paths closed for a community guest", () => {
		for (const pathname of [
			"/seeker/jobs/abc",
			"/seeker/me",
			"/seeker/chats",
			// 접두사만 같은 경로는 수다방이 아니다.
			"/seeker/communityx",
		]) {
			expect(resolveGate({ pathname, ...communityGuest })).toEqual({
				type: "redirect",
				to: "/seeker?auth=signup&guestBlocked=1",
			});
		}
	});
	it("still blocks anonymous visitors from the member community area", () => {
		expect(resolveGate({ pathname: "/seeker/community", ...fresh })).toEqual({
			type: "redirect",
			to: "/seeker?auth=login",
		});
	});
	it("sends guest from employer area to signup with guestBlocked signal", () => {
		expect(resolveGate({ pathname: "/employer", ...guest })).toEqual({
			type: "redirect",
			to: "/seeker?auth=signup&guestBlocked=1",
		});
	});
	it("sends guest at root to seeker", () => {
		expect(resolveGate({ pathname: "/", ...guest })).toEqual({
			type: "redirect",
			to: "/seeker",
		});
	});
	it("lets terms/privacy pass for logged-out visitors", () => {
		expect(resolveGate({ pathname: "/terms", ...fresh }).type).toBe("next");
		expect(resolveGate({ pathname: "/privacy", ...fresh }).type).toBe("next");
		expect(resolveGate({ pathname: "/terms", ...guest }).type).toBe("next");
		expect(resolveGate({ pathname: "/privacy", ...guest }).type).toBe("next");
	});
	it("lets the public job landings pass for anon and guest", () => {
		for (const pathname of ["/jobs", "/jobs/seoul", "/jobs/seoul/room-salon"]) {
			expect(resolveGate({ pathname, ...fresh }).type).toBe("next");
			expect(resolveGate({ pathname, ...guest }).type).toBe("next");
		}
	});
	it("lets the public board area pass for logged-out visitors", () => {
		for (const pathname of ["/board", "/board/free", "/board/free/abc"]) {
			expect(resolveGate({ pathname, ...fresh }).type).toBe("next");
			expect(resolveGate({ pathname, ...guest }).type).toBe("next");
		}
	});
	it("keeps job detail behind the gate even with the /jobs landing open", () => {
		expect(resolveGate({ pathname: "/seeker/jobs/abc", ...fresh }).type).toBe(
			"redirect"
		);
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
