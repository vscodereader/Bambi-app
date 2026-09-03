import { describe, expect, it } from "vitest";

import {
	addJobBlock,
	canAddJobBlock,
	createJobDescriptionBlock,
	jobDescriptionBlocksError,
	jobDescriptionBlockTypeLabels,
	moveJobBlock,
	removeJobBlock,
	updateJobBlockText,
	updateJobBlockType,
} from "@/src/lib/employer/job-description-blocks";

const block = (id: string, text = "내용") =>
	({ id, text, type: "paragraph" }) as const;

describe("createJobDescriptionBlock", () => {
	it("고유 id와 빈 텍스트로 만든다", () => {
		const a = createJobDescriptionBlock();
		const b = createJobDescriptionBlock("heading");

		expect(a.id).not.toBe(b.id);
		expect(a.type).toBe("paragraph");
		expect(b.type).toBe("heading");
		expect(a.text).toBe("");
	});
});

describe("타입 라벨", () => {
	it("네 타입 모두 한국어 라벨이 있다", () => {
		expect(jobDescriptionBlockTypeLabels.paragraph).toBe("문단");
		expect(jobDescriptionBlockTypeLabels.heading).toBe("소제목");
		expect(jobDescriptionBlockTypeLabels.bullet_list).toBe("목록");
		expect(jobDescriptionBlockTypeLabels.callout).toBe("강조");
	});
});

describe("상태 조작", () => {
	it("addJobBlock은 끝에 붙인다", () => {
		expect(addJobBlock([block("a")]).length).toBe(2);
	});

	it("removeJobBlock은 해당 id만 뺀다", () => {
		expect(
			removeJobBlock([block("a"), block("b")], "a").map((x) => x.id)
		).toEqual(["b"]);
	});

	it("moveJobBlock up/down은 인접 항목과 교환한다", () => {
		const list = [block("a"), block("b"), block("c")];
		expect(moveJobBlock(list, "b", "up").map((x) => x.id)).toEqual([
			"b",
			"a",
			"c",
		]);
		expect(moveJobBlock(list, "b", "down").map((x) => x.id)).toEqual([
			"a",
			"c",
			"b",
		]);
	});

	it("맨 끝을 down하면 그대로", () => {
		const list = [block("a"), block("b")];
		expect(moveJobBlock(list, "b", "down")).toEqual(list);
	});

	it("updateJobBlockText/Type은 해당 id만 바꾼다", () => {
		const updated = updateJobBlockText([block("a")], "a", "새 텍스트");
		expect(updated[0].text).toBe("새 텍스트");
		expect(updateJobBlockType(updated, "a", "callout")[0].type).toBe("callout");
	});
});

describe("canAddJobBlock / jobDescriptionBlocksError", () => {
	it("12개 미만이면 추가 가능", () => {
		expect(canAddJobBlock([])).toBe(true);
		expect(
			canAddJobBlock(Array.from({ length: 12 }, (_, i) => block(String(i))))
		).toBe(false);
	});

	it("빈 텍스트 블록은 오류 문구를 준다", () => {
		expect(jobDescriptionBlocksError([block("a", "  ")])).toBe(
			"상세설명 블록의 내용을 입력하거나 빈 블록을 삭제해 주세요."
		);
	});

	it("정상 블록은 null", () => {
		expect(jobDescriptionBlocksError([block("a", "내용")])).toBeNull();
	});

	it("빈 배열은 null(상세설명 블록은 선택 입력)", () => {
		expect(jobDescriptionBlocksError([])).toBeNull();
	});

	it("13개(한도 초과)면 too_many_blocks 문구", () => {
		const tooMany = Array.from({ length: 13 }, (_, i) => block(String(i)));
		expect(jobDescriptionBlocksError(tooMany)).toBe(
			"상세설명 블록은 최대 12개까지 추가할 수 있어요."
		);
	});

	it("801자면 block_text_too_long 문구", () => {
		expect(jobDescriptionBlocksError([block("a", "가".repeat(801))])).toBe(
			"상세설명 블록은 한 블록당 800자 이하로 입력해 주세요."
		);
	});
});
