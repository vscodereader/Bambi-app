import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = (fileName: string) =>
	path.join(import.meta.dirname, fileName);

const readComponent = (fileName: string) =>
	fs.readFileSync(componentPath(fileName), "utf8");

describe("visual job marketplace components", () => {
	it("defines a compact visual job card with promotion, safety, and chat affordances", () => {
		const source = readComponent("visual-job-card.tsx");

		expect(source).toContain("export function VisualJobCard");
		expect(source).toContain(
			'tone: "organic" | "recommended" | "special" | "urgent"'
		);
		expect(source).toContain("연락처 보호");
		expect(source).toContain("job.promotionLabel ?? toneLabel[tone]");
		expect(source).toContain("rightIcon={<Message />}");
	});

	it("defines visual exposure sections with special, urgent, recommended, and organic groups", () => {
		const source = readComponent("visual-job-exposure-sections.tsx");

		expect(source).toContain("export function VisualJobExposureSections");
		expect(source).toContain("getVisualJobExposureSections");
		expect(source).toContain("스페셜 채용");
		expect(source).toContain("급구 채용");
		expect(source).toContain("추천 채용");
		expect(source).toContain("전체 공고");
		expect(source).toContain("<VisualJobCard");
	});

	it("wires the seeker marketplace to visual exposure sections", () => {
		const source = readComponent("screens/seeker-marketplace.tsx");

		expect(source).toContain("VisualJobExposureSections");
		expect(source).not.toContain("<JobList");
	});

	it("wires the public marketplace to visual exposure sections", () => {
		const source = readComponent("screens/public-marketplace.tsx");

		expect(source).toContain("VisualJobExposureSections");
		expect(source).not.toContain("<JobList");
	});

	it("defines employer listing preview with cover fallback and preview copy", () => {
		const source = readComponent("employer-listing-preview.tsx");

		expect(source).toContain("export function EmployerListingPreview");
		expect(source).toContain("목록 노출 미리보기");
		expect(source).toContain("대표 이미지 반영");
		expect(source).toContain("coverImageUrl");
		expect(source).toContain("displayCompanyName");
	});

	it("wires employer create and edit pages to listing preview", () => {
		const newSource = readComponent("../../app/employer/new/page.tsx");
		const editSource = readComponent(
			"../../app/employer/jobs/[id]/edit/page.tsx"
		);

		expect(newSource).toContain("EmployerListingPreview");
		expect(newSource).toContain("previewPay");
		expect(newSource).toContain("previewCompanyName");
		expect(editSource).toContain("EmployerListingPreview");
		expect(editSource).toContain("previewPay");
		expect(editSource).toContain("previewCompanyName");
	});
});
