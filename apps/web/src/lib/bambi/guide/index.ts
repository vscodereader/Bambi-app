// 가이드 콘텐츠 클러스터의 레지스트리. 라우트 generateStaticParams·사이트맵·상호링크·
// 업종 랜딩의 가이드 소블록이 전부 이 한 표만 본다(슬러그가 늘어도 색인·링크가 따라온다).

import { bamAlbaGuide } from "./bam-alba";
import { bamAlbaInterviewGuide } from "./bam-alba-interview";
import { bamAlbaPayGuide } from "./bam-alba-pay";
import { bamAlbaSafetyGuide } from "./bam-alba-safety";
import { bamAlbaTermsGuide } from "./bam-alba-terms";
import { gangnamRoomAlbaGuide } from "./gangnam-room-alba";
import { hwaryuAlbaGuide } from "./hwaryu-alba";
import { jujeomAlbaGuide } from "./jujeom-alba";
import { massageAlbaGuide } from "./massage-alba";
import { noraebangAlbaGuide } from "./noraebang-alba";
import { roomSalonPaybackGuide } from "./room-salon-payback";
import { tenProAlbaGuide } from "./ten-pro-alba";
import type { GuideContent } from "./types";
import { yuheungAlbaGuide } from "./yuheung-alba";
import { yuheungAlbaGuinGuide } from "./yuheung-alba-guin";
import { yuheungGradeGuide } from "./yuheung-grade";

export type {
	FaqItem,
	GuideContent,
	GuideLandingLink,
	GuideSection,
} from "./types";

// 15편. 배열 순서가 허브·사이트맵 노출 순서다(대표 허브 밤알바를 선두에).
const GUIDES: readonly GuideContent[] = [
	bamAlbaGuide,
	tenProAlbaGuide,
	yuheungAlbaGuide,
	yuheungAlbaGuinGuide,
	hwaryuAlbaGuide,
	jujeomAlbaGuide,
	yuheungGradeGuide,
	roomSalonPaybackGuide,
	gangnamRoomAlbaGuide,
	noraebangAlbaGuide,
	massageAlbaGuide,
	bamAlbaPayGuide,
	bamAlbaInterviewGuide,
	bamAlbaSafetyGuide,
	bamAlbaTermsGuide,
];

export const GUIDE_CONTENTS = GUIDES;

const GUIDE_BY_SLUG = new Map(GUIDES.map((guide) => [guide.slug, guide]));

export const findGuide = (slug: string): GuideContent | undefined =>
	GUIDE_BY_SLUG.get(slug);

export const guideSlugs = (): string[] => GUIDES.map((guide) => guide.slug);

export const guidePath = (slug: string): string => `/jobs/guide/${slug}`;

// SEO title: 타깃 키워드 선두 + 경쟁사명 병기(정책 순서 퀸알바→여우알바→밤알바) + | 밤비알바.
// 랜딩 jobLandingTitle과 같은 병기 패턴을 따른다.
export const guideTitle = (content: GuideContent): string =>
	`${content.keyword} 퀸알바·여우알바·밤알바 채용 가이드 | 밤비알바`;

// 업종 슬러그 → 관련 가이드 slug. 업종 랜딩 하단 가이드 소블록이 본다.
// 각 업종에 가장 구체적으로 맞는 가이드 한 편을 건다(소블록은 단일 칩 렌더).
// 매핑 없는 업종(다방·기타)은 소블록을 통째로 생략한다.
const INDUSTRY_GUIDE_SLUG: Record<string, string> = {
	bar: "yuheung-alba",
	danran: "jujeom-alba",
	"karaoke-bar": "noraebang-alba",
	massage: "massage-alba",
	"room-salon": "room-salon-payback",
	"ten-pro": "ten-pro-alba",
	yojeong: "yuheung-alba",
};

export const guideForIndustrySlug = (
	industrySlug: string
): GuideContent | undefined => {
	const slug = INDUSTRY_GUIDE_SLUG[industrySlug];

	return slug ? findGuide(slug) : undefined;
};
