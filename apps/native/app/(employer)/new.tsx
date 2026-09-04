import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { useEffect } from "react";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { NativeJobFormScreen } from "@/src/components/native-job-form";
import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import {
	resetJobDraft,
	setJobDraft,
	useJobDraft,
} from "@/src/lib/employer/job-draft-store";
import { orpc } from "@/src/lib/orpc";

export default function NewEmployerJobScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const draft = useJobDraft();

	// 이 화면에 처음 진입할 때 초안을 비운다 — 직전 등록의 노출 선택·배너가 다음 등록으로 새면
	// 안 된다. 노출 화면에서 뒤로 돌아올 땐 이 화면이 스택에 그대로 남아 remount되지 않으므로
	// 이 effect도 다시 돌지 않아, 왕복 중 초안은 보존된다.
	useEffect(() => {
		resetJobDraft();
	}, []);

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

	// "다음" — 검증·조립된 입력을 초안에 담고 노출 상품·결제 화면으로 스택 push한다. 노출 선택·
	// 배너는 초안에 남아 있던 값을 그대로 두어 왕복해도 이전 선택이 살아 있다(base만 갱신). 단,
	// 배너 업로드 키는 조직 단위라 조직을 바꿔 다시 넘어오면 이전 조직 키 배너는 서버 FORBIDDEN이다
	// — 조직이 바뀐 경우에만 배너를 비운다(노출 상품 카탈로그는 전역이라 exposure는 유지).
	const handleNext = (base: NativeJobPostInput) => {
		setJobDraft((prev) => ({
			...prev,
			banners:
				prev.base && prev.base.organizationId !== base.organizationId
					? {}
					: prev.banners,
			base,
		}));
		router.push("/(employer)/new-exposure" as Href);
	};

	// 화면 제목("새 공고")은 네이티브 헤더가 이미 달고 있다 — 폼이 스스로 화면을 두른다.
	return (
		<NativeJobFormScreen
			exposureEnabled
			exposurePreviewTemplate={draft.exposure.selection?.previewTemplate}
			isSubmitting={false}
			notice="등록한 공고는 검수를 거쳐 공개됩니다."
			onNext={handleNext}
			postingScopes={postingScopes}
			submitLabel="공고 등록"
		/>
	);
}
