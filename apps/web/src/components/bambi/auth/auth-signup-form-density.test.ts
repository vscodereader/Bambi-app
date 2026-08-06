import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 가입 폼은 QA에서 두 번 되돌아온 자리다: (1) 2열 배치가 읽는 순서를 갈랐고,
// (2) 1열로 편 뒤에는 높이가 카드를 넘겨 푸터를 덮었다. 두 조건은 서로 반대 방향으로
// 당기므로 "1열 + 컴팩트"를 동시에 못 박아 둔다 — 렌더 없이 소스만 훑는 검사다.
const read = (file: string) =>
	fs.readFileSync(path.join(import.meta.dirname, file), "utf8");

const fields = read("auth-fields.tsx");
const panel = read("auth-panel.tsx");

const FIELD_ORDER = [
	"auth-nickname",
	"auth-username",
	"auth-email",
	"auth-password",
	"auth-password-confirm",
	"auth-role-label",
];

const ARBITRARY_PX_RE = /\[\d+px\]/;

const countOf = (source: string, needle: string) =>
	source.split(needle).length - 1;

describe("회원가입 폼 1열 배치", () => {
	it("닉네임→아이디→이메일→비밀번호→비밀번호 확인→가입 유형 순서를 지킨다", () => {
		const positions = FIELD_ORDER.map((id) => fields.indexOf(`"${id}"`));
		expect(positions).not.toContain(-1);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
	});

	it("폼에 다열 그리드를 얹지 않는다", () => {
		// 가입 유형 ToggleGroup의 grid-cols-2는 한 칸 안의 선택지 배치라 예외다.
		expect(panel).not.toContain("grid-cols");
		expect(fields).not.toContain("sm:grid-cols");
	});
});

describe("회원가입 폼 밀도", () => {
	it("칸 사이는 gap-3, 칸 안 라벨–입력은 gap-1.5로 좁혀 둔다", () => {
		expect(panel).toContain('className="grid gap-3"');
		expect(countOf(fields, 'className="grid gap-1.5"')).toBe(
			FIELD_ORDER.length
		);
	});

	it("로그인 폼의 간격은 건드리지 않는다(가입만 압축)", () => {
		expect(countOf(fields, 'className="grid gap-2"')).toBe(2);
	});

	it("간격은 gap으로만 준다(space-y 금지)", () => {
		expect(fields).not.toContain("space-y-");
		expect(panel).not.toContain("space-y-");
	});

	it("임의 px 대신 Tailwind 스케일 토큰을 쓴다", () => {
		expect(fields).not.toMatch(ARBITRARY_PX_RE);
	});
});
