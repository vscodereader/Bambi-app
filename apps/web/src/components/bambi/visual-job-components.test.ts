import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = (fileName: string) =>
	path.join(import.meta.dirname, fileName);

const readComponent = (fileName: string) =>
	fs.readFileSync(componentPath(fileName), "utf8");

describe("visual job marketplace components", () => {
	it("defines a compact visual job card with promotion, safety, and chat affordances", () => {
		const source = readComponent("visual-job-card.tsx");

		expect(source).toContain("export function VisualJobCard");
		expect(source).toContain(
			'tone: "organic" | "recommended" | "special" | "urgent"'
		);
		expect(source).toContain("채팅");
		expect(source).toContain("splitPay");
		expect(source).toContain("rightIcon={<Message />}");
		// 최신(organic) 배지는 중립 톤 — 사용 색상 최소화
		expect(source).toContain("tone={toneBadge[tone]}");
		expect(source).toContain('organic: "neutral"');
		// 4열 컴팩트화로 설명(shortDesc) 줄과 truncateDesc는 제거됨
		expect(source).not.toContain("truncateDesc");
	});

	it("makes every ad banner link to the advertised job detail page", () => {
		const banner = readComponent("ad-banner.tsx");
		const links = readComponent("../../lib/bambi/ad-links.ts");

		// 가로·세로 배너 모두 next/link로 감싸 광고 공고 상세로 이동한다
		expect(banner).toContain('from "next/link"');
		expect(banner).toContain("adJobHref");
		expect(banner).toContain("<Link");
		// 세로 배너도 클릭 대상 — seed로 결정적 공고 매핑
		expect(banner).toContain("seed={banner.src}");
		// 링크는 실제 공고 상세(/seeker/jobs/{id})이며 프로모션 공고를 광고 대상으로 삼는다
		expect(links).toContain("/seeker/jobs/");
		expect(links).toContain("isPromoted");
	});

	it("defines visual exposure sections with special, urgent, recommended, and organic groups", () => {
		const source = readComponent("visual-job-exposure-sections.tsx");

		expect(source).toContain("export function VisualJobExposureSections");
		expect(source).toContain("getVisualJobExposureSections");
		expect(source).toContain("스페셜 채용");
		expect(source).toContain("급구 채용");
		expect(source).toContain("추천 채용");
		expect(source).toContain("전체 공고");
		expect(source).toContain("<VisualJobCard");
		// 모든 섹션이 동일 반응형 그리드를 공유해 한 행에 최대 3열까지 카드를 보여줌
		expect(source).toContain("lg:grid-cols-3");
		expect(source).not.toContain("2xl:grid-cols-4");
	});

	it("wires the seeker marketplace to visual exposure sections", () => {
		const source = readComponent("screens/seeker-marketplace.tsx");

		expect(source).toContain("VisualJobExposureSections");
		expect(source).not.toContain("<JobList");
		// 로그인 마켓플레이스는 채용 전용 고정폭을 쓴다(SEEKER_CONTENT_WIDTH = min(92%,1120px))
		expect(source).toContain("SEEKER_CONTENT_WIDTH");
		expect(source).not.toContain("max-w-[80%]");
		expect(source).not.toContain("조건에 맞는 안전한 자리를 찾아요");
		// 검색은 헤더(SeekerAppShell)와 필터를 공유하고, 본문 검색은 모바일 전용
		expect(source).toContain("useSeekerFilters");
		expect(source).toContain('searchFieldClassName="md:hidden"');
	});

	it("hosts the seeker marketplace search in the shared header only on /seeker", () => {
		const source = readComponent("seeker-app-shell.tsx");

		expect(source).toContain("export function SeekerAppShell");
		expect(source).toContain("useSeekerFilters");
		expect(source).toContain('pathname === "/seeker"');
		// 마켓플레이스에서만 헤더에 검색창을 끼운다
		expect(source).toContain(
			"headerSlot={isMarketplace ? <SeekerHeaderSearch />"
		);
	});

	it("wires the public marketplace to visual exposure sections", () => {
		const source = readComponent("screens/public-marketplace.tsx");

		expect(source).toContain("VisualJobExposureSections");
		expect(source).not.toContain("<JobList");
		// 본문 컨테이너는 고정폭이 아닌 유동 폭(뷰포트 비례)을 사용하며 헤더와 동일하게 맞춘다
		expect(source).toContain("max-w-[80%]");
		// 검색창을 헤더(연락처 보호 왼쪽)로 옮기고 본문 검색은 모바일 전용으로 둔다
		expect(source).toContain("headerSlot={headerSearch}");
		expect(source).toContain('searchFieldClassName="md:hidden"');
		// 히어로 카피 블록은 제거됨
		expect(source).not.toContain("밤비 안에서 먼저 대화해요");
	});

	it("uses 80% width for the employer page shell", () => {
		const source = readComponent("page-shell.tsx");

		// 구인자 화면 본문도 헤더와 동일 폭(min(80%,72rem))으로 맞춘다
		expect(source).toContain("max-w-[min(80%,72rem)]");
		expect(source).not.toContain("max-w-6xl");
	});

	it("defines employer listing preview with cover fallback and preview copy", () => {
		const source = readComponent("employer-listing-preview.tsx");

		expect(source).toContain("export function EmployerListingPreview");
		expect(source).toContain("목록 노출 미리보기");
		expect(source).toContain("대표 이미지 반영");
		expect(source).toContain("coverImageUrl");
		expect(source).toContain("displayCompanyName");
	});

	it("wires employer create and edit pages to listing preview", () => {
		const newSource = readComponent("../../app/employer/new/page.tsx");
		const editSource = readComponent(
			"../../app/employer/jobs/[id]/edit/page.tsx"
		);

		expect(newSource).toContain("EmployerListingPreview");
		expect(newSource).toContain("previewPay");
		expect(newSource).toContain("previewCompanyName");
		expect(editSource).toContain("EmployerListingPreview");
		expect(editSource).toContain("previewPay");
		expect(editSource).toContain("previewCompanyName");
	});
});
