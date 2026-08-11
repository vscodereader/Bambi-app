// 공개 공고 랜딩(/jobs)의 주소 체계와 문구. 비로그인 방문자·검색 크롤러가 인증 게이트
// 없이 공고 목록을 읽는 유일한 경로라, 라우트·메타데이터·내부 링크가 전부 이 표 하나만 본다.
//
// 지역 마스터 코드는 법정동코드(숫자 10자리)이고 업종은 한글 enum이라 둘 다 URL에 그대로
// 쓸 수 없다(퍼센트 인코딩된 주소는 공유·색인 양쪽에서 손해다). ASCII 소문자 슬러그를
// 코드/enum에 잇는 매핑을 여기 한 곳에 둔다.

import { type IndustryOption, industryOptions } from "../bambi-options";

export interface JobLandingRegion {
	// 지역 마스터(region.code) 값 — jobs.list의 regionCode 필터 입력이다.
	code: string;
	label: string;
	slug: string;
}

export interface JobLandingIndustry {
	// 업종 enum 값이자 화면 표기(bambi-options 참고 — 별도 라벨 맵이 없는 축이다).
	label: IndustryOption;
	slug: string;
}

export interface JobLandingTarget {
	industry?: JobLandingIndustry;
	region?: JobLandingRegion;
}

// 시/도 16행. code·label은 지역 시드(apps/server/src/seeds/regions.json)의 sigungu=null
// 행과 같은 값이다 — 랜딩 제목·링크를 그리자고 매 요청 지역 마스터를 조회하지 않는다.
// 시드에 시/도가 추가되면 여기에도 한 줄 추가해야 그 지역 랜딩이 생긴다.
export const JOB_LANDING_REGIONS: readonly JobLandingRegion[] = [
	{ code: "1100000000", label: "서울", slug: "seoul" },
	{ code: "4100000000", label: "경기", slug: "gyeonggi" },
	{ code: "2800000000", label: "인천", slug: "incheon" },
	{ code: "2600000000", label: "부산", slug: "busan" },
	{ code: "2700000000", label: "대구", slug: "daegu" },
	{ code: "2900000000", label: "광주", slug: "gwangju" },
	{ code: "3000000000", label: "대전", slug: "daejeon" },
	{ code: "3100000000", label: "울산", slug: "ulsan" },
	{ code: "5100000000", label: "강원", slug: "gangwon" },
	{ code: "4300000000", label: "충북", slug: "chungbuk" },
	{ code: "4400000000", label: "충남", slug: "chungnam" },
	{ code: "5200000000", label: "전북", slug: "jeonbuk" },
	{ code: "4600000000", label: "전남", slug: "jeonnam" },
	{ code: "4700000000", label: "경북", slug: "gyeongbuk" },
	{ code: "4800000000", label: "경남", slug: "gyeongnam" },
	{ code: "5000000000", label: "제주", slug: "jeju" },
] as const;

// Record로 잡아 두면 업종 enum이 늘어날 때 이 파일이 타입 에러로 먼저 터진다
// (슬러그 없는 업종이 조용히 랜딩에서 빠지는 것보다 낫다).
const INDUSTRY_SLUGS: Record<IndustryOption, string> = {
	BAR: "bar",
	기타: "etc",
	노래주점: "karaoke-bar",
	다방: "dabang",
	단란주점: "danran",
	룸싸롱: "room-salon",
	마사지: "massage",
	요정: "yojeong",
	"텐프로/쩜오": "ten-pro",
};

// 순서는 industryOptions를 그대로 따른다("기타"가 항상 끝).
export const JOB_LANDING_INDUSTRIES: readonly JobLandingIndustry[] =
	industryOptions.map((label) => ({ label, slug: INDUSTRY_SLUGS[label] }));

export const findJobLandingRegion = (
	slug: string
): JobLandingRegion | undefined =>
	JOB_LANDING_REGIONS.find((region) => region.slug === slug);

export const findJobLandingIndustry = (
	slug: string
): JobLandingIndustry | undefined =>
	JOB_LANDING_INDUSTRIES.find((industry) => industry.slug === slug);

export const jobLandingPath = ({
	industry,
	region,
}: JobLandingTarget): string =>
	[
		"/jobs",
		region?.slug,
		// 업종만 있는 랜딩은 없다 — 지역이 빠지면 업종 세그먼트도 버린다.
		region && industry ? industry.slug : undefined,
	]
		.filter(Boolean)
		.join("/");

// 존재하는 랜딩 주소 전부 — 1(인덱스) + 16(지역) + 16×9(지역×업종) = 161개.
// 사이트맵이 라우트와 같은 표에서 주소를 만들어, 슬러그가 늘어도 색인이 따라온다.
export const jobLandingPaths = (): string[] => [
	"/jobs",
	...JOB_LANDING_REGIONS.flatMap((region) => [
		jobLandingPath({ region }),
		...JOB_LANDING_INDUSTRIES.map((industry) =>
			jobLandingPath({ industry, region })
		),
	]),
];

// "서울 룸싸롱" / "서울" / "" — 제목·문구가 공유하는 범위 라벨.
const scopeLabel = ({ industry, region }: JobLandingTarget): string =>
	[region?.label, region ? industry?.label : undefined]
		.filter(Boolean)
		.join(" ");

export const jobLandingHeading = (target: JobLandingTarget): string => {
	const scope = scopeLabel(target);

	return scope ? `${scope} 알바 채용 정보` : "지역·업종별 알바 채용 정보";
};

export const jobLandingTitle = (target: JobLandingTarget): string =>
	target.region
		? `${scopeLabel(target)} 밤알바·유흥알바 채용 정보 | 밤비알바`
		: "지역·업종별 밤알바·유흥알바 채용 정보 | 밤비알바";

const industryKeywordAliases = (industry?: JobLandingIndustry): string[] => {
	if (!industry) {
		return [];
	}
	const aliases: Partial<Record<IndustryOption, string[]>> = {
		BAR: ["바알바", "BAR알바"],
		노래주점: ["노래방알바", "노래방도우미알바"],
		룸싸롱: ["룸살롱알바", "룸알바"],
		마사지: ["마사지알바"],
		"텐프로/쩜오": ["텐프로알바", "쩜오알바"],
	};
	return aliases[industry.label] ?? [];
};

export const jobLandingKeywords = ({
	industry,
	region,
}: JobLandingTarget): string[] => {
	if (!region) {
		return ["지역별 채용 정보", "밤알바", "유흥알바", "룸알바"];
	}
	const regionKeywords = [
		`${region.label} 밤알바`,
		`${region.label} 유흥알바`,
		`${region.label} 여성알바`,
		`${region.label} 고소득알바`,
		`${region.label} 구인구직`,
	];
	if (!industry) {
		return regionKeywords;
	}
	return [
		...regionKeywords,
		`${region.label} ${industry.label} 알바`,
		`${region.label} ${industry.label} 구인`,
		`${region.label} ${industry.label} 채용`,
		...industryKeywordAliases(industry).map(
			(alias) => `${region.label} ${alias}`
		),
	];
};

export const jobLandingDescription = ({
	industry,
	region,
}: JobLandingTarget): string => {
	if (region && industry) {
		return `${region.label} ${industry.label} 알바 채용 정보를 모았습니다. 급여와 근무 시간, 업체 인증 여부를 확인하고 밤비알바 1:1 채팅으로 문의하세요.`;
	}

	if (region) {
		return `${region.label} 유흥·접객 알바 채용 정보를 모았습니다. 업종별로 공고를 좁혀 보고 밤비알바 1:1 채팅으로 안전하게 문의하세요.`;
	}

	return "밤비알바의 지역·업종별 유흥·접객 알바 채용 정보입니다. 전국 시·도와 업종별 공고를 로그인 없이 둘러보세요.";
};

// 랜딩마다 다른 소개 문단(1~2개). 같은 문장을 지역만 바꿔 반복하지 않도록 축 조합별로
// 다른 구성을 쓴다.
export const jobLandingIntro = ({
	industry,
	region,
}: JobLandingTarget): readonly string[] => {
	if (region && industry) {
		return [
			`${region.label}에서 모집 중인 ${industry.label} 공고를 모았습니다. 급여 단위와 근무 시간, 세부 지역은 카드에서 바로 확인할 수 있습니다.`,
			"관심 있는 공고는 밤비알바 1:1 채팅으로 문의하세요. 연락처를 먼저 넘기지 않고도 근무 조건을 확인할 수 있습니다.",
		];
	}

	if (region) {
		return [
			`${region.label} 지역의 유흥·접객 채용 공고입니다. ${region.label} 안에서도 업종을 골라 원하는 조건의 공고만 볼 수 있습니다.`,
			"업체 인증을 마친 공고에는 인증 배지가 붙습니다. 조건을 확인한 뒤 채팅으로 문의하세요.",
		];
	}

	return [
		"밤비알바는 유흥·접객 구인구직 정보를 1:1 채팅으로 연결하는 플랫폼입니다. 지역과 업종을 골라 모집 중인 공고를 로그인 없이 둘러볼 수 있습니다.",
		"급여·근무 시간·세부 지역은 공고 카드에서 바로 보이고, 지원과 문의는 회원가입 후 채팅으로 진행합니다.",
	];
};
