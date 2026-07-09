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
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

export default function NewAdPlacementPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [kind, setKind] = useState<"banner" | "listing">("listing");
	const create = useMutation(
		orpc.bambi.adProducts.createPlacement.mutationOptions({
			onSuccess: () => {
				toast.success("노출 위치를 만들었어요.");
				router.push("/moderator/ad-products");
			},
			onError: (error) => toast.error(error.message),
		})
	);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6">
			<h1 className="m-0 font-extrabold text-2xl">노출 위치 추가</h1>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="name">위치명</Label>
				<Input
					id="name"
					onChange={(e) => setName(e.target.value)}
					value={name}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="description">안내 문구</Label>
				<Textarea
					id="description"
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
			<div className="flex gap-2">
				<Button
					disabled={create.isPending || name.trim().length === 0}
					onClick={() =>
						create.mutate({
							name: name.trim(),
							description: description.trim() || undefined,
							kind,
						})
					}
				>
					만들기
				</Button>
				<Button
					onClick={() => router.push("/moderator/ad-products")}
					variant="ghost"
				>
					취소
				</Button>
			</div>
		</div>
	);
}
