"use client";

import { isBoostPurchaseActive } from "@bambi-app/api/services/bambi-job-boost";
import { sumJobPaymentAmount } from "@bambi-app/api/services/bambi-job-detail-design";
import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { Ban, Info } from "lucide-react";
import { useEffect, useMemo } from "react";

import { AdPriceTag } from "@/components/bambi/ad-price-tag";
import { BankTransferGuide } from "@/components/bambi/bank-transfer-guide";
import {
	FieldError,
	FieldHint,
	FieldLabel,
} from "@/components/bambi/form-message";
import {
	type AdCatalogProduct,
	formatAdDuration,
	formatAdPrice,
	formatAdPriceLabel,
	resolveAdPrice,
} from "@/lib/bambi/ad-catalog";
import {
	formatBoostOptionSpec,
	JOB_BOOST_OPTION_TYPE_LABELS,
	type JobBoostOptionTypeKey,
} from "@/lib/bambi/boost-options";
import type { JobDetailDesignStatusKey } from "@/lib/bambi/exposure";
import type { JobFormErrors, JobPaymentMethod } from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

// 광고 상품을 고르지 않은 "일반 구인(무료)" 선택지를 나타내는 센티넬 값.
const FREE_EXPOSURE_VALUE = "__free__";

// 프리미엄 배너 풀로 통합된 미리보기 템플릿. 이 상품을 고르면 전체 정원·대기열이 적용된다.
const BANNER_PREVIEW_TEMPLATES: ReadonlySet<string> = new Set([
	"premium-top",
	"side-horizontal",
	"side-vertical",
]);

const premiumCapacityNote = (
	capacity: { capacity: number; remaining: number } | undefined
): string => {
	if (!capacity) {
		return "프리미엄 광고는 전체 정원 안에서 진행되며, 정원이 차면 대기열에 등록됩니다.";
	}

	if (capacity.remaining === 0) {
		return `프리미엄 광고 정원(${capacity.capacity}자리)이 가득 차, 신청하면 대기열에 등록됩니다. 자리가 나면 입금 확인 순으로 진행돼요.`;
	}

	return `프리미엄 광고 남은 자리 ${capacity.remaining}/${capacity.capacity} — 신청 후 입금이 확인되면 노출됩니다.`;
};

const paymentOptions: { label: string; value: JobPaymentMethod }[] = [
	{ label: "신용카드", value: "card" },
	{ label: "무통장입금", value: "bank_transfer" },
];

// 판매 중인 끌어올리기 옵션 한 줄(boostOptions.listOptions 응답 행).
interface BoostOptionRow {
	boostCount: null | number;
	boostsPerDay: null | number;
	durationDays: null | number;
	optionType: JobBoostOptionTypeKey;
	price: null | number;
}

// 수정 폼이 넘기는 기존 구매 요약(jobs.getEditableById.boostPurchases).
export interface JobBoostPurchaseSummary {
	expiresAt: Date | null;
	id: string;
	optionType: JobBoostOptionTypeKey;
	paymentStatus: string;
	remainingCount: null | number;
}

// 체크 고정(해제 불가) 대상 판정 = 이미 적용 중인 구매. 규칙은 서버와 한 벌로 유지해야
// 하므로 서비스의 순수 함수를 그대로 쓰고, 판정에 쓰이지 않는 칸만 자리값으로 채운다
// (편집 조회는 boostsPerDay·createdAt을 내려주지 않는다).
const isBoostPurchaseLocked = (
	purchase: JobBoostPurchaseSummary,
	now: Date
): boolean =>
	isBoostPurchaseActive(
		{ ...purchase, boostsPerDay: null, createdAt: now },
		now
	);

// 유형별 기존 구매 상태. locked = 입금 확인돼 적용 중(해제 불가·다시 받을 돈 아님),
// unpaid = 입금 대기(해제 가능·이미 청구된 금액). 맵에 없으면 "새로 결제되는 유형"이다.
// 화면의 체크 고정·총액·결제수단 노출이 전부 이 한 판정에서 갈린다.
export type BoostPurchaseState = "locked" | "unpaid";

export const getBoostPurchaseStates = (
	purchases: JobBoostPurchaseSummary[] | undefined,
	now: Date
): Map<JobBoostOptionTypeKey, BoostPurchaseState> => {
	const states = new Map<JobBoostOptionTypeKey, BoostPurchaseState>();

	for (const purchase of purchases ?? []) {
		if (isBoostPurchaseLocked(purchase, now)) {
			states.set(purchase.optionType, "locked");
			continue;
		}

		// 같은 유형에 만료된 구매와 입금 대기 구매가 함께 있어도 locked를 덮어쓰지 않는다.
		if (
			purchase.paymentStatus === "unpaid" &&
			!states.has(purchase.optionType)
		) {
			states.set(purchase.optionType, "unpaid");
		}
	}

	return states;
};

// 새로 결제되는 유형(= 기존 구매가 없는 유형). 결제수단 요구·노출·차단 축을
// validateJobForm의 newTypes와 한 규칙으로 맞추는 단일 소스다.
export const getNewBoostOptionTypes = (
	types: JobBoostOptionTypeKey[] | undefined,
	purchases: JobBoostPurchaseSummary[] | undefined,
	now: Date
): JobBoostOptionTypeKey[] => {
	const states = getBoostPurchaseStates(purchases, now);

	return (types ?? []).filter((optionType) => !states.has(optionType));
};

// 체크한 옵션들의 판매가 합. 카탈로그에 없는(판매 중지) 유형은 계산에서 빠진다 —
// 서버도 그런 유형은 구매로 만들지 않는다.
export const sumBoostOptionPrices = (
	options: BoostOptionRow[] | undefined,
	types: JobBoostOptionTypeKey[] | undefined
): number =>
	(options ?? [])
		.filter((option) => (types ?? []).includes(option.optionType))
		.reduce((sum, option) => sum + (option.price ?? 0), 0);

// 카드 내부 텍스트가 카드 밖으로 넘치지 않도록 min-w-0 + whitespace-normal + break-words로
// 줄바꿈을 허용한다.
// h-full: 같은 그리드 행에서 부모(ToggleGroup)가 items-stretch일 때 행 안의 가장 높은 카드에
// 맞춰 모든 카드 높이가 같아진다(그리드 행 트랙 자체는 항상 최대 콘텐츠 높이로 결정되므로,
// stretch가 걸려야 나머지 카드도 그 트랙 높이를 실제로 채운다).
// min-h-16: tagline 유무와 무관하게 카드가 시각적으로 너무 낮아지지 않도록 하는 바닥값(로딩
// Skeleton의 h-16과 맞춤). min-height라서 콘텐츠가 넘치면 자연히 더 커지고 텍스트는 잘리지 않는다.
// justify-start: 기본 toggleVariants가 justify-center를 주므로, 카드가 늘어났을 때도
// 상품명이 항상 위쪽에 고정되고 소개가 그 아래로 이어지도록 명시적으로 덮어쓴다.
const exposureToggleItemClassName =
	"h-full min-h-16 w-full min-w-0 flex-col items-start justify-start gap-1 whitespace-normal px-3 py-2.5 text-left";

const durationSelectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

interface JobExposureFieldsProps {
	adProductId: string | null;
	// 무료 공고에서 옵션만 결제할 때의 결제수단(유료 공고는 공고 결제수단을 쓴다).
	boostOptionPaymentMethod?: JobPaymentMethod | null;
	// 끌어올리기 옵션 네 값은 애드온(onDetailDesignChange)과 같은 규칙으로 optional이다 —
	// 콜백이 없으면 읽기 전용(운영자 편집)으로 보고 컨트롤 자체를 그리지 않는다. 서버도 운영자
	// 편집 경로에서는 옵션을 동결하므로, 켜고 끌 수 있는 UI를 내주면 거짓 화면이 된다.
	boostOptionTypes?: JobBoostOptionTypeKey[];
	// 수정 폼만 넘긴다. 이미 적용 중인 구매를 체크 고정하고, 입금 대기 건에 취소 안내를 붙인다.
	boostPurchases?: JobBoostPurchaseSummary[];
	detailDesignAmount: number | null;
	detailDesignRequested: boolean;
	// 애드온 제작 진행 상태. "completed"면 애드온을 동결한다(체크박스 비활성·자동 언체크 스킵).
	// 없으면(신규 등록·미신청) null.
	detailDesignStatus?: JobDetailDesignStatusKey | null;
	errors?: Pick<
		JobFormErrors,
		| "boostOptionPaymentMethod"
		| "exposureDurationDays"
		| "exposureType"
		| "paymentMethod"
	>;
	exposureAmount: number | null;
	exposureDurationDays: number | null;
	// 없으면 애드온을 읽기 전용으로 본다(운영자 편집 — 서버가 애드온을 동결하는 경로라
	// 켜고 끄는 컨트롤을 내주면 저장해도 아무 일이 없는 거짓 UI가 된다).
	onBoostOptionPaymentMethodChange?: (value: JobPaymentMethod) => void;
	onBoostOptionTypesChange?: (types: JobBoostOptionTypeKey[]) => void;
	onDetailDesignChange?: (requested: boolean, amount: number | null) => void;
	onDurationChange: (days: number | null, amount: number | null) => void;
	onPaymentMethodChange: (value: JobPaymentMethod) => void;
	onProductChange: (productId: string | null) => void;
	paymentMethod: JobPaymentMethod | null;
}

const isJobPaymentMethod = (value: string): value is JobPaymentMethod =>
	value === "card" || value === "bank_transfer";

type AdPriceOption = AdCatalogProduct["priceOptions"][number];

// 선택된 이용 기간에 해당하는 원가 옵션(없으면 undefined). 결제 예정 금액의 원가 취소선
// 표기에 쓴다.
const findDurationOption = (
	product: AdCatalogProduct | null,
	days: number | null
): AdPriceOption | undefined =>
	product && typeof days === "number"
		? product.priceOptions.find((priceOption) => priceOption.days === days)
		: undefined;

// 결제 예정 금액 = 노출 금액 + 디자인 제작 옵션 금액 + 끌어올리기 옵션 금액. 애드온이
// 하나도 없을 때는 기존처럼 원가 취소선(AdPriceTag)을 보여 주고, 애드온이 붙으면 총액 +
// 내역 한 줄로 바꾼다(취소선 뱃지 옆에 다른 금액을 더하면 어느 값이 결제액인지 읽히지 않는다).
// 무료 공고에서 끌어올리기 옵션만 산 경우에도 이 블록이 총액을 알린다(amount가 null이라
// "광고" 항목은 빠진다).
function PayableTotal({
	amount,
	boostAmount,
	detailDesignAmount,
	option,
	show,
}: {
	amount: number | null;
	boostAmount: number | null;
	detailDesignAmount: number | null;
	option: AdPriceOption | undefined;
	show: boolean;
}) {
	if (!show) {
		return null;
	}

	const total = sumJobPaymentAmount(
		sumJobPaymentAmount(amount, detailDesignAmount),
		boostAmount
	);
	const breakdown = [
		amount === null ? null : `광고 ${formatAdPrice(amount)}`,
		detailDesignAmount === null
			? null
			: `상세이미지 디자인 제작 ${formatAdPrice(detailDesignAmount)}`,
		boostAmount === null
			? null
			: `끌어올리기 옵션 ${formatAdPrice(boostAmount)}`,
	].filter((part): part is string => part !== null);

	return (
		<div className="flex flex-col gap-1 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="font-medium text-muted-foreground text-sm">
					결제 예정 금액
				</span>
				{option && detailDesignAmount === null && boostAmount === null ? (
					<AdPriceTag
						amount={option.amount}
						className="justify-end"
						discountPercent={option.discountPercent ?? 0}
						priceClassName="min-w-0 break-words font-semibold text-lg text-primary"
					/>
				) : (
					<span className="min-w-0 break-words font-semibold text-lg text-primary">
						{total === null ? "" : formatAdPrice(total)}
					</span>
				)}
			</div>
			{breakdown.length > 1 ? (
				<span className="text-muted-foreground text-xs">
					{breakdown.join(" + ")}
				</span>
			) : null}
		</div>
	);
}

// 상세이미지 디자인 제작 애드온. 상품에 옵션 가격이 있을 때만(price !== null) 낸다.
// onChange가 없으면 읽기 전용이라 컨트롤 자체를 그리지 않는다 — 운영자 편집은 서버가
// 애드온을 동결하므로, 켜고 끌 수 있는 체크박스를 내주면 저장해도 아무 일이 없는 거짓 UI다.
function DetailDesignOption({
	amount,
	onChange,
	price,
	requested,
	show,
	status,
}: {
	amount: number | null;
	onChange: ((requested: boolean, amount: null | number) => void) | undefined;
	price: number | null;
	requested: boolean;
	show: boolean;
	status: JobDetailDesignStatusKey | null;
}) {
	if (!(show && onChange)) {
		return null;
	}

	// 제작 완료 건은 애드온이 동결된다 — 서버가 신청 해제·금액 재산정을 막으므로 체크 상태
	// 그대로 비활성으로 보여 준다. 운영자가 옵션가를 지워도(price null) 결제·제작이 끝난
	// 스냅샷 금액(amount)으로 표시한다.
	if (status === "completed") {
		const frozenAmount = amount ?? price;

		return (
			<div className="flex items-start gap-2 rounded-lg border border-border p-3">
				<Checkbox
					checked
					className="mt-0.5"
					disabled
					id="detail-design-requested"
				/>
				<div className="flex min-w-0 flex-col gap-1">
					<Label htmlFor="detail-design-requested">
						상세이미지 디자인 제작
						{frozenAmount === null ? "" : ` +${formatAdPrice(frozenAmount)}`}
					</Label>
					<span className="text-muted-foreground text-xs">
						제작이 완료된 옵션은 변경할 수 없어요. 관련 문의는 운영자에게
						채팅으로 전달해 주세요.
					</span>
				</div>
			</div>
		);
	}

	if (price === null) {
		return null;
	}

	return (
		<div className="flex items-start gap-2 rounded-lg border border-border p-3">
			<Checkbox
				checked={requested}
				className="mt-0.5"
				id="detail-design-requested"
				onCheckedChange={(checked) =>
					onChange(checked === true, checked === true ? price : null)
				}
			/>
			<div className="flex min-w-0 flex-col gap-1">
				<Label htmlFor="detail-design-requested">
					상세이미지 디자인 제작 +{formatAdPrice(price)}
				</Label>
				<span className="text-muted-foreground text-xs">
					디자이너가 공고 상세페이지 이미지를 제작해 드립니다. 제작 요청 내용은
					결제 확인 후 운영자가 채팅으로 안내합니다.
				</span>
			</div>
		</div>
	);
}

// 결제 방법 선택 + 안내(미지원 카드 경고·무통장 계좌). 유료 공고 결제와 무료 공고의
// 끌어올리기 옵션 결제가 같은 컨트롤을 쓴다 — 두 곳에서 문구·경고가 갈라지지 않게 한 벌로 둔다.
function PaymentMethodField({
	amount,
	errorMessage,
	id,
	label,
	onChange,
	paymentMethod,
	purpose,
}: {
	amount: number | null;
	errorMessage: string | undefined;
	id: string;
	label: string;
	onChange: (value: JobPaymentMethod) => void;
	paymentMethod: JobPaymentMethod | null;
	// 입금이 여는 대상(계좌 안내 마지막 줄 문구). 무료 공고의 옵션 결제는 "boost".
	purpose: "boost" | "posting";
}) {
	return (
		<div className="flex flex-col gap-2">
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<ToggleGroup
				aria-label={label}
				className="grid w-full grid-cols-2 gap-2"
				onValueChange={(next) => {
					const selected = next.at(-1);

					if (selected && isJobPaymentMethod(selected)) {
						onChange(selected);
					}
				}}
				value={paymentMethod ? [paymentMethod] : []}
				variant="outline"
			>
				{paymentOptions.map((option) => (
					<ToggleGroupItem
						className="w-full"
						key={option.value}
						value={option.value}
					>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<FieldError id={`${id}-error`} message={errorMessage} />
			{paymentMethod === "card" ? (
				<Alert variant="warning">
					<Ban />
					<AlertDescription>
						신용카드는 아직 지원하지 않는 결제 방법입니다. 곧 지원할 예정이에요.
						지금은 무통장입금으로 진행해 주세요.
					</AlertDescription>
				</Alert>
			) : null}
			{paymentMethod === "bank_transfer" ? (
				<Alert>
					<Info />
					<AlertDescription>
						<BankTransferGuide amount={amount} purpose={purpose} />
					</AlertDescription>
				</Alert>
			) : null}
		</div>
	);
}

// 기본값을 인라인 []로 두면 렌더마다 새 배열이 되어 아래 정리 effect가 매번 다시 돈다.
const NO_BOOST_OPTION_TYPES: JobBoostOptionTypeKey[] = [];

const boostOptionCheckboxId = (optionType: JobBoostOptionTypeKey) =>
	`boost-option-${optionType}`;

// 끌어올리기 추가 옵션 피커. 판매 중인 옵션(listOptions)만 유형별 체크박스로 낸다.
// 배너형 상품은 끌어올리기 대상이 아니라(서버도 거부) show=false로 통째로 숨는다.
// 수정 폼은 기존 구매를 함께 받아, 이미 적용 중인(paid·활성) 유형은 체크 고정·비활성으로
// 두고 입금 대기(unpaid) 유형만 해제할 수 있게 한다.
function BoostOptionsPicker({
	onTypesChange,
	options,
	purchaseStates,
	selectedTypes,
	show,
}: {
	onTypesChange: ((types: JobBoostOptionTypeKey[]) => void) | undefined;
	options: BoostOptionRow[];
	purchaseStates: Map<JobBoostOptionTypeKey, BoostPurchaseState>;
	selectedTypes: JobBoostOptionTypeKey[];
	show: boolean;
}) {
	if (!(show && onTypesChange && options.length > 0)) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			<FieldLabel
				htmlFor={boostOptionCheckboxId(
					options[0]?.optionType ?? "manual_period"
				)}
				optional
			>
				끌어올리기 옵션
			</FieldLabel>
			<FieldHint>
				결제가 확인되면 공고를 목록 위로 다시 올려 줍니다. 유형별로 하나씩
				신청할 수 있어요.
			</FieldHint>
			{options.map((option) => {
				const purchaseState = purchaseStates.get(option.optionType);
				const locked = purchaseState === "locked";
				const hasUnpaid = purchaseState === "unpaid";
				const checked = locked || selectedTypes.includes(option.optionType);
				const spec = formatBoostOptionSpec(option);

				return (
					<div
						className="flex items-start gap-2 rounded-lg border border-border p-3"
						key={option.optionType}
					>
						<Checkbox
							checked={checked}
							className="mt-0.5"
							disabled={locked}
							id={boostOptionCheckboxId(option.optionType)}
							onCheckedChange={(next) =>
								onTypesChange(
									next === true
										? [...selectedTypes, option.optionType]
										: selectedTypes.filter((type) => type !== option.optionType)
								)
							}
						/>
						<div className="flex min-w-0 flex-col gap-1">
							<Label htmlFor={boostOptionCheckboxId(option.optionType)}>
								{JOB_BOOST_OPTION_TYPE_LABELS[option.optionType]}
								{spec ? ` · ${spec}` : ""} +{formatAdPrice(option.price ?? 0)}
							</Label>
							{locked ? (
								<span className="text-muted-foreground text-xs">
									이미 적용 중인 옵션이에요. 기간이 끝난 뒤 다시 신청할 수
									있습니다.
								</span>
							) : null}
							{!locked && hasUnpaid && checked ? (
								<span className="text-muted-foreground text-xs">
									해제하면 입금 대기 건이 취소돼요.
								</span>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// 결제 총액에 실제로 더할 애드온 금액. 상품이 옵션을 제공하지 않으면(price === null)
// 폼에 남은 금액이 있어도 무시한다 — 서버도 그 조합을 저장하지 않는다.
const resolveAppliedDetailDesignAmount = ({
	amount,
	price,
	requested,
	status,
}: {
	amount: number | null;
	price: number | null;
	requested: boolean;
	status: JobDetailDesignStatusKey | null;
}): number | null => {
	// 완료 건은 옵션가가 사라져도 결제·제작이 끝난 스냅샷 금액을 총액에 그대로 유지한다
	// (화면 총액이 이미 결제된 금액과 일치한다).
	if (status === "completed") {
		return amount;
	}

	return price !== null && requested ? amount : null;
};

// 신청해 둔 애드온 상태를 현재 상품 가격에 맞춘다. 운영자가 상품 가격을 바꾸면 폼이 들고
// 있던 스냅샷이 낡으므로, 노출 금액과 같은 방식으로 최신 가격을 되돌려 서버 CONFLICT
// (가격 변경 재확인)를 미리 없앤다. 옵션이 없는 상품으로 바꾸면 신청 상태 자체를 내려놓는다
// (서버가 BAD_REQUEST로 막는 조합).
// productResolved: 카탈로그가 아직 로딩 중이면 선택 상품을 못 찾아 가격이 null로 보인다.
// 그 값을 믿고 정리하면 수정 폼이 프리필한 신청 상태가 로딩 한 프레임에 조용히 풀린다.
const useDetailDesignPriceSync = ({
	amount,
	onChange,
	price,
	productResolved,
	requested,
	status,
}: {
	amount: number | null;
	onChange: ((requested: boolean, amount: null | number) => void) | undefined;
	price: number | null;
	productResolved: boolean;
	requested: boolean;
	status: JobDetailDesignStatusKey | null;
}) => {
	useEffect(() => {
		// 완료 건은 애드온이 동결된다 — 옵션가가 사라져도 자동 언체크하지 않고, 상품가가
		// 바뀌어도 신가로 덮어쓰지 않는다. 서버가 완료 건의 해제·재산정을 막으므로 폼이
		// 프리필한 스냅샷을 그대로 둔다(강제 언체크 시 서버 completed_locked로 저장 봉쇄).
		if (status === "completed") {
			return;
		}

		if (!(requested && productResolved)) {
			return;
		}

		if (price === null) {
			onChange?.(false, null);
			return;
		}

		if (price !== amount) {
			onChange?.(true, price);
		}
	}, [amount, onChange, price, productResolved, requested, status]);
};

// 이용 기간 선택값 → {기간, 결제 금액}. 결제 금액은 할인가로 확정한다(서버 스냅샷과 동일 계산).
const resolveDurationSelection = (
	value: string | null,
	product: AdCatalogProduct | null
): { amount: number | null; days: number | null } => {
	const days = value ? Number(value) : null;
	const option = findDurationOption(product, days);

	return {
		amount: option
			? resolveAdPrice(option.amount, option.discountPercent ?? 0)
					.discountedAmount
			: null,
		days: option?.days ?? null,
	};
};

export function JobExposureFields({
	adProductId,
	boostOptionPaymentMethod = null,
	boostOptionTypes = NO_BOOST_OPTION_TYPES,
	boostPurchases,
	detailDesignAmount,
	detailDesignRequested,
	detailDesignStatus = null,
	errors,
	exposureAmount,
	exposureDurationDays,
	onBoostOptionPaymentMethodChange,
	onBoostOptionTypesChange,
	onDetailDesignChange,
	onDurationChange,
	onPaymentMethodChange,
	onProductChange,
	paymentMethod,
}: JobExposureFieldsProps) {
	const catalogQuery = useQuery({
		...orpc.bambi.adProducts.getCatalog.queryOptions(),
		refetchOnWindowFocus: true,
	});
	const products = useMemo<AdCatalogProduct[]>(
		() => (catalogQuery.data ?? []).flatMap((placement) => placement.products),
		[catalogQuery.data]
	);
	const capacityQuery = useQuery(
		orpc.bambi.adProducts.premiumCapacity.queryOptions()
	);
	const selectedProduct =
		products.find((product) => product.id === adProductId) ?? null;
	const isBannerProduct = selectedProduct
		? BANNER_PREVIEW_TEMPLATES.has(selectedProduct.previewTemplate)
		: false;
	const toggleValue = adProductId ?? FREE_EXPOSURE_VALUE;
	const showPaidOptions = Boolean(selectedProduct);
	// 결제 예정 금액의 원가 취소선 표기를 위해 선택된 기간의 원가 옵션을 함께 잡아둔다.
	const selectedDurationOption = findDurationOption(
		selectedProduct,
		exposureDurationDays
	);
	const boostOptionsQuery = useQuery(
		orpc.bambi.boostOptions.listOptions.queryOptions()
	);
	// 배너형 상품에는 끌어올리기 옵션을 팔지 않는다(서버도 BAD_REQUEST). 카탈로그가 로딩 중이면
	// 선택 상품을 못 찾아 isBannerProduct가 false라, 로딩 한 프레임에 체크가 풀리는 일은 없다.
	const showBoostOptions = !isBannerProduct;
	const boostPurchaseStates = getBoostPurchaseStates(
		boostPurchases,
		new Date()
	);
	// 결제 예정 금액에서 이미 입금 확인된(적용 중) 유형은 뺀다 — 다시 받을 돈이 아니다.
	// 입금 대기(unpaid)는 아직 안 낸 돈이라 총액에 남긴다.
	const payableBoostTypes = boostOptionTypes.filter(
		(optionType) => boostPurchaseStates.get(optionType) !== "locked"
	);
	// 결제수단을 요구·차단하는 축은 "새로 결제되는 유형"이다(validateJobForm과 같은 규칙).
	const newBoostOptionTypes = boostOptionTypes.filter(
		(optionType) => !boostPurchaseStates.has(optionType)
	);
	const boostOptionsAmount = showBoostOptions
		? sumBoostOptionPrices(boostOptionsQuery.data, payableBoostTypes)
		: 0;
	const boostAmount = boostOptionsAmount > 0 ? boostOptionsAmount : null;
	const showTotal =
		(showPaidOptions &&
			typeof exposureDurationDays === "number" &&
			typeof exposureAmount === "number") ||
		boostAmount !== null;
	// 상품에 옵션 가격이 설정된 경우에만 애드온을 연다(null = 미제공).
	const detailDesignPrice = selectedProduct?.detailDesignPrice ?? null;
	const appliedDetailDesignAmount = resolveAppliedDetailDesignAmount({
		amount: detailDesignAmount,
		price: detailDesignPrice,
		requested: detailDesignRequested,
		status: detailDesignStatus,
	});
	// 무통장입금 안내에도 같은 총액을 쓴다 — 노출 금액만 안내하면 애드온만큼 덜 입금된다.
	const payableTotal = sumJobPaymentAmount(
		sumJobPaymentAmount(exposureAmount, appliedDetailDesignAmount),
		boostAmount
	);
	const nextPricingChangeAt = useMemo(() => {
		const futureBoundaries = products
			.flatMap((product) => product.priceOptions)
			.map((option) => option.nextPricingChangeAt)
			.filter((value): value is Date => value instanceof Date)
			.map((value) => value.getTime())
			.filter((value) => value > Date.now());

		return futureBoundaries.length > 0 ? Math.min(...futureBoundaries) : null;
	}, [products]);

	useEffect(() => {
		if (nextPricingChangeAt === null) {
			return;
		}

		const timeout = window.setTimeout(
			() => {
				catalogQuery.refetch().catch(() => undefined);
			},
			Math.max(0, nextPricingChangeAt - Date.now()) + 250
		);

		return () => window.clearTimeout(timeout);
	}, [catalogQuery.refetch, nextPricingChangeAt]);

	useEffect(() => {
		if (!selectedDurationOption || exposureDurationDays === null) {
			return;
		}

		const currentAmount = resolveAdPrice(
			selectedDurationOption.amount,
			selectedDurationOption.discountPercent ?? 0
		).discountedAmount;
		if (currentAmount !== exposureAmount) {
			onDurationChange(exposureDurationDays, currentAmount);
		}
	}, [
		exposureAmount,
		exposureDurationDays,
		onDurationChange,
		selectedDurationOption,
	]);

	// 배너형 상품으로 바꾸면 옵션 자체가 사라지므로 체크도 비운다 — 남겨 두면 저장할 때
	// 서버가 "배너 광고 공고에는 끌어올리기 옵션을 제공하지 않습니다"로 막는다.
	useEffect(() => {
		if (isBannerProduct && boostOptionTypes.length > 0) {
			onBoostOptionTypesChange?.([]);
		}
	}, [boostOptionTypes, isBannerProduct, onBoostOptionTypesChange]);

	useDetailDesignPriceSync({
		amount: detailDesignAmount,
		onChange: onDetailDesignChange,
		price: detailDesignPrice,
		productResolved: showPaidOptions,
		requested: detailDesignRequested,
		status: detailDesignStatus,
	});

	const handleExposureValueChange = (value: string[]) => {
		const next = value.at(-1);

		if (!next || next === FREE_EXPOSURE_VALUE) {
			onProductChange(null);
			return;
		}

		if (products.some((product) => product.id === next)) {
			onProductChange(next);
		}
	};

	const handleDurationValueChange = (value: string | null) => {
		const selection = resolveDurationSelection(value, selectedProduct);
		onDurationChange(selection.days, selection.amount);
	};

	return (
		<section aria-labelledby="new-exposure" className="flex flex-col gap-3">
			<div>
				<h2 className="font-semibold text-lg" id="new-exposure">
					노출 상품·결제
				</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					운영자가 등록한 노출 상품 중에서 고르고, 이용 기간과 결제 방법을
					선택하세요.
				</p>
			</div>
			<Card>
				<CardContent className="grid gap-6">
					<div className="flex flex-col gap-2">
						<FieldLabel htmlFor="exposureType">노출 상품</FieldLabel>
						{catalogQuery.isLoading ? (
							<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-16 w-full" />
							</div>
						) : (
							<ToggleGroup
								aria-label="노출 상품"
								className="grid w-full grid-cols-1 items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-3"
								onValueChange={handleExposureValueChange}
								value={[toggleValue]}
								variant="outline"
							>
								{products.map((product) => (
									<ToggleGroupItem
										className={exposureToggleItemClassName}
										key={product.id}
										value={product.id}
									>
										<span className="w-full text-balance break-words font-medium text-sm">
											{product.name}
										</span>
										{product.tagline ? (
											<span className="w-full break-words text-muted-foreground text-xs">
												{product.tagline}
											</span>
										) : null}
									</ToggleGroupItem>
								))}
								<ToggleGroupItem
									className={exposureToggleItemClassName}
									value={FREE_EXPOSURE_VALUE}
								>
									<span className="w-full text-balance break-words font-medium text-sm">
										일반 구인(무료)
									</span>
									<span className="w-full break-words text-muted-foreground text-xs">
										일반 목록에 노출합니다. 추가 비용이 없습니다.
									</span>
								</ToggleGroupItem>
							</ToggleGroup>
						)}
						<FieldError
							id="exposureType-error"
							message={errors?.exposureType}
						/>
						{isBannerProduct ? (
							<Alert>
								<Info />
								<AlertDescription>
									{premiumCapacityNote(capacityQuery.data)}
								</AlertDescription>
							</Alert>
						) : null}
					</div>

					{showPaidOptions ? (
						<div className="flex flex-col gap-2">
							<FieldLabel htmlFor="exposureDurationDays">이용 기간</FieldLabel>
							<Select
								items={(selectedProduct?.priceOptions ?? []).map(
									(priceOption) => ({
										label: `${formatAdDuration(priceOption.days)} · ${formatAdPriceLabel(
											priceOption.amount,
											priceOption.discountPercent ?? 0
										)}`,
										value: String(priceOption.days),
									})
								)}
								name="exposureDurationDays"
								onValueChange={handleDurationValueChange}
								value={exposureDurationDays ? String(exposureDurationDays) : ""}
							>
								<SelectTrigger
									aria-describedby={
										errors?.exposureDurationDays
											? "exposureDurationDays-error"
											: undefined
									}
									aria-invalid={Boolean(errors?.exposureDurationDays)}
									className={durationSelectTriggerClassName}
									id="exposureDurationDays"
								>
									<SelectValue placeholder="이용 기간을 선택하세요" />
								</SelectTrigger>
								<SelectContent>
									{selectedProduct?.priceOptions.map((priceOption) => (
										<SelectItem
											key={priceOption.days}
											value={String(priceOption.days)}
										>
											{formatAdDuration(priceOption.days)} ·{" "}
											<AdPriceTag
												amount={priceOption.amount}
												discountPercent={priceOption.discountPercent ?? 0}
												priceClassName="font-medium"
											/>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldError
								id="exposureDurationDays-error"
								message={errors?.exposureDurationDays}
							/>
						</div>
					) : null}

					<DetailDesignOption
						amount={detailDesignAmount}
						onChange={onDetailDesignChange}
						price={detailDesignPrice}
						requested={detailDesignRequested}
						show={showPaidOptions}
						status={detailDesignStatus}
					/>

					<BoostOptionsPicker
						onTypesChange={onBoostOptionTypesChange}
						options={boostOptionsQuery.data ?? []}
						purchaseStates={boostPurchaseStates}
						selectedTypes={boostOptionTypes}
						show={showBoostOptions}
					/>

					<PayableTotal
						amount={exposureAmount}
						boostAmount={boostAmount}
						detailDesignAmount={appliedDetailDesignAmount}
						option={selectedDurationOption}
						show={showTotal}
					/>

					{showPaidOptions ? (
						<PaymentMethodField
							amount={payableTotal}
							errorMessage={errors?.paymentMethod}
							id="paymentMethod"
							label="결제 방법"
							onChange={onPaymentMethodChange}
							paymentMethod={paymentMethod}
							purpose="posting"
						/>
					) : null}

					{/* 무료 공고는 공고 결제수단이 없어, 새로 결제되는 옵션이 있을 때만 옵션 전용
					결제수단을 받는다(이미 입금 대기·적용 중인 유형만 유지하는 저장은 결제가 없다). */}
					{showPaidOptions ||
					newBoostOptionTypes.length === 0 ||
					!onBoostOptionPaymentMethodChange ? null : (
						<PaymentMethodField
							amount={boostAmount}
							errorMessage={errors?.boostOptionPaymentMethod}
							id="boostOptionPaymentMethod"
							label="끌어올리기 옵션 결제 방법"
							onChange={onBoostOptionPaymentMethodChange}
							paymentMethod={boostOptionPaymentMethod}
							purpose="boost"
						/>
					)}

					<Alert>
						<Info />
						<AlertDescription>
							결제는 운영자 확인 후 완료되며, 검수·결제완료 시 게시됩니다.
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		</section>
	);
}
