import { jobStatusLabels } from "@/src/lib/bambi-native";

// web /employer/page.tsx getJobStatusCounts와 같은 규칙 — 이 세 상태만 요약 타일로 센다.
export interface JobStatusCounts {
	pendingReview: number;
	published: number;
	rejected: number;
}

export const countJobStatuses = (
	jobs: readonly { status: string }[]
): JobStatusCounts => {
	const counts: JobStatusCounts = {
		pendingReview: 0,
		published: 0,
		rejected: 0,
	};

	for (const job of jobs) {
		if (job.status === "published") {
			counts.published += 1;
		} else if (job.status === "pending_review") {
			counts.pendingReview += 1;
		} else if (job.status === "rejected") {
			counts.rejected += 1;
		}
	}

	return counts;
};

export interface JobDisplayStatus {
	label: string;
	tone: "danger" | "neutral" | "success" | "warning";
}

const STATUS_TONES: Record<string, JobDisplayStatus["tone"]> = {
	draft: "neutral",
	hidden: "neutral",
	on_hold: "warning",
	pending_review: "warning",
	published: "success",
	rejected: "danger",
};

// web @/lib/bambi/exposure getJobDisplayStatus 이식 — 게시됐지만 미결제면 "미공개".
export const getJobDisplayStatus = (job: {
	paymentStatus: null | string;
	status: string;
}): JobDisplayStatus => {
	if (job.status === "published" && job.paymentStatus !== "paid") {
		return { label: "미공개", tone: "warning" };
	}

	return {
		label:
			jobStatusLabels[job.status as keyof typeof jobStatusLabels] ?? job.status,
		tone: STATUS_TONES[job.status] ?? "neutral",
	};
};

// web employer-jobs-columns.tsx getJobStatusNote 이식(우선순위 동일).
export const getJobStatusNote = (job: {
	listingQueuePosition: null | number;
	paymentStatus: null | string;
	rejectionReason: null | string;
	status: string;
}): null | string => {
	if (job.listingQueuePosition !== null) {
		return "자리가 나면 순서대로 자동 노출됩니다.";
	}

	if (job.paymentStatus !== "paid" && job.status === "published") {
		return "입금 확인 후 노출됩니다.";
	}

	if (job.paymentStatus !== "paid" && job.status === "pending_review") {
		return "검수 통과와 입금 확인을 모두 마쳐야 노출됩니다.";
	}

	if (job.status === "on_hold") {
		return "운영자가 추가 확인 중입니다. 검수가 끝나면 상태가 바뀝니다.";
	}

	if (job.status === "rejected") {
		return job.rejectionReason
			? `반려 사유: ${job.rejectionReason}`
			: "수정 후 제출하면 재검수를 거칩니다.";
	}

	return null;
};

// web /employer/page.tsx getDeletePointRefundPreview 응답 형태.
export interface DeleteRefundPreview {
	cap?: null | number;
	forfeitedAmount: number;
	refundAmount: number;
	refundLocked: boolean;
	usedAmount: number;
}

const won = (value: number): string => value.toLocaleString("ko-KR");

// web /employer/page.tsx getDeleteDescription 이식(분기 순서 동일).
export const getDeleteRefundDescription = (
	preview: DeleteRefundPreview | null | undefined
): string => {
	if (preview?.refundLocked) {
		return "한 번이라도 결제 완료가 되거나 공개 처리된 공고에 사용된 포인트는 환불이 어렵습니다. 삭제한 공고와 연결된 기록은 되돌릴 수 없어요.";
	}

	if (preview && preview.forfeitedAmount > 0) {
		return `지금 취소하시면 최대 보유 포인트는 ${won(preview.cap ?? 0)}포인트까지 가능하므로 사용하신 ${won(preview.usedAmount)}포인트 중 ${won(preview.forfeitedAmount)}포인트는 환급이 불가합니다. 그대로 하시겠습니까?`;
	}

	if (preview && preview.refundAmount > 0) {
		return `공고를 삭제하면 사용한 ${won(preview.refundAmount)}포인트가 즉시 환급됩니다.`;
	}

	return "삭제한 공고와 연결된 광고·성과 기록은 되돌릴 수 없어요.";
};
