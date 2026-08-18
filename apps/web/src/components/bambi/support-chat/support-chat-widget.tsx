"use client";

import { readSupportChatTokenFromCookieString } from "@bambi-app/api/services/bambi-support-chat-token";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card } from "@bambi-app/ui/components/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@bambi-app/ui/components/tooltip";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, MessageCircle, MessageSquare } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { WidgetConversation } from "./widget-conversation";
import { WidgetHome } from "./widget-home";
import { WidgetMessages, type WidgetRoomSummary } from "./widget-messages";

// 두 자리 배지는 원형 버튼 밖으로 삐져나간다 — 정확한 수보다 "밀렸다"는 신호가 중요.
const BADGE_CAP = 9;
const ISSUE_ERROR = "문의를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.";
// 패널 컨테이너 — 3개 뷰가 공유한다.
const PANEL_CLASS =
	"fixed right-4 bottom-36 z-50 flex h-[70dvh] max-h-[34rem] w-80 max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 md:bottom-24";

const TABS = [
	{ icon: Home, label: "홈", name: "home" },
	{ icon: MessageSquare, label: "메시지", name: "messages" },
] as const;

type WidgetView =
	| { name: "conversation"; roomId: null | string } // null = 새 대화
	| { name: "home" }
	| { name: "messages" };

// 쿼리 파라미터 구독. 위젯은 루트 레이아웃 상주라 라우터 내비게이션으로는 리마운트되지
// 않는다 — 마운트 1회 읽기로는 인앱 알림 클릭(router.push)이 무동작이라 useSearchParams로
// 값 변화를 구독한다(Suspense 경계가 필요해 자식으로 분리).
// - ?support-chat=1 → 알림 딥링크로 패널 열림(홈 뷰로)
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

// 열린 패널 본문. 위젯에서 분리한 건 인지 복잡도 예산 때문이다 — 뷰 라우팅·탭바 중첩이
// 감춤/열림 래핑 아래 쌓이면 위젯 함수가 임계를 넘는다.
function SupportChatPanel({
	faqs,
	isSending,
	notice,
	onBack,
	onClose,
	onMarkRead,
	onNavigate,
	onOpenRoom,
	onSend,
	onSetView,
	onStartChat,
	onStartNew,
	rooms,
	totalUnread,
	view,
}: {
	faqs: { id: string; question: string }[];
	isSending: boolean;
	notice: null | string;
	onBack: () => void;
	onClose: () => void;
	onMarkRead: (roomId: string) => void;
	onNavigate: () => void;
	onOpenRoom: (roomId: string) => void;
	onSend: (roomId: null | string, body: string) => Promise<boolean>;
	onSetView: (view: WidgetView) => void;
	onStartChat: () => void;
	onStartNew: () => void;
	rooms: WidgetRoomSummary[];
	totalUnread: number;
	view: WidgetView;
}) {
	if (view.name === "conversation") {
		return (
			<Card className={PANEL_CLASS}>
				<WidgetConversation
					isSending={isSending}
					onBack={onBack}
					onClose={onClose}
					onMarkRead={onMarkRead}
					onSend={onSend}
					onStartNew={onStartNew}
					roomId={view.roomId}
					unreadCount={
						rooms.find((room) => room.id === view.roomId)?.unreadCount ?? 0
					}
				/>
			</Card>
		);
	}
	return (
		<Card className={PANEL_CLASS}>
			{view.name === "home" ? (
				<WidgetHome
					faqs={faqs}
					notice={notice}
					onClose={onClose}
					onNavigate={onNavigate}
					onStartChat={onStartChat}
				/>
			) : (
				<WidgetMessages
					onOpenRoom={onOpenRoom}
					onStartNew={onStartNew}
					rooms={rooms}
				/>
			)}
			<div className="flex border-t">
				{TABS.map((tab) => (
					<button
						className={cn(
							"flex flex-1 flex-col items-center gap-1 py-2 text-xs",
							view.name === tab.name ? "text-primary" : "text-muted-foreground"
						)}
						key={tab.name}
						onClick={() => onSetView({ name: tab.name })}
						type="button"
					>
						<tab.icon className="size-5" />
						<span className="relative">
							{tab.label}
							{tab.name === "messages" && totalUnread > 0 ? (
								<span className="absolute top-0 -right-2 size-2 rounded-full bg-primary" />
							) : null}
						</span>
					</button>
				))}
			</div>
		</Card>
	);
}

export function SupportChatWidget() {
	const pathname = usePathname();
	const { data: session } = authClient.useSession();
	const queryClient = useQueryClient();

	const [open, setOpen] = useState(false);
	const [view, setView] = useState<WidgetView>({ name: "home" });
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

	// 패널을 열 때(런처·딥링크) 항상 홈 뷰로 리셋한다.
	const openPanel = useCallback(() => {
		setView({ name: "home" });
		setOpen(true);
	}, []);

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
	const roomsQuery = useQuery({
		...orpc.bambi.supportChat.getMyRooms.queryOptions(),
		enabled: canPoll,
		refetchInterval: open ? 3000 : 30_000,
	});
	const rooms: WidgetRoomSummary[] = roomsQuery.data?.rooms ?? [];
	const totalUnread = rooms.reduce((sum, room) => sum + room.unreadCount, 0);

	// 홈 탭 데이터 — 신원 불요, 패널 연 뒤 1회(5분 신선).
	const homeQuery = useQuery({
		...orpc.bambi.supportChat.getWidgetHome.queryOptions(),
		enabled: mounted && !hidden && open,
		staleTime: 5 * 60 * 1000,
	});

	const markReadMutation = useMutation(
		orpc.bambi.supportChat.markRead.mutationOptions()
	);
	const sendMutation = useMutation(
		orpc.bambi.supportChat.sendMessage.mutationOptions()
	);

	const invalidateRooms = useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.supportChat.getMyRooms.queryKey(),
			}),
		[queryClient]
	);
	const invalidateMessages = useCallback(
		(roomId: string) =>
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.supportChat.getRoomMessages.queryKey({
					input: { roomId },
				}),
			}),
		[queryClient]
	);

	const markReadMutate = markReadMutation.mutate;
	const markRoomRead = useCallback(
		(roomId: string) =>
			markReadMutate({ roomId }, { onSuccess: () => invalidateRooms() }),
		[markReadMutate, invalidateRooms]
	);

	// 발신 로직은 셸에 남긴다(쿠키 발급 + 새 대화/기존 발신). roomId=null이면 새 대화
	// 생성 후 반환 roomId로 뷰를 고정한다. 실패(차단·종료 409 포함) 시 rooms/messages를
	// 무효화해 종료·차단 상태가 반영되게 한다.
	const send = useCallback(
		async (roomId: null | string, body: string): Promise<boolean> => {
			const trimmed = body.trim();
			if (!trimmed || sendMutation.isPending) {
				return false;
			}
			// 비로그인 + 쿠키 없음 → 먼저 익명 신원 쿠키를 발급받는다. 발급 후 orpc 요청이
			// x-bambi-support-chat 헤더로 신원을 실어 보낸다.
			if (!(session || hasCookie)) {
				try {
					const res = await fetch("/api/support-chat", { method: "POST" });
					if (!res.ok) {
						toast.error(ISSUE_ERROR);
						return false;
					}
					setHasCookie(true);
				} catch {
					toast.error(ISSUE_ERROR);
					return false;
				}
			}
			try {
				const result = await sendMutation.mutateAsync({
					body: trimmed,
					roomId: roomId ?? undefined,
				});
				if (roomId === null) {
					setView({ name: "conversation", roomId: result.roomId });
				}
				invalidateRooms();
				invalidateMessages(result.roomId);
				return true;
			} catch (error) {
				toast.error((error as Error).message);
				invalidateRooms();
				if (roomId) {
					invalidateMessages(roomId);
				}
				return false;
			}
		},
		[session, hasCookie, sendMutation, invalidateRooms, invalidateMessages]
	);

	// 홈의 "메시지를 보내주세요" — 진행 중(open) 최신 대화가 있으면 그 대화, 없으면 새 대화.
	const startChat = useCallback(() => {
		const latestOpen = rooms.find((room) => room.status === "open");
		setView({
			name: "conversation",
			roomId: latestOpen ? latestOpen.id : null,
		});
	}, [rooms]);

	const badgeCount = totalUnread > BADGE_CAP ? `${BADGE_CAP}+` : totalUnread;
	const onToggle = () => (open ? setOpen(false) : openPanel());
	// 미읽음 배지 — 두 런처 형태가 같은 캡 로직을 공유한다(코너에 absolute 배치).
	const unreadBadge =
		totalUnread > 0 ? (
			<Badge className="absolute -top-2 -right-2 min-w-5 justify-center px-1 text-xs">
				{badgeCount}
			</Badge>
		) : null;

	// 레일 포털일 때: 세로 배너와 같은 가로 폭(13rem*4/9 = aspect-[4/9] h-52의 폭)의 정사각
	// 말풍선 아이콘 버튼. 호버 시 살짝 리프트 + 버튼 아래에 툴팁("운영자 문의하기").
	const railLauncher = (
		<Tooltip>
			<TooltipTrigger
				aria-label="운영자 문의"
				className="relative flex aspect-square w-[calc(13rem*4/9)] items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-primary)] transition hover:-translate-y-0.5"
				onClick={onToggle}
			>
				<MessageCircle className="size-7" />
				{unreadBadge}
			</TooltipTrigger>
			<TooltipContent side="bottom">운영자 문의하기</TooltipContent>
		</Tooltip>
	);

	// fixed 폴백(좁은 화면 우하단): 원형 FAB — 현행 유지.
	const fabLauncher = (
		<>
			<Button
				aria-label="운영자 문의"
				className="rounded-full"
				onClick={onToggle}
				size="icon-lg"
			>
				<MessageCircle />
			</Button>
			{unreadBadge}
		</>
	);

	// 보이는 레일 앵커가 있으면 배너 스택 아래에 CTA 카드로, 없으면 fixed 우하단 원형 FAB로.
	// 앵커가 DOM에서 떨어진 오래된 참조면(페이지 이동 직후 한 프레임) fixed로 폴백한다.
	const renderLauncher = () =>
		railAnchor?.isConnected ? (
			createPortal(railLauncher, railAnchor)
		) : (
			<span className="fixed right-4 bottom-20 z-50 inline-flex md:bottom-6">
				{fabLauncher}
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
							faqs={homeQuery.data?.faqs ?? []}
							isSending={sendMutation.isPending}
							notice={homeQuery.data?.notice ?? null}
							onBack={() => setView({ name: "messages" })}
							onClose={() => setOpen(false)}
							onMarkRead={markRoomRead}
							onNavigate={() => setOpen(false)}
							onOpenRoom={(roomId) => setView({ name: "conversation", roomId })}
							onSend={send}
							onSetView={setView}
							onStartChat={startChat}
							onStartNew={() => setView({ name: "conversation", roomId: null })}
							rooms={rooms}
							totalUnread={totalUnread}
							view={view}
						/>
					) : null}
					{renderLauncher()}
				</>
			)}
		</>
	);
}
