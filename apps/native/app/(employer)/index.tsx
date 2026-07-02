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
import {
	jobStatusLabels,
	verificationStatusLabels,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const getJobStatusLabel = (status: string): string =>
	jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status;

const getVerificationLabel = (status: string): string =>
	verificationStatusLabels[status as keyof typeof verificationStatusLabels] ??
	status;

export default function EmployerHomeScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const jobsQuery = useQuery(orpc.bambi.jobs.listMine.queryOptions());

	if (mineQuery.isLoading || jobsQuery.isLoading) {
		return <LoadingState label="구인자 정보를 불러오고 있습니다." />;
	}

	if (mineQuery.isError || jobsQuery.isError) {
		return (
			<ErrorState
				onRetry={() => {
					mineQuery.refetch();
					jobsQuery.refetch();
				}}
			/>
		);
	}

	const profile = mineQuery.data?.bambiProfile;
	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const jobs = jobsQuery.data ?? [];

	if (!profile || profile.role === "job_seeker") {
		return (
			<BambiScreen>
				<StateCard
					description="구인자 프로필을 만든 뒤 공고를 등록하고 관리할 수 있습니다."
					title="구인자 권한이 필요합니다"
				/>
			</BambiScreen>
		);
	}

	return (
		<BambiScreen>
			<BambiHeader
				action={
					<Link asChild href={"/(employer)/new" as Href}>
						<Button size="sm">
							<Button.Label>새 공고</Button.Label>
						</Button>
					</Link>
				}
				description="내 조직의 공고 상태와 등록 범위를 확인합니다."
				title="구인자 관리"
			/>
			{organizationProfile ? (
				<Surface className="gap-2 rounded-lg p-4" variant="secondary">
					<Text className="font-semibold text-foreground" selectable>
						{organizationProfile.displayName}
					</Text>
					<Pill tone="success">
						{getVerificationLabel(organizationProfile.verificationStatus)}
					</Pill>
				</Surface>
			) : null}
			{jobs.length === 0 ? (
				<StateCard
					action={
						<Link asChild href={"/(employer)/new" as Href}>
							<Button>
								<Button.Label>새 공고 등록</Button.Label>
							</Button>
						</Link>
					}
					description="등록 가능한 조직 또는 팀 범위가 있으면 모바일에서도 공고를 만들 수 있습니다."
					title="등록한 공고가 없습니다"
				/>
			) : (
				<View className="gap-3">
					{jobs.map((job) => (
						<CardLink
							href={
								{
									pathname: "/(employer)/jobs/[id]/edit",
									params: { id: job.id },
								} as unknown as Href
							}
							key={job.id}
						>
							<View className="gap-2">
								<View className="flex-row flex-wrap gap-2">
									<Pill>{getJobStatusLabel(job.status)}</Pill>
									<Pill>{job.region}</Pill>
								</View>
								<Text className="font-bold text-foreground text-lg" selectable>
									{job.title}
								</Text>
								<Text className="text-muted text-sm" selectable>
									{job.industryCategory} ·{" "}
									{formatPay(job.payAmount, job.payUnit)}
								</Text>
							</View>
						</CardLink>
					))}
				</View>
			)}
		</BambiScreen>
	);
}
