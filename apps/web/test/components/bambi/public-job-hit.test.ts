import { describe, expect, it } from "vitest";
import {
	PUBLIC_HIT_DEADLINE_COUNT,
	PUBLIC_JOB_HIT_COUNT,
	PUBLIC_NON_HIT_DEADLINE_COUNT,
	selectPublicJobDecorations,
	selectRandomJobHitIds,
	selectRegionDiverseJobIds,
} from "@/components/bambi/public-job-hit";

describe("public jobs random HIT selection", () => {
	it("selects exactly eight unique jobs without changing the source", () => {
		const ids = Array.from({ length: 24 }, (_, index) => `job-${index + 1}`);
		const original = [...ids];
		const selected = selectRandomJobHitIds(
			ids,
			PUBLIC_JOB_HIT_COUNT,
			() => 0.5
		);

		expect(selected).toHaveLength(8);
		expect(new Set(selected)).toHaveLength(8);
		expect(ids).toEqual(original);
	});

	it("selects every available job when fewer than eight are shown", () => {
		const ids = ["job-1", "job-2", "job-3"];
		expect(
			selectRandomJobHitIds(ids, PUBLIC_JOB_HIT_COUNT, () => 0)
		).toHaveLength(3);
	});

	it("changes the selected set when the random sequence changes", () => {
		const ids = Array.from({ length: 24 }, (_, index) => `job-${index + 1}`);
		const first = selectRandomJobHitIds(ids, PUBLIC_JOB_HIT_COUNT, () => 0);
		const second = selectRandomJobHitIds(ids, PUBLIC_JOB_HIT_COUNT, () => 0.99);
		expect(second).not.toEqual(first);
	});

	it("selects four HIT and two non-HIT deadline badges from eligible jobs", () => {
		const jobs = Array.from({ length: 24 }, (_, index) => ({
			beginnerFriendly: false,
			id: `job-${index + 1}`,
			instantInterview: false,
			regionKey: `region-${(index % 6) + 1}`,
		}));
		const decorations = selectPublicJobDecorations(jobs, () => 0.5);
		const deadlineIds = [...decorations.deadlineIds];

		expect(decorations.hitIds.size).toBe(PUBLIC_JOB_HIT_COUNT);
		expect(deadlineIds.filter((id) => decorations.hitIds.has(id))).toHaveLength(
			PUBLIC_HIT_DEADLINE_COUNT
		);
		expect(
			deadlineIds.filter((id) => !decorations.hitIds.has(id))
		).toHaveLength(PUBLIC_NON_HIT_DEADLINE_COUNT);
	});

	it("never gives a deadline badge to beginner-friendly or instant jobs", () => {
		const jobs = Array.from({ length: 24 }, (_, index) => ({
			beginnerFriendly: index % 3 === 0,
			id: `job-${index + 1}`,
			instantInterview: index % 3 === 1,
			regionKey: `region-${(index % 6) + 1}`,
		}));
		const decorations = selectPublicJobDecorations(jobs, () => 0.25);
		const ineligibleIds = new Set(
			jobs
				.filter((job) => job.beginnerFriendly || job.instantInterview)
				.map((job) => job.id)
		);
		expect(
			[...decorations.deadlineIds].some((id) => ineligibleIds.has(id))
		).toBe(false);
	});

	it("selects unique regions first when enough regions are available", () => {
		const jobs = Array.from({ length: 12 }, (_, index) => ({
			id: `job-${index + 1}`,
			regionKey: `region-${(index % 6) + 1}`,
		}));
		const selected = selectRegionDiverseJobIds(jobs, 4, () => 0.5);
		const regionById = new Map(jobs.map((job) => [job.id, job.regionKey]));
		expect(new Set(selected.map((id) => regionById.get(id))).size).toBe(4);
	});

	it("allows duplicate regions only after every available region is used", () => {
		const jobs = Array.from({ length: 9 }, (_, index) => ({
			id: `job-${index + 1}`,
			regionKey: `region-${(index % 3) + 1}`,
		}));
		const selected = selectRegionDiverseJobIds(jobs, 4, () => 0.25);
		const regionById = new Map(jobs.map((job) => [job.id, job.regionKey]));
		expect(selected).toHaveLength(4);
		expect(new Set(selected.map((id) => regionById.get(id))).size).toBe(3);
	});
});
