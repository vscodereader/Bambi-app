"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button } from "./ds";
import { CheckIcon, MapPinIcon, Message, ShieldIcon } from "./icons";

interface VisualJobCardProps {
	job: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
	tone: "recommended" | "special" | "urgent";
}

const toneClassName = {
	recommended: "border-sky-200 bg-sky-50/50",
	special: "border-coral-200 bg-coral-50/70",
	urgent: "border-amber-200 bg-amber-50/70",
} as const;

const toneLabel = {
	recommended: "추천",
	special: "스페셜",
	urgent: "급구",
} as const;

export function VisualJobCard({
	job,
	onChat,
	onOpen,
	tone,
}: VisualJobCardProps) {
	return (
		<article
			className={cn(
				"grid min-h-[148px] rounded-lg border bg-card p-2.5 transition-colors",
				toneClassName[tone]
			)}
		>
			<button
				className="grid cursor-pointer gap-2 border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
				<div className="flex items-start gap-2">
					{job.coverImage ? (
						<Image
							alt={job.coverImage.altText || job.coverImage.fileName}
							className="size-12 shrink-0 rounded-md border border-white object-cover"
							height={48}
							src={job.coverImage.url}
							unoptimized
							width={48}
						/>
					) : (
						<div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-white bg-card font-extrabold text-coral-700 text-xs">
							{job.company.slice(0, 2)}
						</div>
					)}
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-1">
							<Badge tone="pending">
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
						<h3 className="mt-1 mb-0 line-clamp-2 font-extrabold text-[13px] leading-snug">
							{job.company} {job.title}
						</h3>
					</div>
				</div>
				<div className="grid gap-1 text-xs">
					<span className="truncate font-bold text-foreground">{job.pay}</span>
					<span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
						<span className="inline-flex size-3">
							<MapPinIcon />
						</span>
						<span className="truncate">{job.location}</span>
					</span>
					<span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
						<span className="inline-flex size-3">
							<ShieldIcon />
						</span>
						<span className="truncate">연락처 보호</span>
					</span>
				</div>
			</button>
			<Button
				className="mt-2 h-8 justify-center"
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
