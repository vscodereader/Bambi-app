import { createHash } from "node:crypto";

import type { jobIndustryCategory } from "@bambi-app/db/schema/bambi";

export type JobIndustryCategory =
	(typeof jobIndustryCategory.enumValues)[number];

// 파서가 내놓고 수집기가 받아 저장하는 공통 레코드. 사이트별 파서는 이 모양만 지키면 되고,
// 수집기는 어느 사이트에서 왔는지 몰라도 된다 — 파서를 추가할 때 수집기를 건드리지 않는 경계다.
export interface CrawledJobRecord {
	address: string | null;
	ageRange: string | null;
	bizName: string | null;
	body: string;
	contactKakao: string | null;
	contactName: string | null;
	contactPhone: string | null;
	district: string | null;
	gender: string | null;
	industryCategory: JobIndustryCategory | null;
	industryRaw: string | null;
	payAmount: number | null;
	payRaw: string | null;
	payUnit: string | null;
	region: string | null;
	// 공개 가능한 업소 표시명(원본의 "닉네임/업소명"). 사업자등록 상호인 bizName과 다르다 —
	// 이쪽은 공고에 내걸린 간판이라 노출해도 되고, bizName은 운영자 전용 리드다.
	shopName: string | null;
	// 원본이 내건 마감일자. 없는 사이트가 있어 null이 정상이다.
	sourceDeadlineAt: Date | null;
	sourceExternalId: string;
	sourcePostedAt: Date | null;
	sourceUrl: string;
	title: string;
	workSchedule: string | null;
}

// 급여 단위. apps/web/src/lib/bambi-options.ts의 payUnitOptions와 같은 값이어야
// 전환된 공고가 기존 화면·필터에 그대로 얹힌다.
export const NEGOTIABLE_PAY_UNIT = "협의";
const HOURLY = "시급";
const DAILY = "일급";
const WEEKLY = "주급";
const MONTHLY = "월급";

const MAN_MULTIPLIER = 10_000;

// "15만원", "15.5만" 같은 만 단위 표기. 국내 구인 공고의 기본형이라 먼저 본다.
const PAY_MAN_PATTERN = /(\d[\d,]*(?:\.\d+)?)\s*만/;
// "150,000원", "150000" 같은 원 단위 표기.
const PAY_WON_PATTERN = /(\d[\d,]{2,})/;

// 협의·면접 후 결정 계열. 금액을 못 읽는 게 정상인 경우라, 파싱 실패와 구분해야 한다.
const NEGOTIABLE_PATTERN = /협의|면접|추후|문의|상담/;

// "15~20만원" 같은 범위 표기를 하한만 남기고 접는다. 이 단계를 건너뛰면 단위(만/원)가 붙은
// 뒤쪽 숫자에 먼저 매칭돼 상한을 집는다 — 실제 지급액을 넘겨 짚는 쪽이 구직자를 더 오도한다.
const PAY_RANGE_PATTERN =
	/(\d[\d,]*(?:\.\d+)?)\s*[~∼〜–—-]\s*\d[\d,]*(?:\.\d+)?/g;

// 테이블 차지. 유흥업 공고의 기본 급여 단위인데 우리 payUnitOptions 5종에는 없다.
// 억지로 "일급"에 욱여넣으면 금액의 의미가 바뀌므로(TC는 테이블당, 일급은 하루당) 원문
// 그대로 둔다 — crawled_job_post.payUnit이 자유 텍스트인 이유이고, 우리 5종으로 좁히는
// 판단은 전환 시점에 운영자가 한다.
export const TABLE_CHARGE_PAY_UNIT = "TC";

// 단위 판정. 긴 표기를 먼저 두어 "일급"이 "일"보다 앞서 매칭되게 한다.
const PAY_UNIT_RULES: readonly { pattern: RegExp; unit: string }[] = [
	{ pattern: /\bTC\b|테이블\s*차지/i, unit: TABLE_CHARGE_PAY_UNIT },
	{ pattern: /시급|시간당|1시간|한시간/, unit: HOURLY },
	{ pattern: /일급|일당|1일|하루|당일/, unit: DAILY },
	{ pattern: /주급|1주|한주|주당/, unit: WEEKLY },
	{ pattern: /월급|월정|1개월|한달|월\s*\d|연봉/, unit: MONTHLY },
	// 단독 "일"·"월"은 위 규칙이 모두 빗나갔을 때만 본다("월 500"은 위에서 이미 잡힌다).
	{ pattern: /(^|[^가-힣])일([^가-힣]|$)/, unit: DAILY },
	{ pattern: /(^|[^가-힣])월([^가-힣]|$)/, unit: MONTHLY },
];

export interface ParsedPay {
	amount: number | null;
	unit: string;
}

// 급여 원문을 금액+단위로 가른다. 범위 표기("15~20만원")는 하한을 취한다 — 목록 정렬·필터에서
// 실제 지급액을 넘겨 짚는 것보다 낮게 잡는 쪽이 구직자를 덜 오도한다.
// 판정 불가면 amount=null + unit="협의"로 떨어뜨린다(0으로 저장하면 "무급"으로 읽힌다).
export const parsePay = (raw: string | null | undefined): ParsedPay => {
	const source = (raw ?? "").trim();

	if (source.length === 0) {
		return { amount: null, unit: NEGOTIABLE_PAY_UNIT };
	}

	const text = source.replaceAll(PAY_RANGE_PATTERN, "$1");

	const unit =
		PAY_UNIT_RULES.find((rule) => rule.pattern.test(text))?.unit ?? null;

	const manMatch = text.match(PAY_MAN_PATTERN);
	if (manMatch?.[1]) {
		const value = Number.parseFloat(manMatch[1].replaceAll(",", ""));
		if (Number.isFinite(value) && value > 0) {
			return {
				amount: Math.round(value * MAN_MULTIPLIER),
				unit: unit ?? NEGOTIABLE_PAY_UNIT,
			};
		}
	}

	const wonMatch = text.match(PAY_WON_PATTERN);
	if (wonMatch?.[1]) {
		const value = Number.parseInt(wonMatch[1].replaceAll(",", ""), 10);
		if (Number.isFinite(value) && value > 0) {
			return { amount: value, unit: unit ?? NEGOTIABLE_PAY_UNIT };
		}
	}

	// 숫자가 없다. 협의 계열이면 정상, 아니면 단위만 살리고 금액은 비운다.
	if (NEGOTIABLE_PATTERN.test(text)) {
		return { amount: null, unit: NEGOTIABLE_PAY_UNIT };
	}

	return { amount: null, unit: unit ?? NEGOTIABLE_PAY_UNIT };
};

// 원본 사이트의 직종 문자열을 우리 8종 업종 enum에 잇는다. 우리 enum이 고정값이라
// 매핑되지 않는 직종이 반드시 생기는데, 그때 공고를 버리지 않고 null을 돌려 수집기가
// needs_review로 남기게 한다(운영자가 손으로 잇는다).
const INDUSTRY_RULES: readonly {
	category: JobIndustryCategory;
	pattern: RegExp;
}[] = [
	// 텐프로·쩜오를 룸싸롱보다 먼저 본다 — "텐프로 룸싸롱"처럼 둘 다 걸리는 표기에서
	// 더 좁은 분류를 살려야 한다.
	{ category: "텐프로/쩜오", pattern: /텐프로|텐카페|쩜오|점오|1\.?5차/ },
	{
		category: "룸싸롱",
		pattern: /룸\s*(싸|살)롱|룸빵|하이퍼블릭|퍼블릭|셔츠룸/,
	},
	{ category: "노래주점", pattern: /노래\s*(주점|방|클럽)|가라오케|코인노래/ },
	{ category: "단란주점", pattern: /단란/ },
	{ category: "다방", pattern: /다방|티켓/ },
	{ category: "마사지", pattern: /마사지|안마|스파|테라피|아로마/ },
	{ category: "요정", pattern: /요정|한정식\s*주점/ },
	{ category: "BAR", pattern: /\bbar\b|바텐더|칵테일|라운지|호프|카페/i },
];

export const mapIndustryCategory = (
	raw: string | null | undefined
): JobIndustryCategory | null => {
	const text = (raw ?? "").trim();

	if (text.length === 0) {
		return null;
	}

	return (
		INDUSTRY_RULES.find((rule) => rule.pattern.test(text))?.category ?? null
	);
};

// 연락처 마스킹. 유흥 공고는 본문에 전화번호·카톡아이디를 크게 박아두기 때문에, 별도 필드만
// 가리고 본문을 그대로 내보내면 아무것도 가린 게 아니다.
//
// 알려진 한계: 국내 구인 글은 차단을 피하려 "공일공", "010ㅡ1234", 이미지 안에 번호 넣기 같은
// 우회 표기를 흔히 쓴다. 아래 규칙은 숫자·라틴 문자로 쓰인 표기만 잡는다. 우회 표기까지
// 걸러야 하면 한글 숫자 치환과 이미지 OCR이 필요하며, 그건 별도 작업이다.
const PHONE_PATTERN = /0\d{1,2}[\s.\-–—ㅡ~]?\d{3,4}[\s.\-–—ㅡ~]?\d{4}/g;
const MESSENGER_PATTERN =
	/(카\s*톡|카카오\s*톡|kakao|k\s*t|텔레\s*그램|telegram|라인|line|위\s*챗)\s*(아이디|id)?\s*[:：]?\s*[A-Za-z0-9._-]{2,}/gi;

const MASK_LABEL = "[연락처 비공개]";

export const maskContacts = (text: string): string =>
	text
		.replaceAll(PHONE_PATTERN, MASK_LABEL)
		.replaceAll(MESSENGER_PATTERN, MASK_LABEL);

// 공백 정규화. 원본이 HTML이라 개행·연속 공백·비가시 문자가 섞여 들어오는데, 이걸 그대로
// 두면 내용이 같은데도 contentHash가 달라져 매 회차 UPDATE가 돌아버린다.
const INVISIBLE_PATTERN = /[\u00A0\u200B-\u200D\uFEFF]/g;
const MULTI_SPACE_PATTERN = /[ \t]+/g;
const MULTI_NEWLINE_PATTERN = /\n{3,}/g;

// PostgreSQL의 text 컬럼은 U+0000을 저장하지 못한다. 원문에 섞여 들어오면 INSERT가
// 통째로 실패하므로 여기서 지운다(정규식 안에 두면 린트가 제어문자를 막는다).
const NUL_CHARACTER = "\u0000";

export const normalizeText = (raw: string): string =>
	raw
		.replaceAll(NUL_CHARACTER, "")
		.replaceAll(INVISIBLE_PATTERN, " ")
		.replaceAll("\r\n", "\n")
		.replaceAll("\r", "\n")
		.replaceAll(MULTI_SPACE_PATTERN, " ")
		.replaceAll(MULTI_NEWLINE_PATTERN, "\n\n")
		.split("\n")
		.map((line) => line.trim())
		.join("\n")
		.trim();

// 변경 감지용 해시. 정규화된 값만 넣어 계산하므로 원본의 공백·마크업이 흔들려도 해시는
// 그대로다. 해시가 같으면 수집기가 UPDATE를 건너뛰고 last_seen_at만 갱신한다.
// 키를 명시적으로 나열해 순서를 고정한다 — Object.keys 순서에 기대면 필드 추가만으로
// 기존 행 전체가 변경된 것처럼 보인다.
// 필드 경계 구분자. 공백으로 이으면 ["ab","c"]와 ["a","bc"]가 같은 해시가 되고,
// NUL은 정규화 단계에서 본문에서 제거되므로 값 안에 나타날 수 없다.
const FIELD_SEPARATOR = "\u0000";

export const computeContentHash = (record: CrawledJobRecord): string => {
	const material = [
		record.address ?? "",
		record.ageRange ?? "",
		record.bizName ?? "",
		record.body,
		record.contactKakao ?? "",
		record.contactName ?? "",
		record.contactPhone ?? "",
		record.district ?? "",
		record.gender ?? "",
		record.industryRaw ?? "",
		record.payRaw ?? "",
		record.region ?? "",
		record.shopName ?? "",
		record.title,
		record.workSchedule ?? "",
	].join(FIELD_SEPARATOR);

	return createHash("sha256").update(material, "utf8").digest("hex");
};
