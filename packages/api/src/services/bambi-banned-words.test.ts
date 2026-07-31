import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

// 검사 대상은 순수 함수뿐이지만, 같은 모듈이 캐시 조회를 위해 db를 import하므로
// 모듈 평가 시점에 서버 env가 필요하다. 이 패키지의 다른 테스트와 동일한 관례로
// dotenv를 먼저 실행하고 동적 import한다(정적 import는 env보다 먼저 평가된다).
dotenv.config({ path: "../../apps/server/.env" });

const { findBannedTerm, findBannedTerms, normalizeForMatch } = await import(
	"./bambi-banned-words"
);
type BannedWordEntry = import("./bambi-banned-words").BannedWordEntry;

const entry = (term: string): BannedWordEntry => ({
	term,
	normalizedTerm: normalizeForMatch(term),
});

describe("normalizeForMatch", () => {
	it("공백과 특수문자를 제거한다", () => {
		expect(normalizeForMatch("성 매매")).toBe("성매매");
		expect(normalizeForMatch("성*매매")).toBe("성매매");
		expect(normalizeForMatch("성.매.매")).toBe("성매매");
		expect(normalizeForMatch("성-매-매")).toBe("성매매");
	});

	it("영문을 소문자로 접는다", () => {
		expect(normalizeForMatch("ViAgRa")).toBe("viagra");
	});

	it("한글 자모와 숫자는 보존한다", () => {
		expect(normalizeForMatch("ㅅㅁㅁ 010")).toBe("ㅅㅁㅁ010");
	});

	it("빈 문자열을 안전하게 처리한다", () => {
		expect(normalizeForMatch("")).toBe("");
	});
});

describe("findBannedTerm", () => {
	const entries = [entry("성매매"), entry("미성년")];

	it("정확히 일치하면 원문 term을 반환한다", () => {
		expect(findBannedTerm("성매매 알선합니다", entries)).toBe("성매매");
	});

	it("공백·특수문자로 우회해도 잡는다", () => {
		expect(findBannedTerm("성 매매 합니다", entries)).toBe("성매매");
		expect(findBannedTerm("성*매매 합니다", entries)).toBe("성매매");
	});

	it("금칙어가 없으면 null을 반환한다", () => {
		expect(findBannedTerm("평범한 구인 공고입니다", entries)).toBeNull();
	});

	it("목록이 비면 null을 반환한다", () => {
		expect(findBannedTerm("성매매", [])).toBeNull();
	});

	it("여러 개가 걸리면 목록에서 먼저 만난 것을 반환한다", () => {
		expect(findBannedTerm("미성년 성매매", entries)).toBe("성매매");
	});

	// 정규화의 부작용 — 공백 제거로 인접 단어가 붙어 우연히 금칙어를 이루는 경계를 고정한다.
	// 이 동작은 의도된 것이다(우회 차단을 위해 오탐을 감수). 바뀌면 테스트가 알려준다.
	it("공백 제거로 인접 단어가 붙는 경우도 차단된다", () => {
		expect(findBannedTerm("완성 매매가 끝났다", entries)).toBe("성매매");
	});

	it("정상 문장은 통과시킨다", () => {
		expect(
			findBannedTerm("주말 근무 가능하신 분 구합니다", entries)
		).toBeNull();
	});
});

describe("findBannedTerms", () => {
	const entries = [entry("성매매"), entry("미성년"), entry("보도")];

	it("걸린 단어를 모두 모은다", () => {
		expect(findBannedTerms("미성년 성매매 알선", entries)).toEqual([
			"성매매",
			"미성년",
		]);
	});

	it("같은 단어가 여러 번 나와도 한 번만 담는다", () => {
		expect(findBannedTerms("보도 보도 보도", entries)).toEqual(["보도"]);
	});

	it("공백·구두점으로 끊어 쓴 우회도 잡는다", () => {
		expect(findBannedTerms("성 매.매 합니다", entries)).toEqual(["성매매"]);
	});

	it("걸리는 단어가 없으면 빈 배열이다", () => {
		expect(findBannedTerms("주말 홀서빙 구합니다", entries)).toEqual([]);
	});

	it("금칙어 목록이 비면 빈 배열이다", () => {
		expect(findBannedTerms("성매매", [])).toEqual([]);
	});

	it("빈 텍스트는 빈 배열이다", () => {
		expect(findBannedTerms("", entries)).toEqual([]);
	});
});
