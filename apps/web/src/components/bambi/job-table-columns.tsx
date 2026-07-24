import type { DataColumn } from "@/components/bambi/data-table";
import { StatusBadge } from "@/components/bambi/status-badge";
import {
	EXPOSURE_TYPE_LABELS,
	expiryLabel,
	getExpiryTone,
	getJobDisplayStatus,
	PAYMENT_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";

// 행 필드 타입을 헬퍼에서 파생해 JobRow/PaymentJob에 직접 의존하지 않는다.
type JobStatusFields = Parameters<typeof getJobDisplayStatus>[0];
type ExposureEndsAt = Parameters<typeof expiryLabel>[0];

export function jobTitleColumn<T extends { title: string }>(): DataColumn<T> {
	return {
		id: "title",
		header: "공고 제목",
		sortValue: (row) => row.title,
		cell: (row) => (
			<span className="break-keep font-medium text-foreground">
				{row.title}
			</span>
		),
	};
}

// 헤더 "업소"로 통일(결제 관리의 "업체"를 흡수).
export function jobOrganizationColumn<
	T extends { organizationDisplayName: string },
>(): DataColumn<T> {
	return {
		id: "organizationDisplayName",
		header: "업소",
		sortValue: (row) => row.organizationDisplayName,
		cell: (row) => (
			<span className="break-keep text-muted-foreground">
				{row.organizationDisplayName}
			</span>
		),
	};
}

export function jobStatusColumn<T extends JobStatusFields>(): DataColumn<T> {
	return {
		id: "status",
		header: "공고 상태",
		sortValue: (row) =>
			getJobDisplayStatus({
				paymentStatus: row.paymentStatus,
				status: row.status,
			}).label,
		cell: (row) => {
			const display = getJobDisplayStatus({
				paymentStatus: row.paymentStatus,
				status: row.status,
			});

			return <StatusBadge tone={display.tone}>{display.label}</StatusBadge>;
		},
	};
}

export function exposureTypeColumn<
	T extends { exposureType: keyof typeof EXPOSURE_TYPE_LABELS },
>(): DataColumn<T> {
	return {
		id: "exposureType",
		header: "노출 상품",
		sortValue: (row) => EXPOSURE_TYPE_LABELS[row.exposureType],
		cell: (row) => (
			<StatusBadge>{EXPOSURE_TYPE_LABELS[row.exposureType]}</StatusBadge>
		),
	};
}

export function paymentStatusColumn<
	T extends { paymentStatus: keyof typeof PAYMENT_STATUS_LABELS },
>(): DataColumn<T> {
	return {
		id: "paymentStatus",
		header: "결제 상태",
		sortValue: (row) => PAYMENT_STATUS_LABELS[row.paymentStatus],
		cell: (row) => (
			<StatusBadge tone={row.paymentStatus === "paid" ? "good" : "warning"}>
				{PAYMENT_STATUS_LABELS[row.paymentStatus]}
			</StatusBadge>
		),
	};
}

// withRemainingDays=true: 공고 관리(헤더 "노출 마감", 배지 + 남은 일수).
// false: 결제 관리(헤더 "만료 상태", 배지만).
export function expiryColumn<
	T extends { exposureEndsAt: ExposureEndsAt },
>(options?: { header?: string; withRemainingDays?: boolean }): DataColumn<T> {
	const withRemainingDays = options?.withRemainingDays ?? false;
	const header =
		options?.header ?? (withRemainingDays ? "노출 마감" : "만료 상태");

	return {
		id: "expiry",
		header,
		sortValue: (row) =>
			withRemainingDays
				? (remainingDays(row.exposureEndsAt) ?? Number.POSITIVE_INFINITY)
				: expiryLabel(row.exposureEndsAt),
		cell: (row) => {
			const label = expiryLabel(row.exposureEndsAt);

			if (!withRemainingDays) {
				return <StatusBadge tone={getExpiryTone(label)}>{label}</StatusBadge>;
			}

			const days = remainingDays(row.exposureEndsAt);

			return (
				<div className="flex items-center gap-2">
					<StatusBadge tone={getExpiryTone(label)}>{label}</StatusBadge>
					{days !== null && days > 0 ? (
						<span className="whitespace-nowrap text-muted-foreground text-xs">
							{`${days}일`}
						</span>
					) : null}
				</div>
			);
		},
	};
}
