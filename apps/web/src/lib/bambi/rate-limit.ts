// 게스트 본인인증 라우트의 봇 방어용 슬라이딩 윈도 카운터. 본인인증은 건당 과금이라
// 무제한 호출을 그대로 두면 비용이 새어 나간다.
// ponytail: 인스턴스 로컬 메모리 — 단일 web 인스턴스 전제. 수평 확장하면 Redis/DB 카운터로.

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
