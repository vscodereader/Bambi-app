"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { HIT_RIBBON_CLASS_BY_TONE } from "@/lib/bambi/job-hit";
import { HitRibbon } from "./hit-ribbon";

export const PUBLIC_JOB_HIT_COUNT = 8;
export const PUBLIC_HIT_DEADLINE_COUNT = 4;
export const PUBLIC_NON_HIT_DEADLINE_COUNT = 2;

interface PublicJobHitCandidate {
	beginnerFriendly: boolean;
	id: string;
	instantInterview: boolean;
	regionKey: string;
}

interface PublicJobDecorations {
	deadlineIds: ReadonlySet<string>;
	hitIds: ReadonlySet<string>;
}

const EMPTY_PUBLIC_JOB_DECORATIONS: PublicJobDecorations = {
	deadlineIds: new Set(),
	hitIds: new Set(),
};

const PublicJobHitContext = createContext<PublicJobDecorations>(
	EMPTY_PUBLIC_JOB_DECORATIONS
);

export const selectRandomJobHitIds = (
	jobIds: readonly string[],
	count = PUBLIC_JOB_HIT_COUNT,
	random: () => number = Math.random
): string[] => {
	const shuffled = [...new Set(jobIds)];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[shuffled[index], shuffled[swapIndex]] = [
			shuffled[swapIndex] as string,
			shuffled[index] as string,
		];
	}
	return shuffled.slice(0, Math.min(count, shuffled.length));
};

export const selectPublicJobDecorations = (
	jobs: readonly PublicJobHitCandidate[],
	random: () => number = Math.random
): PublicJobDecorations => {
	const hitIds = new Set(
		selectRandomJobHitIds(
			jobs.map((job) => job.id),
			PUBLIC_JOB_HIT_COUNT,
			random
		)
	);
	const deadlineCandidates = jobs.filter(
		(job) => !(job.beginnerFriendly || job.instantInterview)
	);
	const hitDeadlineIds = selectRegionDiverseJobIds(
		deadlineCandidates.filter((job) => hitIds.has(job.id)),
		PUBLIC_HIT_DEADLINE_COUNT,
		random
	);
	const nonHitDeadlineIds = selectRegionDiverseJobIds(
		deadlineCandidates.filter((job) => !hitIds.has(job.id)),
		PUBLIC_NON_HIT_DEADLINE_COUNT,
		random
	);

	return {
		deadlineIds: new Set([...hitDeadlineIds, ...nonHitDeadlineIds]),
		hitIds,
	};
};

export const selectRegionDiverseJobIds = (
	jobs: readonly Pick<PublicJobHitCandidate, "id" | "regionKey">[],
	count: number,
	random: () => number = Math.random
): string[] => {
	const jobsByRegion = new Map<string, string[]>();
	for (const job of jobs) {
		const regionJobs = jobsByRegion.get(job.regionKey) ?? [];
		regionJobs.push(job.id);
		jobsByRegion.set(job.regionKey, regionJobs);
	}
	const regionKeys = selectRandomJobHitIds(
		[...jobsByRegion.keys()],
		jobsByRegion.size,
		random
	);
	const selected = regionKeys
		.slice(0, count)
		.flatMap((regionKey) =>
			selectRandomJobHitIds(jobsByRegion.get(regionKey) ?? [], 1, random)
		);
	if (selected.length >= count) {
		return selected;
	}
	const selectedSet = new Set(selected);
	const remaining = jobs
		.map((job) => job.id)
		.filter((id) => !selectedSet.has(id));
	return [
		...selected,
		...selectRandomJobHitIds(remaining, count - selected.length, random),
	];
};

export function PublicJobHitProvider({
	children,
	jobs,
}: {
	children: ReactNode;
	jobs: readonly PublicJobHitCandidate[];
}) {
	const [decorations, setDecorations] = useState<PublicJobDecorations>(
		EMPTY_PUBLIC_JOB_DECORATIONS
	);

	useEffect(() => {
		setDecorations(selectPublicJobDecorations(jobs));
	}, [jobs]);

	return (
		<PublicJobHitContext value={decorations}>{children}</PublicJobHitContext>
	);
}

export function PublicJobHitRibbon({ jobId }: { jobId: string }) {
	const { hitIds } = useContext(PublicJobHitContext);
	return hitIds.has(jobId) ? (
		<HitRibbon className={HIT_RIBBON_CLASS_BY_TONE.special} />
	) : null;
}

export function PublicJobHitStatusBadges({
	beginnerFriendly,
	instantInterview,
	jobId,
}: {
	beginnerFriendly: boolean;
	instantInterview: boolean;
	jobId: string;
}) {
	const { deadlineIds } = useContext(PublicJobHitContext);

	if (beginnerFriendly || instantInterview) {
		return (
			<div className="ml-auto flex shrink-0 items-center gap-1">
				{instantInterview ? <Badge variant="outline">당일면접</Badge> : null}
				{beginnerFriendly ? <Badge variant="outline">초보 가능</Badge> : null}
			</div>
		);
	}

	return deadlineIds.has(jobId) ? (
		<Badge
			className="ml-auto animate-pulse border-destructive/40 bg-destructive/10 text-destructive motion-reduce:animate-none"
			variant="outline"
		>
			마감임박
		</Badge>
	) : null;
}
