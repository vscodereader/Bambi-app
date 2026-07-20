"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";

export interface PriceOption {
	amount: number;
	days: number;
}

export interface AdProductDraft {
	benefits: string[];
	name: string;
	previewImageUrl: string | null;
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
			previewImageUrl,
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
