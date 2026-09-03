import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Alert } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { NativeJobFormScreen } from "@/src/components/native-job-form";
import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import { orpc } from "@/src/lib/orpc";

export default function NewEmployerJobScreen() {
	const queryClient = useQueryClient();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const createMutation = useMutation(
		orpc.bambi.jobs.create.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"공고를 등록하지 못했어요",
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

	if (mineQuery.isLoading) {
		return <LoadingState label="공고 등록 범위를 확인하고 있습니다." />;
	}

	if (mineQuery.isError) {
		return <ErrorState onRetry={() => mineQuery.refetch()} />;
	}

	const postingScopes = mineQuery.data?.employerJobPostingScopes ?? [];

	if (postingScopes.length === 0) {
		return (
			<BambiScreen>
				<StateCard
					description="조직 대표, 관리자 또는 팀 멤버 권한이 있어야 공고를 등록할 수 있습니다."
					title="등록 가능한 범위가 없습니다"
				/>
			</BambiScreen>
		);
	}

	const handleSubmit = (input: NativeJobPostInput) => {
		createMutation.mutate(input);
	};

	// 화면 제목("새 공고")은 네이티브 헤더가 이미 달고 있다 — 같은 말을 큰 제목으로 한 번 더
	// 그리면 첫 화면의 위쪽 절반이 제목 반복으로 채워진다. 폼이 스스로 화면을 두른다.
	return (
		<NativeJobFormScreen
			isSubmitting={createMutation.isPending}
			notice="등록한 공고는 검수를 거쳐 공개됩니다."
			onSubmit={handleSubmit}
			postingScopes={postingScopes}
			submitLabel="공고 등록"
		/>
	);
}
