"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";
import { CheckIcon, ClockIcon, XIcon } from "../icons";

// 승인 심사 진행 단계. 미승인 구인자는 항상 "운영자 심사"(index 1) 단계에 머문다.
const REVIEW_STEPS = [
	{ key: "received", label: "정보 접수" },
	{ key: "review", label: "운영자 심사" },
	{ key: "approved", label: "승인 완료" },
] as const;
const CURRENT_STEP = 1;
const STATUS_LABEL = { done: "완료", current: "심사 중", upcoming: "대기" };

type StepState = "done" | "current" | "upcoming";

function stepState(index: number): StepState {
	if (index < CURRENT_STEP) {
		return "done";
	}
	if (index === CURRENT_STEP) {
		return "current";
	}
	return "upcoming";
}

function ReviewStep({ index, label }: { index: number; label: string }) {
	const state = stepState(index);
	const isLast = index === REVIEW_STEPS.length - 1;
	return (
		<li className="flex gap-3">
			<div className="flex flex-col items-center">
				<span
					className={cn(
						"flex size-7 items-center justify-center rounded-full",
						state === "done" && "bg-primary text-primary-foreground",
						state === "current" &&
							"bg-primary/15 text-primary ring-2 ring-primary",
						state === "upcoming" && "bg-muted text-muted-foreground"
					)}
				>
					{state === "done" ? (
						<span className="inline-flex size-4">
							<CheckIcon />
						</span>
					) : (
						<span
							className={cn(
								"size-2 rounded-full",
								state === "current" ? "bg-primary" : "bg-muted-foreground/50"
							)}
						/>
					)}
				</span>
				{isLast ? null : (
					<span
						className={cn(
							"my-1 w-0.5 flex-1",
							index < CURRENT_STEP ? "bg-primary/40" : "bg-border"
						)}
					/>
				)}
			</div>
			<div
				className={cn(
					"flex flex-1 items-center justify-between pb-5",
					isLast && "pb-0"
				)}
			>
				<span
					className={cn(
						"font-bold text-sm",
						state === "upcoming" ? "text-muted-foreground" : "text-foreground"
					)}
				>
					{label}
				</span>
				<span
					className={cn(
						"text-xs",
						state === "current"
							? "font-bold text-primary"
							: "text-muted-foreground"
					)}
				>
					{STATUS_LABEL[state]}
				</span>
			</div>
		</li>
	);
}

// 미검증 구인자에게 보여주는 승인 대기/반려 화면. /employer 레이아웃이 미검증일 때
// children 대신 이 컴포넌트를 렌더한다(리다이렉트 없이 인라인) — 무한 리다이렉트 방지.
export function EmployerPending() {
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const orgProfile = mineQuery.data?.employerOrganizationProfiles?.[0] ?? null;
	const status = orgProfile?.verificationStatus ?? "pending";

	// 미승인 상태로 구인 관리 기능(홈 외 경로)에 직접 접근하면 이용 불가를 알린다.
	useEffect(() => {
		if (pathname !== "/employer") {
			toast.error("운영자 승인 후 이용할 수 있어요");
		}
	}, [pathname]);

	const resubmit = useMutation(
		orpc.bambi.onboarding.requestEmployerVerification.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);

	return (
		<div className="flex flex-1 items-center justify-center px-4 py-10">
			{status === "rejected" ? (
				<Card className="w-full max-w-md">
					<CardContent className="flex flex-col items-center gap-5 px-6 py-8 text-center">
						<div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
							<span className="inline-flex size-7">
								<XIcon />
							</span>
						</div>
						<div className="flex flex-col gap-2">
							<h1 className="font-bold text-foreground text-lg">
								가입이 반려되었어요
							</h1>
							<p className="text-muted-foreground text-sm/relaxed">
								{orgProfile?.verificationNote ??
									"제출하신 정보를 확인할 수 없었어요. 내용을 확인한 뒤 다시 신청해 주세요."}
							</p>
						</div>
						{orgProfile ? (
							<Button
								className="w-full"
								disabled={resubmit.isPending}
								onClick={() =>
									resubmit.mutate({ organizationId: orgProfile.organizationId })
								}
							>
								재신청하기
							</Button>
						) : null}
					</CardContent>
				</Card>
			) : (
				<Card className="w-full max-w-md">
					<CardContent className="flex flex-col items-center gap-6 px-6 py-8 text-center">
						<div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
							<span className="inline-flex size-7">
								<ClockIcon />
							</span>
						</div>
						<div className="flex flex-col gap-2">
							<h1 className="font-bold text-foreground text-lg">
								운영자 심사 대기 중이에요
							</h1>
							<p className="text-muted-foreground text-sm/relaxed">
								업소 정보를 검토하고 있어요. 승인되면 구인 관리 기능을 이용할 수
								있어요.
							</p>
						</div>
						<ol className="flex w-full flex-col text-left">
							{REVIEW_STEPS.map((step, index) => (
								<ReviewStep index={index} key={step.key} label={step.label} />
							))}
						</ol>
						<div className="flex w-full items-center gap-2 rounded-lg bg-muted/60 px-4 py-3 text-left">
							<span className="inline-flex size-4 shrink-0 text-muted-foreground">
								<ClockIcon />
							</span>
							<p className="text-muted-foreground text-xs/relaxed">
								보통 영업일 기준 1~2일 안에 결과를 알려드려요.
							</p>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
