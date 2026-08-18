"use client";

import { readSupportChatTokenFromCookieString } from "@bambi-app/api/services/bambi-support-chat-token";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card } from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, SendHorizontal, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

// 서버 sendMessage 입력 한도(SUPPORT_CHAT_BODY_MAX)와 맞춘다.
const BODY_MAX = 1000;
// 두 자리 배지는 원형 버튼 밖으로 삐져나간다 — 정확한 수보다 "밀렸다"는 신호가 중요.
const BADGE_CAP = 9;
const ISSUE_ERROR = "문의를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";

// 알림 딥링크(?support-chat=1)로 패널을 연다. 위젯은 루트 레이아웃 상주라 라우터
// 내비게이션으로는 리마운트되지 않는다 — 마운트 1회 읽기로는 인앱 알림 클릭
// (router.push)이 무동작이라, useSearchParams로 값 변화를 구독한다. 이 훅은
// Suspense 경계가 필요해 자식 컴포넌트로 분리한다.
function SupportChatDeepLink({ onOpen }: { onOpen: () => void }) {
	const searchParams = useSearchParams();
	const shouldOpen = searchParams.get("support-chat") === "1";
	useEffect(() => {
		if (shouldOpen) {
			onOpen();
		}
	}, [shouldOpen, onOpen]);
	return null;
}

export function SupportChatWidget() {
	const pathname = usePathname();
	const { data: session } = authClient.useSession();
	const queryClient = useQueryClient();

	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState("");
	// 쿠키 존재 여부는 마운트 시·발급 후에만 바뀌므로 state로 든다. 쿠키 없는 익명
	// 방문자는 폴링하지 않는다(전 방문자 폴링은 서버 낭비).
	const [hasCookie, setHasCookie] = useState(false);
	// 딥링크 구독(useSearchParams)은 마운트 후에만 렌더한다. SSR에서 이 훅은 Suspense
	// 경계를 서스펜드시켜 서버 HTML에 경계 마커가 남고, 클라이언트 첫 렌더와 형제
	// 노드(Toaster) 매칭이 어긋나 hydration 불일치가 났다 — 서버·클라 첫 렌더를
	// 둘 다 null로 맞춘다(마운트 직후 붙으므로 첫 로드 딥링크도 동작한다).
	const [mounted, setMounted] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	// 마운트 1회: 쿠키 존재 반영. 딥링크 자동 열림은 SupportChatDeepLink가 담당.
	useEffect(() => {
		setHasCookie(
			Boolean(readSupportChatTokenFromCookieString(document.cookie))
		);
		setMounted(true);
	}, []);

	const openPanel = useCallback(() => setOpen(true), []);

	// 운영자 계정은 위젯을 감춘다(문의를 받는 쪽). 로그인 상태에서만 프로필을 조회.
	const profileQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session),
	});
	const isAdmin = profileQuery.data?.bambiProfile?.role === "admin";
	const isModeratorPath = pathname?.startsWith("/moderator") ?? false;
	// 로그인 상태에서 프로필 응답 전까지도 감춘다 — admin 계정에서 버튼이 잠깐 떴다
	// 사라지는 깜빡임 방지(비로그인은 조회가 없어 해당 없음).
	const hidden =
		isModeratorPath || isAdmin || (Boolean(session) && profileQuery.isPending);

	const canPoll = (Boolean(session) || hasCookie) && !hidden;
	const roomQuery = useQuery({
		...orpc.bambi.supportChat.getMyRoom.queryOptions(),
		enabled: canPoll,
		refetchInterval: open ? 3000 : 30_000,
	});
	const roomData = roomQuery.data;
	const messages = roomData?.messages ?? [];
	const unreadCount = roomData?.unreadCount ?? 0;
	const isBlocked = roomData?.room.isBlocked ?? false;

	const markReadMutation = useMutation(
		orpc.bambi.supportChat.markRead.mutationOptions()
	);
	const sendMutation = useMutation(
		orpc.bambi.supportChat.sendMessage.mutationOptions()
	);

	const invalidateRoom = useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.supportChat.getMyRoom.queryKey(),
			}),
		[queryClient]
	);

	// 패널이 열려 있고 안 읽은 운영자 메시지가 있으면 읽음 처리 — 읽으면 unreadCount가
	// 0으로 떨어져 재실행되지 않는다(markRead는 멱등).
	useEffect(() => {
		if (open && unreadCount > 0) {
			markReadMutation.mutate(undefined, { onSuccess: invalidateRoom });
		}
	}, [open, unreadCount, markReadMutation.mutate, invalidateRoom]);

	// 메시지가 늘거나 패널이 열리면 맨 아래로.
	useEffect(() => {
		const el = scrollRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
		}
	}, [messages.length, open]);

	const send = async () => {
		const body = draft.trim();
		if (!body || sendMutation.isPending) {
			return;
		}
		// 비로그인 + 쿠키 없음 → 먼저 익명 신원 쿠키를 발급받는다. 발급 후 orpc 요청이
		// x-bambi-support-chat 헤더로 신원을 실어 보낸다.
		if (!(session || hasCookie)) {
			try {
				const res = await fetch("/api/support-chat", { method: "POST" });
				if (!res.ok) {
					toast.error(ISSUE_ERROR);
					return;
				}
				setHasCookie(true);
			} catch {
				toast.error(ISSUE_ERROR);
				return;
			}
		}
		sendMutation.mutate(
			{ body },
			{
				onError: (error) => toast.error(error.message),
				onSuccess: () => {
					setDraft("");
					invalidateRoom();
				},
			}
		);
	};

	const onSubmit = () => {
		send().catch(() => undefined);
	};

	if (hidden) {
		return null;
	}

	const badgeCount = unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : unreadCount;

	return (
		<>
			{mounted ? (
				<Suspense fallback={null}>
					<SupportChatDeepLink onOpen={openPanel} />
				</Suspense>
			) : null}
			{open ? (
				<Card className="fixed right-4 bottom-36 z-50 flex h-96 w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 md:bottom-24">
					<div className="flex items-center justify-between gap-2 border-b p-3">
						<span className="font-medium text-sm">운영자 문의</span>
						<Button
							aria-label="문의 닫기"
							onClick={() => setOpen(false)}
							size="icon-sm"
							variant="ghost"
						>
							<X />
						</Button>
					</div>
					<div
						className="flex flex-1 flex-col gap-2 overflow-y-auto p-3"
						ref={scrollRef}
					>
						{messages.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								운영자에게 궁금한 점을 남겨 주세요.
							</p>
						) : (
							messages.map((message) => (
								<div
									className={cn(
										"flex",
										message.senderType === "inquirer"
											? "justify-end"
											: "justify-start"
									)}
									key={message.id}
								>
									<div
										className={cn(
											"max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
											message.senderType === "inquirer"
												? "bg-primary text-primary-foreground"
												: "bg-muted text-foreground"
										)}
									>
										{message.body}
									</div>
								</div>
							))
						)}
					</div>
					{isBlocked ? (
						<p className="border-t p-3 text-muted-foreground text-sm">
							문의 발신이 제한된 상태예요.
						</p>
					) : (
						<div className="flex items-center gap-2 border-t p-3">
							<Input
								maxLength={BODY_MAX}
								onChange={(event) => setDraft(event.target.value)}
								onKeyDown={(event) => {
									// 한글 IME 조합 확정 Enter는 발신이 아니다.
									if (event.key === "Enter" && !event.nativeEvent.isComposing) {
										event.preventDefault();
										onSubmit();
									}
								}}
								placeholder="메시지를 입력하세요"
								value={draft}
							/>
							<Button
								aria-label="전송"
								disabled={draft.trim() === "" || sendMutation.isPending}
								onClick={onSubmit}
								size="icon"
							>
								<SendHorizontal />
							</Button>
						</div>
					)}
				</Card>
			) : null}
			<span className="fixed right-4 bottom-20 z-50 inline-flex md:bottom-6">
				<Button
					aria-label="운영자 문의"
					className="rounded-full"
					onClick={() => setOpen((prev) => !prev)}
					size="icon-lg"
				>
					<MessageCircle />
				</Button>
				{unreadCount > 0 ? (
					<Badge className="absolute -top-2 -right-2 min-w-5 justify-center px-1 text-xs">
						{badgeCount}
					</Badge>
				) : null}
			</span>
		</>
	);
}
