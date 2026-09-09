import { env } from "@bambi-app/env/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Alert } from "react-native";

import { ErrorState, LoadingState } from "@/src/components/bambi-screen";
import {
	NativeJobFormScreen,
	type PostingScope,
} from "@/src/components/native-job-form";
import type { NativeJobForm, NativeJobPostInput } from "@/src/lib/bambi-native";
import {
	buildJobUpdateData,
	toInitialMedia,
} from "@/src/lib/employer/job-update";
import { orpc } from "@/src/lib/orpc";

const toForm = (job: {
	description: string;
	districtCode: string | null;
	industryCategory: string;
	interviewNotes: string | null;
	organizationId: string;
	payAmount: number | null;
	payUnit: string;
	regionCode: string | null;
	teamId: string | null;
	title: string;
	workSchedule: string;
}): NativeJobForm => ({
	description: job.description,
	districtCode: job.districtCode ?? "",
	industryCategory: job.industryCategory,
	interviewNotes: job.interviewNotes ?? "",
	organizationId: job.organizationId,
	payAmount: job.payAmount === null ? "" : String(job.payAmount),
	payUnit: job.payUnit,
	regionCode: job.regionCode ?? "",
	teamId: job.teamId ?? "",
	title: job.title,
	workSchedule: job.workSchedule,
});

export default function ModeratorEditJobScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const client = useQueryClient();
	const query = useQuery(
		orpc.bambi.moderation.getJobPostForAdmin.queryOptions({
			input: { jobPostId: id },
		})
	);
	const mutation = useMutation(
		orpc.bambi.moderation.adminUpdateJobPost.mutationOptions()
	);
	if (query.isPending) {
		return <LoadingState label="공고 정보를 불러오고 있습니다." />;
	}
	if (query.isError || !query.data) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}
	const job = query.data;
	const media = toInitialMedia(job.media, env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL);
	const scope: PostingScope = {
		organizationDisplayName: "대상 조직",
		organizationId: job.organizationId,
		scopeType: job.teamId ? "team" : "organization",
		teamDisplayName: null,
		teamId: job.teamId ?? null,
	};
	const submit = async (input: NativeJobPostInput) => {
		try {
			await mutation.mutateAsync({
				jobPostId: id,
				data: buildJobUpdateData(
					input,
					{
						adProductId: job.adProductId ?? null,
						exposureAmount: job.exposureAmount ?? null,
						exposureDurationDays: job.exposureDurationDays ?? null,
						paymentMethod: job.paymentMethod ?? null,
					},
					media.banners
				),
			});
			await Promise.all([
				client.invalidateQueries({
					queryKey: orpc.bambi.moderation.listJobPosts.key(),
				}),
				client.invalidateQueries({
					queryKey: orpc.bambi.moderation.getJobPostForAdmin.key(),
				}),
			]);
			router.replace("/(moderator)/jobs" as Href);
		} catch (error) {
			Alert.alert(
				"공고를 저장하지 못했어요",
				error instanceof Error ? error.message : "입력값을 확인해 주세요."
			);
		}
	};
	return (
		<NativeJobFormScreen
			initialBeginnerFriendly={job.beginnerFriendly ?? false}
			initialBlocks={job.descriptionBlocks ?? []}
			initialCover={media.cover}
			initialDetail={media.detail}
			initialInstantInterview={job.instantInterview ?? false}
			initialPreviews={media.previews}
			initialValue={toForm(job)}
			isSubmitting={mutation.isPending}
			notice="기존 배너·상세 이미지와 상태를 보존한 채 수정합니다."
			onSubmit={submit}
			postingScopes={[scope]}
			scopeLocked
			submitLabel="공고 저장"
		/>
	);
}
