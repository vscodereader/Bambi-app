// "글 관리" 화면 전용 순수 헬퍼 — react-native를 import하지 않는다(vitest에서 그대로 돈다).

// 날짜 표기는 웹 목록(lib/bambi/community.ts formatCommunityDate)과 같은 "YYYY.MM.DD"다.
// bambi-screen의 formatDateTime은 시:분이 붙어 웹과 어긋나므로 재사용하지 않는다.
// 타임존을 한국으로 고정하는 이유도 웹과 같다 — 기기 타임존이 다르면 자정 언저리 글의
// 날짜가 웹 화면과 하루씩 갈린다.
const contentDateFormat = new Intl.DateTimeFormat("ko-KR", {
	day: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Seoul",
	year: "numeric",
});

export const formatContentDate = (value: Date | string): string => {
	const parts = contentDateFormat.formatToParts(new Date(value));
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${get("year")}.${get("month")}.${get("day")}`;
};

// listMineLiked는 community_board leftJoin이라 게시판이 지워지면 라벨이 null로 온다
// (listMineAuthored는 innerJoin이라 항상 값이 있다). 웹 ContentTable과 같은 폴백 문구.
export const contentBoardLabel = (label: null | string): string =>
	label ?? "삭제된 게시판";

// status는 DB enum(community_content_status: published | hidden | deleted)이고
// listMineLiked만 원글 행이 사라진 경우 "missing"을 얹어 준다. enum 원값을 화면에
// 내보내지 않도록 라벨 변환은 이 함수만 담당한다. published면 배지가 없어 null.
export const contentUnavailableLabel = (status: string): null | string => {
	if (status === "published") {
		return null;
	}

	return status === "hidden" ? "숨김 처리된 글" : "삭제된 글";
};
