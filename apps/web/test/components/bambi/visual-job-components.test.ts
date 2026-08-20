import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const componentPath = (fileName: string) =>
	srcPath(`components/bambi/${fileName}`);

const readComponent = (fileName: string) =>
	fs.readFileSync(componentPath(fileName), "utf8");

// 한 파일에 세로형·가로형이 같이 사는 컴포넌트는 소스 전체로 단정하면 한쪽 분기를 지워도
// 다른 쪽(또는 주석)의 같은 문자열에 걸려 초록으로 남는다. 그래서 함수 블록으로 잘라서 본다.
// 마커를 못 찾으면 조용히 빈 문자열이 되어 검사가 무의미해지므로 바로 던진다.
const blockBetween = (source: string, start: string, end: string) => {
	const from = source.indexOf(start);
	const to = source.indexOf(end, from);
	if (from < 0 || to < 0) {
		throw new Error(`block not found: ${start} … ${end}`);
	}
	return source.slice(from, to);
};

describe("visual job marketplace components", () => {
	it("defines a compact visual job card without a chat button", () => {
		const source = readComponent("visual-job-card.tsx");

		expect(source).toContain("export function VisualJobCard");
		expect(source).toContain(
			'tone: "organic" | "recommended" | "special" | "urgent"'
		);
		expect(source).toContain("splitPay");
		// 급여줄 단위 분리: 알려진 5종 목록은 유지하되(꼬리가 숫자가 아닌 "급여 협의"도 분리),
		// 목록 밖 수집 공고의 자유 텍스트 단위(건당·TC 등)도 뱃지로 빼도록 일반화됐다.
		// splitPay는 함수 단언용으로 export되지만, 이 파일은 @/ 별칭을 못 푸는 무설정 vitest라
		// import 대신 소스 규칙 존재를 grep으로 지킨다(다른 테스트와 동일 방식).
		expect(source).toContain(
			'const PAY_UNITS = ["시급", "일급", "주급", "월급", "급여", "연봉"]'
		);
		expect(source).toContain("export function splitPay");
		// 목록 밖 단위 일반화 분기 — 머리 1~4자·숫자 없음 + 꼬리 숫자 시작.
		expect(source).toContain("looksLikeFreeTextUnit");
		expect(source).toContain("head.length <= 4");
		expect(source).toContain("HEAD_HAS_DIGIT.test(head)");
		expect(source).toContain("TAIL_STARTS_WITH_DIGIT.test(tail)");
		// 카드의 채팅 버튼은 제거됨 — 채팅 진입은 공고 상세에서만 한다
		expect(source).not.toContain("채팅");
		expect(source).not.toContain("onChat");
		// 모든 노출 구역이 공유하는 카드에서 제목 → 업체 → 위치 순서와 7자 말줄임을 유지한다.
		expect(source).toContain("const JOB_CARD_TEXT_LIMIT = 7");
		expect(source).toContain("truncateJobCardText(job.title)");
		expect(source).toContain("truncateJobCardText(job.company)");
		expect(source).toContain("title={fullTextTitle(job.title)}");
		expect(source).toContain("title={fullTextTitle(job.company)}");
		// 최신(organic) 배지는 중립 톤 — 사용 색상 최소화
		expect(source).toContain("tone={toneBadge[tone]}");
		expect(source).toContain('organic: "neutral"');
		// 4열 컴팩트화로 설명(shortDesc) 줄과 truncateDesc는 제거됨
		expect(source).not.toContain("truncateDesc");
	});

	it("renders the ad-period badge in the salary row without adding a new row", () => {
		const source = readComponent("visual-job-card.tsx");

		// 배지는 lib 티어·포맷과 등급 아이콘을 쓴다. 아이콘은 공용 컴포넌트가 그린다 —
		// 업로드 이미지/프리셋 분기를 카드·안내·설정이 각자 재구현하지 않게 한다.
		expect(source).toContain("adPeriodTier");
		expect(source).toContain("formatAdPeriod");
		expect(source).toContain("AdPeriodTierIcon");
		expect(source).toContain("tier.iconImageUrl");
		// null이면 렌더하지 않는다(조건부 렌더)
		expect(source).toContain("job.adPeriod");
		// 급여 행(mt-auto)에 얹는다 — 새 행 추가 없이 오른쪽 끝(ml-auto) 배치
		expect(source).toContain("mt-auto flex items-center");
		expect(source).toContain("ml-auto");
		// 테두리 없이 글자처럼 얹고(border-0), pr-0으로 카드 콘텐츠 오른쪽 경계에 맞춘다.
		// py-0은 미관이 아니라 결합이다 — 아이콘 24px + 세로 패딩이 급여 행 h-9(36px)을
		// 넘으면 카드 높이가 늘어 광고 레일 비율(aspect-[259/122])까지 어긋난다.
		expect(source).toContain("border-0 py-0 pr-0");
		expect(source).toContain('className="size-6"');
		// 접근성 툴팁
		expect(source).toContain("누적");
	});

	it("shows the ad-period grade table on the employer ad guide", () => {
		const source = readComponent("screens/employer-ad-guide.tsx");

		// 등급표는 이제 운영자 설정값을 읽는 훅에서 온다(없으면 상수 폴백).
		expect(source).toContain("useAdPeriodTiers");
		expect(source).toContain("formatAdPeriodTierRange");
		expect(source).toContain("누적 광고일수 등급");
		// 카드와 같은 등급 아이콘 컴포넌트를 쓴다(업로드 이미지도 그대로 따라온다)
		expect(source).toContain("AdPeriodTierIcon");
		expect(source).toContain("tier.iconImageUrl");
	});

	// 등급 아이콘은 업로드 이미지가 프리셋을 이긴다. GIF를 애니메이션으로 보이게 하려면
	// next/image 최적화를 꺼야 한다 — unoptimized가 빠지면 첫 프레임만 남아 요구사항이 깨진다.
	it("prefers the uploaded tier icon image and keeps GIFs animated", () => {
		const source = readComponent("ad-period-tier-icon.tsx");

		expect(source).toContain("iconImageUrl");
		expect(source).toContain("unoptimized");
		expect(source).toContain("MedalIcon");
		expect(source).toContain("CrownIcon");
	});

	it("wires the ad-period tier settings section into the ad-products console", () => {
		const page = readComponent("../../app/moderator/ad-products/page.tsx");
		const settings = readComponent("ad-period-tier-settings.tsx");

		// 광고 상품 관리 페이지 하단에 등급 관리 섹션을 얹는다.
		expect(page).toContain("AdPeriodTierSettings");
		// 접이식 섹션은 shadcn Accordion으로 감싼다.
		expect(settings).toContain("Accordion");
		expect(settings).toContain("누적 광고일수 등급");
		// 목록 조회·CRUD 뮤테이션을 orpc로 연결한다.
		expect(settings).toContain("adPeriodTiers.list");
		expect(settings).toContain("adPeriodTiers.create");
		expect(settings).toContain("adPeriodTiers.update");
		expect(settings).toContain("adPeriodTiers.remove");
		// 색·아이콘은 자유 입력이 아니라 프리셋/토글에서 고른다.
		expect(settings).toContain("AD_PERIOD_TIER_COLOR_PRESETS");
		expect(settings).toContain("ToggleGroup");
		// 프리셋 대신 쓸 아이콘 이미지를 직접 올릴 수 있다(GIF 포함).
		expect(settings).toContain("adPeriodTiers.createIconUpload");
		expect(settings).toContain("uploadFileToSignedUrl");
		expect(settings).toContain("image/gif");
	});

	it("makes every ad banner link to the advertised job detail page", () => {
		const banner = readComponent("ad-banner.tsx");

		// 가로·세로 배너 모두 next/link로 감싸 광고 공고 상세로 이동한다
		expect(banner).toContain('from "next/link"');
		expect(banner).toContain("<Link");
		// 링크 주소는 매퍼(toAdBannerItem)가 만든다 — 검증은 api-job-mapper.test.ts.
		expect(banner).toContain("item.href");
		expect(banner).toContain("item.id");
		// 배너 이미지는 슬롯 규격으로 업로드된 배너(AdBannerItem.imageUrl)를 쓴다 — 커버가 아니다
		expect(banner).toContain("item.imageUrl");
		expect(banner).not.toContain("item.coverUrl");
	});

	// 수집 배너는 방향과 무관하게 결제 배너와 같은 규격 슬롯에 채워 그린다.
	// 세로: 원본 실측 80×180 = 정확히 4:9라 규격(aspect-[4/9] h-52)을 object-cover로 채워도
	// 잘리는 곳이 없다.
	// 가로: 슬롯을 object-fill로 채운다 — 원본 실측 240×117(≈2.05)이 슬롯 비율과 달라 눌리지만,
	// 슬롯이 이미지 크기대로 늘었다 줄었다 하면 옆 결제 슬롯·레일과 높이가 어긋난다(사용자 결정)
	// — 그래서 원본 비율(h-auto) 분기는 양쪽 다 없다.
	it("renders crawled banners at our spec slots in both orientations", () => {
		const banner = readComponent("ad-banner.tsx");
		const vertical = blockBetween(
			banner,
			"export function AdBanner({",
			"interface AdBannerRailProps"
		);
		const horizontal = blockBetween(
			banner,
			"export function HorizontalAdBanner({",
			"interface HorizontalAdBannerRailProps"
		);

		// 세로형은 수집·결제 구분 없이 규격 슬롯 + cover 하나로 그린다.
		expect(vertical).toContain("aspect-[4/9] h-52 w-auto rounded-lg");
		expect(vertical).toContain('"object-cover"');
		expect(vertical).not.toContain("item.crawled");
		expect(vertical).not.toContain("h-auto");
		// 가로형도 수집·결제 구분 없이 규격 슬롯 하나로 그린다. 기본값 16:9는 상단 프리미엄
		// 3칸이 쓰는 값이라 좌측 레일 높이를 맞추더라도 여기서 바뀌면 안 된다.
		expect(horizontal).toContain("aspect-[16/9] w-full rounded-lg border");
		expect(horizontal).not.toContain("aspect-[259/122]");
		expect(horizontal).toContain('"object-fill"');
		expect(horizontal).not.toContain("item.crawled");
		expect(horizontal).not.toContain("h-auto");
		// 갈 곳 없는 배너는 이제 없다(매퍼가 수집 전용 상세 주소를 만든다).
		expect(banner).not.toContain("if (!item.href)");
	});

	// 좌측 사이드(w-[259px]) 레일 슬롯은 공고 카드 높이 122px에 맞춘다 —
	// 16:9면 ≈146px라 옆 카드보다 커진다. 고정 px가 아니라 비율로 처리한다.
	it("sizes the left rail slots to the job card height", () => {
		const banner = readComponent("ad-banner.tsx");
		const rail = blockBetween(
			banner,
			"export function HorizontalAdBannerRail({",
			"</div>"
		);

		expect(banner).toContain(
			'const RAIL_SLOT_ASPECT_CLASS = "aspect-[259/122]"'
		);
		// 세 렌더 경로(배너·자리표시·스켈레톤)가 모두 같은 비율 상수를 쓴다.
		expect(rail.match(/RAIL_SLOT_ASPECT_CLASS/g)).toHaveLength(3);
		expect(rail).not.toContain("aspect-[16/9]");
		// 폭이 변해도 안 깨지도록 고정 높이는 두지 않는다.
		expect(rail).not.toContain("h-[");
	});

	// 수집 공고는 job_post에 없어 /seeker/jobs/[id]로 보내면 404다 — 카드도 배너와 같은
	// 수집 전용 상세로 가야 한다.
	it("routes crawled cards to the crawled detail page", () => {
		const marketplace = readComponent("screens/seeker-marketplace.tsx");

		expect(marketplace).toContain("job.crawled");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: 소스의 라우트 리터럴을 검증
		expect(marketplace).toContain("/seeker/jobs/crawled/${job.id}");
	});

	// 수집 공고 상세는 우리 검수·인증 배지를 달 수 없고(우리가 본 적 없는 공고다), 반대로
	// 출처를 알리는 배지·고지도 두지 않는다 — 화면에는 공고 내용만 남긴다.
	// 채팅·후기·신고·연락처는 여전히 없다 — 응대할 담당자가 우리 서비스에 없다.
	it("shows the crawled job detail without our verification signals", () => {
		const source = readComponent("screens/seeker-crawled-job-detail.tsx");

		expect(source).not.toContain("외부 수집");
		expect(source).not.toContain("외부에서 수집");
		expect(source).not.toContain("검수 통과");
		expect(source).not.toContain("검증 완료");
		expect(source).not.toContain("채팅 시작");
		expect(source).not.toContain("JobReviewSection");
		expect(source).not.toContain("ReportDialog");
		// 좌·우 광고 레일 배치는 우리 공고 상세와 같다.
		expect(source).toContain("HorizontalAdBannerRail");
		expect(source).toContain("AdBannerRail");
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

	// 섹션 헤더의 개수 표기는 제거됐다 — 크롤링 주입 상한·슬롯 컷·단기성 크롤링 변동이 겹쳐
	// 어떤 기준(배열/카드/자격 총량)으로 세도 다른 숫자와 어긋났다(헤더 14 vs 카드 12 버그).
	// 헤더에는 라벨(meta)만 남긴다.
	it("renders section headers without a job count", () => {
		const source = readComponent("visual-job-exposure-sections.tsx");

		expect(source).not.toContain("개 · {meta}");
		expect(source).not.toContain("{jobs.length}개");
		expect(source).not.toContain("{shownJobs.length}개");
	});

	it("wires the seeker marketplace to visual exposure sections", () => {
		const source = readComponent("screens/seeker-marketplace.tsx");

		expect(source).toContain("VisualJobExposureSections");
		expect(source).not.toContain("<JobList");
		// 로그인 마켓플레이스는 채용 전용 고정폭을 쓴다(SEEKER_CONTENT_WIDTH = min(92%,1120px))
		expect(source).toContain("SEEKER_CONTENT_WIDTH");
		expect(source).not.toContain("max-w-[80%]");
		expect(source).not.toContain("조건에 맞는 안전한 자리를 찾아요");
		// 탐색 바(세그먼트 탭·퀵칩·본문 검색·필터 버튼·필터 시트)는 전부 걷어냈다.
		// 검색은 헤더(SeekerAppShell)로, 필터는 1720px+ 사이드바로만 남는다.
		expect(source).toContain("useSeekerFilters");
		expect(source).toContain("MarketplaceFilterControls");
		expect(source).not.toContain("MarketplaceDiscoveryBar");
		expect(source).not.toContain("MarketplaceDiscoveryAxisChips");
		expect(source).not.toContain("MarketplaceFilterSheet");
		expect(source).not.toContain("MarketplaceSearch");
	});

	it("hosts the seeker marketplace search in the shared header only on /seeker", () => {
		const source = readComponent("seeker-app-shell.tsx");

		expect(source).toContain("export function SeekerAppShell");
		expect(source).toContain("useSeekerFilters");
		expect(source).toContain('pathname === "/seeker"');
		// 마켓플레이스에서만 데스크톱·모바일 두 헤더에 검색을 끼운다. 두 헤더는 CSS로만
		// 숨겨질 뿐 항상 함께 마운트되므로 Ctrl/Cmd+K 리스너는 데스크톱 쪽에서만 켠다.
		expect(source).toContain(
			"isMarketplace ? <SeekerHeaderSearch withHotkey />"
		);
		expect(source).toContain(
			"mobileHeaderSlot={isMarketplace ? <SeekerHeaderSearch /> : undefined}"
		);
		// 헤더 검색은 아이콘 버튼 트리거의 모달(JobSearchCommand)이다. 고정폭 검색창을
		// 되살리면 내비가 압축돼 마지막 항목("고객센터") 끝 글자가 잘린다.
		expect(source).toContain("JobSearchCommand");
		expect(source).not.toContain('trigger="header"');
		expect(source).not.toContain('className="relative w-48"');
		expect(source).not.toContain("w-64");
		// 모든 seeker 페이지 헤더를 /seeker와 동일한 고정폭으로 통일한다(경로별 분기 없음)
		expect(source).toContain("contentWidthClassName={SEEKER_CONTENT_MAX_W}");
		expect(source).not.toContain("isJobArea");
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
		const myPageLayout = readComponent("../../app/seeker/me/layout.tsx");

		// 채팅 목록·상세·연락처 공개 본문을 헤더와 동일한 고정폭으로 맞춘다
		for (const source of [chatList, chatRoom, contactReveal]) {
			expect(source).toContain("SEEKER_CONTENT_WIDTH");
		}
		// 내 정보(마이페이지) 폭 캡은 공용 셸이 아니라 me/layout.tsx가 seeker 중앙 컬럼과
		// 같은 SEEKER_CONTENT_WIDTH로 건다(셸은 캡 없이 그 안을 채운다).
		expect(myPageLayout).toContain("SEEKER_CONTENT_WIDTH");
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
		expect(source).toContain("공고 썸네일 반영");
		// 썸네일 미리보기는 실제 공고 카드(visual-job-card)와 같은 h-14 w-30 규격이어야 한다.
		expect(source).toContain("h-14 w-30");
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
		// 운영자 메뉴는 layout에서 lib의 공통 목록으로 빠졌다(데스크톱 헤더·모바일 더보기 공용).
		const navItems = readComponent("../../lib/bambi/moderator-navigation.ts");
		const nav = readComponent("persona-nav.tsx");
		expect(page).toContain("listCatalogAdmin");
		expect(page).toContain("effectiveDiscountPercent");
		expect(page).toContain("기간 할인");
		expect(page).toContain("campaign.startsAt");
		expect(page).toContain("campaign.endsAt");
		expect(page).toContain('"무기한"');
		expect(page).not.toContain('dateStyle: "medium"');
		expect(page).toContain('year: "numeric"');
		expect(page).toContain('month: "numeric"');
		expect(page).toContain('day: "numeric"');
		expect(page).toContain("collapsedPlacementIds");
		expect(page).toContain("collapsedProductIds");
		expect(page).toContain(
			"flex flex-col items-start gap-2 text-muted-foreground text-sm"
		);
		expect(navItems).toContain("/moderator/ad-products");
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
		// 비용은 기간별 가격 강조 표기 — 할인 반영 공용 태그(원가 취소선+할인가+뱃지)로 렌더한다
		expect(source).toContain("AdPriceTag");
		expect(source).toContain("amount={option.amount}");
		expect(source).toContain("formatAdDuration(option.days)");
		// 데스크톱은 4열 그리드 행으로 전환. PR #29에서 비용·신청 열을 auto에서
		// minmax 트랙으로 바꿔(열 폭이 내용에 따라 튀지 않게) 템플릿이 갱신됐다.
		expect(source).toContain(
			"md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)]"
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
		expect(layout).toContain("/employer/ad-guide");
		expect(layout).toContain("광고 안내");
		// 진입점을 헤더 nav 하나로 일원화(PR #26)했더니 모바일에서 광고 안내에 닿을 길이
		// 사라졌다 — 그 헤더는 hidden md:block이고 하단 탭 5개에도 없기 때문이다.
		// 그래서 대시보드 퀵링크를 되살렸다. 헤더 nav만 남기면 안 된다.
		expect(dashboard).toContain('href: "/employer/ad-guide" as Route');
	});

	it("keeps the bottom tab bar visible on /employer/ad-guide", () => {
		const nav = readComponent("persona-nav.tsx");

		// showNav에서 빠져 있으면 광고 안내에 들어간 순간 하단 탭이 사라져 모바일에서
		// 되돌아갈 길이 없다(실제로 그 막다른 길이 났었다).
		expect(nav).toContain('path.startsWith("/employer/ad-guide")');
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
