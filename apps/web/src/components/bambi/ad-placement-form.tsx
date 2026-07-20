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

export interface AdPlacementDraft {
	description: string;
	kind: "listing" | "banner";
	name: string;
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

	const submit = () =>
		onSubmit({
			name: name.trim(),
			description: description.trim(),
			kind,
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
					items={{ listing: "리스팅 노출", banner: "배너 광고" }}
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
			<Button disabled={pending || name.trim().length === 0} onClick={submit}>
				{submitLabel}
			</Button>
		</div>
	);
}
