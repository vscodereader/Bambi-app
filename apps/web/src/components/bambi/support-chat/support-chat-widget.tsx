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
import {
	type RefObject,
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

// 서버 sendMessage 입력 한도(SUPPORT_CHAT_BODY_MAX)와 맞춘다.
const BODY_MAX = 1000;
// 두 자리 배지는 원형 버튼 밖으로 삐져나간다 — 정확한 수보다 "밀렸다"는 신호가 중요.
const BADGE_CAP = 9;
const ISSUE_ERROR = "문의를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";

// 쿼리 파라미터 구독. 위젯은 루트 레이아웃 상주라 라우터 내비게이션으로는 리마운트되지
// 않는다 — 마운트 1회 읽기로는 인앱 알림 클릭(router.push)이 무동작이라 useSearchParams로
// 값 변화를 구독한다(Suspense 경계가 필요해 자식으로 분리).
// - ?support-chat=1 → 알림 딥링크로 패널 열림
// - ?auth=… → 로그인/가입 카드가 떠 있는 화면 — 위젯을 감춘다(버튼이 인증 카드를 가리고,
//   그 상태에서 문의를 시작하는 흐름 자체가 어색하다). 감춤 판정은 페인트 전에 반영해야
//   로그인 화면에서 버튼이 한 프레임도 비치지 않는다 → useLayoutEffect.
function SupportChatSearchParams({
	onAuthVisible,
	onOpen,
}: {
	onAuthVisible: (visible: boolean) => void;
	onOpen: () => void;
}) {
	const searchParams = useSearchParams();
	const shouldOpen = searchParams.get("support-chat") === "1";
	const onAuthScreen = searchParams.get("auth") !== null;
	useLayoutEffect(() => {
		onAuthVisible(onAuthScreen);
	}, [onAuthScreen, onAuthVisible]);
	useEffect(() => {
		if (shouldOpen) {
			onOpen();
		}
	}, [shouldOpen, onOpen]);
	return null;
}

// 실제 senderType은 유니온이지만 여기선 "inquirer" 여부만 본다 — 최소 형태로 받는다.
interface SupportChatMessage {
	body: string;
	id: string;
	senderType: string;
}

// 열린 패널 본문. 위젯에서 분리한 건 렌더 트리 정리보다 인지 복잡도 예산 때문이다 —
// 감춤/열림 래핑 아래 이 블록의 중첩 삼항이 쌓이면 위젯 함수가 임계를 넘는다.
function SupportChatPanel({
	draft,
	isBlocked,
	messages,
	onClose,
	onDraftChange,
	onSubmit,
	scrollRef,
	sending,
}: {
	draft: string;
	isBlocked: boolean;
	messages: SupportChatMessage[];
	onClose: () => void;
	onDraftChange: (value: string) => void;
	onSubmit: () => void;
	scrollRef: RefObject<HTMLDivElement | null>;
	sending: boolean;
}) {
	return (
		<Card className="fixed right-4 bottom-36 z-50 flex h-96 w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 md:bottom-24">
			<div className="flex items-center justify-between gap-2 border-b p-3">
				<span className="font-medium text-sm">운영자 문의</span>
				<Button
					aria-label="문의 닫기"
					onClick={onClose}
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
						onChange={(event) => onDraftChange(event.target.value)}
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
						disabled={draft.trim() === "" || sending}
						onClick={onSubmit}
						size="icon"
					>
						<SendHorizontal />
					</Button>
				</div>
			)}
		</Card>
	);
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
	// 파라미터 구독(useSearchParams)은 마운트 후에만 렌더한다. SSR에서 이 훅은 Suspense
	// 경계를 서스펜드시켜 서버 HTML에 경계 마커가 남고, 클라이언트 첫 렌더와 형제
	// 노드(Toaster) 매칭이 어긋나 hydration 불일치가 났다 — 서버·클라 첫 렌더를
	// 둘 다 null로 맞춘다. 버튼 UI도 mounted 뒤에만 렌더한다: 인증 카드(?auth=) 판정이
	// 나기 전에 버튼을 먼저 그리면 로그인 화면에서 한 프레임 비친다.
	const [mounted, setMounted] = useState(false);
	// 인증 카드(?auth=)가 떠 있는 화면인지 — SupportChatSearchParams가 페인트 전에 갱신.
	const [onAuthScreen, setOnAuthScreen] = useState(false);
	// 세로 배너 레일(AdBannerRail) 하단의 포털 앵커. 초광폭(≥1720px)에서만 보이는 sticky
	// 레일이라, 보이지 않을 땐 null로 두고 런처를 지금처럼 fixed 우하단에 그린다.
	const [railAnchor, setRailAnchor] = useState<HTMLElement | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// 마운트 1회: 쿠키 존재 반영. 딥링크·인증 화면 판정은 SupportChatSearchParams가 담당.
	useEffect(() => {
		setHasCookie(
			Boolean(readSupportChatTokenFromCookieString(document.cookie))
		);
		setMounted(true);
	}, []);

	// 레일 앵커를 찾는다. aside가 `hidden min-[1720px]:block`이라 뷰포트가 좁으면
	// display:none → offsetParent가 null이다(그 경우 fixed 폴백). pathname 변경(페이지 이동)과
	// resize 때 다시 판정한다 — 한 페이지에 둘일 수 있어 첫 매치만 쓴다.
	useEffect(() => {
		const sync = () => {
			const el = document.querySelector<HTMLElement>(
				"[data-support-chat-anchor]"
			);
			setRailAnchor(el && el.offsetParent !== null ? el : null);
		};
		sync();
		window.addEventListener("resize", sync);
		return () => window.removeEventListener("resize", sync);
	}, [pathname]);

	const openPanel = useCallback(() => setOpen(true), []);

	// 운영자 계정은 위젯을 감춘다(문의를 받는 쪽). 로그인 상태에서만 프로필을 조회.
	const profileQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session),
	});
	const isAdmin = profileQuery.data?.bambiProfile?.role === "admin";
	const isModeratorPath = pathname?.startsWith("/moderator") ?? false;
	// 로그인 상태에서 프로필 응답 전까지도 감춘다 — admin 계정에서 버튼이 잠깐 떴다
	// 사라지는 깜빡임 방지(비로그인은 조회가 없어 해당 없음). 인증 카드(?auth=) 위에도
	// 버튼을 세우지 않는다.
	const hidden =
		isModeratorPath ||
		isAdmin ||
		onAuthScreen ||
		(Boolean(session) && profileQuery.isPending);

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

	const badgeCount = unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : unreadCount;

	// 버튼 + 미읽음 배지. 렌더 위치(레일 포털 / fixed)와 무관하게 함께 따라간다.
	const launcher = (
		<>
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
		</>
	);

	// 보이는 레일 앵커가 있으면 배너 바로 아래에 portal로, 없으면 fixed 우하단에.
	// 앵커가 DOM에서 떨어진 오래된 참조면(페이지 이동 직후 한 프레임) fixed로 폴백한다.
	const renderLauncher = () =>
		railAnchor?.isConnected ? (
			createPortal(
				<span className="relative inline-flex">{launcher}</span>,
				railAnchor
			)
		) : (
			<span className="fixed right-4 bottom-20 z-50 inline-flex md:bottom-6">
				{launcher}
			</span>
		);

	// UI는 mounted 이후에만 그린다 — 인증 화면(?auth=) 판정이 나기 전에 버튼을 먼저
	// 그리면 로그인 화면에서 한 프레임 비친다.
	if (!mounted) {
		return null;
	}

	// hidden이어도 파라미터 구독은 살려 둔다 — 여기서 통째로 return null 하면 인증
	// 카드가 닫혀 ?auth=가 사라져도 구독이 없어 감춤이 영영 안 풀린다.
	return (
		<>
			<Suspense fallback={null}>
				<SupportChatSearchParams
					onAuthVisible={setOnAuthScreen}
					onOpen={openPanel}
				/>
			</Suspense>
			{hidden ? null : (
				<>
					{open ? (
						<SupportChatPanel
							draft={draft}
							isBlocked={isBlocked}
							messages={messages}
							onClose={() => setOpen(false)}
							onDraftChange={setDraft}
							onSubmit={onSubmit}
							scrollRef={scrollRef}
							sending={sendMutation.isPending}
						/>
					) : null}
					{renderLauncher()}
				</>
			)}
		</>
	);
}
