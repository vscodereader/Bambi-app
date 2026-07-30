import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.join(import.meta.dirname, "..", "..");

const readSource = (...segments: string[]) =>
	fs.readFileSync(path.join(SRC_ROOT, ...segments), "utf8");

describe("seeker chat role guard", () => {
	it("blocks non job seekers at the chat route with a server layout", () => {
		const layout = readSource(
			"app",
			"seeker",
			"jobs",
			"[id]",
			"chat",
			"layout.tsx"
		);

		// 페이지가 클라이언트 컴포넌트라, 렌더 전에 막으려면 서버 레이아웃이어야 한다.
		expect(layout).toContain("export default async function");
		expect(layout).toContain("await enforceJobSeekerAccess()");
	});

	it("sends the wrong role to its own home instead of the signup gate", () => {
		const requireRole = readSource("lib", "bambi", "require-role.ts");

		expect(requireRole).toContain(
			"export async function enforceJobSeekerAccess"
		);
		// 역할 불일치를 /seeker 인증 오버레이로 보내면 로그인한 구인자에게 가입 화면이 떠
		// 로그아웃된 것처럼 보인다. 기존 운영자·구인자 가드와 같은 처리를 쓴다.
		expect(requireRole).toContain('routing.role !== "job_seeker"');
		expect(requireRole).toContain("redirect(homePathForRole(routing.role))");
	});

	it("no longer pushes the signup gate from the chat preflight", () => {
		const page = readSource(
			"app",
			"seeker",
			"jobs",
			"[id]",
			"chat",
			"page.tsx"
		);

		// 이 리다이렉트가 원래 버그였다: 구인자가 채팅으로 이어가면 가입 게이트로 튕겼다.
		// 로그인 유도(?auth=login)는 정상이므로 가입 경로만 금지한다.
		expect(page).not.toContain('router.push("/seeker?auth=signup"');
	});

	it("hides the chat CTA on the job detail page when chatting is not allowed", () => {
		const detail = readSource(
			"components",
			"bambi",
			"screens",
			"seeker-job-detail-responsive.tsx"
		);

		expect(detail).toContain("canStartChat: boolean");
		// 데스크톱 사이드 CTA와 모바일 하단 고정 CTA 둘 다 같은 조건으로 감춘다.
		expect(detail.match(/canStartChat \?/g)?.length).toBeGreaterThanOrEqual(3);

		const detailPage = readSource("app", "seeker", "jobs", "[id]", "page.tsx");

		// 화면 조건과 서버 가드가 같은 기준(구직자만)을 써야 어긋나지 않는다.
		expect(detailPage).toContain('role === "job_seeker"');
		expect(detailPage).toContain("canStartChat={canStartChat}");
	});
});
