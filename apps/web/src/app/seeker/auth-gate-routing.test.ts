import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
	readFileSync(new URL(relative, import.meta.url), "utf8");

const layout = read("./layout.tsx");
const page = read("./page.tsx");

describe("seeker 인증 게이트 라우팅", () => {
	it("layout은 anon에게만 게이트 화면을 그리고 게스트는 page로 넘긴다", () => {
		expect(layout).toContain('visitor === "anon"');
		expect(layout).toContain("<SeekerAuthGateScreen />");
		// 게스트는 셸 없이 children만 — 셸을 씌우면 page가 게이트 전체 화면을 못 그린다.
		expect(layout).toContain('visitor === "guest"');
		expect(layout).toContain("return children;");
	});

	it("page가 ?auth= 쿼리를 읽어 게스트에게 같은 게이트 화면을 그린다", () => {
		// layout은 searchParams를 못 받으므로 이 분기는 반드시 page에 있어야 한다.
		expect(page).toContain("searchParams");
		expect(page).toContain('auth === "login" || auth === "signup"');
		expect(page).toContain("<SeekerAuthGateScreen />");
	});

	it("실제 목록 위에 겹치는 인증 다이얼로그를 더는 쓰지 않는다", () => {
		expect(page).not.toContain("AuthDialog");
	});

	it("게이트로 돌려보내진 게스트에게 안내 토스트를 계속 띄운다", () => {
		expect(page).toContain("<GuestBlockedToast />");
	});
});
