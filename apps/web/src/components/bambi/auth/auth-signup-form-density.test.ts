import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 가입 폼은 QA에서 세 번 되돌아온 자리다: (1) 전면 2열이 읽는 순서를 갈랐고,
// (2) 1열로 편 뒤에는 높이가 카드를 넘겨 푸터를 덮었고, (3) 밀도만 줄여서는 모자랐다.
// 확정안은 혼합 배치다 — 닉네임|아이디 · 이메일(전체) · 비밀번호|비밀번호 확인 ·
// 가입 유형(전체). 순서·행 구조·모바일 1열·로그인 불변을 함께 못 박아 둔다
// (렌더 없이 소스만 훑는 검사다).
const read = (file: string) =>
	fs.readFileSync(path.join(import.meta.dirname, file), "utf8");

const fields = read("auth-fields.tsx");
const panel = read("auth-panel.tsx");

// 2열 행에서 짝을 짓는 칸(전체 폭을 쓰지 않는다).
const PAIRED_FIELDS = [
	"auth-nickname",
	"auth-username",
	"auth-password",
	"auth-password-confirm",
];

const FIELD_ORDER = [
	"auth-nickname",
	"auth-username",
	"auth-email",
	"auth-password",
	"auth-password-confirm",
	"auth-role-label",
];

const ARBITRARY_PX_RE = /\[\d+px\]/;
const GRID_COLS_RE = /[\w@:.-]*grid-cols-\d+/g;

const countOf = (source: string, needle: string) =>
	source.split(needle).length - 1;

describe("회원가입 폼 혼합 배치", () => {
	it("닉네임→아이디→이메일→비밀번호→비밀번호 확인→가입 유형 순서를 지킨다", () => {
		const positions = FIELD_ORDER.map((id) => fields.indexOf(`"${id}"`));
		expect(positions).not.toContain(-1);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
	});

	it("가입 칸을 2열 그리드에 얹고 도움말 문구가 옆 칸을 밀지 않게 items-start로 세운다", () => {
		expect(panel).toContain('className="@container grid gap-3"');
		expect(panel).toContain(
			'<div className="grid @md:grid-cols-2 items-start gap-3">'
		);
	});

	it("1·3행(닉네임|아이디, 비밀번호|비밀번호 확인)은 반 칸을 쓴다", () => {
		for (const id of PAIRED_FIELDS) {
			expect(fields).toContain(`className="grid gap-1.5" htmlFor="${id}"`);
		}
	});

	it("2·4행(이메일, 가입 유형)은 행을 통째로 쓴다", () => {
		expect(fields).toContain(
			'<label className="@md:col-span-2 grid gap-1.5" htmlFor="auth-email">'
		);
		// 가입 유형 묶음(라벨 + ToggleGroup)과 그 아래 업소회원 안내.
		expect(fields).toContain('<div className="@md:col-span-2 grid gap-1.5">');
		expect(fields).toContain('className="@md:col-span-2 m-0 rounded-lg');
	});

	it("좁은 카드(모바일)에서는 1열로 흐른다 — 다열은 컨테이너 쿼리 뒤에만 둔다", () => {
		// 뷰포트 breakpoint(sm:/md:)나 무조건 다열은 모바일에서 그대로 2열이 된다.
		expect(panel.match(GRID_COLS_RE)).toEqual(["@md:grid-cols-2"]);
		// 가입 유형 ToggleGroup의 grid-cols-2는 한 칸 안의 선택지 배치라 예외다.
		expect(fields.match(GRID_COLS_RE)).toEqual(["grid-cols-2"]);
	});
});

describe("회원가입 폼 밀도", () => {
	it("칸 안 라벨–입력은 가입 6칸 모두 gap-1.5로 좁혀 둔다", () => {
		expect(countOf(fields, "grid gap-1.5")).toBe(FIELD_ORDER.length);
	});

	it("로그인 폼은 배치·간격 모두 건드리지 않는다(가입만 압축)", () => {
		expect(countOf(fields, 'className="grid gap-2"')).toBe(2);
		// 전체 폭 지정은 가입 쪽 3곳(이메일·가입 유형·업소회원 안내)뿐이다 —
		// 로그인 칸은 2열 그리드를 타지 않으므로 붙을 이유가 없다.
		expect(countOf(fields, 'className="@md:col-span-2')).toBe(3);
	});

	it("간격은 gap으로만 준다(space-y 금지)", () => {
		expect(fields).not.toContain("space-y-");
		expect(panel).not.toContain("space-y-");
	});

	it("임의 px 대신 Tailwind 스케일 토큰을 쓴다", () => {
		expect(fields).not.toMatch(ARBITRARY_PX_RE);
	});
});
