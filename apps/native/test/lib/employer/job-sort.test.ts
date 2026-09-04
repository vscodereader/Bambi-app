import { describe, expect, it } from "vitest";

import {
	EMPLOYER_JOB_SORT_OPTIONS,
	type SortableEmployerJob,
	sortEmployerJobs,
} from "@/src/lib/employer/job-sort";

const job = (
	overrides: Partial<SortableEmployerJob> & { title: string }
): SortableEmployerJob => ({
	payAmount: 0,
	paymentStatus: "paid",
	status: "published",
	updatedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const titles = (jobs: readonly SortableEmployerJob[]) =>
	jobs.map((each) => each.title);

describe("sortEmployerJobs", () => {
	it("recent는 updatedAt 내림차순", () => {
		const jobs = [
			job({ title: "가운데", updatedAt: "2026-02-01T00:00:00.000Z" }),
			job({ title: "최신", updatedAt: "2026-03-01T00:00:00.000Z" }),
			job({ title: "오래된", updatedAt: "2026-01-01T00:00:00.000Z" }),
		];

		expect(titles(sortEmployerJobs(jobs, "recent"))).toEqual([
			"최신",
			"가운데",
			"오래된",
		]);
	});

	it("title은 한국어 사전순", () => {
		const jobs = [job({ title: "다방" }), job({ title: "가게" })];

		expect(titles(sortEmployerJobs(jobs, "title"))).toEqual(["가게", "다방"]);
	});

	it("pay는 급여 내림차순이고 null은 0으로 본다", () => {
		const jobs = [
			job({ payAmount: null, title: "무급" }),
			job({ payAmount: 12_000, title: "고액" }),
			job({ payAmount: 10_000, title: "보통" }),
		];

		expect(titles(sortEmployerJobs(jobs, "pay"))).toEqual([
			"고액",
			"보통",
			"무급",
		]);
	});

	it("status는 표시 상태 라벨 사전순(미공개 < 공개)", () => {
		const jobs = [
			job({ title: "공개", paymentStatus: "paid" }),
			job({ title: "미공개", paymentStatus: "unpaid" }),
		];

		expect(titles(sortEmployerJobs(jobs, "status"))).toEqual([
			"공개",
			"미공개",
		]);
	});

	it("입력 배열을 변형하지 않는다", () => {
		const jobs = [job({ title: "나" }), job({ title: "가" })];

		sortEmployerJobs(jobs, "title");

		expect(titles(jobs)).toEqual(["나", "가"]);
	});

	it("정렬 옵션은 web과 같은 순서·라벨", () => {
		expect(EMPLOYER_JOB_SORT_OPTIONS.map((option) => option.value)).toEqual([
			"recent",
			"title",
			"pay",
			"status",
		]);
	});
});
