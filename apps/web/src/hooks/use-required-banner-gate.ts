"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdBannerLayout } from "@/lib/bambi/ad-banner-layout";
import { getAdBannerUsagesForPreviewTemplate } from "@/lib/bambi/ad-preview-templates";
import type { JobAdBannerUsage } from "@/lib/bambi/job-ad-banner-spec";
import {
	getMissingAdBannerUsages,
	type JobFormMedia,
} from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

/**
 * 선택한 노출 상품이 요구하는 광고 배너 슬롯과 누락 여부를 계산한다. 프리미엄 광고는
 * 가로형(상단·좌측)·세로형(우측) 배너를 모두 요구하므로, 하나라도 없으면 공고 폼의
 * 제출 버튼을 잠그고 안내를 띄우는 데 쓴다. 하위 폼(JobExposureFields·JobPostMediaUploader)과
 * 같은 쿼리 키라 react-query 캐시를 공유한다(추가 요청 없음). 카탈로그 로딩 중에는 상품이
 * 아직 안 잡혀 오판할 수 있으니, 상품이 해소된 뒤에만 누락을 판정한다.
 * 배경이 단색인 슬롯은 이미지가 배너에 나오지 않아 누락으로 보지 않는다 — 그래서 레이아웃이
 * 필요하다.
 */
export function useRequiredBannerGate({
	adProductId,
	layout,
	media,
}: {
	adProductId: string | null;
	layout: AdBannerLayout | null;
	media: JobFormMedia;
}): {
	bannerImagesMissing: boolean;
	requiredBannerUsages: JobAdBannerUsage[];
} {
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.getCatalog.queryOptions()
	);
	const selectedProduct =
		(catalogQuery.data ?? [])
			.flatMap((placement) => placement.products)
			.find((product) => product.id === adProductId) ?? null;
	const requiredBannerUsages = getAdBannerUsagesForPreviewTemplate(
		selectedProduct?.previewTemplate
	);
	const isProductResolved = !adProductId || Boolean(selectedProduct);

	return {
		bannerImagesMissing:
			isProductResolved &&
			getMissingAdBannerUsages(media, requiredBannerUsages, layout).length > 0,
		requiredBannerUsages,
	};
}
