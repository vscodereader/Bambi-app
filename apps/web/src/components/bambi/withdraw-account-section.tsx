"use client";

// 회원 탈퇴 섹션 — 계정 설정 화면 하단의 위험 구역. 확인 다이얼로그를 거쳐
// onboarding.withdrawMyAccount를 호출하고, 성공하면 세션 흔적을 정리하고 홈으로
// 보낸다. 조직 소유자 차단 등 서버 거절 사유는 토스트로 그대로 보여준다.
// 보존기간은 운영자 설정(siteSettings.getMemberPolicy)을 그대로 표시한다.

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { clearGuestCookie } from "@/lib/bambi/guest";
import { orpc } from "@/utils/orpc";

export function WithdrawAccountSection() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const memberPolicyQuery = useQuery(
		orpc.bambi.siteSettings.getMemberPolicy.queryOptions()
	);
	// 설정값 → 기본값 순 폴백. 쿼리 로딩 중에도 안내가 비지 않게 30을 마지막에 둔다.
	const retentionDays =
		memberPolicyQuery.data?.days ?? memberPolicyQuery.data?.defaultDays ?? 30;
	// 소유 조직에 다른 멤버가 남아 있으면 탈퇴 버튼을 사전 비활성화한다. 로딩 중에는
	// 활성 유지(서버가 최종 가드) — 명시적 true일 때만 막는다.
	const eligibilityQuery = useQuery(
		orpc.bambi.onboarding.getWithdrawEligibility.queryOptions()
	);
	const blockedByTeamMembers =
		eligibilityQuery.data?.blockedByTeamMembers === true;

	const withdrawMutation = useMutation(
		orpc.bambi.onboarding.withdrawMyAccount.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "탈퇴하지 못했어요. 다시 시도해 주세요.");
			},
			onSuccess: async () => {
				// 서버가 세션을 모두 지웠으므로 signOut 실패는 무시하고 쿠키만 정리한다.
				await authClient.signOut().catch(() => undefined);
				await clearGuestCookie();
				toast.success("탈퇴가 완료됐어요. 그동안 이용해 주셔서 감사합니다.");
				router.push("/");
				router.refresh();
			},
		})
	);

	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-5">
			<div className="flex flex-col gap-1">
				<span className="font-bold text-foreground text-sm">회원 탈퇴</span>
				<p className="m-0 text-muted-foreground text-xs">
					탈퇴하면 즉시 로그아웃되고 다시 로그인할 수 없어요. 프로필은 '탈퇴한
					회원'으로 표시되고, 연락처·비밀번호 등 개인정보는 탈퇴 즉시 파기돼요.
					부정 재가입을 막기 위해 본인인증 식별값만 {retentionDays}일 동안
					남으며, 그동안에는 같은 명의로 본인인증을 다시 할 수 없어요.
				</p>
			</div>
			{blockedByTeamMembers ? (
				<Alert variant="destructive">
					<AlertDescription>
						팀에 다른 멤버가 남아 있어 지금은 탈퇴할 수 없어요. 팀 관리에서
						멤버를 모두 정리한 뒤 탈퇴할 수 있어요.
					</AlertDescription>
				</Alert>
			) : null}
			<Button
				className="self-start"
				disabled={blockedByTeamMembers}
				onClick={() => setOpen(true)}
				variant="destructive"
			>
				회원 탈퇴
			</Button>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent>
					<DialogTitle>정말 탈퇴하시겠어요?</DialogTitle>
					<DialogDescription>
						탈퇴 즉시 모든 기기에서 로그아웃되고 계정은 복구할 수 없어요. 남긴
						채팅·리뷰는 '탈퇴한 회원'으로 표시돼요.
					</DialogDescription>
					<div className="flex justify-end gap-2">
						<Button onClick={() => setOpen(false)} variant="outline">
							취소
						</Button>
						<Button
							disabled={withdrawMutation.isPending}
							onClick={() => withdrawMutation.mutate(undefined)}
							variant="destructive"
						>
							{withdrawMutation.isPending ? "탈퇴 처리 중" : "탈퇴하기"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</section>
	);
}
