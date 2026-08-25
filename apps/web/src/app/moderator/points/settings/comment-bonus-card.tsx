"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

// 댓글 랜덤 보너스 설정. 활성 스위치·당첨 확률·지급 구간만 다뤄 자체 쿼리·상태만 쓴다.
export function CommentBonusCard() {
	const queryClient = useQueryClient();
	const commentBonusQuery = useQuery(
		orpc.bambi.siteSettings.getCommentBonus.queryOptions()
	);
	const [enabled, setEnabled] = useState(false);
	const [chancePercent, setChancePercent] = useState("");
	const [minPoints, setMinPoints] = useState("");
	const [maxPoints, setMaxPoints] = useState("");

	// 저장된 값이 오면 폼에 채운다. 네 값 모두 서버가 기본값(false/10/5/50)으로 폴백해 내려준다.
	useEffect(() => {
		const data = commentBonusQuery.data;
		if (!data) {
			return;
		}
		setEnabled(data.enabled);
		setChancePercent(String(data.chancePercent));
		setMinPoints(String(data.minPoints));
		setMaxPoints(String(data.maxPoints));
	}, [commentBonusQuery.data]);

	const saveMutation = useMutation(
		orpc.bambi.siteSettings.updateCommentBonus.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("댓글 보너스 설정을 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getCommentBonus.queryKey(),
				});
			},
		})
	);

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		const chance = Number(chancePercent.trim());
		const min = Number(minPoints.trim());
		const max = Number(maxPoints.trim());
		if (
			!(
				Number.isInteger(chance) &&
				chance >= 0 &&
				chance <= 100 &&
				Number.isInteger(min) &&
				min >= 0 &&
				Number.isInteger(max) &&
				max >= 0
			)
		) {
			toast.error(
				"당첨 확률은 0~100, 최소·최대 포인트는 0 이상의 정수로 입력해 주세요."
			);
			return;
		}
		if (min > max) {
			toast.error("최소 포인트는 최대 포인트보다 클 수 없습니다.");
			return;
		}
		saveMutation.mutate({
			chancePercent: chance,
			enabled,
			maxPoints: max,
			minPoints: min,
		});
	};

	return (
		<section className="flex flex-col gap-5 rounded-xl border p-4">
			<h2 className="m-0 font-bold text-lg">댓글 랜덤 보너스</h2>
			<form className="flex flex-col gap-5" onSubmit={onSubmit}>
				<div className="flex items-start justify-between gap-4">
					<div className="flex flex-col gap-1">
						<Label htmlFor="commentBonusEnabled">댓글 보너스 사용</Label>
						<p className="m-0 text-muted-foreground text-xs">
							켜두면 댓글 적립 시 확률에 따라 추가 포인트가 얹힙니다. 당첨액은
							댓글 작성 시점에 확정돼요.
						</p>
					</div>
					<Switch
						checked={enabled}
						disabled={commentBonusQuery.isLoading}
						id="commentBonusEnabled"
						onCheckedChange={setEnabled}
					/>
				</div>
				<div className="grid grid-cols-1 gap-5 md:max-w-xl md:grid-cols-3">
					<div className="flex flex-col gap-2">
						<Label htmlFor="commentBonusChancePercent">당첨 확률(%)</Label>
						<Input
							id="commentBonusChancePercent"
							inputMode="numeric"
							max={100}
							min={0}
							onChange={(event) => setChancePercent(event.target.value)}
							placeholder="10"
							type="number"
							value={chancePercent}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="commentBonusMinPoints">최소 포인트</Label>
						<Input
							id="commentBonusMinPoints"
							inputMode="numeric"
							min={0}
							onChange={(event) => setMinPoints(event.target.value)}
							placeholder="5"
							type="number"
							value={minPoints}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="commentBonusMaxPoints">최대 포인트</Label>
						<Input
							id="commentBonusMaxPoints"
							inputMode="numeric"
							min={0}
							onChange={(event) => setMaxPoints(event.target.value)}
							placeholder="50"
							type="number"
							value={maxPoints}
						/>
					</div>
				</div>
				<p className="m-0 text-muted-foreground text-xs">
					당첨되면 최소~최대 포인트 사이에서 무작위로 지급됩니다. 최소 포인트는
					최대 포인트보다 클 수 없어요.
				</p>
				<div className="flex justify-end">
					<Button
						disabled={saveMutation.isPending || commentBonusQuery.isLoading}
						type="submit"
					>
						{saveMutation.isPending ? "저장 중…" : "저장"}
					</Button>
				</div>
			</form>
		</section>
	);
}
