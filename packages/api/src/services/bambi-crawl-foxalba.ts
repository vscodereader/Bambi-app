import { load } from "cheerio";

import {
	type CrawledJobRecord,
	mapIndustryCategory,
	maskContacts,
	NEGOTIABLE_PAY_UNIT,
	normalizeText,
	parsePay,
	TABLE_CHARGE_PAY_UNIT,
} from "./bambi-crawl-normalize";

// 여우알바 파서. 네트워크를 모르고 HTML 문자열만 받는 순수 함수라, 저장해 둔 픽스처만으로
// 테스트가 돈다. DOM 크롤링의 운영 비용은 대부분 셀렉터가 소리 없이 깨지는 데서 나오므로
// 이 경계가 유일하게 작동하는 방어선이다.

export const FOXALBA_ORIGIN = "https://m.foxalba.com";

// 목록은 페이지당 50건이고 all.asp에 붙는 파라미터는 intpage 하나뿐이다(지역·업종 필터는
// search_result.asp라는 별도 화면으로 간다 — 전건 수집이 목적이라 여기서는 쓰지 않는다).
export const FOXALBA_ITEMS_PER_PAGE = 50;

export const foxalbaListUrl = (page: number): string =>
	page <= 1
		? `${FOXALBA_ORIGIN}/all.asp`
		: `${FOXALBA_ORIGIN}/all.asp?intpage=${page}`;

export const foxalbaDetailUrl = (sourceExternalId: string): string =>
	`${FOXALBA_ORIGIN}/view.asp?o_idx=${sourceExternalId}`;

// 본문 저장 상한. 실측 샘플의 모집글이 한 줄에 77,000자였다. 상한 없이 받으면 이상 공고
// 하나가 행 크기와 목록 응답을 통째로 흔든다.
const MAX_BODY_LENGTH = 20_000;

// 목록의 급여 단위는 텍스트가 아니라 아이콘 class로만 구분된다.
// day = TC는 같은 공고 상세의 급여 칩("TC")과 대조해 확인했다. hs·time은 상세 교차 검증
// 표본을 얻지 못해 아이콘 글자("협", "시")에서 읽은 추정이며, 틀리면 상세 파싱이 덮어쓴다.
const LIST_PAY_UNIT_BY_ICON_CLASS: Readonly<Record<string, string>> = {
	day: TABLE_CHARGE_PAY_UNIT,
	hs: NEGOTIABLE_PAY_UNIT,
	time: "시급",
};

export interface FoxalbaListItem {
	payText: string | null;
	payUnit: string | null;
	region: string | null;
	shopName: string | null;
	sourceExternalId: string;
	title: string;
}

const WHITESPACE_PATTERN = /\s+/;

const cleanText = (raw: string | undefined): string | null => {
	const text = normalizeText(raw ?? "");

	return text.length > 0 ? text : null;
};

// 목록 페이지에서 공고 요약을 뽑는다. 여기서 얻는 건 "이 ID가 아직 살아 있다"는 사실과
// 최소 표시 정보뿐이고, 전체 필드는 상세에서 채운다. 목록만으로 생존을 확인할 수 있어야
// 매 회차 3,000건 상세를 다시 받지 않는다.
export const parseFoxalbaList = (html: string): FoxalbaListItem[] => {
	const $ = load(html);
	const items: FoxalbaListItem[] = [];

	$("ul.list > li.liItem").each((_, element) => {
		const $item = $(element);
		const sourceExternalId = $item.attr("data-id")?.trim() ?? "";

		// data-id가 곧 o_idx다. 없으면 우리가 아는 구조가 아니므로 조용히 건너뛰지 않고
		// 수율 집계에 실패로 남도록 항목 자체를 버린다.
		if (sourceExternalId.length === 0) {
			return;
		}

		const iconClass = $item.find("span.icon").attr("class") ?? "";
		const unitKey = iconClass
			.split(WHITESPACE_PATTERN)
			.find((token) => token !== "icon" && token.length > 0);

		items.push({
			payText: cleanText($item.find("span.pay").text()),
			payUnit: unitKey ? (LIST_PAY_UNIT_BY_ICON_CLASS[unitKey] ?? null) : null,
			region: cleanText($item.find("span.add").text()),
			// span.company는 서버에서 말줄임돼 온다("시흥시 써니 노.."). 썸네일 alt에 원문이
			// 남아 있어 그쪽을 먼저 본다.
			shopName:
				cleanText($item.find("img.info_img").attr("alt")) ??
				cleanText($item.find("span.company").text()),
			sourceExternalId,
			title: cleanText($item.find("span.title").text()) ?? "",
		});
	});

	return items;
};

const TOTAL_COUNT_PATTERN = /[\d,]+/;

// 전체 공고 수. 페이저는 앞쪽 5개와 "다음"만 노출해서 마지막 페이지를 알 수 없으므로,
// 수집 범위는 페이저가 아니라 이 숫자로 계산한다.
export const parseFoxalbaTotalCount = (html: string): number | null => {
	const $ = load(html);
	const raw = $("ul.ti span.num b").first().text();
	const match = raw.match(TOTAL_COUNT_PATTERN);

	if (!match) {
		return null;
	}

	const value = Number.parseInt(match[0].replaceAll(",", ""), 10);

	return Number.isFinite(value) ? value : null;
};

// 상세는 table도 dl도 아니고 `<li><span class="ti">라벨</span>값</li>` 형태다.
// 값이 없는 필드는 빈 span이 아니라 li 행 자체가 사라지므로 위치 인덱스로 읽으면 밀린다 —
// 반드시 라벨 텍스트로 찾아야 한다.
const readLabeledFields = (
	$: ReturnType<typeof load>
): Map<string, ReturnType<ReturnType<typeof load>>> => {
	const fields = new Map<string, ReturnType<ReturnType<typeof load>>>();

	// #nowAd로 스코프를 좁힌다. 같은 구조의 빈 슬라이드(#prevAd/#nextAd)가 페이지에 있고
	// JS가 그것들을 채우기 때문에, 스코프가 없으면 나중에 엉뚱한 슬라이드를 읽을 수 있다.
	$("#nowAd ul.top > li, #nowAd ul.info > li").each((_, element) => {
		const $item = $(element);
		const label = $item.children("span.ti").text().trim();

		if (label.length > 0 && !fields.has(label)) {
			fields.set(label, $item);
		}
	});

	return fields;
};

// 라벨 span과 "복사" 버튼을 떼어낸 나머지를 값으로 본다. 카톡아이디는 값이 span으로 감싸여
// 있지 않은 맨 텍스트 노드라, 값 전용 셀렉터로 읽으면 null이 되고 이 방식이라야 잡힌다.
const readFieldValue = (
	$item: ReturnType<ReturnType<typeof load>> | undefined
): string | null => {
	if (!$item || $item.length === 0) {
		return null;
	}

	const $value = $item.clone();
	$value.children("span.ti").remove();
	$value.find("a.copy-btn").remove();

	return cleanText($value.text());
};

// 근무지역·급여는 `칩 + 값` 두 span으로 쪼개져 있다(경기 + 하남시, TC + 60,000원).
const readChipPair = (
	$item: ReturnType<ReturnType<typeof load>> | undefined
): { chip: string | null; value: string | null } => {
	if (!$item || $item.length === 0) {
		return { chip: null, value: null };
	}

	return {
		chip: cleanText($item.find("span.keyword-chip").first().text()),
		value: cleanText($item.find("span.value-strong").first().text()),
	};
};

export const parseFoxalbaDetail = (
	html: string,
	sourceExternalId: string
): CrawledJobRecord | null => {
	const $ = load(html);

	// 제목은 #spnTitle이 아니라 #divTitle에서 읽는다 — #spnTitle은 빈 채로 서빙되고
	// 클라이언트 JS가 채우기 때문에 정적 파싱으로는 항상 빈 문자열이다.
	const title = cleanText($("#divTitle").first().text());
	const fields = readLabeledFields($);

	// 제목과 라벨 블록 둘 다 못 읽었으면 이 페이지는 우리가 아는 상세가 아니다(삭제된 공고,
	// 오류 페이지, 마크업 변경). null을 돌려 수집기의 수율 판정에 실패로 잡히게 한다.
	if (!title || fields.size === 0) {
		return null;
	}

	const location = readChipPair(fields.get("근무지역"));
	const pay = readChipPair(fields.get("급여"));
	const payRaw =
		[pay.chip, pay.value].filter(Boolean).join(" ") ||
		readFieldValue(fields.get("급여"));
	const parsedPay = parsePay(payRaw);
	const industryRaw = readFieldValue(fields.get("모집직종"));

	// 본문은 라벨과 값이 형제 li로 갈라져 있어(라벨 li 다음에 li.content) 다른 필드와 패턴이
	// 다르다. HTML을 버리고 텍스트만 남긴다 — 원문이 font 태그·인라인 48px·외부 핫링크
	// 이미지로 채워져 있어 그대로 렌더하면 우리 화면이 깨지고 남의 서버 트래픽을 쓰게 된다.
	const rawBody = $("#nowAd ul.info li.content").first().text();
	const body = maskContacts(normalizeText(rawBody)).slice(0, MAX_BODY_LENGTH);

	return {
		address: readFieldValue(fields.get("주소")),
		ageRange: readFieldValue(fields.get("모집연령")),
		bizName: readFieldValue(fields.get("사업자명")),
		body,
		contactKakao: readFieldValue(fields.get("카톡아이디")),
		contactName: readFieldValue(fields.get("담당자")),
		contactPhone: readFieldValue(fields.get("연락처")),
		district: location.value,
		gender: readFieldValue(fields.get("모집성별")),
		industryCategory: mapIndustryCategory(industryRaw),
		industryRaw,
		payAmount: parsedPay.amount,
		payRaw,
		// 원문 단위를 그대로 남긴다. TC는 우리 payUnitOptions에 없는데 "일급"으로 욱여넣으면
		// 금액의 의미가 바뀐다(테이블당 vs 하루당).
		payUnit: pay.chip ?? parsedPay.unit,
		region: location.chip,
		shopName: readFieldValue(fields.get("닉네임/업소명")),
		sourceExternalId,
		// 원본에 게시일이 없다. 광고기간은 "1,350일" 같은 잔여 기간이라 게시 시각으로 환산할 수
		// 없어 비워 둔다(수집 시각은 first_seen_at이 따로 들고 있다).
		sourcePostedAt: null,
		sourceUrl: foxalbaDetailUrl(sourceExternalId),
		title,
		workSchedule: readFieldValue(fields.get("근무시간")),
	};
};
