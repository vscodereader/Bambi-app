export async function runContentBatch(
	ids: readonly string[],
	request: (id: string) => Promise<unknown>
) {
	const targets = [...new Set(ids)];
	const results = await Promise.allSettled(
		targets.map((id) => Promise.resolve().then(() => request(id)))
	);
	const failed = targets.filter(
		(_, index) => results[index]?.status === "rejected"
	);
	const errors = results.flatMap((result) =>
		result.status === "rejected"
			? [result.reason instanceof Error ? result.reason.message : "처리 실패"]
			: []
	);
	return { failed, errors, succeeded: targets.length - failed.length };
}
