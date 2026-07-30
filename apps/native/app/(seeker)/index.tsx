import { useQuery } from "@tanstack/react-query";
import { type Href, Link } from "expo-router";
import { Button, Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	CardLink,
	ErrorState,
	formatPay,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { orpc } from "@/src/lib/orpc";

interface JobItem {
	employerDisplayName: null | string;
	id: string;
	industryCategory: string;
	payAmount: null | number;
	payUnit: string;
	region: string;
	title: string;
	workSchedule: null | string;
}

function JobCard({ job, label }: { job: JobItem; label?: string }) {
	return (
		<CardLink
			href={
				{
					pathname: "/(seeker)/jobs/[id]",
					params: { id: job.id },
				} as unknown as Href
			}
		>
			<View className="gap-2">
				<View className="flex-row flex-wrap gap-2">
					{label ? <Pill tone="success">{label}</Pill> : null}
					<Pill>{job.region}</Pill>
					<Pill>{job.industryCategory}</Pill>
				</View>
				<Text className="font-bold text-foreground text-lg" selectable>
					{job.title}
				</Text>
				<Text className="text-muted text-sm" selectable>
					{job.employerDisplayName ?? "밤비알바 구인자"} ·{" "}
					{job.workSchedule ?? "일정 협의"}
				</Text>
				<Text className="font-semibold text-foreground" selectable>
					{formatPay(job.payAmount, job.payUnit)}
				</Text>
			</View>
		</CardLink>
	);
}

export default function SeekerHomeScreen() {
	const jobsQuery = useQuery(
		orpc.bambi.jobs.list.queryOptions({ input: { limit: 20 } })
	);
	const sections = jobsQuery.data?.sections;

	if (jobsQuery.isLoading) {
		return <LoadingState label="공고를 불러오고 있습니다." />;
	}

	if (jobsQuery.isError) {
		return <ErrorState onRetry={() => jobsQuery.refetch()} />;
	}

	return (
		<BambiScreen>
			<BambiHeader
				action={
					<Link asChild href={"/(seeker)/chats" as Href}>
						<Button size="sm" variant="secondary">
							<Button.Label>채팅</Button.Label>
						</Button>
					</Link>
				}
				description="스페셜, 추천, 일반 공고를 모바일에서 빠르게 확인합니다."
				title="공고 탐색"
			/>
			{sections ? (
				<View className="gap-5">
					{sections.special.length > 0 ? (
						<View className="gap-3">
							<Text className="font-semibold text-foreground" selectable>
								스페셜
							</Text>
							{sections.special.map((job) => (
								<JobCard job={job} key={job.id} label="스페셜" />
							))}
						</View>
					) : null}
					{sections.recommended.length > 0 ? (
						<View className="gap-3">
							<Text className="font-semibold text-foreground" selectable>
								추천
							</Text>
							{sections.recommended.map((job) => (
								<JobCard job={job} key={job.id} label="추천" />
							))}
						</View>
					) : null}
					<View className="gap-3">
						<Text className="font-semibold text-foreground" selectable>
							일반
						</Text>
						{sections.organic.map((job) => (
							<JobCard job={job} key={job.id} />
						))}
					</View>
				</View>
			) : (
				<StateCard
					description="조건에 맞는 공개 공고가 아직 없습니다."
					title="공고가 없습니다"
				/>
			)}
			<Surface className="rounded-lg p-4" variant="secondary">
				<Text className="text-muted text-sm leading-5" selectable>
					연락처는 면접 일정이 확정된 뒤 본인이 선택할 때만 공개됩니다.
				</Text>
			</Surface>
		</BambiScreen>
	);
}
