"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Button } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { selectEditableAdCampaign } from "@/lib/bambi/ad-catalog";
import {
	AD_PREVIEW_TEMPLATE_HINTS,
	AD_PREVIEW_TEMPLATE_LABELS,
	type AdPlacementKind,
	type AdPreviewTemplateValue,
	getPreviewTemplateOptionsForPlacementKind,
	isBannerPreviewTemplate,
	isPreviewTemplateKindMismatch,
} from "@/lib/bambi/ad-preview-templates";
import { PopupDateTimePicker } from "./main-popup/popup-date-time-picker";

export interface DiscountCampaignDraft {
	discountPercent: number;
	endsAt: Date | null;
	priceOptionDays: number;
	startsAt: Date;
	status?: "active" | "cancelled" | "ended" | "planned";
}

export interface PriceOption {
	amount: number;
	days: number;
	// 옵션(기간)별 할인율. 0~100 정수, 없거나 0이면 할인 없음. 읽는 쪽은 항상 `?? 0`.
	discountPercent?: number;
}

export interface AdProductDraft {
	autoBoostsPerDay: number;
	benefits: string[];
	discountCampaigns: DiscountCampaignDraft[];
	manualBoostsPerDay: number;
	name: string;
	previewImageUrl: string | null;
	previewTemplate: AdPreviewTemplateValue;
	priceOptions: PriceOption[];
	tagline: string;
}

interface BenefitField {
	id: number;
	value: string;
}
interface PriceOptionField extends PriceOption {
	campaignDiscountPercent?: number;
	campaignEnabled: boolean;
	campaignEndsAt?: Date | null;
	campaignStartsAt?: Date | null;
	campaignStatus?: "active" | "cancelled" | "ended" | "planned";
	id: number;
}

const MAX_PREVIEW_IMAGE_BYTES = 1_500_000;

export function AdProductForm({
	initialValue,
	onSubmit,
	pending,
	placementKind,
	submitLabel = "저장",
}: {
	initialValue?: AdProductDraft;
	onSubmit: (draft: AdProductDraft) => void;
	pending: boolean;
	// 이 상품이 속한 게재 위치의 유형. 노출 영역 선택지를 유형에 맞게 좁힌다 —
	// 리스팅 위치에 "프리미엄 광고 배너"가 보이면 위치와 상품이 어긋난 채 팔린다.
	// 위치를 아직 못 읽었으면(로딩·조회 실패) undefined로 전체 선택지를 유지한다.
	placementKind?: AdPlacementKind;
	submitLabel?: string;
}) {
	const nextFieldId = useRef(0);
	const makeId = () => nextFieldId.current++;

	const [name, setName] = useState(initialValue?.name ?? "");
	const [tagline, setTagline] = useState(initialValue?.tagline ?? "");
	const [benefits, setBenefits] = useState<BenefitField[]>(() =>
		(initialValue?.benefits.length ? initialValue.benefits : [""]).map(
			(value) => ({ id: makeId(), value })
		)
	);
	const [priceOptions, setPriceOptions] = useState<PriceOptionField[]>(() =>
		(initialValue?.priceOptions.length
			? initialValue.priceOptions
			: [{ amount: 0, days: 30 }]
		).map((o) => {
			const campaign = selectEditableAdCampaign(
				initialValue?.discountCampaigns ?? [],
				o.days
			);
			const campaignEnabled =
				campaign?.status === "active" || campaign?.status === "planned";
			return {
				id: makeId(),
				...o,
				campaignDiscountPercent: campaign?.discountPercent,
				campaignEnabled,
				campaignEndsAt: campaign?.endsAt ?? null,
				campaignStartsAt: campaign?.startsAt ?? null,
				campaignStatus: campaign?.status,
			};
		})
	);
	const clampPercent = (value: number) =>
		Math.max(0, Math.min(100, Math.floor(value)));
	const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(
		initialValue?.previewImageUrl ?? null
	);
	const [previewTemplate, setPreviewTemplate] =
		useState<AdPreviewTemplateValue>(initialValue?.previewTemplate ?? "none");
	const [manualBoostsPerDay, setManualBoostsPerDay] = useState(
		initialValue?.manualBoostsPerDay ?? 0
	);
	const [autoBoostsPerDay, setAutoBoostsPerDay] = useState(
		initialValue?.autoBoostsPerDay ?? 0
	);
	const [pendingDaysChange, setPendingDaysChange] = useState<{
		days: number;
		id: number;
	} | null>(null);
	// 배너형(프리미엄·레거시 사이드) 판정은 광고 배너 슬롯 표에서 파생시킨 공용 헬퍼를 쓴다.
	// 끌어올리기(수동·자동)는 리스팅형(스페셜·급구·추천)에만 제공된다.
	const isBannerTemplate = isBannerPreviewTemplate(previewTemplate);
	// 게재 위치 유형에 맞는 선택지만 남긴다(판정은 ad-preview-templates의 공용 헬퍼).
	const templateOptions =
		getPreviewTemplateOptionsForPlacementKind(placementKind);
	// 현재 값이 선택지에 없는 경우가 둘 있다: 레거시 side 값(좌/우 사이드 배너)이거나,
	// 위치 유형과 어긋난 채 저장된 기존 상품이다. 둘 다 항목으로 함께 렌더해 편집 중
	// 값이 유실되지 않게 한다. AD_PREVIEW_TEMPLATE_LABELS는 레거시 포함 전체 라벨을 제공한다.
	const isOffListTemplate = !templateOptions.some(
		(option) => option.value === previewTemplate
	);
	const isKindMismatch = isPreviewTemplateKindMismatch(
		previewTemplate,
		placementKind
	);

	const setPrice = (id: number, patch: Partial<PriceOption>) =>
		setPriceOptions((options) =>
			options.map((option) =>
				option.id === id ? { ...option, ...patch } : option
			)
		);
	const setBenefit = (id: number, value: string) =>
		setBenefits((items) =>
			items.map((item) => (item.id === id ? { ...item, value } : item))
		);

	const handlePreviewImageChange = (file: File) => {
		if (file.size > MAX_PREVIEW_IMAGE_BYTES) {
			toast.error("이미지 용량은 1.5MB 이하만 업로드할 수 있습니다.");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				setPreviewImageUrl(reader.result);
			}
		};
		reader.readAsDataURL(file);
	};

	const submit = () => {
		const normalizedPriceOptions = priceOptions
			.filter((option) => option.days > 0)
			.map(({ amount, days, discountPercent }) => {
				const percent = discountPercent ? clampPercent(discountPercent) : 0;
				// 0이면 discountPercent 필드를 생략(undefined), 1~100이면 포함한다.
				return percent > 0
					? { amount, days, discountPercent: percent }
					: { amount, days };
			});
		const dayValues = normalizedPriceOptions.map((option) => option.days);
		if (new Set(dayValues).size !== dayValues.length) {
			toast.error("같은 이용 기간이 중복됩니다. 기간별로 하나만 등록해주세요.");
			return;
		}
		const invalidCampaign = priceOptions.find(
			(option) =>
				option.campaignEnabled &&
				(!option.campaignStartsAt || option.campaignDiscountPercent == null)
		);
		if (invalidCampaign) {
			toast.error("기간 할인의 시작 일시와 할인율을 모두 입력해 주세요.");
			return;
		}
		const discountCampaigns = priceOptions.flatMap((option) =>
			option.campaignEnabled &&
			option.campaignStartsAt &&
			option.campaignDiscountPercent != null
				? [
						{
							discountPercent: clampPercent(option.campaignDiscountPercent),
							endsAt: option.campaignEndsAt ?? null,
							priceOptionDays: option.days,
							startsAt: option.campaignStartsAt,
						},
					]
				: []
		);
		onSubmit({
			name: name.trim(),
			tagline: tagline.trim(),
			benefits: benefits
				.map((item) => item.value.trim())
				.filter((value) => value.length > 0),
			discountCampaigns,
			priceOptions: normalizedPriceOptions,
			previewImageUrl,
			previewTemplate,
			// 배너형은 끌어올리기 미제공 — 항상 0으로 저장(서버도 거부)
			manualBoostsPerDay: isBannerTemplate ? 0 : manualBoostsPerDay,
			autoBoostsPerDay: isBannerTemplate ? 0 : autoBoostsPerDay,
		});
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="p-name">상품명</Label>
				<Input
					id="p-name"
					onChange={(e) => setName(e.target.value)}
					value={name}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="p-tagline">한 줄 소개</Label>
				<Input
					id="p-tagline"
					onChange={(e) => setTagline(e.target.value)}
					value={tagline}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="p-preview-template">노출 영역(게시 위치)</Label>
				<Select
					items={AD_PREVIEW_TEMPLATE_LABELS}
					onValueChange={(value) => {
						const next = value as AdPreviewTemplateValue;
						setPreviewTemplate(next);
						// 배너형으로 바꾸면 끌어올리기 횟수를 0으로 리셋(배너엔 미제공)
						if (isBannerPreviewTemplate(next)) {
							setManualBoostsPerDay(0);
							setAutoBoostsPerDay(0);
						}
					}}
					value={previewTemplate}
				>
					<SelectTrigger className="w-full" id="p-preview-template">
						<SelectValue placeholder="노출 영역 선택" />
					</SelectTrigger>
					<SelectContent>
						{templateOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
						{isOffListTemplate ? (
							<SelectItem value={previewTemplate}>
								{AD_PREVIEW_TEMPLATE_LABELS[previewTemplate]}
							</SelectItem>
						) : null}
					</SelectContent>
				</Select>
				{/* 안내는 선택한 노출 영역 값에 1:1로 매핑한다 — 고정 문구를 쓰면
				    리스팅형(스페셜·급구·추천)에도 광고 배너 영역 설명이 붙는다. */}
				<p className="m-0 text-muted-foreground text-xs">
					{AD_PREVIEW_TEMPLATE_HINTS[previewTemplate]}
				</p>
				{isKindMismatch ? (
					<p className="m-0 text-destructive text-xs">
						이 상품이 속한 게재 위치는{" "}
						{placementKind === "banner" ? "배너 광고" : "리스팅 노출"} 유형인데,
						선택된 노출 영역은 {placementKind === "banner" ? "리스팅" : "배너"}{" "}
						영역이에요. 저장 전에 위치 유형에 맞는 노출 영역으로 바꿔 주세요.
					</p>
				) : null}
			</div>

			<div className="flex flex-col gap-2">
				<Label>서비스 내용</Label>
				{benefits.map((item) => (
					<div className="flex gap-2" key={item.id}>
						<Input
							onChange={(e) => setBenefit(item.id, e.target.value)}
							value={item.value}
						/>
						<Button
							onClick={() =>
								setBenefits((items) => items.filter((b) => b.id !== item.id))
							}
							size="sm"
							variant="ghost"
						>
							삭제
						</Button>
					</div>
				))}
				<Button
					onClick={() =>
						setBenefits((items) => [...items, { id: makeId(), value: "" }])
					}
					size="sm"
					variant="secondary"
				>
					내용 추가
				</Button>
			</div>

			<div className="flex flex-col gap-2">
				<Label>가격 옵션(이용기간 · 금액 · 할인율)</Label>
				{priceOptions.map((option) => (
					<div className="grid gap-3 rounded-lg border p-3" key={option.id}>
						<div className="flex flex-wrap items-center gap-2">
							<Input
								className="w-24"
								onChange={(e) => {
									const days = Number(e.target.value) || 0;
									if (option.campaignEnabled) {
										setPendingDaysChange({ days, id: option.id });
										return;
									}
									setPrice(option.id, { days });
								}}
								type="number"
								value={option.days === 0 ? "" : option.days}
							/>
							<span className="text-muted-foreground text-sm">일</span>
							<Input
								className="w-40"
								onChange={(e) =>
									setPrice(option.id, { amount: Number(e.target.value) || 0 })
								}
								type="number"
								value={option.amount === 0 ? "" : option.amount}
							/>
							<span className="text-muted-foreground text-sm">원</span>
							<Input
								className="w-20"
								disabled={option.campaignEnabled}
								max={100}
								min={0}
								onChange={(e) =>
									setPrice(option.id, {
										discountPercent: clampPercent(Number(e.target.value) || 0),
									})
								}
								type="number"
								value={option.discountPercent ? option.discountPercent : ""}
							/>
							<span className="text-muted-foreground text-sm">% 할인</span>
							<Button
								onClick={() =>
									setPriceOptions((options) =>
										options.filter((o) => o.id !== option.id)
									)
								}
								size="sm"
								variant="ghost"
							>
								삭제
							</Button>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Checkbox
								checked={option.campaignEnabled}
								id={`campaign-${option.id}`}
								onCheckedChange={(checked) =>
									setPriceOptions((items) =>
										items.map((item) =>
											item.id === option.id
												? {
														...item,
														campaignEnabled: checked === true,
														campaignStartsAt:
															checked === true
																? (item.campaignStartsAt ?? new Date())
																: item.campaignStartsAt,
													}
												: item
										)
									)
								}
							/>
							<Label htmlFor={`campaign-${option.id}`}>기간 설정</Label>
							{option.campaignStatus === "ended" && !option.campaignEnabled ? (
								<span className="text-muted-foreground text-sm">종료됨</span>
							) : null}
						</div>
						{option.campaignEnabled ? (
							<div className="grid gap-3 md:grid-cols-3">
								<div className="grid gap-1.5">
									<Label>시작 일시</Label>
									<PopupDateTimePicker
										allowUnset={false}
										kind="start"
										onChange={(campaignStartsAt) =>
											setPriceOptions((items) =>
												items.map((item) =>
													item.id === option.id
														? { ...item, campaignStartsAt }
														: item
												)
											)
										}
										value={option.campaignStartsAt ?? null}
									/>
								</div>
								<div className="grid gap-1.5">
									<Label>종료 일시 (설정 안 함: 무기한)</Label>
									<PopupDateTimePicker
										kind="end"
										onChange={(campaignEndsAt) =>
											setPriceOptions((items) =>
												items.map((item) =>
													item.id === option.id
														? { ...item, campaignEndsAt }
														: item
												)
											)
										}
										value={option.campaignEndsAt ?? null}
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor={`campaign-discount-${option.id}`}>
										기간 할인율
									</Label>
									<div className="flex items-center gap-2">
										<Input
											id={`campaign-discount-${option.id}`}
											max={100}
											min={0}
											onChange={(event) =>
												setPriceOptions((items) =>
													items.map((item) =>
														item.id === option.id
															? {
																	...item,
																	campaignDiscountPercent: clampPercent(
																		Number(event.target.value) || 0
																	),
																}
															: item
													)
												)
											}
											type="number"
											value={option.campaignDiscountPercent ?? ""}
										/>
										<span>%</span>
									</div>
								</div>
							</div>
						) : null}
					</div>
				))}
				<Button
					onClick={() =>
						setPriceOptions((options) => [
							...options,
							{ id: makeId(), amount: 0, campaignEnabled: false, days: 30 },
						])
					}
					size="sm"
					variant="secondary"
				>
					가격 옵션 추가
				</Button>
				<p className="m-0 text-muted-foreground text-xs">
					할인율은 0~100 사이 정수입니다. 값을 넣으면 그 기간 옵션에 원가
					취소선을 긋고 할인가와 "N% 할인"을 함께 보여줍니다. 비워두면(0) 할인
					없이 원가만 노출됩니다. 할인가는 10원 단위로 내림합니다.
				</p>
			</div>

			{isBannerTemplate ? (
				<p className="m-0 text-muted-foreground text-sm">
					배너형 광고는 끌어올리기(수동·자동)를 제공하지 않아 횟수 설정이
					없습니다. 끌어올리기는 스페셜·급구·추천 리스팅 상품에만 제공됩니다.
				</p>
			) : (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="p-manual-boosts">일일 끌어올리기 횟수</Label>
						<Input
							className="w-24"
							id="p-manual-boosts"
							onChange={(e) =>
								setManualBoostsPerDay(Number(e.target.value) || 0)
							}
							type="number"
							value={manualBoostsPerDay === 0 ? "" : manualBoostsPerDay}
						/>
						<p className="m-0 text-muted-foreground text-xs">
							이 상품을 구매한 공고가 하루에 쓸 수 있는 끌어올리기 횟수입니다.
							비워두면 미제공(0회)입니다.
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="p-auto-boosts">일일 자동 끌어올리기 횟수</Label>
						<Input
							className="w-24"
							id="p-auto-boosts"
							onChange={(e) => setAutoBoostsPerDay(Number(e.target.value) || 0)}
							type="number"
							value={autoBoostsPerDay === 0 ? "" : autoBoostsPerDay}
						/>
						<p className="m-0 text-muted-foreground text-xs">
							이 상품을 구매한 공고가 하루에 자동으로 끌어올려지는
							횟수입니다(09~21시 균등 분배). 비워두면 미제공(0회)입니다.
						</p>
					</div>
				</>
			)}

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="p-preview-image">게시 위치 미리보기</Label>
				{previewImageUrl ? (
					<div className="flex flex-col gap-2">
						<div className="relative flex max-h-48 items-center justify-center overflow-hidden rounded-lg border border-border p-2">
							<Image
								alt="게시 위치 미리보기"
								className="max-h-44 w-auto object-contain"
								height={176}
								src={previewImageUrl}
								unoptimized
								width={320}
							/>
						</div>
						<Button
							onClick={() => setPreviewImageUrl(null)}
							size="sm"
							variant="ghost"
						>
							<X data-icon="inline-start" />
							이미지 제거
						</Button>
					</div>
				) : (
					<div className="flex min-h-16 items-center justify-center rounded-lg border border-border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs">
						미리보기 없음
					</div>
				)}
				<p className="m-0 text-muted-foreground text-xs">
					구인자 광고 안내 화면에서 이 상품이 어디에 뜨는지 보여 주는 예시
					이미지입니다.{" "}
					{isBannerTemplate
						? "배너 영역 상품이라 상단·사이드 배너 자리가 보이는 예시가 좋아요."
						: "리스팅 영역 상품이라 채용 목록 섹션 카드가 보이는 예시가 좋아요."}{" "}
					실제 광고 배너 이미지는 여기가 아니라 구인자가 공고를 등록할 때
					올립니다.
				</p>
				<Input
					accept="image/*"
					id="p-preview-image"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) {
							handlePreviewImageChange(file);
						}
						e.target.value = "";
					}}
					type="file"
				/>
			</div>

			<Button disabled={pending || name.trim().length === 0} onClick={submit}>
				{submitLabel}
			</Button>
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingDaysChange(null);
					}
				}}
				open={pendingDaysChange !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>이용 기간을 변경할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							이 옵션에 연결된 기간 할인 설정과 저장된 이력이 함께 삭제됩니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (!pendingDaysChange) {
									return;
								}
								setPriceOptions((options) =>
									options.map((option) =>
										option.id === pendingDaysChange.id
											? {
													...option,
													campaignDiscountPercent: undefined,
													campaignEnabled: false,
													campaignEndsAt: null,
													campaignStartsAt: null,
													campaignStatus: undefined,
													days: pendingDaysChange.days,
												}
											: option
									)
								);
								setPendingDaysChange(null);
							}}
						>
							변경
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
