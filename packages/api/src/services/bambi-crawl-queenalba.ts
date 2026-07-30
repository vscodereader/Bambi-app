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

// 원본은 주소를 "/wys2/...", "img/icon_x.gif", "./guin_detail.php"처럼 섞어 쓴다. 저장한 뒤에는
// 어느 페이지에서 읽었는지 알 수 없어 상대경로가 쓸모없어지므로 파싱 시점에 절대 URL로 굳힌다.
// 해석 규칙은 표준 URL 파서에 맡긴다(../, //host, 퍼센트 인코딩까지 직접 짜면 틀린다).
export const toQueenalbaAbsoluteUrl = (
	raw: string | null | undefined
): string | null => {
	const src = normalizeText(raw ?? "");

	if (src.length === 0) {
		return null;
	}

	try {
		return new URL(src, `${QUEENALBA_ORIGIN}/`).toString();
	} catch {
		// 이상한 src 하나로 페이지 파싱 전체를 세우지 않는다.
		return null;
	}
};

// 공고 이미지로 인정하는 경로. 아이콘·버튼·스페이서를 하나씩 빼는 블랙리스트로 가면 상대가
// 장식 이미지를 새로 추가할 때마다 그게 공고 이미지로 새어 들어온다 — 반대로 화이트리스트는
// 새 경로를 놓칠 뿐 쓰레기를 저장하지 않으므로 이쪽이 안전하다.
//  - /wys2/file_attach/...     : 상세 본문에 업체가 올린 이미지. 실물 응답에서 확인.
//  - /upload/happy_member/...  : 목록·메인 카드와 상세 상단의 업체 썸네일(86×46 GIF). 실물
//                                응답에서 확인. 처음에 /offerphoto/로 가정했던 자리이며,
//                                그 경로는 이 사이트에 존재하지 않아 걷어냈다.
//  - /img_up/...               : 상세 본문 이미지의 다른 저장 위치(/img_up/shop_pds/...).
//                                본문 이미지 48장이 전부 이 경로인 공고가 실재해 0장이
//                                수집됐고, 그래서 상세 화면이 썸네일 폴백으로 빠졌다.
//
// 본문에는 외부 호스트(imgur 등) 장식 gif와 에디터 장식(/cheditor/icons, /Editor/img)도
// 섞여 있다. 외부 호스트는 아래 origin 대조에서, 에디터 장식은 이 목록에 없어서 걸러진다.
//
// 이 화이트리스트를 쓰는 건 "그 자리에 있다고 광고라는 보장이 없는" 곳뿐이다(목록·메인 카드·
// 상세 본문). 메인의 배너 칸(#main_top_center·#divMenu*)은 위치가 곧 광고이고 경로도 따로
// (mobile_img/banner/) 있어 여기를 쓰지 않는다 — bambi-crawl-queenalba-main.ts를 보라.
const JOB_IMAGE_PATH_PATTERN =
	/^\/(?:wys2\/file_attach|upload\/happy_member|img_up)\//i;

export const isQueenalbaJobImageUrl = (url: string): boolean => {
	try {
		const parsed = new URL(url);

		return (
			parsed.origin === QUEENALBA_ORIGIN &&
			JOB_IMAGE_PATH_PATTERN.test(parsed.pathname)
		);
	} catch {
		return false;
	}
};

// 상세 링크에서 공고 ID를 뽑는다. 목록·메인페이지 파서가 같은 링크 모양을 보므로 한 곳에 둔다.
const DETAIL_NUM_PATTERN = /[?&]num=(\d+)/;

export const readQueenalbaDetailNum = (
	href: string | null | undefined
): string | null => href?.match(DETAIL_NUM_PATTERN)?.[1] ?? null;

export const QUEENALBA_DETAIL_LINK_SELECTOR = 'a[href*="guin_detail.php"]';

// 카드 하나의 경계. 링크 안에 이미지가 없으면 같은 카드의 이미지를 찾아야 하는데, 스코프 없이
// 올라가면 옆 카드 이미지를 집는다.
const CARD_CONTAINER_SELECTOR = "dl, li, td";

const firstJobImageUrl = (
	$: ReturnType<typeof load>,
	$scope: ReturnType<ReturnType<typeof load>>
): string | null => {
	for (const element of $scope.find("img").toArray()) {
		const url = toQueenalbaAbsoluteUrl($(element).attr("src"));

		if (url && isQueenalbaJobImageUrl(url)) {
			return url;
		}
	}

	return null;
};

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
	// 카드에 걸린 대표 이미지(절대 URL). 이미지 없이 텍스트만 있는 카드가 있어 null이 정상이다.
	thumbnailUrl?: string | null;
}

// 목록에서 수집기가 쓰는 건 num 하나뿐이다. 한 페이지에 카드형·표형 섹션이 섞여 있고
// 같은 공고가 여러 섹션에 실리므로, 섹션 구조를 따라가지 않고 상세 링크만 훑어 중복을 접는다.
// #sub_center로 좁히는 건 헤더·푸터의 배너 링크를 공고로 세지 않기 위해서다.
//
// 썸네일은 같은 공고가 실린 섹션마다 있을 수도, 없을 수도 있어(표형 섹션은 텍스트만이다)
// 먼저 찾은 값을 채우고 그 뒤 등장은 비어 있을 때만 메운다.
export const parseQueenalbaList = (html: string): QueenalbaListItem[] => {
	if (isQueenalbaGateStub(html)) {
		return [];
	}

	const $ = load(html);
	const thumbnails = new Map<string, string | null>();

	$(`#sub_center ${QUEENALBA_DETAIL_LINK_SELECTOR}`).each((_, element) => {
		const $link = $(element);
		const id = readQueenalbaDetailNum($link.attr("href"));

		if (!id || thumbnails.get(id)) {
			return;
		}

		thumbnails.set(
			id,
			firstJobImageUrl($, $link) ??
				firstJobImageUrl($, $link.closest(CARD_CONTAINER_SELECTOR).first())
		);
	});

	return [...thumbnails].map(([sourceExternalId, thumbnailUrl]) => ({
		sourceExternalId,
		thumbnailUrl,
	}));
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

// 급여 **단위는 텍스트가 아니라 이미지**다. 급여 값 칸에 WantMoneyArrImgN.gif 한 장이 있고
// 텍스트에는 금액만 남는다("150,000원 2026년 최저시급 10,320원") — 그래서 .text()만 읽던
// 예전 방식은 수집한 공고의 payUnit을 전부 비웠다. 실물 5건 모두 #sub_center 전체에서 이
// 이미지가 정확히 한 장이라 페이지에서 첫 장을 찾는 것으로 충분하다.
const PAY_UNIT_IMAGE_PATTERN = /WantMoneyArrImg(\d+)\.gif/i;

// 파일명의 N → 우리 어휘. 원본 표기는 1=면접 후 협의, 2=시급, 3=당일, 4=주급, 5=월급,
// 6=건당, 7=연봉이다.
//  - 3의 "당일"은 하루 단위 당일지급이라 일급으로 본다(normalize의 DAILY 규칙도 "당일"을
//    일급으로 잡아 폴백 경로와 답이 갈리지 않는다).
//  - 6·7은 우리 payUnitOptions 5종에 없지만 TABLE_CHARGE_PAY_UNIT과 같은 이유로 원문 의미
//    그대로 둔다 — 연봉을 월급으로 뭉개면 같은 금액이 12배 다른 뜻이 된다.
const PAY_UNIT_BY_IMAGE: Readonly<Record<string, string>> = {
	1: NEGOTIABLE_PAY_UNIT,
	2: "시급",
	3: "일급",
	4: "주급",
	5: "월급",
	6: "건당",
	7: "연봉",
};

// 모르는 N(사이트가 단위를 늘리는 경우)은 null을 돌려 텍스트 폴백에 맡긴다.
const readPayUnitImage = ($: ReturnType<typeof load>): string | null => {
	for (const element of $("#sub_center img").toArray()) {
		const digit = $(element).attr("src")?.match(PAY_UNIT_IMAGE_PATTERN)?.[1];

		if (digit) {
			return PAY_UNIT_BY_IMAGE[digit] ?? null;
		}
	}

	return null;
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

// 콜핀(대표번호 + 내선) 폴백. 대표번호 칸이 "1566-1945 + 콜핀번호"라는 안내 문구라, 그
// 자리에 실제 핀을 끼워 넣어야 걸 수 있는 번호가 된다. 실물 다수는 "전화번호" 라벨에 직통
// 번호를 그대로 적어 두므로 그쪽이 우선이고, 이 두 라벨은 콜핀만 쓰는 공고에만 나타난다.
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

// 날짜 칸은 어디든 첫 YYYY-MM-DD가 우리가 원하는 날짜다. 게시일이 따로 없어 "접수기간"의
// 시작일이 등록 시점 역할을 하고("2026-02-13 ~ 2026-08-24"), "마감일자"는 D-day 표기가
// 뒤에 붙는다("2026-08-05 D-12") — 둘 다 앞을 취하면 되므로 한 함수로 읽는다.
const DATE_PATTERN = /(\d{4})-(\d{2})-(\d{2})/;

const parseDate = (raw: string | null): Date | null => {
	const match = raw?.match(DATE_PATTERN);

	if (!match) {
		return null;
	}

	const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);

	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// 본문 블록을 여는 제목 이미지. 이 사이트의 섹션 제목은 **텍스트가 아니라 GIF**다 —
// 처음에 h2의 텍스트에서 "상세 채용정보"를 찾았는데 그 h2 안에는 img 하나뿐이라 한 건도
// 매칭되지 않았고, 그래서 본문·상세이미지가 198건 전부 비었다. 파일명으로 앵커한다.
const BODY_TITLE_IMAGE_PATTERN = /title_detail_guin_02/i;

// 본문 블록. "상세 채용정보" 제목 이미지를 품은 #sub_center 직계 자식 div가 그 블록이고,
// 업체가 올린 이미지와 면책 문구(.detail_no_ment)가 그 안에 함께 들어 있다. 블록을 못 찾으면
// 빈 선택자가 되어 본문·이미지가 비는데, 그건 파싱 실패가 아니라 이미지만 올린 공고와 구분이
// 안 된다 — 그래서 상단 수율 판정은 제목·라벨표로 하고 여기서는 조용히 빈 값을 돌린다.
const readBodySection = (
	$: ReturnType<typeof load>
): ReturnType<ReturnType<typeof load>> =>
	$("#sub_center > div").filter((_, element) =>
		$(element)
			.find("img")
			.toArray()
			.some((image) =>
				BODY_TITLE_IMAGE_PATTERN.test($(image).attr("src") ?? "")
			)
	);

// 이미지만 올리는 공고가 절반 이상이라 본문이 빈 문자열인 경우가 정상이다 — 파싱 실패로
// 보면 안 된다(수율 판정이 멀쩡한 회차를 중단시킨다).
const readBody = (
	$: ReturnType<typeof load>,
	$section: ReturnType<ReturnType<typeof load>>
): string => {
	// 면책 문구는 사이트가 모든 공고에 붙이는 고정 문장이다. 그대로 담으면 수집한 모든 공고의
	// 본문이 같은 문장이 되고 content_hash도 그 문장으로 결정돼 변경 감지가 죽는다.
	const $clone = $section.clone();

	// 섹션 제목(h2)과 면책 문구를 걷어낸다. 둘 다 사이트가 모든 공고에 똑같이 붙이는 것이라
	// 남겨두면 "본문 = 상세 채용정보 + 면책문구"가 되어 어느 공고든 같은 값이 된다.
	$clone.find("h2, .detail_no_ment").remove();

	const parts = $clone.toArray().map((element) => $(element).text());

	// 원문 HTML은 버리고 텍스트만 남긴다. 본문에 박힌 번호까지 가려야 마스킹이 의미가 있다.
	return maskContacts(normalizeText(parts.join("\n"))).slice(
		0,
		MAX_BODY_LENGTH
	);
};

// 상세 이미지 저장 상한. 같은 이미지를 수십 번 반복해 붙이는 공고가 있어 천장을 둔다.
// 몇 장을 버렸는지 세는 필드는 두지 않았다 — 저장할 컬럼도 읽는 쪽도 아직 없다. 대신 상한값을
// export 해서 호출자가 "길이 == 상한 → 잘렸을 수 있음"을 로그로 드러낼 수 있게 한다.
export const QUEENALBA_MAX_DETAIL_IMAGES = 20;

// 본문 이미지가 우리 오리진 밖(외부 CDN)에 있는지. 절대 http/https이면서 오리진이 퀸알바가
// 아니면 외부 후보다. toQueenalbaAbsoluteUrl이 상대경로를 퀸알바 오리진으로 굳히므로, 여기
// 남는 건 원문이 절대 URL로 박아둔 외부 호스트뿐이다.
const isExternalImageUrl = (url: string): boolean => {
	try {
		const parsed = new URL(url);

		return (
			(parsed.protocol === "http:" || parsed.protocol === "https:") &&
			parsed.origin !== QUEENALBA_ORIGIN
		);
	} catch {
		return false;
	}
};

// 본문에 박힌 공고 이미지. 유흥 공고는 조건 대부분을 이미지로만 적어두는 경우가 많아 텍스트만
// 저장하면 정작 핵심이 빠진다. 같은 이미지를 여러 번 붙이는 공고가 흔해 중복은 접되, 순서는
// 그대로 둔다(위에서부터 읽는 게 곧 공고의 구성이다).
//
// 두 버킷으로 모은다: (1) same-origin 화이트리스트, (2) 외부 호스트 후보. 화이트리스트가
// 한 장이라도 있으면 그것만, 0장일 때만 외부 후보로 폴백한다. 37893은 본문 14장이 전부
// tksk8080.diskn.com이었다 — 전량 외부 호스팅 공고가 실재해, 폴백이 없으면 그런 공고의
// 이미지가 통째로 빈다. 반대로 혼합 공고(본문 same-origin + imgur 장식 gif)는 화이트리스트가
// 이겨 외부 장식이 새지 않는다. same-origin 비화이트리스트(에디터 아이콘·사이트 장식)는 어느
// 버킷에도 안 들어간다. 상한 20은 두 버킷 모두 같게 적용한다.
const readDetailImageUrls = (
	$: ReturnType<typeof load>,
	$section: ReturnType<ReturnType<typeof load>>
): string[] => {
	const whitelist: string[] = [];
	const external: string[] = [];
	const seenWhitelist = new Set<string>();
	const seenExternal = new Set<string>();

	for (const element of $section.find("img").toArray()) {
		const url = toQueenalbaAbsoluteUrl($(element).attr("src"));

		if (!url) {
			continue;
		}

		if (isQueenalbaJobImageUrl(url)) {
			if (
				!seenWhitelist.has(url) &&
				whitelist.length < QUEENALBA_MAX_DETAIL_IMAGES
			) {
				seenWhitelist.add(url);
				whitelist.push(url);
			}
		} else if (
			isExternalImageUrl(url) &&
			!seenExternal.has(url) &&
			external.length < QUEENALBA_MAX_DETAIL_IMAGES
		) {
			seenExternal.add(url);
			external.push(url);
		}
	}

	// 화이트리스트가 한 장이라도 있으면 그것만, 0장일 때만 외부 후보로 폴백한다.
	return whitelist.length > 0 ? whitelist : external;
};

// 상세 페이지 썸네일. 운영자 확인으로 새로 안 사실 — 썸네일이 본문 이미지와 별개로 상세에도
// 있고, #sub_center 안에서 본문 영역보다 위에 온다. 그 사이 래퍼 구조는 모르므로 위치 사슬
// 대신 "본문 범위 밖에 있는 첫 공고 이미지"로 잡는다. 본문 범위의 img는 원소 단위로 빼서
// 썸네일이 detailImageUrls에 섞이지 않게 한다(같은 파일을 두 칸에 저장하면 중복이 된다).
const readThumbnailUrl = (
	$: ReturnType<typeof load>,
	$section: ReturnType<ReturnType<typeof load>>
): string | null => {
	const bodyImages = new Set($section.find("img").toArray());

	for (const element of $("#sub_center img").toArray()) {
		if (bodyImages.has(element)) {
			continue;
		}

		const url = toQueenalbaAbsoluteUrl($(element).attr("src"));

		if (url && isQueenalbaJobImageUrl(url)) {
			return url;
		}
	}

	return null;
};

// 공통 레코드에 상세에서만 얻는 값(본문 이미지 목록·썸네일)을 얹은 확장형. 공통 타입
// (CrawledJobRecord)에 넣지 않은 것은 여우알바 파서가 아직 이 값을 채우지 않고 수집기도
// 읽지 않기 때문이다 — 공통 타입에 필수 필드로 들어가면 그쪽이 전부 깨진다.
export interface QueenalbaDetailRecord extends CrawledJobRecord {
	detailImageUrls?: string[];
	// 목록·메인에서 썸네일을 못 얻은 공고를 상세 것으로 채우기 위한 칸. 상세에 썸네일이
	// 없는 공고가 있어 null이 정상이다.
	thumbnailUrl?: string | null;
}

export const parseQueenalbaDetail = (
	html: string,
	sourceExternalId: string
): QueenalbaDetailRecord | null => {
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
	const payUnitFromImage = readPayUnitImage($);
	const $body = readBodySection($);

	return {
		address: fields.get("회사주소") ?? null,
		ageRange: fields.get("나이") ?? null,
		bizName: fields.get("회사명") ?? fields.get("상호") ?? null,
		body: readBody($, $body),
		contactKakao: readMessengerId($),
		contactName: fields.get("담당자") ?? null,
		// 직통 번호("전화번호" 라벨)가 실물 다수다. 콜핀은 그게 없는 공고의 폴백이다.
		contactPhone: fields.get("전화번호") ?? readCallPin(fields),
		detailImageUrls: readDetailImageUrls($, $body),
		district: location.district,
		// 여성 전용 사이트라 상세에 성별 항목 자체가 없다.
		gender: null,
		industryCategory: mapIndustryCategory(industryRaw),
		industryRaw,
		payAmount: parsedPay.amount,
		payRaw,
		// 단위 이미지가 있으면 그것이 정본이다(사이트가 단위를 그 gif로만 표기한다).
		// 폴백은 텍스트 판정인데, 급여 칸이 단위 없이 금액만 주는 경우가 있어("150,000원")
		// 금액을 읽었는데 단위가 기본값 "협의"로 떨어졌다면 그건 협의가 아니라 단위를 모르는
		// 것이므로 비운다 — 금액이 있는데 "협의"라고 적으면 화면에서 서로 모순된 값이 된다.
		payUnit:
			payUnitFromImage ??
			(parsedPay.amount !== null && parsedPay.unit === NEGOTIABLE_PAY_UNIT
				? null
				: parsedPay.unit),
		region: location.region,
		shopName: fields.get("닉네임") ?? null,
		sourceDeadlineAt: parseDate(fields.get("마감일자") ?? null),
		sourceExternalId,
		sourcePostedAt: parseDate(fields.get("접수기간") ?? null),
		sourceUrl: queenalbaDetailUrl(sourceExternalId),
		thumbnailUrl: readThumbnailUrl($, $body),
		title,
		// 이 사이트의 상세에는 근무시간 항목이 아예 없다(업무내용·고용형태·급여·마감일자·
		// 편의사항까지가 전부다). "업무일"은 우리가 있을 것으로 가정했던 라벨이라 걷어냈다 —
		// 없는 라벨을 조회하면 항상 null이면서 마치 읽어보는 것처럼 보인다.
		workSchedule: null,
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

// bbs_num을 맨 앞에 둔다. robots.txt가 개별 글을 `/bbs_detail.php?bbs_num=1064363` 형태로
// 통째로 막아두는데, 우리 robots 대조는 접두사 일치라 파라미터 순서가 바뀌면 그 차단을 놓친다.
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
			sourcePostedAt: parseDate(texts.at(-3) ?? null),
			sourceUrl: queenalbaCommunityTopicUrl(sourceExternalId),
			title,
			viewCount: parseCount(texts.at(-1)),
		});
	});

	return topics;
};

// 게시판 본문 저장 상한. 공고와 같은 이유로 천장을 둔다.
const MAX_COMMUNITY_BODY_LENGTH = 10_000;

// 조회수는 상세에만 있고, 그나마 글마다 나올 때도 안 나올 때도 있다(칸은 그대로 있고 내용만
// 빈다 — 실측으로 확인). 같은 칸에 추천 수까지 들어 있어("조회 : 176 추천: 0") 라벨로 끊어 읽고,
// 없으면 null로 둔다. 본문이 있는데 조회수가 없는 건 파싱 실패가 아니다.
const VIEW_COUNT_PATTERN = /조회\s*:\s*([\d,]+)/;

export interface CrawledCommunityBody {
	body: string;
	title: string | null;
	viewCount: number | null;
}

// 게시글 상세. 목록에서 못 얻는 두 가지(본문, 조회수)만 가져온다 — 제목·댓글수·작성일은
// 목록이 이미 준다.
//
// 댓글은 읽지 않는다. 본문과 달리 댓글창은 업소 홍보글이 대부분이라 주제 신호로 쓸모가 없고,
// 개별 작성자 글을 그만큼 더 복제하게 된다.
export const parseQueenalbaCommunityDetail = (
	html: string
): CrawledCommunityBody | null => {
	if (isQueenalbaGateStub(html)) {
		return null;
	}

	const $ = load(html);
	const container = $("#ct").first();

	// #ct가 없으면 우리가 아는 상세가 아니다(삭제된 글·블라인드·마크업 변경).
	if (container.length === 0) {
		return null;
	}

	const viewMatch = $("#sub_center td.smfont2")
		.text()
		.match(VIEW_COUNT_PATTERN);

	return {
		// 원문 HTML은 버리고 텍스트만 남긴다. 본문에 박힌 번호·메신저 아이디까지 가려야
		// 마스킹이 의미가 있다(유흥 커뮤니티 글은 본문에 연락처를 그대로 적는다).
		body: maskContacts(normalizeText(container.text())).slice(
			0,
			MAX_COMMUNITY_BODY_LENGTH
		),
		title: cleanText($(".board-title-container h1").first().text()),
		viewCount: viewMatch?.[1]
			? Number.parseInt(viewMatch[1].replaceAll(",", ""), 10)
			: null,
	};
};
