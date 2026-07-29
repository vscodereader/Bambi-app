import { load } from "cheerio";

import {
	type CrawledJobRecord,
	mapIndustryCategory,
	maskContacts,
	NEGOTIABLE_PAY_UNIT,
	normalizeText,
	parsePay,
} from "./bambi-crawl-normalize";

// 퀸알바 파서. 여우알바와 같은 규약(HTML 문자열만 받는 순수 함수)이라 저장해 둔 픽스처만으로
// 테스트가 돈다.
//
// 이 사이트는 전 페이지가 KCB 본인확인 성인인증 게이트 뒤에 있다. 인증 세션 쿠키가 없으면
// 어떤 URL을 불러도 adult_index.php로 보내는 116바이트짜리 스크립트 스텁만 돌아온다.
// 쿠키는 코드에 박지 않고 운영자가 QUEENALBA_COOKIE로 주입한다(bambi-crawl-ingest.ts).

export const QUEENALBA_ORIGIN = "https://queenalba.net";

// 게이트 스텁 감지용. 스텁을 그냥 파싱하면 "공고 0건"으로 읽혀 수율 판정이 회차를 중단시키는데,
// 그러면 원인이 "셀렉터 파손"으로 잘못 기록된다. 쿠키 만료를 그 자리에서 이름 붙여 실패시킨다.
const GATE_STUB_PATTERN =
	/document\.location\.replace\(\s*["']\/?adult_index\.php/;

export const isQueenalbaGateStub = (html: string): boolean =>
	GATE_STUB_PATTERN.test(html);

// 목록은 페이지 파라미터를 줘도 전건을 한 번에 돌려준다(page=1·2·3 응답이 동일했다).
// 그래서 페이지 수 계산이 없고 parseQueenalbaTotalCount는 항상 null이다.
export const queenalbaListUrl = (): string =>
	`${QUEENALBA_ORIGIN}/guin_list.php`;

export const queenalbaDetailUrl = (sourceExternalId: string): string =>
	`${QUEENALBA_ORIGIN}/guin_detail.php?num=${sourceExternalId}`;

// 본문 저장 상한. 여우알바와 같은 이유다 — 이상 공고 하나가 행 크기와 목록 응답을 흔든다.
const MAX_BODY_LENGTH = 20_000;

// 값이 비어 있다는 뜻으로 사이트가 넣는 문자열. 그대로 저장하면 "정보없음"이 데이터가 된다.
const EMPTY_VALUE_TEXTS = new Set([
	"등록된 접수방법이 없습니다.",
	"정보없음",
	"정보 없음",
]);

const cleanText = (raw: string | undefined | null): string | null => {
	const text = normalizeText(raw ?? "");

	return text.length > 0 && !EMPTY_VALUE_TEXTS.has(text) ? text : null;
};

export interface QueenalbaListItem {
	sourceExternalId: string;
}

const DETAIL_NUM_PATTERN = /[?&]num=(\d+)/;

// 목록에서 수집기가 쓰는 건 num 하나뿐이다. 한 페이지에 카드형·표형 섹션이 섞여 있고
// 같은 공고가 여러 섹션에 실리므로, 섹션 구조를 따라가지 않고 상세 링크만 훑어 중복을 접는다.
// #sub_center로 좁히는 건 헤더·푸터의 배너 링크를 공고로 세지 않기 위해서다.
export const parseQueenalbaList = (html: string): QueenalbaListItem[] => {
	if (isQueenalbaGateStub(html)) {
		return [];
	}

	const $ = load(html);
	const ids = new Set<string>();

	$('#sub_center a[href*="guin_detail.php"]').each((_, element) => {
		const id = $(element).attr("href")?.match(DETAIL_NUM_PATTERN)?.[1];

		if (id) {
			ids.add(id);
		}
	});

	return [...ids].map((sourceExternalId) => ({ sourceExternalId }));
};

// 목록이 전건을 한 번에 주므로 페이지 수 계산이 필요 없다. 수집기 규약을 맞추려 null을 돌린다.
export const parseQueenalbaTotalCount = (): number | null => null;

// 상세는 `<tr><td>라벨</td><td>값</td></tr>` 표다. 라벨 칸에 아이콘 img가 섞여 있고 값 칸이
// colspan으로 갈라져 있어, 첫 칸 텍스트를 라벨로, 나머지 칸 전체를 값으로 읽는다.
// 중첩 표(등급 아이콘 등)를 라벨 행으로 오인하지 않도록 tr을 품은 tr은 건너뛴다.
const readLabeledRows = (
	$: ReturnType<typeof load>
): Map<string, string | null> => {
	const fields = new Map<string, string | null>();

	$("#sub_center tr").each((_, element) => {
		const $row = $(element);

		if ($row.find("tr").length > 0) {
			return;
		}

		const cells = $row.children("td");

		if (cells.length < 2) {
			return;
		}

		const label = normalizeText($(cells[0]).text());

		// 라벨이 길면 값 칸을 라벨로 읽은 것이다(공지 문단 등).
		if (label.length === 0 || label.length > 20 || fields.has(label)) {
			return;
		}

		fields.set(label, cleanText(cells.slice(1).text()));
	});

	return fields;
};

// 급여 원문에 사이트가 최저임금 안내를 덧붙인다("500,000원 2026년 최저시급 10,320원").
// 그대로 parsePay에 넘기면 안내 문구의 숫자를 급여로 읽을 수 있어 먼저 잘라낸다.
// 안내 문구가 여러 줄로 오기도 해서 개행까지 포함해 잘라낸다(dotAll 플래그는 web의
// 컴파일 타깃이 못 받는다).
const MINIMUM_WAGE_NOTICE_PATTERN = /\d{4}\s*년\s*최저\s*시급[\s\S]*$/;

const stripMinimumWageNotice = (raw: string | null): string | null => {
	if (!raw) {
		return null;
	}

	return cleanText(raw.replace(MINIMUM_WAGE_NOTICE_PATTERN, ""));
};

// 근무지역은 "서울 - 강남구" 한 칸에 시도와 시군구가 같이 온다.
const REGION_SEPARATOR = /\s*-\s*/;

const splitRegion = (
	raw: string | null
): { district: string | null; region: string | null } => {
	if (!raw) {
		return { district: null, region: null };
	}

	const [region, ...rest] = raw.split(REGION_SEPARATOR);

	return {
		district: cleanText(rest.join(" ")),
		region: cleanText(region),
	};
};

// 전화는 직통이 아니라 콜핀(대표번호 + 내선) 방식이다. 대표번호 칸이 "1566-1945 + 콜핀번호"
// 라는 안내 문구라, 그 자리에 실제 핀을 끼워 넣어야 걸 수 있는 번호가 된다.
const readCallPin = (fields: Map<string, string | null>): string | null => {
	const representative = fields.get("콜핀대표번호") ?? null;
	const pin = fields.get("콜핀번호") ?? null;

	if (!(representative && pin)) {
		return representative ?? pin;
	}

	return representative.includes("콜핀번호")
		? representative.replace("콜핀번호", pin)
		: `${representative} ${pin}`;
};

// 메신저 아이디. 카톡 칸이 비어 있고 텔레그램·라인·위챗에만 아이디를 남기는 공고가 흔한데,
// 그걸 버리면 운영자에게 남는 연락 수단이 없어진다. 어느 메신저인지 알 수 있게 이름을 붙인다.
const MESSENGER_ROWS: readonly { label: string; selector: string }[] = [
	{ label: "", selector: "tr.kakao-wrap" },
	{ label: "텔레그램", selector: "tr.telegram-wrap" },
	{ label: "라인", selector: "tr.line-wrap" },
	{ label: "위챗", selector: "tr.wechat-wrap" },
];

const readMessengerId = ($: ReturnType<typeof load>): string | null => {
	for (const row of MESSENGER_ROWS) {
		const value = cleanText(
			$(`#sub_center ${row.selector}`).first().children("td").slice(1).text()
		);

		if (value) {
			return row.label ? `${row.label} ${value}` : value;
		}
	}

	return null;
};

// 게시일이 따로 없고 "접수기간"의 시작일이 등록 시점 역할을 한다("2026-02-13 ~ 2026-08-24").
const POSTED_AT_PATTERN = /(\d{4})-(\d{2})-(\d{2})/;

const parsePostedAt = (raw: string | null): Date | null => {
	const match = raw?.match(POSTED_AT_PATTERN);

	if (!match) {
		return null;
	}

	const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);

	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// 본문. "상세 채용정보" 제목 뒤부터 면책 문구(.detail_no_ment) 앞까지가 업체가 쓴 영역이다.
// 이미지만 올리는 공고가 절반 이상이라 본문이 빈 문자열인 경우가 정상이다 — 파싱 실패로
// 보면 안 된다(수율 판정이 멀쩡한 회차를 중단시킨다).
const readBody = ($: ReturnType<typeof load>): string => {
	const heading = $("#sub_center h2")
		.filter((_, element) => $(element).text().includes("상세 채용정보"))
		.first();

	if (heading.length === 0) {
		return "";
	}

	const parts: string[] = [];

	for (const element of heading.parent().nextAll().toArray()) {
		if ($(element).hasClass("detail_no_ment")) {
			break;
		}

		parts.push($(element).text());
	}

	// 원문 HTML은 버리고 텍스트만 남긴다. 본문에 박힌 번호까지 가려야 마스킹이 의미가 있다.
	return maskContacts(normalizeText(parts.join("\n"))).slice(
		0,
		MAX_BODY_LENGTH
	);
};

export const parseQueenalbaDetail = (
	html: string,
	sourceExternalId: string
): CrawledJobRecord | null => {
	if (isQueenalbaGateStub(html)) {
		return null;
	}

	const $ = load(html);
	const title = cleanText($("#sub_center h1").first().text());
	const fields = readLabeledRows($);

	// 제목과 라벨 표 둘 다 못 읽었으면 우리가 아는 상세가 아니다(삭제된 공고·마크업 변경).
	// null을 돌려 수집기의 수율 판정에 실패로 잡히게 한다.
	if (!title || fields.size === 0) {
		return null;
	}

	const location = splitRegion(fields.get("근무지역") ?? null);
	const payRaw = stripMinimumWageNotice(fields.get("급여") ?? null);
	const parsedPay = parsePay(payRaw);
	const industryRaw = fields.get("업무내용") ?? null;

	return {
		address: fields.get("회사주소") ?? null,
		ageRange: fields.get("나이") ?? null,
		bizName: fields.get("회사명") ?? fields.get("상호") ?? null,
		body: readBody($),
		contactKakao: readMessengerId($),
		contactName: fields.get("담당자") ?? null,
		contactPhone: readCallPin(fields),
		district: location.district,
		// 여성 전용 사이트라 상세에 성별 항목 자체가 없다.
		gender: null,
		industryCategory: mapIndustryCategory(industryRaw),
		industryRaw,
		payAmount: parsedPay.amount,
		payRaw,
		// 급여 칸이 단위 없이 금액만 준다("150,000원"). 금액을 읽었는데 단위가 기본값
		// "협의"로 떨어졌다면 그건 협의가 아니라 단위를 모르는 것이므로 비운다 — 금액이
		// 있는데 "협의"라고 적으면 화면에서 서로 모순된 값이 된다.
		payUnit:
			parsedPay.amount !== null && parsedPay.unit === NEGOTIABLE_PAY_UNIT
				? null
				: parsedPay.unit,
		region: location.region,
		shopName: fields.get("닉네임") ?? null,
		sourceExternalId,
		sourcePostedAt: parsePostedAt(fields.get("접수기간") ?? null),
		sourceUrl: queenalbaDetailUrl(sourceExternalId),
		title,
		workSchedule: fields.get("업무일") ?? null,
	};
};

// ---------------------------------------------------------------------------
// 커뮤니티(게시판)
// ---------------------------------------------------------------------------

// 긁는 게시판. 여러 판이 있지만 주제 신호가 모이는 건 메인 게시판 하나라 여기만 본다.
// tb 값이 곧 게시판 식별자다.
export const QUEENALBA_COMMUNITY_BOARD = "comm_board2";
export const QUEENALBA_COMMUNITY_BOARD_NAME = "밤문화이야기";

// 이 게시판은 pg 파라미터가 실제로 동작한다(공고 목록과 다르다).
export const queenalbaCommunityListUrl = (page: number): string =>
	`${QUEENALBA_ORIGIN}/bbs_list.php?tb=${QUEENALBA_COMMUNITY_BOARD}&pg=${page}`;

export const queenalbaCommunityTopicUrl = (
	sourceExternalId: string
): string => {
	const [board, num] = sourceExternalId.split(":");

	return `${QUEENALBA_ORIGIN}/bbs_detail.php?bbs_num=${num}&tb=${board}`;
};

export interface CrawledCommunityTopic {
	boardName: string;
	commentCount: number | null;
	sourceExternalId: string;
	sourcePostedAt: Date | null;
	sourceUrl: string;
	title: string;
	viewCount: number | null;
}

const BBS_NUM_PATTERN = /[?&]bbs_num=(\d+)/;
const COUNT_PATTERN = /^[\d,]+$/;

const parseCount = (raw: string | undefined): number | null => {
	const text = (raw ?? "").trim();

	if (!COUNT_PATTERN.test(text)) {
		return null;
	}

	const value = Number.parseInt(text.replaceAll(",", ""), 10);

	return Number.isFinite(value) ? value : null;
};

// 제목 뒤에 붙는 댓글 수(" ... 알려줄 언니.. [21]"). 일반 글은 댓글수 칸이 비어 있고
// 이 표기가 유일한 반응 지표다.
const TITLE_COMMENT_COUNT_PATTERN = /\s*\[(\d+)\]\s*$/;

// 게시판 목록. 상세는 받지 않는다 — 본문은 개별 작성자의 저작물이라 저장하지 않고,
// "어떤 주제가 반응을 얻는가"만 제목·반응 지표로 남긴다(crawled_community_topic).
//
// 행은 [뱃지][첨부][제목][글쓴이][날짜][댓글수][조회수] 일곱 칸인데, 뒤 두 칸은 공지에만
// 채워지고 일반 글은 비어 있다. 앞쪽 칸도 글 종류에 따라 붙었다 빠졌다 해서 위치 인덱스가
// 아니라 뒤에서부터 읽는다.
export const parseQueenalbaCommunityList = (
	html: string
): CrawledCommunityTopic[] => {
	if (isQueenalbaGateStub(html)) {
		return [];
	}

	const $ = load(html);
	const topics: CrawledCommunityTopic[] = [];
	const seen = new Set<string>();

	$("#sub_center tr").each((_, element) => {
		const $row = $(element);

		if ($row.find("tr").length > 0) {
			return;
		}

		const cells = $row.children("td");
		const link = cells.find('a[href*="bbs_detail.php"]').last();
		const href = link.attr("href") ?? "";
		const num = href.match(BBS_NUM_PATTERN)?.[1];

		if (!num || cells.length < 4) {
			return;
		}

		// 상단 고정 공지는 운영자가 쓴 안내문이고 조회수가 20만을 넘는다. 회원들이 무슨
		// 주제에 반응하는지 보려고 모으는 표라, 섞이면 상위권을 통째로 차지한다.
		if (href.includes("top_gonggi=1")) {
			return;
		}

		const sourceExternalId = `${QUEENALBA_COMMUNITY_BOARD}:${num}`;

		if (seen.has(sourceExternalId)) {
			return;
		}

		// 제목은 링크 텍스트에서 읽고, 댓글 수는 링크 밖 형제 노드로 붙어 있어 칸 전체에서 읽는다.
		const title = cleanText(link.text());

		if (!title) {
			return;
		}

		seen.add(sourceExternalId);

		const texts = cells.map((_index, cell) => $(cell).text().trim()).get();
		const commentMatch = normalizeText(link.closest("td").text()).match(
			TITLE_COMMENT_COUNT_PATTERN
		);

		topics.push({
			boardName: QUEENALBA_COMMUNITY_BOARD_NAME,
			commentCount: commentMatch
				? Number.parseInt(commentMatch[1] as string, 10)
				: parseCount(texts.at(-2)),
			sourceExternalId,
			sourcePostedAt: parsePostedAt(texts.at(-3) ?? null),
			sourceUrl: queenalbaCommunityTopicUrl(sourceExternalId),
			title,
			viewCount: parseCount(texts.at(-1)),
		});
	});

	return topics;
};
