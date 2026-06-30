"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button } from "./ds";
import { CheckIcon, ClockIcon, MapPinIcon, Message } from "./icons";

interface DenseJobRowProps {
	active?: boolean;
	job: Job;
	onChat: (job: Job) => void;
	onOpen: (job: Job) => void;
}

export function DenseJobRow({
	active = false,
	job,
	onChat,
	onOpen,
}: DenseJobRowProps) {
	return (
		<article
			className={cn(
				"grid gap-2 rounded-lg border bg-card p-2.5 transition-colors sm:grid-cols-[1fr_auto] sm:items-center",
				active ? "border-coral-400 ring-2 ring-coral-100" : "border-border"
			)}
		>
			<button
				className="flex min-w-0 cursor-pointer items-start gap-2 border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
				{job.coverImage ? (
					<Image
						alt={job.coverImage.altText || job.coverImage.fileName}
						className="size-10 shrink-0 rounded-md border border-border object-cover"
						height={40}
						src={job.coverImage.url}
						unoptimized
						width={40}
					/>
				) : (
					<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-coral-50 font-extrabold text-coral-700 text-xs">
						{job.company.slice(0, 2)}
					</div>
				)}
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 flex-wrap items-center gap-1.5">
						<h3 className="m-0 max-w-full truncate font-extrabold text-[14px]">
							{job.company} {job.title}
						</h3>
						{job.verified ? (
							<Badge tone="success">
								<span className="inline-flex size-3">
									<CheckIcon />
								</span>
								검수
							</Badge>
						) : null}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
						<span className="inline-flex items-center gap-1">
							<span className="inline-flex size-3">
								<MapPinIcon />
							</span>
							{job.location}
						</span>
						<span className="inline-flex items-center gap-1">
							<span className="inline-flex size-3">
								<ClockIcon />
							</span>
							{job.hours}
						</span>
						<strong className="text-foreground">{job.pay}</strong>
					</div>
				</div>
			</button>
			<Button
				className="h-8 justify-center"
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
