import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { useRef } from "react";
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
	// 유료·무통장입금 건의 입금 안내 문구. 제출 시점에 계산해 두고 등록 성공 후 한 번 띄운다
	// — 성공 콜백은 서버 응답만 받아 원래 결제 정보를 모르므로 여기 담아 둔다.
	const depositNoticeRef = useRef<null | string>(null);
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
				const depositNotice = depositNoticeRef.current;
				if (depositNotice) {
					Alert.alert("공고가 등록되었어요", depositNotice);
				}
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
		// 무통장입금 유료 건이면 입금액(노출금액 − 사용 포인트)을 안내한다. 무료·카드는 안내 없음.
		depositNoticeRef.current =
			input.paymentMethod === "bank_transfer" &&
			typeof input.exposureAmount === "number"
				? `무통장입금 안내: ${Math.max(
						0,
						input.exposureAmount - (input.pointsToUse ?? 0)
					).toLocaleString("ko-KR")}원을 입금하면 광고 노출이 시작됩니다.`
				: null;
		createMutation.mutate(input);
	};

	// 화면 제목("새 공고")은 네이티브 헤더가 이미 달고 있다 — 같은 말을 큰 제목으로 한 번 더
	// 그리면 첫 화면의 위쪽 절반이 제목 반복으로 채워진다. 폼이 스스로 화면을 두른다.
	return (
		<NativeJobFormScreen
			exposureEnabled
			isSubmitting={createMutation.isPending}
			notice="등록한 공고는 검수를 거쳐 공개됩니다."
			onSubmit={handleSubmit}
			postingScopes={postingScopes}
			submitLabel="공고 등록"
		/>
	);
}
