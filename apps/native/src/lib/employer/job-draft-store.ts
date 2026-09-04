import type { AdBannerLayoutInput } from "@bambi-app/api/services/bambi-ad-banner-layout";
import { useSyncExternalStore } from "react";

import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import {
	getMissingBannerUsages,
	type JobAdBannerUsage,
	type NativeExposureState,
} from "@/src/lib/employer/ad-exposure";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";

// 새 공고 등록의 두 화면(작성 → 노출·결제)이 나눠 갖는 초안. expo-router Stack push라 작성
// 화면이 아래에 그대로 마운트돼 있어 작성 값은 그 화면 state가 지키지만, 노출 선택·배너는
// 상단 노출 화면이 pop되면 사라지므로 왕복해도 살아남게 여기(모듈 스코프)에 둔다.
// zustand 등 새 의존성 대신 모듈 값 + React 내장 useSyncExternalStore로 구독한다.

export interface JobBannerMedia {
	adHorizontal?: JobMediaUploadItem;
	adVertical?: JobMediaUploadItem;
}

export interface EmployerJobDraft {
	// 배너 배경(단색 등). null이면 미편집(두 슬롯 이미지 배경 기본) — 유료 등록 시에만 싣는다.
	bannerLayout: AdBannerLayoutInput | null;
	banners: JobBannerMedia;
	// 1단계에서 검증돼 조립된 서버 입력(초보환영·즉시면접·설명블록·미디어까지 병합). null이면
	// 아직 작성 단계를 통과하지 않은 빈 초안 — 노출 화면에 직접 들어오면 이 값으로 되돌린다.
	base: NativeJobPostInput | null;
	exposure: NativeExposureState;
}

// 초안 초기값. 무료(selection null)·무통장입금·포인트 0·상세 디자인 미신청이 기본이다.
export const emptyJobDraft = (): EmployerJobDraft => ({
	base: null,
	banners: {},
	bannerLayout: null,
	exposure: {
		detailDesignAmount: null,
		detailDesignRequested: false,
		paymentMethod: "bank_transfer",
		pointsToUse: 0,
		selection: null,
	},
});

// 노출 선택·배너를 base에 병합해 최종 제출 입력을 만든다. 무료면 base를 그대로 둔다(배너·결제
// 필드 없음). 유료면 배너를 media에 함께 실어야 서버가 배너 행을 지우지 않고, 결제·노출 필드를
// 싣는다. (예전 native-job-form의 buildExposureSubmission을 순수 함수로 뽑아 옮긴 것.)
export const buildDraftSubmission = (
	base: NativeJobPostInput,
	exposure: NativeExposureState,
	banners: JobBannerMedia,
	bannerLayout: AdBannerLayoutInput | null
): NativeJobPostInput => {
	const { selection } = exposure;

	if (!selection) {
		return base;
	}

	return {
		...base,
		adProductId: selection.adProductId,
		// 단색 배경 등을 골라 레이아웃을 만졌을 때만 싣는다. null이면 키를 생략해 서버 기본
		// (두 슬롯 이미지 배경)을 따른다.
		...(bannerLayout ? { adBannerLayout: bannerLayout } : {}),
		// 상세 디자인 신청은 유료 분기에서만 싣는다(옵션은 광고 상품에만 붙는다). 미신청이면
		// requested=false·amount=null이라 서버가 스냅샷을 만들지 않는다.
		detailDesignAmount: exposure.detailDesignAmount,
		detailDesignRequested: exposure.detailDesignRequested,
		exposureAmount: selection.amount,
		exposureDurationDays: selection.durationDays,
		media: {
			adHorizontal: banners.adHorizontal,
			adVertical: banners.adVertical,
			cover: base.media?.cover,
			detail: base.media?.detail ?? [],
		},
		paymentMethod: "bank_transfer",
		pointsToUse: exposure.pointsToUse,
	};
};

// 유료 상품을 골랐는데 필수 배너가 비어 있는지. 무료·리스팅은 requiredUsages가 비어 항상 false다
// — 노출 화면 등록 게이트가 이 값으로 배너 미충족 등록을 막는다.
export const hasMissingRequiredBanners = (
	exposure: NativeExposureState,
	banners: JobBannerMedia,
	requiredUsages: readonly JobAdBannerUsage[],
	bannerLayout: AdBannerLayoutInput | null
): boolean =>
	Boolean(exposure.selection) &&
	getMissingBannerUsages(banners, requiredUsages, bannerLayout).length > 0;

let draft: EmployerJobDraft = emptyJobDraft();
const listeners = new Set<() => void>();

const emit = () => {
	for (const listener of listeners) {
		listener();
	}
};

export const getJobDraft = (): EmployerJobDraft => draft;

// 함수형 갱신만 받는다 — 노출 화면이 직전 값을 읽어 exposure/banners만 바꿔 넣기 편하다.
export const setJobDraft = (
	updater: (prev: EmployerJobDraft) => EmployerJobDraft
): void => {
	draft = updater(draft);
	emit();
};

// 새 공고 화면 첫 진입·등록 성공 시 호출한다 — 이전 등록 잔재가 다음 등록으로 새지 않게 비운다.
export const resetJobDraft = (): void => {
	draft = emptyJobDraft();
	emit();
};

const subscribe = (listener: () => void): (() => void) => {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
};

export const useJobDraft = (): EmployerJobDraft =>
	useSyncExternalStore(subscribe, getJobDraft, getJobDraft);
