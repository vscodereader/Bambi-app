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
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useState } from "react";
import {
	PREVIEW_TEMPLATE_OPTIONS,
	type PreviewTemplate,
} from "@/components/bambi/ad-placement-preview";

export interface AdPlacementDraft {
	description: string;
	kind: "listing" | "banner";
	name: string;
	previewTemplate: PreviewTemplate;
}

export function AdPlacementForm({
	initialValue,
	onSubmit,
	pending,
	submitLabel = "저장",
}: {
	initialValue?: AdPlacementDraft;
	onSubmit: (draft: AdPlacementDraft) => void;
	pending: boolean;
	submitLabel?: string;
}) {
	const [name, setName] = useState(initialValue?.name ?? "");
	const [description, setDescription] = useState(
		initialValue?.description ?? ""
	);
	const [kind, setKind] = useState<"banner" | "listing">(
		initialValue?.kind ?? "listing"
	);
	const [previewTemplate, setPreviewTemplate] = useState<PreviewTemplate>(
		initialValue?.previewTemplate ?? "none"
	);

	const submit = () =>
		onSubmit({
			name: name.trim(),
			description: description.trim(),
			kind,
			previewTemplate,
		});

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="placement-name">위치명</Label>
				<Input
					id="placement-name"
					onChange={(e) => setName(e.target.value)}
					value={name}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="placement-description">안내 문구</Label>
				<Textarea
					id="placement-description"
					onChange={(e) => setDescription(e.target.value)}
					value={description}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label>유형</Label>
				<Select
					onValueChange={(v) => setKind(v as "banner" | "listing")}
					value={kind}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="listing">리스팅 노출</SelectItem>
						<SelectItem value="banner">배너 광고</SelectItem>
					</SelectContent>
				</Select>
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
