import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

// 좌우 사이드 배너 rail을 쓰는 화면들. 경로가 서로 달라 소스를 직접 읽어 구조를 단언한다.
const SRC_ROOT = srcPath(".");

const RAIL_SCREENS = [
	{
		label: "수다방 rail",
		relativePath: path.join(
			"app",
			"seeker",
			"community",
			"community-rails.tsx"
		),
	},
	{
		label: "고객센터 레이아웃",
		relativePath: path.join("app", "support", "layout.tsx"),
	},
	{
		label: "구직자 마켓플레이스",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-marketplace.tsx"
		),
	},
	{
		label: "채팅 목록",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-chat-list-responsive.tsx"
		),
	},
	{
		label: "공고 상세",
		relativePath: path.join(
			"components",
			"bambi",
			"screens",
			"seeker-job-detail-responsive.tsx"
		),
	},
];

const readScreen = (relativePath: string) =>
	fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");

// 판매된 배너가 없다고 aside를 통째로 걷어내면, justify-center가 남은 칸만으로 정렬해
// 콘텐츠가 (rail 259px + gap)/2 만큼 밀린다. 조건부가 aside를 감싸는 형태를 금지한다.
const CONDITIONAL_WRAPPING_ASIDE = /length > 0 \? \(\s*<aside/;
const INLINE_RAIL_CLASS = /w-\[259px\] shrink-0 min-\[1720px\]:block/g;
const SHARED_RAIL_CLASS = /<aside className=\{SIDE_AD_RAIL_ASIDE_CLASS\}>/g;

describe("seeker side ad rails", () => {
	for (const screen of RAIL_SCREENS) {
		it(`reserves both rail columns on ${screen.label} even when a banner group is empty`, () => {
			const source = readScreen(screen.relativePath);

			// 좌·우 두 칸이 항상 있어야 콘텐츠가 헤더·푸터와 같은 중앙에 선다.
			// (aside 태그 수가 아니라 rail 클래스 수로 센다 — 공고 상세는 본문 사이드바로
			// aside를 하나 더 쓰기 때문에 태그 수는 화면마다 다르다.)
			const inlineRailCount = source.match(INLINE_RAIL_CLASS)?.length ?? 0;
			const sharedRailCount = source.match(SHARED_RAIL_CLASS)?.length ?? 0;
			expect(inlineRailCount + sharedRailCount).toBe(2);
			// 빈 판정은 aside 안쪽에서만 한다.
			expect(source).not.toMatch(CONDITIONAL_WRAPPING_ASIDE);
		});
	}
});
