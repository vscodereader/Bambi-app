"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button } from "./ds";
import { CheckIcon, MapPinIcon, Message, ShieldIcon } from "./icons";

interface VisualJobCardProps {
	active?: boolean;
	job: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	tone: "organic" | "recommended" | "special" | "urgent";
}

const toneClassName = {
	organic: "border-border bg-card",
	recommended: "border-sky-200 bg-sky-50/50",
	special: "border-coral-200 bg-coral-50/70",
	urgent: "border-amber-200 bg-amber-50/70",
} as const;

const toneLabel = {
	organic: "최신",
	recommended: "추천",
	special: "스페셜",
	urgent: "급구",
} as const;

const toneBadge = {
	organic: "primary",
	recommended: "pending",
	special: "pending",
	urgent: "pending",
} as const;

export function VisualJobCard({
	active = false,
	job,
	onChat,
	onOpen,
	tone,
}: VisualJobCardProps) {
	return (
		<article
			className={cn(
				"flex flex-col gap-2 rounded-lg border bg-card p-2.5 transition-colors",
				toneClassName[tone],
				active && "border-coral-400 ring-2 ring-coral-100"
			)}
		>
			<button
				className="flex cursor-pointer flex-col gap-2 border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
				<div className="flex flex-wrap items-center gap-1">
					<Badge tone={toneBadge[tone]}>
						{job.promotionLabel ?? toneLabel[tone]}
					</Badge>
					{job.verified ? (
						<Badge tone="success">
							<span className="inline-flex size-3">
								<CheckIcon />
							</span>
							검수
						</Badge>
					) : null}
				</div>
				<div className="flex items-start gap-2.5">
					{job.coverImage ? (
						<Image
							alt={job.coverImage.altText || job.coverImage.fileName}
							className="size-14 shrink-0 rounded-md border border-white object-cover"
							height={56}
							src={job.coverImage.url}
							unoptimized
							width={56}
						/>
					) : (
						<div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-white bg-secondary font-extrabold text-coral-700 text-xs">
							{job.company.slice(0, 2)}
						</div>
					)}
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<h3 className="m-0 line-clamp-2 font-extrabold text-sm leading-snug">
							{job.company} {job.title}
						</h3>
						<span className="truncate font-bold text-foreground text-sm">
							{job.pay}
						</span>
						<span className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
							<span className="inline-flex size-3 shrink-0">
								<MapPinIcon />
							</span>
							<span className="truncate">{job.location}</span>
						</span>
						<span className="flex items-center gap-1 text-muted-foreground text-xs">
							<span className="inline-flex size-3 shrink-0">
								<ShieldIcon />
							</span>
							연락처 보호
						</span>
					</div>
				</div>
			</button>
			<Button
				className="mt-auto h-8 justify-center"
				onClick={() => onChat(job)}
				rightIcon={<Message />}
				size="sm"
				variant="secondary"
			>
				채팅
			</Button>
		</article>
	);
}
