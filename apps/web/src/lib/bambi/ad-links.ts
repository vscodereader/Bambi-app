// 광고 배너 → 공고 상세 링크 매핑.
// 배너를 클릭하면 그 배너가 광고하는 공고 상세(/seeker/jobs/{id})로 이동한다.
// 이미지 자체는 아직 공고와 별개(샘플)라, 지금은 배너 슬롯 키를 실제 공고에
// 결정적으로 매핑만 한다. 추후 각 배너 이미지를 매핑된 공고 커버로 교체 예정.

import type { Route } from "next";
import { JOBS } from "./data";

// 광고 배너가 노출하는 공고 풀 — 프로모션(유료 노출) 공고를 광고 대상으로 삼는다.
// 프로모션 공고가 없으면 전체 공고로 폴백한다.
const AD_JOB_POOL = (() => {
	const promoted = JOBS.filter((job) => job.isPromoted);
	return promoted.length > 0 ? promoted : JOBS;
})();

// 배너 슬롯 키(결정적 문자열) 기반 해시 — sampleThumbnailUrl과 동일 방식.
// 결정적이라 같은 키는 항상 같은 공고로 이동하고 SSR/CSR hydration이 어긋나지 않는다.
function hashKey(key: string): number {
	let hash = 0;
	for (const char of key) {
		hash = (hash * 31 + char.charCodeAt(0)) % 100_000;
	}
	return hash;
}

// 배너 클릭 시 이동할 광고 공고 상세 경로를 결정적으로 반환한다.
export function adJobHref(seed: string): Route {
	const job = AD_JOB_POOL[hashKey(seed) % AD_JOB_POOL.length];
	return `/seeker/jobs/${job.id}` as Route;
}
