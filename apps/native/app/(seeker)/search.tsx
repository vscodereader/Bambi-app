import { env } from "@bambi-app/env/native";
import { Ionicons } from "@expo/vector-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type Href, Link, router } from "expo-router";
import { Button, SearchField, Skeleton, useThemeColor } from "heroui-native";
import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatPay, StateCard } from "@/src/components/bambi-screen";
import {
	describeJobForScreenReader,
	type NativeSeekerJob,
	resolveJobCoverUri,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

// 웹 job-search-command.tsx와 동일 문구.
const SEARCH_PLACEHOLDER = "업종, 지역, 공고 제목 검색";
const SKELETON_KEYS = ["s1", "s2", "s3"] as const;

// 공개 버킷 base URL. 순수 공고 커버는 storageKey만 내려오므로 이 값과 합쳐 URL을 만든다.
const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

// 웹 useDebouncedValue 이식 — 타이핑 사이 250ms 쉴 때만 검색어를 확정한다.
function useDebouncedValue(value: string, delayMs = 250): string {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

// 커버 없는 공고는 탐색 카드와 같은 업소명 두 글자 타일(size-14)로 폴백한다.
function JobCoverTile({ name }: { name: string }) {
	return (
		<View className="size-14 shrink-0 items-center justify-center rounded-md bg-accent/10">
			<Text className="font-bold text-accent-soft-foreground text-sm dark:text-accent">
				{Array.from(name).slice(0, 2).join("")}
			</Text>
		</View>
	);
}

// 결과 행 본문. 업소명이 메타 줄에 텍스트로 있어 커버는 장식 이미지다(부모 행이 접근성 트리에서 가린다).
function SearchRowBody({ job }: { job: NativeSeekerJob }) {
	const employerName = job.employerDisplayName ?? "밤비알바 구인자";
	const coverUri = resolveJobCoverUri(job, GCS_PUBLIC_BASE_URL);

	return (
		<View className="flex-row items-center gap-3">
			{coverUri ? (
				<Image
					className="h-14 w-30 shrink-0 rounded-md border border-border"
					resizeMode="stretch"
					source={{ uri: coverUri }}
				/>
			) : (
				<JobCoverTile name={employerName} />
			)}
			<View className="min-w-0 flex-1 gap-0.5">
				<Text className="font-bold text-foreground text-sm" numberOfLines={1}>
					{job.title}
				</Text>
				<Text className="text-muted text-xs" numberOfLines={1}>
					{job.industryCategory} · {job.region}
				</Text>
				<Text
					className="font-extrabold text-foreground text-sm"
					numberOfLines={1}
				>
					{formatPay(job.payAmount, job.payUnit)}
				</Text>
			</View>
		</View>
	);
}

function SearchRow({ job }: { job: NativeSeekerJob }) {
	// 수집 공고는 job_post에 없어 jobs.getById가 NOT_FOUND다 — 웹처럼 crawledJobs.getById를
	// 쓰는 수집 전용 상세(jobs/crawled/[id])로 보낸다. 순수 공고는 jobs/[id] 그대로.
	const href = (job.source === "crawled"
		? { pathname: "/(seeker)/jobs/crawled/[id]", params: { id: job.id } }
		: {
				pathname: "/(seeker)/jobs/[id]",
				params: { id: job.id },
			}) as unknown as Href;

	return (
		<Link asChild href={href}>
			<Pressable
				accessibilityLabel={describeJobForScreenReader(job)}
				accessibilityRole="button"
				accessible
				className="px-4 py-3 active:opacity-75"
			>
				<View importantForAccessibility="no-hide-descendants">
					<SearchRowBody job={job} />
				</View>
			</Pressable>
		</Link>
	);
}

function SearchRowSkeleton() {
	return (
		<View className="flex-row items-center gap-3 px-4 py-3">
			<Skeleton className="h-14 w-30 rounded-md" />
			<View className="flex-1 gap-2">
				<Skeleton className="h-4 w-3/4 rounded-md" />
				<Skeleton className="h-3 w-1/2 rounded-md" />
				<Skeleton className="h-4 w-24 rounded-md" />
			</View>
		</View>
	);
}

function CenteredMessage({ text }: { text: string }) {
	return (
		<View className="px-4 py-10">
			<Text className="text-center text-muted text-sm">{text}</Text>
		</View>
	);
}

// 웹 JobSearchResults의 상태 4종을 1:1로 옮긴다.
function SearchResults({
	isError,
	isFetching,
	jobs,
	onRetry,
	query,
}: {
	isError: boolean;
	isFetching: boolean;
	jobs: NativeSeekerJob[];
	onRetry: () => void;
	query: string;
}) {
	if (query.trim() === "") {
		return <CenteredMessage text="검색어를 입력해 주세요" />;
	}

	if (isError) {
		return (
			<View className="px-4 py-6">
				<StateCard
					action={
						<Button onPress={onRetry} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인한 뒤 다시 시도해 주세요."
					title="검색에 실패했어요"
				/>
			</View>
		);
	}

	// 이전 결과가 남아 있으면(keepPreviousData) 그대로 두고, 첫 검색일 때만 자리표시를 그린다.
	if (isFetching && jobs.length === 0) {
		return (
			<View accessibilityLabel="검색 중" accessible>
				{SKELETON_KEYS.map((key) => (
					<SearchRowSkeleton key={key} />
				))}
			</View>
		);
	}

	if (jobs.length === 0) {
		return <CenteredMessage text="검색 결과가 없어요" />;
	}

	return (
		<FlatList
			data={jobs}
			keyboardDismissMode="on-drag"
			keyboardShouldPersistTaps="handled"
			keyExtractor={(job) => job.id}
			renderItem={({ item }) => <SearchRow job={item} />}
		/>
	);
}

export default function SeekerSearchScreen() {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebouncedValue(query);
	const trimmed = debouncedQuery.trim();

	const searchQuery = useQuery({
		...orpc.bambi.jobs.search.queryOptions({ input: { query: trimmed } }),
		enabled: trimmed.length > 0,
		placeholderData: keepPreviousData,
	});

	// 검색 items는 목록 피드와 같은 selection이라 구조적으로 NativeSeekerJob이다(웹 toMarketplaceJob 불필요).
	const jobs: NativeSeekerJob[] =
		trimmed.length > 0 ? (searchQuery.data?.items ?? []) : [];

	return (
		<View className="flex-1 bg-background">
			<View
				className="border-border border-b bg-background"
				style={{ paddingTop: insets.top }}
			>
				<View className="h-14 flex-row items-center gap-2 px-4">
					<Pressable
						accessibilityLabel="뒤로 가기"
						accessibilityRole="button"
						className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface"
						hitSlop={8}
						onPress={() => router.back()}
					>
						<Ionicons color={foreground} name="arrow-back" size={22} />
					</Pressable>
					<View className="flex-1">
						<SearchField onChange={setQuery} value={query}>
							<SearchField.Group>
								<SearchField.SearchIcon />
								<SearchField.Input
									autoFocus
									placeholder={SEARCH_PLACEHOLDER}
									returnKeyType="search"
								/>
								<SearchField.ClearButton />
							</SearchField.Group>
						</SearchField>
					</View>
				</View>
			</View>
			<SearchResults
				isError={searchQuery.isError}
				// 디바운스 대기 중에도 로딩으로 취급해 "결과 없음"이 잠깐 스치지 않게 한다.
				isFetching={searchQuery.isFetching || debouncedQuery !== query}
				jobs={jobs}
				onRetry={() => {
					searchQuery.refetch().catch(() => undefined);
				}}
				query={query}
			/>
		</View>
	);
}
