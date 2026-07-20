import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
	path.join(import.meta.dirname, "page.tsx"),
	"utf8"
);

describe("moderator FAQ list", () => {
	it("collapses each FAQ behind an accordion trigger", () => {
		// 답변이 리치 텍스트가 되면서 카드가 길어져 목록을 훑기 어려웠다.
		// 공개 고객센터 목록(support/faq-list)과 같은 아코디언으로 접는다.
		expect(source).toContain("<Accordion");
		expect(source).toContain("<AccordionTrigger");
		expect(source).toContain("{item.question}");
	});

	it("keeps the publish and delete controls out of the trigger", () => {
		// 트리거는 button이라 그 안에 Switch·삭제 버튼을 넣으면 버튼이 중첩돼
		// 마크업이 무효가 되고 키보드 조작도 깨진다. 조작은 펼친 내용 쪽에 둔다.
		const triggerIndex = source.indexOf("<AccordionTrigger");
		const contentIndex = source.indexOf("<AccordionContent");
		const switchIndex = source.indexOf("<Switch");

		expect(triggerIndex).toBeGreaterThan(-1);
		expect(contentIndex).toBeGreaterThan(triggerIndex);
		expect(switchIndex).toBeGreaterThan(contentIndex);
	});
});
