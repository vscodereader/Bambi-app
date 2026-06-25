import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { NativeJobFormScreen } from "@/src/components/native-job-form";
import type { NativeJobForm, NativeJobPostInput } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const toNativeJobForm = (job: {
	description: string;
	industryCategory: string;
	interviewNotes: null | string;
	organizationId: string;
	payAmount: number;
	payUnit: string;
	region: string;
	teamId: null | string;
	title: string;
	workSchedule: string;
}): NativeJobForm => ({
	description: job.description,
	industryCategory: job.industryCategory,
	interviewNotes: job.interviewNotes ?? "",
	organizationId: job.organizationId,
	payAmount: String(job.payAmount),
	payUnit: job.payUnit,
	region: job.region,
	teamId: job.teamId ?? "",
	title: job.title,
	workSchedule: job.workSchedule,
});

export default function EditEmployerJobScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const queryClient = useQueryClient();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const jobQuery = useQuery(
		orpc.bambi.jobs.getEditableById.queryOptions({ input: { id } })
	);
	const updateMutation = useMutation(
		orpc.bambi.jobs.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				router.replace("/(employer)" as Href);
			},
		})
	);

	if (mineQuery.isLoading || jobQuery.isLoading) {
		return <LoadingState label="공고 정보를 불러오고 있습니다." />;
	}

	if (mineQuery.isError || jobQuery.isError || !jobQuery.data) {
		return (
			<ErrorState
				onRetry={() => {
					mineQuery.refetch();
					jobQuery.refetch();
				}}
			/>
		);
	}

	const postingScopes = mineQuery.data?.employerJobPostingScopes ?? [];

	if (postingScopes.length === 0) {
		return (
			<BambiScreen>
				<StateCard
					description="공고를 수정할 수 있는 조직 또는 팀 권한이 없습니다."
					title="수정 가능한 범위가 없습니다"
				/>
			</BambiScreen>
		);
	}

	const handleSubmit = (input: NativeJobPostInput) => {
		updateMutation.mutate({
			data: input,
			id,
		});
	};

	return (
		<BambiScreen>
			<BambiHeader
				description="공개 내용이 바뀌면 조직 인증 상태와 위험어 여부에 따라 재검수될 수 있습니다."
				title="공고 편집"
			/>
			<NativeJobFormScreen
				initialValue={toNativeJobForm(jobQuery.data)}
				isSubmitting={updateMutation.isPending}
				onSubmit={handleSubmit}
				postingScopes={postingScopes}
				submitLabel="공고 저장"
			/>
		</BambiScreen>
	);
}
