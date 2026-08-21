"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";
import styles from "./point-draw-machine.module.css";

type Stage =
	| "dispensing"
	| "idle"
	| "opening"
	| "requesting"
	| "revealed"
	| "shaking";
const BALLS = [
	[styles.ball1, "text-rose-400"],
	[styles.ball2, "text-sky-400"],
	[styles.ball3, "text-emerald-400"],
	[styles.ball4, "text-yellow-300"],
	[styles.ball5, "text-sky-300"],
	[styles.ball6, "text-red-400"],
	[styles.ball7, "text-emerald-500"],
	[styles.ball8, "text-yellow-300"],
	[styles.ball9, "text-red-400"],
	[styles.ball10, "text-sky-400"],
	[styles.ball11, "text-yellow-300"],
	[styles.ball12, "text-rose-400"],
	[styles.ball13, "text-emerald-400"],
	[styles.ball14, "text-sky-300"],
] as const;

const wait = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function PointDrawMachine(): React.JSX.Element {
	const queryClient = useQueryClient();
	const stateQuery = useQuery(orpc.bambi.pointDraw.getState.queryOptions());
	const [stage, setStage] = useState<Stage>("idle");
	const [result, setResult] = useState<null | {
		awardedPoints: number;
		prizePoints: number;
	}>(null);
	const drawMutation = useMutation(orpc.bambi.pointDraw.draw.mutationOptions());
	const handleDraw = async () => {
		setResult(null);
		setStage("requesting");
		try {
			const draw = await drawMutation.mutateAsync({
				requestId: crypto.randomUUID(),
			});
			setStage("shaking");
			await wait(1300);
			setStage("dispensing");
			await wait(850);
			setStage("opening");
			await wait(700);
			setResult(draw);
			setStage("revealed");
			await queryClient.invalidateQueries({ queryKey: orpc.bambi.key() });
		} catch (error) {
			setStage("idle");
			toast.error(
				error instanceof Error ? error.message : "뽑기를 진행하지 못했어요."
			);
		}
	};
	const state = stateQuery.data;
	const isBusy = stage !== "idle" && stage !== "revealed";
	const canDraw =
		!isBusy &&
		Boolean(state?.activePrizeAvailable) &&
		(state?.ticketBalance ?? 0) > 0;
	let resultMessage: null | string = null;
	if (result) {
		resultMessage =
			result.awardedPoints === result.prizePoints
				? `${result.awardedPoints.toLocaleString("ko-KR")}P 당첨!`
				: `${result.prizePoints.toLocaleString("ko-KR")}P 당첨 · 보유 한도로 ${result.awardedPoints.toLocaleString("ko-KR")}P 적립`;
	}

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-5 py-8 md:px-6">
			<div className="relative flex flex-col items-center text-center">
				<p className="m-0 font-extrabold text-primary text-xl">
					100% 포인트 당첨!
				</p>
				<h1 className="m-0 font-black text-4xl tracking-tight">
					포인트 랜덤 뽑기
				</h1>
				<div className={styles.speechBubble}>
					{state?.maxPrizePoints
						? `행운의 ${state.maxPrizePoints.toLocaleString("ko-KR")} 포인트 주인공이 되어보세요`
						: "운영자가 뽑기 보상을 준비 중입니다"}
				</div>
			</div>

			<div
				aria-label="포인트 랜덤 뽑기 기계"
				className={cn(styles.machine, stage === "shaking" && styles.shaking)}
				role="img"
			>
				<div className={styles.topButton} />
				<div className={styles.cap} />
				<div className={styles.globe}>
					{BALLS.map(([position, color]) => (
						<span
							aria-hidden
							className={cn(styles.ball, position, color)}
							key={position}
						/>
					))}
				</div>
				<div className={styles.collar} />
				<div className={styles.body}>
					<div className={styles.bodyShine} />
					<div className={styles.alertMark}>!</div>
					<div className={styles.crank}>
						<span className={styles.crankCenter} />
						<span className={styles.crankHandle} />
					</div>
					<div className={styles.exit}>
						<span
							aria-hidden
							className={cn(
								styles.dispensedBall,
								stage === "dispensing" && styles.dispensing,
								(stage === "opening" || stage === "revealed") && styles.opening
							)}
						/>
					</div>
				</div>
				<div className={styles.base} />
				<div className={styles.shadow} />
			</div>

			<Card className="w-full">
				<CardContent className="flex flex-col items-center gap-4 p-5">
					<p className="m-0 font-extrabold text-lg">
						남은 뽑기권: {(state?.ticketBalance ?? 0).toLocaleString("ko-KR")}개
					</p>
					<Button
						disabled={!canDraw}
						onClick={handleDraw}
						size="lg"
						type="button"
					>
						{isBusy ? "뽑는 중…" : "뽑기"}
					</Button>
					{state?.activePrizeAvailable ? null : (
						<p className="m-0 text-muted-foreground text-sm">
							운영자가 뽑기 보상을 준비 중입니다.
						</p>
					)}
					{state?.activePrizeAvailable && (state.ticketBalance ?? 0) === 0 ? (
						<p className="m-0 text-muted-foreground text-sm">
							뽑기권이 없어 뽑을 수 없어요.
						</p>
					) : null}
					<div
						aria-live="polite"
						className="min-h-10 text-center font-bold text-xl"
					>
						{resultMessage}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
