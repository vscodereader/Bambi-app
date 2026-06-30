"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMarketplaceJobs } from "@/lib/bambi/api-jobs";
import {
	DEFAULT_MARKETPLACE_FILTERS,
	type MarketplaceFilters,
} from "@/lib/bambi/marketplace";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button } from "../ds";
import { ShieldIcon } from "../icons";
import {
	MarketplaceFilterSidebar,
	MarketplaceSearch,
	SelectedJobPanel,
} from "../marketplace";
import { ResponsiveAppShell } from "../responsive-shell";
import { VisualJobExposureSections } from "../visual-job-exposure-sections";

export function PublicMarketplaceScreen() {
	const router = useRouter();
	const [filters, setFilters] = useState<MarketplaceFilters>(
		DEFAULT_MARKETPLACE_FILTERS
	);
	const { isApiBacked, isError, jobs, refetch, sections } =
		useMarketplaceJobs(filters);
	const selectedJob = jobs[0];
	const openJob = (job: Job) => router.push(`/seeker/jobs/${job.id}` as Route);
	const startChat = (job: Job) =>
		router.push(`/seeker/jobs/${job.id}/chat?entry=public` as Route);
	return (
		<ResponsiveAppShell variant="public">
			<div className="mx-auto flex w-full max-w-[min(92dvw,1600px)] gap-5 px-4 py-6 pb-16 md:px-6 md:py-10">
				<MarketplaceFilterSidebar filters={filters} onChange={setFilters} />
				<section className="min-w-0 flex-1">
					<div className="mb-6 rounded-lg bg-background p-5 shadow-sm ring-1 ring-border md:p-8">
						<Badge tone="success">
							<span className="inline-flex size-3.5">
								<ShieldIcon />
							</span>
							면접 전 연락처 비공개
						</Badge>
						<h1 className="mt-4 mb-3 font-extrabold text-[30px] leading-tight md:text-[42px]">
							안전하게 비교하고,
							<br />
							밤비 안에서 먼저 대화해요
						</h1>
						<p className="m-0 max-w-[620px] text-muted-foreground leading-relaxed">
							지역, 업종, 급여로 빠르게 찾고 검수된 공고를 먼저 확인하세요. 채팅
							시작 전 필요한 인증과 보호 안내를 함께 제공합니다.
						</p>
						<div className="mt-5 flex flex-col gap-3 sm:flex-row">
							<Button onClick={() => router.push("/seeker")}>
								공고 둘러보기
							</Button>
							<Button
								onClick={() => router.push("/employer")}
								variant="secondary"
							>
								업체로 시작하기
							</Button>
						</div>
					</div>
					<div className="mb-4">
						<MarketplaceSearch filters={filters} onChange={setFilters} />
					</div>
					{isError ? (
						<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
							서버 공고를 불러오지 못해 샘플 공고를 먼저 보여드려요.
							<button
								className="ml-2 cursor-pointer border-none bg-transparent p-0 font-extrabold text-amber-900 underline"
								onClick={refetch}
								type="button"
							>
								다시 연결
							</button>
						</div>
					) : null}
					<div className="mb-3 flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-lg">
							지금 확인할 수 있는 공고
						</h2>
						<span className="font-semibold text-muted-foreground text-sm">
							{jobs.length}개{isApiBacked ? " · 실시간" : ""}
						</span>
					</div>
					<VisualJobExposureSections
						jobs={jobs}
						onChat={startChat}
						onOpen={openJob}
						sections={sections}
					/>
				</section>
				<SelectedJobPanel
					job={selectedJob}
					onChat={startChat}
					onOpen={openJob}
				/>
			</div>
		</ResponsiveAppShell>
	);
}
