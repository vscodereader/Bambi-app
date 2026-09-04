import type { AdBannerLayoutInput } from "@bambi-app/api/services/bambi-ad-banner-layout";

import {
	type NativeJobPostInput,
	publicObjectUri,
} from "@/src/lib/bambi-native";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";

// getEditableById가 내려주는 미디어 한 장(원격 프리필). null 축을 그대로 받는다.
export interface EditableMediaItem {
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

export const toUploadItem = (item: EditableMediaItem): JobMediaUploadItem => ({
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
// 미리보기로 조립하고, base 미설정·비공개 객체라 조립이 안 되면 폼이 파일명으로 폴백한다.
// gcsPublicBaseUrl은 호출부(screen)가 env에서 주입한다 — 그래야 이 함수가 순수해 테스트된다.
export const toInitialMedia = (
	media:
		| {
				adHorizontal: EditableMediaItem | null;
				adVertical: EditableMediaItem | null;
				cover: EditableMediaItem | null;
				detail: EditableMediaItem[];
		  }
		| undefined,
	gcsPublicBaseUrl: string | undefined
): {
	banners: EditableBanners;
	cover: JobMediaUploadItem | null;
	detail: JobMediaUploadItem[];
	previews: Record<string, string>;
} => {
	const cover = media?.cover ? toUploadItem(media.cover) : null;
	const detail = (media?.detail ?? []).map(toUploadItem);
	// 배너는 폼에 노출하지 않지만 저장 시 보존해야 한다(media 전량 교체 방어).
	const banners: EditableBanners = {
		adHorizontal: media?.adHorizontal ? toUploadItem(media.adHorizontal) : null,
		adVertical: media?.adVertical ? toUploadItem(media.adVertical) : null,
	};
	const previews: Record<string, string> = {};
	for (const item of cover ? [cover, ...detail] : detail) {
		const uri = publicObjectUri(item.storageKey, gcsPublicBaseUrl);
		if (uri) {
			previews[item.storageKey] = uri;
		}
	}
	return { banners, cover, detail, previews };
};

// getEditableById가 내려주는 공고 행에서 광고 축만 좁힌 것.
export interface EditableAdSource {
	adProductId: null | string;
	exposureAmount: null | number;
	exposureDurationDays: null | number;
	paymentMethod: null | string;
}

// web이 올린 배너 미디어(수정 시 보존용). native는 배너를 새로 만들지 않는다.
export interface EditableBanners {
	adHorizontal: JobMediaUploadItem | null;
	adVertical: JobMediaUploadItem | null;
}

// media는 서버에서 전량 교체라, 배너가 있으면 출력 media에 다시 실어야 배너 행이 지워지지
// 않는다. 배너가 없으면(무료 공고 등) media를 그대로 둔다(참조 유지).
const withBanners = (
	media: NativeJobPostInput["media"],
	banners: EditableBanners | undefined
): NativeJobPostInput["media"] => {
	if (!(media && (banners?.adHorizontal || banners?.adVertical))) {
		return media;
	}

	return {
		...media,
		...(banners.adHorizontal ? { adHorizontal: banners.adHorizontal } : {}),
		...(banners.adVertical ? { adVertical: banners.adVertical } : {}),
	};
};

// 상세 디자인 신청 변경 인자. price는 신청을 켤 때 서버에 보낼 재확인 금액이다.
export interface DetailDesignChange {
	detailDesignPrice: null | number;
	nextRequested: boolean;
	previousRequested: boolean;
}

// 배너 레이아웃 변경 인자. changed일 때만 next를 싣는다(생략 = 서버 보존).
export interface AdBannerLayoutChange {
	changed: boolean;
	next: AdBannerLayoutInput | null;
}

/**
 * 수정 payload를 만든다. native는 광고 상품을 편집하지 않지만, 서버 update는 jobPostInput
 * 전체를 받고 resolveJobPostExposure(data.adProductId)가 adProductId를 안 보내면 노출을
 * "standard"로 되돌려 유료 광고를 무료로 강등하고 결제 상태를 미결제로 리셋한다. 그래서
 * web에서 만든 광고 공고를 native에서 수정할 때는 광고 4필드(adProductId·기간·금액·결제수단)를
 * getEditableById 값 그대로 되돌려 보낸다. boostOptionTypes는 키를 생략하면 서버가 보존한다.
 *
 * 상세 디자인·배너 레이아웃은 "값이 바뀐 경우에만" 싣는다 — 항상 보내면 서버의 "생략=보존"
 * 경로가 죽고, 항상 생략하면 신청·해제·단색 배경 전환이 불가능하다. detailDesign/adBannerLayout
 * 인자를 안 넘기면(수정 UI가 없는 경로) 종전대로 두 키를 모두 생략해 기존 값을 보존한다.
 */
export const buildJobUpdateData = (
	input: NativeJobPostInput,
	editable: EditableAdSource,
	banners?: EditableBanners,
	detailDesign?: DetailDesignChange,
	adBannerLayout?: AdBannerLayoutChange
): NativeJobPostInput => {
	const media = withBanners(input.media, banners);

	let base: NativeJobPostInput;
	if (editable.adProductId) {
		base = {
			...input,
			adProductId: editable.adProductId,
			exposureAmount: editable.exposureAmount,
			exposureDurationDays: editable.exposureDurationDays,
			media,
			paymentMethod:
				editable.paymentMethod === "bank_transfer" ||
				editable.paymentMethod === "card"
					? editable.paymentMethod
					: null,
		};
	} else if (media === input.media) {
		base = input;
	} else {
		base = { ...input, media };
	}

	const extras: Partial<NativeJobPostInput> = {};

	// 신청 상태가 바뀐 경우에만 두 키를 싣는다. 켜면 가격도 함께(서버 재확인용), 끄면 false만.
	if (
		detailDesign &&
		detailDesign.nextRequested !== detailDesign.previousRequested
	) {
		extras.detailDesignRequested = detailDesign.nextRequested;

		if (detailDesign.nextRequested) {
			extras.detailDesignAmount = detailDesign.detailDesignPrice;
		}
	}

	if (adBannerLayout?.changed) {
		extras.adBannerLayout = adBannerLayout.next;
	}

	return Object.keys(extras).length > 0 ? { ...base, ...extras } : base;
};
