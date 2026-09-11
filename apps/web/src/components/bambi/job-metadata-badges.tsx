import { Badge } from "@bambi-app/ui/components/badge";
import { cn } from "@bambi-app/ui/lib/utils";

import {
	buildJobMetadataItems,
	type JobMetadataInput,
	type JobMetadataItem,
} from "@/lib/bambi/job-metadata";

const METADATA_BADGE_CLASS: Record<JobMetadataItem["kind"], string> = {
	district: "bg-sky-50 text-sky-700",
	industry: "bg-primary/10 text-primary",
	region: "bg-green-50 text-green-600",
};

interface JobMetadataBadgesProps extends JobMetadataInput {
	className?: string;
}

export function JobMetadataBadges({
	className,
	district,
	industryCategory,
	industryRaw,
	region,
}: JobMetadataBadgesProps) {
	const items = buildJobMetadataItems({
		district,
		industryCategory,
		industryRaw,
		region,
	});
	if (items.length === 0) {
		return null;
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-1", className)}>
			{items.map((item) => (
				<Badge
					className={METADATA_BADGE_CLASS[item.kind]}
					key={`${item.kind}:${item.label}`}
					variant="secondary"
				>
					{item.label}
				</Badge>
			))}
		</div>
	);
}
