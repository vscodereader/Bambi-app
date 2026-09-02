import { describe, expect, it } from "vitest";
import { resolveGate } from "@/lib/bambi/resolve-gate";

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
	it("sends anonymous visitors from gated seeker paths to the login overlay", () => {
		expect(resolveGate({ pathname: "/seeker/jobs/abc", ...fresh })).toEqual({
			type: "redirect",
			to: "/seeker?auth=login",
		});
	});
	it("permanently redirects anon and guest at root to canonical /seeker", () => {
		expect(resolveGate({ pathname: "/", ...fresh })).toEqual({
			type: "redirect",
			to: "/seeker",
			permanent: true,
		});
		expect(resolveGate({ pathname: "/", ...guest })).toEqual({
			type: "redirect",
			to: "/seeker",
			permanent: true,
		});
	});
	it("lets arbitrary nonexistent paths fall through to a real 404", () => {
		// 게이트되지 않은 경로는 next로 흘려 Next의 not-found가 진짜 404를 내게 한다
		// (예전 soft-404: 미존재 경로가 307→로그인 200으로 남던 문제).
		for (const pathname of ["/random-xyz", "/this-page-does-not-exist"]) {
			expect(resolveGate({ pathname, ...fresh }).type).toBe("next");
			expect(resolveGate({ pathname, ...guest }).type).toBe("next");
		}
	});
	it("lets /welcome and /login fall through (redirects/404 handle them, not the gate)", () => {
		// next.config redirects가 프록시보다 먼저 308로 흡수하고, 그게 실패해도
		// 404가 로그인 리다이렉트보다 낫다.
		for (const pathname of ["/welcome", "/login"]) {
			expect(resolveGate({ pathname, ...fresh }).type).toBe("next");
			expect(resolveGate({ pathname, ...guest }).type).toBe("next");
		}
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
	it("lets every visitor open the community home preview", () => {
		expect(resolveGate({ pathname: "/seeker/community", ...guest })).toEqual({
			type: "next",
		});
		expect(resolveGate({ pathname: "/seeker/community", ...fresh })).toEqual({
			type: "next",
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
	it("still blocks anonymous visitors from community boards and details", () => {
		expect(
			resolveGate({ pathname: "/seeker/community/free", ...fresh })
		).toEqual({
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
	it("keeps every gated root behind the login overlay for anon visitors", () => {
		for (const pathname of [
			"/ad-banner-editor",
			"/employer",
			"/employer/jobs",
			"/manual",
			"/moderator",
			"/moderator/x",
			"/onboarding",
			"/preview",
			"/support",
		]) {
			expect(resolveGate({ pathname, ...fresh })).toEqual({
				type: "redirect",
				to: "/seeker?auth=login",
			});
		}
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
	it("lets the point shop pass for logged-out visitors", () => {
		expect(resolveGate({ pathname: "/point-shop", ...fresh })).toEqual({
			type: "next",
		});
		expect(resolveGate({ pathname: "/point-shop", ...guest })).toEqual({
			type: "next",
		});
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
