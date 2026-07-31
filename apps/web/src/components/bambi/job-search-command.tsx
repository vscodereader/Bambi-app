"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	CommandDialog,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@bambi-app/ui/components/command";
import { DialogClose } from "@bambi-app/ui/components/dialog";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useJobSearch } from "@/lib/bambi/api-jobs";
import type { Job } from "@/lib/bambi/types";
import { JobCoverImage } from "./job-cover-image";

const SEARCH_PLACEHOLDER = "업종, 지역, 공고 제목 검색";

// 트리거는 헤더(좁은 고정폭)와 본문 검색 필드(전체폭) 두 자리에서 같은 모달을 연다.
const TRIGGER_CLASS = {
	field: "h-14 w-full gap-3 px-4 text-base",
	header: "h-10 w-48 gap-2 px-3 text-sm",
} as const;

const TRIGGER_LABEL = {
	field: SEARCH_PLACEHOLDER,
	header: "검색",
} as const;

const MESSAGE_CLASS = "py-6 text-center text-muted-foreground text-sm";

const SKELETON_KEYS = ["row-1", "row-2", "row-3"] as const;

function useDebouncedValue(value: string, delayMs = 250): string {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

function JobSearchResults({
	isError,
	isFetching,
	jobs,
	onSelect,
	query,
	refetch,
}: {
	isError: boolean;
	isFetching: boolean;
	jobs: Job[];
	onSelect: (job: Job) => void;
	query: string;
	refetch: () => void;
}) {
	if (query.trim() === "") {
		return <p className={MESSAGE_CLASS}>검색어를 입력해 주세요</p>;
	}
	if (isError) {
		return (
			<div className={MESSAGE_CLASS}>
				검색에 실패했어요
				<Button
					className="ml-1 h-auto p-0 align-baseline text-sm"
					onClick={refetch}
					variant="link"
				>
					다시 시도
				</Button>
			</div>
		);
	}
	// 이전 결과가 남아 있으면(keepPreviousData) 그대로 두고, 처음 검색일 때만 자리표시를 그린다.
	if (isFetching && jobs.length === 0) {
		return (
			<div className="flex flex-col gap-2 p-4">
				{SKELETON_KEYS.map((key) => (
					<Skeleton className="h-12 w-full rounded-md" key={key} />
				))}
			</div>
		);
	}
	if (jobs.length === 0) {
		return <p className={MESSAGE_CLASS}>검색 결과가 없어요</p>;
	}
	return (
		<CommandGroup heading="검색 결과">
			{jobs.map((job) => (
				<CommandItem
					className="gap-3 px-4 py-3"
					key={job.id}
					onSelect={() => onSelect(job)}
					value={job.id}
				>
					{job.coverImage ? (
						<JobCoverImage
							className="h-12 w-16 shrink-0 rounded-md object-cover"
							height={48}
							media={job.coverImage}
							width={64}
						/>
					) : null}
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-bold text-sm">{job.title}</span>
						<span className="truncate text-muted-foreground text-xs">
							{job.type} · {job.location}
						</span>
					</div>
					<span className="shrink-0 font-extrabold text-sm">{job.pay}</span>
				</CommandItem>
			))}
		</CommandGroup>
	);
}

interface JobSearchCommandProps {
	onSelectJob: (job: Job) => void;
	trigger: "field" | "header";
	triggerClassName?: string;
	withHotkey?: boolean;
}

export function JobSearchCommand({
	onSelectJob,
	trigger,
	triggerClassName,
	withHotkey = false,
}: JobSearchCommandProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebouncedValue(query);
	const { isError, isFetching, jobs, refetch } = useJobSearch(
		open ? debouncedQuery : ""
	);

	useEffect(() => {
		if (!withHotkey) {
			return;
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((prev) => !prev);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [withHotkey]);

	return (
		<>
			<Button
				aria-label={SEARCH_PLACEHOLDER}
				className={cn(
					"justify-start font-medium text-muted-foreground",
					TRIGGER_CLASS[trigger],
					triggerClassName
				)}
				onClick={() => setOpen(true)}
				variant="secondary"
			>
				<SearchIcon />
				{TRIGGER_LABEL[trigger]}
			</Button>
			<CommandDialog
				className="w-xl"
				// 서버가 이미 검색어로 거른 결과라 cmdk 자동 필터를 끈다(한글 부분 매칭에서 결과가 사라진다).
				commandProps={{ shouldFilter: false }}
				description="업종, 지역, 공고 제목으로 검색하세요."
				onOpenChange={setOpen}
				open={open}
				title="공고 검색"
			>
				<div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
					<div className="flex flex-col gap-1">
						<span className="font-extrabold text-lg">공고 검색</span>
						<span className="text-muted-foreground text-sm">
							업종, 지역, 공고 제목으로 검색하세요.
						</span>
					</div>
					<DialogClose
						render={
							<Button aria-label="닫기" size="icon" variant="ghost">
								<XIcon />
							</Button>
						}
					/>
				</div>
				<CommandInput
					onValueChange={setQuery}
					placeholder={SEARCH_PLACEHOLDER}
					value={query}
				/>
				<CommandList className="max-h-96">
					<JobSearchResults
						isError={isError}
						// 디바운스 대기 중에도 로딩으로 취급해야 "결과 없음"이 잠깐 스치지 않는다.
						isFetching={isFetching || debouncedQuery !== query}
						jobs={jobs}
						onSelect={(job) => {
							setOpen(false);
							onSelectJob(job);
						}}
						query={query}
						refetch={refetch}
					/>
				</CommandList>
			</CommandDialog>
		</>
	);
}
