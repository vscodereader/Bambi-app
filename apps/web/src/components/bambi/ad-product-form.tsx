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
import { useRef, useState } from "react";
import {
	PREVIEW_TEMPLATE_OPTIONS,
	type PreviewTemplate,
} from "@/components/bambi/ad-placement-preview";

export interface PriceOption {
	amount: number;
	days: number;
}

export interface AdProductDraft {
	benefits: string[];
	name: string;
	previewTemplate: PreviewTemplate;
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
	const [previewTemplate, setPreviewTemplate] = useState<PreviewTemplate>(
		initialValue?.previewTemplate ?? "none"
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

	const submit = () =>
		onSubmit({
			name: name.trim(),
			tagline: tagline.trim(),
			benefits: benefits
				.map((item) => item.value.trim())
				.filter((value) => value.length > 0),
			priceOptions: priceOptions
				.filter((option) => option.days > 0)
				.map(({ amount, days }) => ({ amount, days })),
			previewTemplate,
		});

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
							value={option.days}
						/>
						<span className="text-muted-foreground text-sm">일</span>
						<Input
							className="w-40"
							onChange={(e) =>
								setPrice(option.id, { amount: Number(e.target.value) || 0 })
							}
							type="number"
							value={option.amount}
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

			<div className="flex flex-col gap-1.5">
				<Label>게시 위치 미리보기</Label>
				<Select
					onValueChange={(v) => setPreviewTemplate(v as PreviewTemplate)}
					value={previewTemplate}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PREVIEW_TEMPLATE_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<Button disabled={pending || name.trim().length === 0} onClick={submit}>
				{submitLabel}
			</Button>
		</div>
	);
}
