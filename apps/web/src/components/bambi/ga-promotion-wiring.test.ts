import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 프리미엄 배너 GA4 프로모션 계측(이슈 #59)의 지면 와이어링 단언.
// 지면마다 promotionSurface 접두어가 달라 소스를 직접 읽어 구조를 확인한다.
const SRC_ROOT = path.join(import.meta.dirname, "..", "..");

const read = (relativePath: string) =>
	fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");

// 슬롯 이름은 접두어 + 1-base 칸 순번이다. 평문 문자열로 쓰면 린트가
// noTemplateCurlyInString으로 막고, 템플릿 리터럴은 포매터가 다시 평문으로 되돌린다 —
// 정규식으로 소스의 보간 표현식을 그대로 찾는다.
const SLOT_EXPRESSION = /\$\{promotionSurface\}_\$\{index \+ 1\}/;

const SURFACES = [
	{
		expects: [
			'promotionSurface="seeker_center"',
			'promotionSurface="seeker_left"',
			'promotionSurface="seeker_right"',
		],
		label: "구직자 마켓플레이스",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-marketplace.tsx"
		),
	},
	{
		expects: ['promotionSurface="community_center"'],
		label: "수다방 홈",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"community-home.tsx"
		),
	},
	{
		expects: [
			'promotionSurface="community_left"',
			'promotionSurface="community_right"',
		],
		label: "수다방 레이아웃 rail",
		relativePath: path.join("app", "seeker", "community", "layout.tsx"),
	},
	{
		expects: [
			'promotionSurface="support_left"',
			'promotionSurface="support_right"',
		],
		label: "고객센터 레이아웃 rail",
		relativePath: path.join("app", "support", "layout.tsx"),
	},
	{
		expects: [
			'promotionSurface="chats_left"',
			'promotionSurface="chats_right"',
		],
		label: "채팅 목록 rail",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-chat-list-responsive.tsx"
		),
	},
	{
		expects: [
			'promotionSurface="job_detail_left"',
			'promotionSurface="job_detail_right"',
		],
		label: "공고 상세 rail",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-job-detail-responsive.tsx"
		),
	},
	{
		expects: [
			'promotionSurface="crawled_detail_left"',
			'promotionSurface="crawled_detail_right"',
		],
		label: "수집 공고 상세 rail",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-crawled-job-detail.tsx"
		),
	},
];

describe("GA 프로모션 지면 와이어링", () => {
	for (const surface of SURFACES) {
		it(`${surface.label}에 promotionSurface가 연결돼 있다`, () => {
			const source = read(surface.relativePath);
			for (const expected of surface.expects) {
				expect(source).toContain(expected);
			}
		});
	}

	it("배너 프레임이 크롤링 배너를 계측에서 거른다", () => {
		const source = read(path.join("components", "bambi", "ad-banner.tsx"));
		expect(source).toContain("shouldTrackPromotion");
		expect(source).toContain("trackPromotionView");
		expect(source).toContain("trackPromotionSelect");
		expect(source).toContain("usePromotionImpression");
	});

	it("프리미엄 섹션이 칸 순번으로 슬롯 이름을 만든다", () => {
		const source = read(
			path.join("components", "bambi", "premium-ad-banner-section.tsx")
		);
		expect(source).toContain("promotionSurface");
		expect(source).toMatch(SLOT_EXPRESSION);
	});
});
