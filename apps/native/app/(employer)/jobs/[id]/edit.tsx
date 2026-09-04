import { env } from "@bambi-app/env/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Alert } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { NativeJobFormScreen } from "@/src/components/native-job-form";
import type { NativeJobForm, NativeJobPostInput } from "@/src/lib/bambi-native";
import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import {
	buildJobUpdateData,
	type EditableAdSource,
	toInitialMedia,
} from "@/src/lib/employer/job-update";
import { orpc } from "@/src/lib/orpc";

const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

const toNativeJobForm = (job: {
	description: string;
	// 세부지역(시군구). 미선택으로 저장된 공고는 null이다.
	districtCode: null | string;
	industryCategory: string;
	interviewNotes: null | string;
	organizationId: string;
	payAmount: null | number;
	payUnit: string;
	// 지역 백필 이전 공고는 코드가 비어 있다 — 그 경우 폼에서 다시 고르게 한다.
	regionCode: null | string;
	teamId: null | string;
	title: string;
	workSchedule: string;
}): NativeJobForm => ({
	description: job.description,
	districtCode: job.districtCode ?? "",
	industryCategory: job.industryCategory,
	interviewNotes: job.interviewNotes ?? "",
	organizationId: job.organizationId,
	// 급여 협의 공고는 금액이 없다.
	payAmount: job.payAmount === null ? "" : String(job.payAmount),
	payUnit: job.payUnit,
	regionCode: job.regionCode ?? "",
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
			onError: (error) => {
				Alert.alert(
					"공고를 저장하지 못했어요",
					localErrorMessage(error, "잠시 후 다시 시도해 주세요.")
				);
			},
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

	const editable = jobQuery.data;
	const {
		banners,
		cover: initialCover,
		detail: initialDetail,
		previews: initialPreviews,
	} = toInitialMedia(editable.media, GCS_PUBLIC_BASE_URL);
	const adSource: EditableAdSource = {
		adProductId: editable.adProductId ?? null,
		exposureAmount: editable.exposureAmount ?? null,
		exposureDurationDays: editable.exposureDurationDays ?? null,
		paymentMethod: editable.paymentMethod ?? null,
	};

	const handleSubmit = (input: NativeJobPostInput) => {
		updateMutation.mutate({
			data: buildJobUpdateData(input, adSource, banners),
			id,
		});
	};

	// 제목은 네이티브 헤더가 단다(new.tsx와 같은 규칙). 재검수 안내만 폼 위에 남긴다.
	return (
		<NativeJobFormScreen
			initialBeginnerFriendly={editable.beginnerFriendly ?? false}
			initialBlocks={editable.descriptionBlocks ?? []}
			initialCover={initialCover}
			initialDetail={initialDetail}
			initialInstantInterview={editable.instantInterview ?? false}
			initialPreviews={initialPreviews}
			initialValue={toNativeJobForm(jobQuery.data)}
			isSubmitting={updateMutation.isPending}
			notice="공개 내용이 바뀌면 조직 인증 상태와 위험어 여부에 따라 재검수될 수 있습니다."
			onSubmit={handleSubmit}
			postingScopes={postingScopes}
			scopeLocked
			submitLabel="공고 저장"
		/>
	);
}
