import { env } from "@bambi-app/env/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Alert } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { NativeJobFormScreen } from "@/src/components/native-job-form";
import {
	type NativeJobForm,
	type NativeJobPostInput,
	publicObjectUri,
} from "@/src/lib/bambi-native";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";
import {
	buildJobUpdateData,
	type EditableAdSource,
} from "@/src/lib/employer/job-update";
import { orpc } from "@/src/lib/orpc";

const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

const toNativeJobForm = (job: {
	description: string;
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

interface EditableMediaItem {
	altText: null | string;
	byteSize: number;
	fileName: string;
	height: null | number;
	mimeType: string;
	sliceGroupId: null | string;
	sliceIndex: null | number;
	storageKey: string;
	width: null | number;
}

const toUploadItem = (item: EditableMediaItem): JobMediaUploadItem => ({
	altText: item.altText ?? "",
	byteSize: item.byteSize,
	fileName: item.fileName,
	height: item.height ?? undefined,
	mimeType: item.mimeType,
	storageKey: item.storageKey,
	width: item.width ?? undefined,
	// web이 만든 detail 조각 그룹 메타를 보존한다 — 빠뜨리면 재저장 시 조각이 흩어진다.
	...(item.sliceGroupId === null ? {} : { sliceGroupId: item.sliceGroupId }),
	...(item.sliceIndex === null ? {} : { sliceIndex: item.sliceIndex }),
});

// getEditableById 미디어를 폼 초기값으로. 원격 미디어는 로컬 uri가 없어 공개 버킷 URL을
// 미리보기로 조립하고, env 미설정·비공개 객체라 조립이 안 되면 폼이 파일명으로 폴백한다.
const toInitialMedia = (media?: {
	cover: EditableMediaItem | null;
	detail: EditableMediaItem[];
}): {
	cover: JobMediaUploadItem | null;
	detail: JobMediaUploadItem[];
	previews: Record<string, string>;
} => {
	const cover = media?.cover ? toUploadItem(media.cover) : null;
	const detail = (media?.detail ?? []).map(toUploadItem);
	const previews: Record<string, string> = {};
	for (const item of cover ? [cover, ...detail] : detail) {
		const uri = publicObjectUri(item.storageKey, GCS_PUBLIC_BASE_URL);
		if (uri) {
			previews[item.storageKey] = uri;
		}
	}
	return { cover, detail, previews };
};

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
					error.message || "잠시 후 다시 시도해 주세요."
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
		cover: initialCover,
		detail: initialDetail,
		previews: initialPreviews,
	} = toInitialMedia(editable.media);
	const adSource: EditableAdSource = {
		adProductId: editable.adProductId ?? null,
		exposureAmount: editable.exposureAmount ?? null,
		exposureDurationDays: editable.exposureDurationDays ?? null,
		paymentMethod: editable.paymentMethod ?? null,
	};

	const handleSubmit = (input: NativeJobPostInput) => {
		updateMutation.mutate({
			data: buildJobUpdateData(input, adSource),
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
				initialBeginnerFriendly={editable.beginnerFriendly ?? false}
				initialBlocks={editable.descriptionBlocks ?? []}
				initialCover={initialCover}
				initialDetail={initialDetail}
				initialInstantInterview={editable.instantInterview ?? false}
				initialPreviews={initialPreviews}
				initialValue={toNativeJobForm(jobQuery.data)}
				isSubmitting={updateMutation.isPending}
				onSubmit={handleSubmit}
				postingScopes={postingScopes}
				submitLabel="공고 저장"
			/>
		</BambiScreen>
	);
}
