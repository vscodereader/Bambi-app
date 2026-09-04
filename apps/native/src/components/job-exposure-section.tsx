import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useQuery } from "@tanstack/react-query";
import {
	Alert,
	Button,
	FieldError,
	Input,
	Label,
	TextField,
} from "heroui-native";
import type { ReactElement, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import {
	CARD_PAYMENT_NOTICE,
	FREE_EXPOSURE_LABEL,
	formatAdPrice,
	formatAdPriceLabel,
	type NativeExposureState,
	resolveAdAmount,
	resolvePayableAmount,
	resolveUsablePoints,
	validatePointsToUse,
} from "@/src/lib/employer/ad-exposure";
import { orpc } from "@/src/lib/orpc";

// 타입 홈은 ad-exposure.ts로 옮겼다 — 기존 소비자(native-job-form 등)가 이 경로로 계속 쓰도록 재노출한다.
export type { NativeExposureState } from "@/src/lib/employer/ad-exposure";

// oRPC 반환 타입에서 카탈로그·계좌 타입을 파생한다(web ad-catalog와 같은 단일 소스 방식) —
// 서버 응답 필드가 바뀌면 여기 타입도 함께 따라온다.
type AdCatalogPlacement = Awaited<
	ReturnType<AppRouterClient["bambi"]["adProducts"]["getCatalog"]>
>[number];
type AdCatalogProduct = AdCatalogPlacement["products"][number];
type AdPriceOption = AdCatalogProduct["priceOptions"][number];
type PaymentAccount = Awaited<
	ReturnType<AppRouterClient["bambi"]["siteSettings"]["getPaymentAccounts"]>
>[number];

// 프리미엄 배너 풀로 통합된 미리보기 템플릿. 이 상품을 고르면 전체 정원·대기열 안내를 붙인다.
// 레거시 side-* 도 서버에서 프리미엄 풀로 흡수되므로 같은 정원을 쓴다(web BANNER_PREVIEW_TEMPLATES와 동일).
const PREMIUM_TEMPLATES: ReadonlySet<string> = new Set([
	"premium-top",
	"side-horizontal",
	"side-vertical",
]);

// 프리미엄 정원 안내 문구. 응답이 없으면(로딩) 일반 안내, 만석이면 대기열 톤으로 바꾼다
// (web premiumCapacityNote와 같은 규칙).
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

// 상품 카드의 "최저가" — 옵션들 중 할인 적용가가 가장 낮은 값. 상품마다 기간별 가격이 여러 개라
// 카드에서는 시작가만 한 줄로 알린다.
const lowestProductAmount = (product: AdCatalogProduct): number =>
	product.priceOptions.reduce(
		(min, option) =>
			Math.min(min, resolveAdAmount(option.amount, option.discountPercent)),
		Number.POSITIVE_INFINITY
	);

// 선택 카드 테두리는 두께를 항상 2로 두고 색만 바꾼다 — 선택/비선택에서 1px 레이아웃 흔들림이 없다.
const cardClassName = (selected: boolean): string =>
	selected
		? "gap-1 rounded-lg border-2 border-accent bg-surface-secondary p-3"
		: "gap-1 rounded-lg border-2 border-border bg-surface p-3";

// 기간 칩도 같은 규칙(두께 고정·색만). 터치 타깃 44dp를 위해 min-h-11.
const chipClassName = (selected: boolean): string =>
	selected
		? "min-h-11 justify-center rounded-lg border-2 border-accent bg-surface-secondary px-3 py-2"
		: "min-h-11 justify-center rounded-lg border-2 border-border bg-surface px-3 py-2";

// 상품 선택 — 맨 위 무료 선택지 + 게재 위치별 상품 카드.
function ProductPicker({
	isLoading,
	onSelectFree,
	onSelectProduct,
	placements,
	selectedProductId,
}: {
	isLoading: boolean;
	onSelectFree: () => void;
	onSelectProduct: (product: AdCatalogProduct) => void;
	placements: AdCatalogPlacement[];
	selectedProductId: string | undefined;
}): ReactElement {
	return (
		<View className="gap-3">
			<Text className="font-semibold text-foreground text-sm">노출 상품</Text>

			<Pressable
				accessibilityRole="button"
				accessibilityState={{ selected: selectedProductId === undefined }}
				className={cardClassName(selectedProductId === undefined)}
				onPress={onSelectFree}
			>
				<Text className="font-medium text-foreground text-sm">
					{FREE_EXPOSURE_LABEL}
				</Text>
				<Text className="text-muted text-xs">
					일반 목록에 노출합니다. 추가 비용이 없습니다.
				</Text>
			</Pressable>

			{isLoading ? (
				<Text className="text-muted text-xs">
					노출 상품을 불러오는 중이에요.
				</Text>
			) : null}

			{placements.map((placement) =>
				placement.products.length === 0 ? null : (
					<View className="gap-2" key={placement.id}>
						<Text className="text-muted text-xs">{placement.name}</Text>
						{placement.products.map((product) => {
							const selected = selectedProductId === product.id;
							const lowest = lowestProductAmount(product);

							return (
								<Pressable
									accessibilityRole="button"
									accessibilityState={{ selected }}
									className={cardClassName(selected)}
									key={product.id}
									onPress={() => onSelectProduct(product)}
								>
									<Text className="font-medium text-foreground text-sm">
										{product.name}
									</Text>
									{product.tagline ? (
										<Text className="text-muted text-xs">
											{product.tagline}
										</Text>
									) : null}
									{product.benefits.length > 0 ? (
										<Text className="text-muted text-xs">
											{product.benefits.join(" · ")}
										</Text>
									) : null}
									{Number.isFinite(lowest) ? (
										<Text className="font-medium text-foreground text-xs">
											{`${formatAdPrice(lowest)}부터`}
										</Text>
									) : null}
								</Pressable>
							);
						})}
					</View>
				)
			)}
		</View>
	);
}

// 기간 선택 — 선택 상품의 priceOptions를 칩으로. 선택 상품이 없으면 렌더하지 않는다.
function DurationPicker({
	onSelect,
	product,
	selectedDays,
}: {
	onSelect: (option: AdPriceOption) => void;
	product: AdCatalogProduct | null;
	selectedDays: number | undefined;
}): ReactElement | null {
	if (!product) {
		return null;
	}

	return (
		<View className="gap-2">
			<Text className="font-semibold text-foreground text-sm">이용 기간</Text>
			<View className="flex-row flex-wrap gap-2">
				{product.priceOptions.map((option) => {
					const selected = selectedDays === option.days;

					return (
						<Pressable
							accessibilityRole="button"
							accessibilityState={{ selected }}
							className={chipClassName(selected)}
							key={option.days}
							onPress={() => onSelect(option)}
						>
							<Text className="text-foreground text-sm">
								{`${option.days}일 · ${formatAdPriceLabel(option.amount, option.discountPercent)}`}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

// 포인트 사용 입력 + 전액 사용. 실제로 쓸 수 있을 때만 부모가 렌더한다.
function PointsField({
	balance,
	errorMessage,
	onChangeText,
	onUseAll,
	pointsToUse,
	usablePoints,
}: {
	balance: number;
	errorMessage: string | null;
	onChangeText: (text: string) => void;
	onUseAll: () => void;
	pointsToUse: number;
	usablePoints: number;
}): ReactElement {
	return (
		<View className="gap-2">
			<TextField isInvalid={Boolean(errorMessage)}>
				<Label>포인트 사용</Label>
				<Input
					keyboardType="number-pad"
					onChangeText={onChangeText}
					placeholder="0"
					value={pointsToUse > 0 ? String(pointsToUse) : ""}
				/>
				<FieldError>{errorMessage ?? undefined}</FieldError>
			</TextField>
			<View className="flex-row items-center justify-between gap-3">
				<Text className="text-muted text-xs">
					{`보유 ${formatAdPrice(balance)} · 이번 결제 최대 ${formatAdPrice(usablePoints)}`}
				</Text>
				<Button onPress={onUseAll} size="sm" variant="secondary">
					<Button.Label>전액 사용</Button.Label>
				</Button>
			</View>
		</View>
	);
}

// 결제수단 — 무통장입금 고정, 신용카드는 준비 중이라 비활성. 값은 항상 무통장입금이라 컨트롤은
// 표시 전용이다(눌리는 카드 옵션 자체가 없어 오해가 없다).
function PaymentMethodPicker(): ReactElement {
	return (
		<View className="gap-2">
			<Text className="font-semibold text-foreground text-sm">결제 방법</Text>
			<View className="flex-row gap-2">
				<View className="min-h-11 flex-1 justify-center rounded-lg border-2 border-accent bg-surface-secondary px-3 py-2">
					<Text className="text-center text-foreground text-sm">
						무통장입금
					</Text>
				</View>
				{/* 눌리지 않는다는 게 분명하도록 반투명 + "준비 중". Pressable이 아니다. */}
				<View className="min-h-11 flex-1 justify-center rounded-lg border-2 border-border bg-surface px-3 py-2 opacity-50">
					<Text className="text-center text-muted text-sm">
						신용카드 (준비 중)
					</Text>
				</View>
			</View>
			<Text className="text-muted text-xs">{CARD_PAYMENT_NOTICE}</Text>
		</View>
	);
}

// 결제 요약 — 노출 금액 → 포인트 차감 → 입금 예정 금액.
function PaymentSummary({
	gross,
	pointsToUse,
}: {
	gross: number;
	pointsToUse: number;
}): ReactElement {
	return (
		<View className="gap-1 rounded-lg border border-border bg-surface-secondary px-4 py-3">
			<View className="flex-row items-center justify-between gap-2">
				<Text className="text-muted text-sm">노출 금액</Text>
				<Text className="text-foreground text-sm">{formatAdPrice(gross)}</Text>
			</View>
			{pointsToUse > 0 ? (
				<View className="flex-row items-center justify-between gap-2">
					<Text className="text-muted text-sm">포인트 사용</Text>
					<Text className="text-foreground text-sm">
						{`- ${formatAdPrice(pointsToUse)}`}
					</Text>
				</View>
			) : null}
			<View className="flex-row items-center justify-between gap-2">
				<Text className="font-medium text-muted text-sm">입금 예정 금액</Text>
				<Text className="font-semibold text-accent text-lg">
					{formatAdPrice(resolvePayableAmount(gross, pointsToUse))}
				</Text>
			</View>
		</View>
	);
}

// 무통장 계좌 안내 — 유료 선택일 때만 부모가 렌더한다.
function BankAccounts({
	accounts,
}: {
	accounts: PaymentAccount[];
}): ReactElement {
	return (
		<View className="gap-2">
			<Text className="font-semibold text-foreground text-sm">입금 계좌</Text>
			{accounts.length > 0 ? (
				<View className="gap-2">
					{accounts.map((account) => (
						<View
							className="gap-0.5 rounded-lg border border-border bg-surface px-3 py-2"
							key={`${account.bank}-${account.accountNumber}`}
						>
							<Text className="font-medium text-foreground text-sm" selectable>
								{`${account.bank} ${account.accountNumber}`}
							</Text>
							<Text className="text-muted text-xs">
								{`예금주 ${account.holder}`}
							</Text>
						</View>
					))}
					<Text className="text-muted text-xs">
						입금자명은 업체명(상호)과 동일하게 입금해 주세요. 입금 확인 후
						공고가 게시됩니다.
					</Text>
				</View>
			) : (
				<Text className="text-danger text-xs">
					입금 계좌가 준비되기 전이라 무통장입금으로 등록할 수 없어요.
					고객센터로 문의해 주세요.
				</Text>
			)}
		</View>
	);
}

// 노출 상품·결제 섹션 본문. 모든 서버 조회·파생·값 변경 로직이 여기 모인다 — 표시
// 컴포넌트들에 props로 내려준다. 예전엔 요약 행+전체화면 모달이 이 파일에 있었지만, 이제
// 폼이 2단계(작성 → 노출·결제)를 소유하고 그 2단계 화면이 이 섹션을 그대로 스크롤에 담는다.
// 그래서 여기는 껍데기 없이 내용만 렌더한다(유일한 소비자는 폼이다).
export function JobExposureSection({
	bannerSlot,
	errorMessage,
	onChange,
	value,
}: {
	bannerSlot?: ReactNode;
	// 필수 배너 미충족 게이트 메시지. 배너 슬롯 옆에 붙여 어디를 채워야 하는지 짚어 준다.
	errorMessage?: string;
	onChange: (next: NativeExposureState) => void;
	value: NativeExposureState;
}): ReactElement {
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.getCatalog.queryOptions()
	);
	const placements = catalogQuery.data ?? [];
	const selectedProduct =
		placements
			.flatMap((placement) => placement.products)
			.find((product) => product.id === value.selection?.adProductId) ?? null;

	const isPremiumSelection = value.selection
		? PREMIUM_TEMPLATES.has(value.selection.previewTemplate)
		: false;
	// 프리미엄 정원은 프리미엄 상품을 고른 동안에만 조회한다 — 그 외에는 서버를 두드릴 이유가 없다.
	const premiumCapacityQuery = useQuery({
		...orpc.bambi.adProducts.premiumCapacity.queryOptions(),
		enabled: isPremiumSelection,
	});

	const gross = value.selection?.amount ?? 0;
	const isPaid = value.selection !== null && gross > 0;

	// 포인트 상한·검증에 쓰는 운영자 설정 + 보유 포인트. 유료 선택일 때만 조회한다.
	const jobPaymentQuery = useQuery({
		...orpc.bambi.pointSettings.getJobPayment.queryOptions(),
		enabled: isPaid,
	});
	const jobPayment = jobPaymentQuery.data;
	const usablePoints =
		jobPayment && gross > 0
			? resolveUsablePoints({
					balance: jobPayment.balance,
					grossAmount: gross,
					maxPoints: jobPayment.jobPaymentMaxPoints,
				})
			: 0;
	const minPoints = jobPayment?.jobPaymentMinPoints ?? 0;
	// 포인트를 실제로 쓸 수 있는 조건: 유료 선택 + 운영자가 최소 단위를 열어 뒀고 + 이번에 쓸
	// 수 있는 상한이 최소 단위 이상. 그 외에는 섹션 자체를 숨겨 거짓 입력칸을 없앤다.
	const pointsEnabled = isPaid && minPoints > 0 && usablePoints >= minPoints;

	// 무통장 계좌 안내. 유료 선택일 때만 조회한다.
	const accountsQuery = useQuery({
		...orpc.bambi.siteSettings.getPaymentAccounts.queryOptions(),
		enabled: isPaid,
	});

	// 상품을 바꾸면 포인트가 새 상한을 넘지 않도록 클램프한다. 포인트 설정을 아직 못 읽었으면
	// 검증 단계에서 걸러지므로 값을 건드리지 않는다.
	const clampPoints = (points: number, grossAmount: number): number => {
		if (!jobPayment) {
			return points;
		}

		const usable = resolveUsablePoints({
			balance: jobPayment.balance,
			grossAmount,
			maxPoints: jobPayment.jobPaymentMaxPoints,
		});

		return Math.min(Math.max(0, points), usable);
	};

	// 상품을 고르면 기간은 첫 옵션으로, 금액은 그 할인가로 확정하고 포인트는 새 상한으로 클램프한다.
	const selectProduct = (product: AdCatalogProduct) => {
		const first = product.priceOptions[0];

		if (!first) {
			return;
		}

		const amount = resolveAdAmount(first.amount, first.discountPercent);

		onChange({
			paymentMethod: "bank_transfer",
			pointsToUse: clampPoints(value.pointsToUse, amount),
			selection: {
				adProductId: product.id,
				amount,
				durationDays: first.days,
				previewTemplate: product.previewTemplate,
				productName: product.name,
			},
		});
	};

	// 기간만 바꾼다 — 상품·이름은 유지하고 금액/일수와 포인트 상한만 재계산한다.
	const selectDuration = (option: AdPriceOption) => {
		if (!value.selection) {
			return;
		}

		const amount = resolveAdAmount(option.amount, option.discountPercent);

		onChange({
			...value,
			pointsToUse: clampPoints(value.pointsToUse, amount),
			selection: { ...value.selection, amount, durationDays: option.days },
		});
	};

	const handlePointsText = (text: string) => {
		const digits = text.replace(/[^0-9]/gu, "");
		const parsed = digits === "" ? 0 : Number.parseInt(digits, 10);
		// 상한을 넘겨 저장되지 않도록 입력 즉시 usablePoints로 클램프한다(음수 방어 포함).
		onChange({
			...value,
			pointsToUse: Math.min(Math.max(0, parsed), usablePoints),
		});
	};

	return (
		<>
			<ProductPicker
				isLoading={catalogQuery.isLoading}
				onSelectFree={() =>
					onChange({
						paymentMethod: "bank_transfer",
						pointsToUse: 0,
						selection: null,
					})
				}
				onSelectProduct={selectProduct}
				placements={placements}
				selectedProductId={value.selection?.adProductId}
			/>

			<DurationPicker
				onSelect={selectDuration}
				product={selectedProduct}
				selectedDays={value.selection?.durationDays}
			/>

			{isPremiumSelection ? (
				<Alert status="warning">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>프리미엄 광고 정원 안내</Alert.Title>
						<Alert.Description>
							{premiumCapacityNote(premiumCapacityQuery.data)}
						</Alert.Description>
					</Alert.Content>
				</Alert>
			) : null}

			{/* 배너 픽커 — 폼이 선택 상품에 맞춰 넘겨줄 때만 그린다. */}
			{bannerSlot}

			{/* 필수 배너 미충족 등 게이트 메시지 — 배너 슬롯 바로 아래에 두어 무엇을 채워야
			    등록되는지 그 자리에서 보이게 한다(등록 CTA 옆 사유와 이중으로 알린다). */}
			{errorMessage ? (
				<Text className="text-danger text-xs" selectable>
					{errorMessage}
				</Text>
			) : null}

			{pointsEnabled ? (
				<PointsField
					balance={jobPayment?.balance ?? 0}
					errorMessage={validatePointsToUse(value.pointsToUse, {
						minPoints,
						usablePoints,
					})}
					onChangeText={handlePointsText}
					onUseAll={() => onChange({ ...value, pointsToUse: usablePoints })}
					pointsToUse={value.pointsToUse}
					usablePoints={usablePoints}
				/>
			) : null}

			{value.selection ? <PaymentMethodPicker /> : null}

			{isPaid ? (
				<PaymentSummary gross={gross} pointsToUse={value.pointsToUse} />
			) : null}

			{isPaid ? <BankAccounts accounts={accountsQuery.data ?? []} /> : null}
		</>
	);
}
