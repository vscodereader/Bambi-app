import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";

import { BambiScreen, LoadingState } from "@/src/components/bambi-screen";
import { JobBannerPickerSection } from "@/src/components/job-banner-picker-section";
import { JobExposureSection } from "@/src/components/job-exposure-section";
import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import {
	getRequiredBannerUsages,
	type NativeExposureState,
	REQUIRED_BANNER_ERROR,
} from "@/src/lib/employer/ad-exposure";
import {
	buildDraftSubmission,
	hasMissingRequiredBanners,
	type JobBannerMedia,
	resetJobDraft,
	setJobDraft,
	useJobDraft,
} from "@/src/lib/employer/job-draft-store";
import { orpc } from "@/src/lib/orpc";

export default function NewEmployerJobExposureScreen() {
	const queryClient = useQueryClient();
	const draft = useJobDraft();
	const base = draft.base;
	// 유료·무통장입금 건의 입금 안내 문구. 등록 시점에 계산해 두고 성공 후 한 번 띄운다 —
	// 성공 콜백은 서버 응답만 받아 원래 결제 정보를 모르므로 여기 담아 둔다.
	const depositNoticeRef = useRef<null | string>(null);
	const [bannerError, setBannerError] = useState<null | string>(null);
	// 선택 상품이 요구하는 배너 슬롯. 리스팅·무료면 빈 배열이라 배너 픽커가 스스로 숨는다.
	const requiredBannerUsages = useMemo(
		() => getRequiredBannerUsages(draft.exposure.selection?.previewTemplate),
		[draft.exposure.selection?.previewTemplate]
	);
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
				// 등록이 끝나면 초안을 비워 다음 등록에 잔재가 새지 않게 한다.
				resetJobDraft();
				const depositNotice = depositNoticeRef.current;
				if (depositNotice) {
					Alert.alert("공고가 등록되었어요", depositNotice);
				}
				router.replace("/(employer)" as Href);
			},
		})
	);

	// 딥링크·잔재 방어: 작성 단계를 통과하지 않은 빈 초안으로 들어오면 작성 화면으로 되돌린다
	// (빈 노출 화면을 띄우지 않는다). 훅 순서를 지키려 조건 없이 effect를 등록한다.
	useEffect(() => {
		if (!base) {
			router.replace("/(employer)/new" as Href);
		}
	}, [base]);

	if (!base) {
		return <LoadingState label="공고 작성 화면으로 이동하고 있습니다." />;
	}

	const handleExposureChange = (next: NativeExposureState) => {
		setJobDraft((prev) => ({ ...prev, exposure: next }));
		// 상품을 바꾸면 이전 게이트 메시지는 더 이상 유효하지 않다.
		setBannerError(null);
	};

	const handleBannersChange = (next: JobBannerMedia) => {
		setJobDraft((prev) => ({ ...prev, banners: next }));
		setBannerError(null);
	};

	// "공고 등록하기". 유료인데 필수 배너가 비면 등록을 막고 사유를 띄운다. 통과하면 초안의
	// 노출 선택·배너를 base에 병합해 실제 등록한다(무료면 배너·결제 없이 그대로 등록).
	const handleRegister = () => {
		if (
			hasMissingRequiredBanners(
				draft.exposure,
				draft.banners,
				requiredBannerUsages
			)
		) {
			setBannerError(REQUIRED_BANNER_ERROR);
			return;
		}

		const input = buildDraftSubmission(base, draft.exposure, draft.banners);
		// 무통장입금 유료 건이면 입금액(노출금액 − 사용 포인트)을 안내한다. 무료는 안내 없음.
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

	// 화면 제목("노출 상품·결제")과 뒤로가기는 네이티브 헤더(Stack)가 이미 단다 — 뒤로 가면
	// 작성 화면이 스택에 그대로 남아 값이 보존된다. 등록 CTA는 스크롤 밖 고정 바에 둔다.
	return (
		<BambiScreen
			stickyFooter={
				<View className="gap-2">
					{/* 필수 배너 누락 등 등록 차단 사유는 CTA 바로 위에 둔다 — 배너 슬롯은 스크롤
					    위쪽이라 여기서 다시 짚어야 눌러도 안 되는 이유가 보인다. */}
					{bannerError ? (
						<Text className="text-danger text-sm" selectable>
							{bannerError}
						</Text>
					) : null}
					<Button
						isDisabled={createMutation.isPending}
						onPress={handleRegister}
					>
						<Button.Label>
							{createMutation.isPending ? "저장 중" : "공고 등록하기"}
						</Button.Label>
					</Button>
				</View>
			}
		>
			<JobExposureSection
				bannerSlot={
					<JobBannerPickerSection
						key={base.organizationId}
						media={draft.banners}
						onChange={handleBannersChange}
						organizationId={base.organizationId}
						requiredUsages={requiredBannerUsages}
						teamId={base.teamId || null}
					/>
				}
				errorMessage={bannerError ?? undefined}
				onChange={handleExposureChange}
				value={draft.exposure}
			/>
		</BambiScreen>
	);
}
