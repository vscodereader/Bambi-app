import { describe, expect, it } from "vitest";

import {
	isLoginPopupScreen,
	popupPageOptionsForAudience,
	resolveMainPopupPageId,
} from "@/lib/bambi/main-popup-pages";

const customBoard = {
	key: "new_board",
	label: "새 게시판",
	slug: "new-board",
};

describe("main popup pages", () => {
	it("adds an admin-created board to popup page options", () => {
		expect(
			popupPageOptionsForAudience("job_seeker", [customBoard]).find(
				(page) => page.id === "community_board:new_board"
			)?.label
		).toBe("새 게시판");
	});

	it("resolves an admin-created board route to its stable popup page id", () => {
		expect(resolveMainPopupPageId("/board/new-board", [customBoard])).toBe(
			"community_board:new_board"
		);
		expect(
			resolveMainPopupPageId("/seeker/community/new-board", [customBoard])
		).toBe("community_board:new_board");
	});

	it("exposes 로그인 as a common popup position for every audience", () => {
		for (const audience of ["job_seeker", "employer"] as const) {
			expect(
				popupPageOptionsForAudience(audience).find(
					(page) => page.id === "login"
				)?.label
			).toBe("로그인");
		}
	});

	it("never resolves the login page from pathname alone", () => {
		expect(resolveMainPopupPageId("/seeker")).toBe("main");
	});
});

describe("isLoginPopupScreen", () => {
	const base = {
		authParam: null,
		isAuthenticated: false,
		isGuest: false,
		pathname: "/seeker",
	};

	it("treats an anonymous visitor on /seeker as the login screen", () => {
		expect(isLoginPopupScreen(base)).toBe(true);
	});

	it("treats a guest on /seeker with an auth query as the login screen", () => {
		expect(
			isLoginPopupScreen({ ...base, isGuest: true, authParam: "login" })
		).toBe(true);
		expect(
			isLoginPopupScreen({ ...base, isGuest: true, authParam: "signup" })
		).toBe(true);
	});

	it("does not treat a guest on /seeker without an auth query as the login screen", () => {
		expect(isLoginPopupScreen({ ...base, isGuest: true })).toBe(false);
		expect(
			isLoginPopupScreen({ ...base, isGuest: true, authParam: "other" })
		).toBe(false);
	});

	it("never treats an authenticated user as the login screen", () => {
		expect(isLoginPopupScreen({ ...base, isAuthenticated: true })).toBe(false);
	});

	it("only recognizes the /seeker route", () => {
		expect(isLoginPopupScreen({ ...base, pathname: "/jobs" })).toBe(false);
		expect(isLoginPopupScreen({ ...base, pathname: "/seeker/me" })).toBe(false);
	});
});
