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
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useJobSearch } from "@/lib/bambi/api-jobs";
import {
	JOB_LISTS,
	trackJobListView,
	trackJobSelect,
} from "@/lib/bambi/ga-job";
import type { Job } from "@/lib/bambi/types";
import { JobCoverImage } from "./job-cover-image";

const SEARCH_PLACEHOLDER = "업종, 지역, 공고 제목 검색";

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
							className="h-14 w-30 shrink-0 rounded-md object-cover"
							height={56}
							media={job.coverImage}
							width={56}
						/>
					) : null}
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-bold text-sm">{job.title}</span>
						<span className="truncate text-muted-foreground text-xs">
							{job.type} · {job.location}
						</span>
						<span className="truncate font-extrabold text-sm">{job.pay}</span>
					</div>
				</CommandItem>
			))}
		</CommandGroup>
	);
}

interface JobSearchCommandProps {
	onSelectJob: (job: Job) => void;
	withHotkey?: boolean;
}

export function JobSearchCommand({
	onSelectJob,
	withHotkey = false,
}: JobSearchCommandProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebouncedValue(query);
	const lastTrackedResultsRef = useRef("");
	const { isError, isFetching, jobs, refetch } = useJobSearch(
		open ? debouncedQuery : ""
	);

	useEffect(() => {
		if (!(open && debouncedQuery.trim() && debouncedQuery === query)) {
			return;
		}
		if (isFetching || jobs.length === 0) {
			return;
		}
		const signature = `${debouncedQuery}:${jobs.map((job) => job.id).join(",")}`;
		if (lastTrackedResultsRef.current === signature) {
			return;
		}
		lastTrackedResultsRef.current = signature;
		trackJobListView(jobs, {
			listId: JOB_LISTS.search.id,
			listName: JOB_LISTS.search.name,
			tone: "search",
		});
	}, [debouncedQuery, isFetching, jobs, open, query]);

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
			{/* 트리거는 헤더(데스크톱·모바일)의 돋보기 아이콘 버튼 하나뿐이다 —
			    우측 액션 버튼들(h-10 outline)과 같은 룩으로 맞춘다. */}
			<Button
				aria-label={SEARCH_PLACEHOLDER}
				onClick={() => setOpen(true)}
				size="icon-lg"
				variant="outline"
			>
				<SearchIcon />
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
							trackJobSelect(job, {
								index: jobs.findIndex((item) => item.id === job.id),
								listId: JOB_LISTS.search.id,
								listName: JOB_LISTS.search.name,
								tone: "search",
							});
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
