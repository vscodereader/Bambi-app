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

		// 가로·세로 배너 모두 next/link로 감싸 광고 공고 상세로 이동한다
		expect(banner).toContain('from "next/link"');
		expect(banner).toContain("<Link");
		// 링크는 결제완료 배너 공고 실데이터의 상세(/seeker/jobs/{id})로 직행한다
		expect(banner).toContain("/seeker/jobs/");
		expect(banner).toContain("item.id");
		// 배너 이미지는 해당 공고 커버(AdBannerItem.coverUrl)를 쓴다
		expect(banner).toContain("item.coverUrl");
	});

	it("defines visual exposure sections with special, urgent, recommended, and organic groups", () => {
		const source = readComponent("visual-job-exposure-sections.tsx");

		expect(source).toContain("export function VisualJobExposureSections");
		// 서버 노출 섹션을 파생 없이 그대로 소비한다(getVisualJobExposureSections 제거)
		expect(source).not.toContain("getVisualJobExposureSections");
		expect(source).toContain("sections.special");
		expect(source).toContain("sections.urgent");
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
		// 모든 seeker 페이지 헤더를 /seeker와 동일한 고정폭으로 통일한다(경로별 분기 없음)
		expect(source).toContain("contentWidthClassName={SEEKER_CONTENT_MAX_W}");
		expect(source).not.toContain("isJobArea");
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

	it("aligns the employer page shell to the shared fixed content width", () => {
		const source = readComponent("page-shell.tsx");

		// 구인자 본문도 채용(/seeker) 헤더와 동일한 고정폭(APP_CONTENT_WIDTH = min(92%,1120px))을 쓴다
		expect(source).toContain("APP_CONTENT_WIDTH");
		expect(source).not.toContain("max-w-[min(80%,72rem)]");
		expect(source).not.toContain("max-w-6xl");
	});

	it("aligns the employer header to the shared fixed content width", () => {
		const source = readComponent("../../app/employer/layout.tsx");

		// 구인자 헤더 바를 채용(/seeker)과 동일한 고정폭으로 통일한다
		expect(source).toContain("contentWidthClassName={APP_CONTENT_MAX_W}");
	});

	it("aligns seeker chat and profile content to the shared fixed width", () => {
		const chatList = readComponent("screens/seeker-chat-list-responsive.tsx");
		const chatRoom = readComponent("screens/seeker-chat-room-responsive.tsx");
		const contactReveal = readComponent("screens/contact-reveal.tsx");
		const seeker = readComponent("screens/seeker.tsx");

		// 채팅 목록·상세·연락처 공개·내 정보 본문을 헤더와 동일한 고정폭으로 맞춘다
		for (const source of [chatList, chatRoom, contactReveal, seeker]) {
			expect(source).toContain("SEEKER_CONTENT_WIDTH");
		}
		// 개별 하드코딩 폭은 제거됐다(공유 상수로 대체)
		expect(chatList).not.toContain("max-w-[860px]");
		expect(chatList).not.toContain("max-w-[760px]");
		expect(chatRoom).not.toContain("md:max-w-[80%]");
		expect(contactReveal).not.toContain("md:max-w-[80%]");
	});

	it("aligns the moderator header to the shared fixed content width", () => {
		const source = readComponent("../../app/moderator/layout.tsx");

		// 운영자 헤더 바도 채용(/seeker)과 동일한 고정폭으로 통일한다(콘솔 본문 폭은 그대로)
		expect(source).toContain("contentWidthClassName={APP_CONTENT_MAX_W}");
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

	it("wires the moderator ad-products console and nav", () => {
		const page = readComponent("../../app/moderator/ad-products/page.tsx");
		const layout = readComponent("../../app/moderator/layout.tsx");
		const nav = readComponent("persona-nav.tsx");
		expect(page).toContain("listCatalogAdmin");
		expect(layout).toContain("/moderator/ad-products");
		expect(nav).toContain("adProducts");
	});

	it("wires ad-product create forms to catalog mutations", () => {
		const placementNew = readComponent(
			"../../app/moderator/ad-products/new/page.tsx"
		);
		const productNew = readComponent(
			"../../app/moderator/ad-products/[placementId]/new/page.tsx"
		);
		expect(placementNew).toContain("createPlacement");
		expect(productNew).toContain("createProduct");
		expect(productNew).toContain("AdProductForm");
	});

	it("renders the employer ad guide from the dynamic catalog", () => {
		const source = readComponent("screens/employer-ad-guide.tsx");
		expect(source).toContain("adProducts.getCatalog");
		expect(source).not.toContain("AD_PRODUCTS");
	});

	it("lays out the ad guide as a reference-style placement table with a preview", () => {
		const source = readComponent("screens/employer-ad-guide.tsx");

		// 광고 위치 열은 운영자가 올린 미리보기 이미지가 담당한다
		expect(source).toContain("previewImageUrl");
		expect(source).toContain("src={product.previewImageUrl}");
		// previewImageUrl이 없으면 "미리보기 없음"을 표시한다
		expect(source).toContain("미리보기 없음");
		// 표 컬럼 라벨(광고 위치·서비스 내용·비용·신청)
		expect(source).toContain("광고 위치");
		expect(source).toContain("서비스 내용");
		expect(source).toContain("비용");
		expect(source).toContain("신청");
		// 비용은 기간별 가격 강조 표기
		expect(source).toContain("formatAdPrice(option.amount)");
		expect(source).toContain("formatAdDuration(option.days)");
		// 데스크톱은 그리드 행으로 전환
		expect(source).toContain(
			"md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto_auto]"
		);
		// 신청 버튼은 기존 공고 등록 링크(/employer/new)를 유지
		expect(source).toContain('const APPLY_HREF = "/employer/new"');
	});

	it("wires the /employer/ad-guide entry points", () => {
		const route = readComponent("../../app/employer/ad-guide/page.tsx");
		const layout = readComponent("../../app/employer/layout.tsx");
		const dashboard = readComponent("../../app/employer/page.tsx");

		// 라우트가 광고 안내 화면을 렌더링한다
		expect(route).toContain("EmployerAdGuideScreen");
		// 구인자 헤더 nav 항목
		expect(layout).toContain("/employer/ad-guide");
		expect(layout).toContain("광고 안내");
		// 대시보드 바로가기 타일
		expect(dashboard).toContain("/employer/ad-guide");
		expect(dashboard).toContain("광고 상품 안내");
	});

	it("wires the ad-products console edit links to the edit routes", () => {
		const page = readComponent("../../app/moderator/ad-products/page.tsx");

		// 위치 카드에는 위치 수정 라우트 링크가 있다
		// biome-ignore lint/suspicious/noTemplateCurlyInString: 소스의 라우트 리터럴을 검증
		expect(page).toContain("/moderator/ad-products/${placement.id}/edit");
		// 상품 행에는 상품 수정 라우트 링크가 있다
		// biome-ignore lint/suspicious/noTemplateCurlyInString: 소스의 라우트 리터럴을 검증
		expect(page).toContain("${product.id}/edit");
	});

	it("wires the ad-products edit pages to catalog update mutations", () => {
		const placementEdit = readComponent(
			"../../app/moderator/ad-products/[placementId]/edit/page.tsx"
		);
		const productEdit = readComponent(
			"../../app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx"
		);

		// 위치 수정 페이지는 프리필 폼과 updatePlacement 뮤테이션을 연결한다
		expect(placementEdit).toContain("updatePlacement");
		expect(placementEdit).toContain("AdPlacementForm");
		expect(placementEdit).toContain("initialValue");
		// 상품 수정 페이지는 프리필 폼과 updateProduct 뮤테이션을 연결한다
		expect(productEdit).toContain("updateProduct");
		expect(productEdit).toContain("AdProductForm");
		expect(productEdit).toContain("initialValue");
	});
});
