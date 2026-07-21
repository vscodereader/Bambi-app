"use client";

import { Button } from "@bambi-app/ui/components/button";
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
import {
	AD_PREVIEW_TEMPLATE_LABELS,
	AD_PREVIEW_TEMPLATE_OPTIONS,
	type AdPreviewTemplateValue,
} from "@/lib/bambi/ad-preview-templates";

export interface PriceOption {
	amount: number;
	days: number;
}

export interface AdProductDraft {
	autoBoostsPerDay: number;
	benefits: string[];
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
	id: number;
}

const MAX_PREVIEW_IMAGE_BYTES = 1_500_000;

// 배너형 노출 영역(프리미엄 상단·좌측·우측 사이드 배너)은 끌어올리기 대상이 아니다.
// 끌어올리기(수동·자동)는 리스팅형(스페셜·급구·추천)에만 제공된다.
const BANNER_PREVIEW_TEMPLATES: ReadonlySet<AdPreviewTemplateValue> = new Set([
	"premium-top",
	"side-horizontal",
	"side-vertical",
]);

export function AdProductForm({
	initialValue,
	onSubmit,
	pending,
	submitLabel = "저장",
}: {
	initialValue?: AdProductDraft;
	onSubmit: (draft: AdProductDraft) => void;
	pending: boolean;
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
		).map((o) => ({ id: makeId(), ...o }))
	);
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
	const isBannerTemplate = BANNER_PREVIEW_TEMPLATES.has(previewTemplate);

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
			.map(({ amount, days }) => ({ amount, days }));
		const dayValues = normalizedPriceOptions.map((option) => option.days);
		if (new Set(dayValues).size !== dayValues.length) {
			toast.error("같은 이용 기간이 중복됩니다. 기간별로 하나만 등록해주세요.");
			return;
		}
		onSubmit({
			name: name.trim(),
			tagline: tagline.trim(),
			benefits: benefits
				.map((item) => item.value.trim())
				.filter((value) => value.length > 0),
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
						if (BANNER_PREVIEW_TEMPLATES.has(next)) {
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
						{AD_PREVIEW_TEMPLATE_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="m-0 text-muted-foreground text-xs">
					이 상품을 구매한 공고가 노출되는 seeker 페이지 위치입니다. "없음"이면
					일반 구인과 동일하게 취급됩니다.
				</p>
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
				<Label>가격 옵션(이용기간 · 금액)</Label>
				{priceOptions.map((option) => (
					<div className="flex items-center gap-2" key={option.id}>
						<Input
							className="w-24"
							onChange={(e) =>
								setPrice(option.id, { days: Number(e.target.value) || 0 })
							}
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
				))}
				<Button
					onClick={() =>
						setPriceOptions((options) => [
							...options,
							{ id: makeId(), amount: 0, days: 30 },
						])
					}
					size="sm"
					variant="secondary"
				>
					가격 옵션 추가
				</Button>
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
		</div>
	);
}
