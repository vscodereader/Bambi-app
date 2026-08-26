import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../../src-path";

const detailPageSource = readFileSync(
	srcPath("app/moderator/queue/[id]/page.tsx"),
	"utf8"
);
const moderatorSource = readFileSync(
	srcPath("components/bambi/screens/moderator.tsx"),
	"utf8"
);
const contextSource = readFileSync(
	srcPath("components/bambi/screens/moderator-context.tsx"),
	"utf8"
);
const seekerDetailSource = readFileSync(
	srcPath("components/bambi/screens/seeker-job-detail-responsive.tsx"),
	"utf8"
);
const queueMediaSectionSource = moderatorSource.slice(
	moderatorSource.indexOf("function QueueMediaSection"),
	moderatorSource.indexOf("function QueueContentSection")
);

describe("운영자 공고 실제 내용 미리보기", () => {
	it("관리자 단건 조회의 기본 상세설명과 구조화 블록 상태를 QueueDetail에 전달한다", () => {
		expect(detailPageSource).toContain("jobPostQuery.data.description");
		expect(detailPageSource).toContain("jobPostQuery.data.descriptionBlocks");
		expect(detailPageSource).toContain("isContentError={jobPostQuery.isError}");
		expect(detailPageSource).toContain(
			"isContentLoading={jobPostQuery.isPending}"
		);
	});

	it("기본 접힘 shadcn 아코디언에서 공개 공고와 같은 본문 렌더러를 쓴다", () => {
		expect(moderatorSource).toContain('<AccordionItem value="job-content">');
		expect(moderatorSource).toContain("<AccordionTrigger");
		expect(moderatorSource).toContain("공고 내용");
		expect(moderatorSource).toContain("<AccordionContent");
		expect(moderatorSource).toContain("<JobDescriptionContent");
		// 열린 value/defaultValue를 주지 않아 첫 진입에는 닫혀 있다.
		expect(moderatorSource).not.toContain(
			'<Accordion defaultValue="job-content"'
		);
		expect(seekerDetailSource).toContain("<JobDescriptionContent");
	});

	it("검수용 평문에는 기본 상세설명과 블록 전체를 함께 사용한다", () => {
		expect(contextSource).toContain("toFullJobDescription");
		expect(contextSource).toContain("description: item.description");
		expect(contextSource).toContain(
			"descriptionBlocks: item.descriptionBlocks"
		);
	});

	it("실제 감지 문구가 있을 때만 평문 강조 영역을 표시한다", () => {
		expect(moderatorSource).toContain("item.detected.length > 0");
		expect(moderatorSource).not.toContain("{item.desc.trim().length > 0 ? (");
	});
});

describe("운영자 상세 이미지 실제 크기 미리보기", () => {
	it("기존 공고 이미지 한 줄 그리드 배치를 유지한다", () => {
		expect(queueMediaSectionSource).toContain("const items = [");
		expect(queueMediaSectionSource).toContain("공고 이미지 {items.length}장");
		expect(queueMediaSectionSource).toContain(
			"grid grid-cols-2 gap-2.5 lg:grid-cols-3"
		);
		expect(queueMediaSectionSource).not.toContain(
			"상세 이미지 {detail.length}장"
		);
	});

	it("고정 높이 축소 대신 공개 공고와 같은 상세 이미지 컴포넌트를 쓴다", () => {
		expect(moderatorSource).toContain("<JobDetailImage");
		expect(seekerDetailSource).toContain("<JobDetailImage");
		expect(moderatorSource).not.toContain(
			'className="relative h-[70vh] w-full"'
		);
		expect(moderatorSource).not.toContain(
			'className="rounded-xl object-contain"'
		);
	});
});
