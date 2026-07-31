// 로그인 없이 부를 수 있는 경로의 봇 방어용 슬라이딩 윈도 카운터. 본인인증은 건당
// 과금이라 무제한 호출을 그대로 두면 비용이 새어 나간다. web의 게스트 라우트(/api/guest)와
// api의 레이트리밋 미들웨어가 함께 쓴다 — env·db에 의존하지 않는 순수 모듈로 유지한다.
// ponytail: 인스턴스 로컬 메모리 — 프로세스별 카운터다(web·server가 각자 센다).
// 수평 확장하면 Redis/DB 카운터로.

const buckets = new Map<string, number[]>();

// 키가 무한히 쌓이지 않게, 버킷 수가 이 값을 넘으면 만료 항목을 한 번 쓸어낸다.
const SWEEP_THRESHOLD = 5000;

const sweep = (cutoff: number) => {
	for (const [key, hits] of buckets) {
		const alive = hits.filter((time) => time > cutoff);
		if (alive.length === 0) {
			buckets.delete(key);
		} else {
			buckets.set(key, alive);
		}
	}
};

// 카운터를 비운다. 버킷이 모듈 수준이라 한 테스트의 호출이 다음 테스트로 새는데,
// 프로시저를 여러 번 부르는 스위트는 그 누적만으로 한도에 닿아 엉뚱하게 429로 깨진다.
export function resetRateLimits() {
	buckets.clear();
}

// 허용되면 true(호출 1회 기록), 한도 초과면 false.
export function takeRateLimit({
	key,
	limit,
	now,
	windowMs,
}: {
	key: string;
	limit: number;
	now: number;
	windowMs: number;
}): boolean {
	const cutoff = now - windowMs;
	if (buckets.size > SWEEP_THRESHOLD) {
		sweep(cutoff);
	}
	const hits = (buckets.get(key) ?? []).filter((time) => time > cutoff);
	if (hits.length >= limit) {
		buckets.set(key, hits);
		return false;
	}
	hits.push(now);
	buckets.set(key, hits);
	return true;
}
