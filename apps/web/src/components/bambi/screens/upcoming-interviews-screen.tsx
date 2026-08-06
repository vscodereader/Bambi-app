"use client";

// 밤비 — "예정된 면접" 화면. 구직자·구인자 공용이다(운영자만 메뉴에서 숨긴다).
// 카드는 아코디언이다: 접으면 일시·상대·공고·상태, 펼치면 면접 정보와 그 방의 채팅 내역
// (읽기 전용)이 열린다. 면접 완료 처리도 여기 있다 — 방 화면에 두면 방을 나간 뒤 완료를
// 영영 못 누르기 때문이다(구인자에게만 노출, 서버 가드도 같은 기준).
// 카드의 상대 이름은 호출자 기준으로 서버가 정하므로(chats.listMyUpcomingInterviews →
// resolveCounterpartNames) 구직자에겐 업소명, 구인자에겐 구직자 닉네임이 나온다.

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { EmptyState } from "@/components/bambi/empty-state";
import { CalendarIcon } from "@/components/bambi/icons";
import { MyPageShell } from "@/components/bambi/my-page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import { interviewStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 뱃지 톤은 상태 라벨(bambi-options의 공용 맵)과 짝지어 쓴다 — 제안=대기, 확정=진행,
// 완료·거절·취소는 지나간 일이라 중립.
const STATUS_TONES = {
	confirmed: "good",
	proposed: "warning",
} as const;

interface InterviewListItem {
	counterpartName: null | string;
	id: string;
	jobTitle: null | string;
	locationNote: null | string;
	scheduledAt: Date | string;
	status: string;
	viewerIsEmployer: boolean;
}

function padTwo(value: number): string {
	return value < 10 ? `0${value}` : `${value}`;
}

function formatSchedule(scheduledAt: Date | string): string {
	const date = new Date(scheduledAt);
	const year = date.getFullYear();
	const month = padTwo(date.getMonth() + 1);
	const day = padTwo(date.getDate());
	const weekday = WEEKDAY_LABELS[date.getDay()];
	const hours = padTwo(date.getHours());
	const minutes = padTwo(date.getMinutes());
	return `${year}.${month}.${day} (${weekday}) ${hours}:${minutes}`;
}

function formatMessageTime(createdAt: Date | string): string {
	const date = new Date(createdAt);
	return `${padTwo(date.getMonth() + 1)}.${padTwo(date.getDate())} ${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

function resolveStatusLabel(status: string): string {
	return (
		interviewStatusLabels[status as keyof typeof interviewStatusLabels] ??
		status
	);
}

function resolveStatusTone(status: string): "default" | "good" | "warning" {
	return STATUS_TONES[status as keyof typeof STATUS_TONES] ?? "default";
}

export function UpcomingInterviewsScreen() {
	const query = useQuery(
		orpc.bambi.chats.listMyUpcomingInterviews.queryOptions()
	);
	const interviews = query.data ?? [];

	return (
		<MyPageShell title="예정된 면접">
			<div className="flex flex-col gap-3">
				{query.isLoading ? (
					<InterviewSkeletonList />
				) : (
					<InterviewList interviews={interviews} />
				)}
			</div>
		</MyPageShell>
	);
}

function InterviewSkeletonList() {
	const placeholders = ["a", "b", "c"];
	return (
		<>
			{placeholders.map((key) => (
				<div
					className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
					key={key}
				>
					<Skeleton className="size-10 rounded-lg" />
					<div className="flex flex-1 flex-col gap-2">
						<Skeleton className="h-6 w-48 rounded-md" />
						<Skeleton className="h-4 w-32 rounded-md" />
					</div>
					<Skeleton className="h-6 w-16 rounded-full" />
				</div>
			))}
		</>
	);
}

function InterviewList({ interviews }: { interviews: InterviewListItem[] }) {
	if (interviews.length === 0) {
		return (
			<EmptyState
				description="제안·확정된 면접과 최근 완료한 면접이 여기에 표시됩니다."
				title="예정된 면접이 없어요"
			/>
		);
	}

	return (
		// base-ui 아코디언은 기본이 "하나만 펼침 + 닫으면 언마운트"라 그대로 쓴다 —
		// 채팅 내역 조회가 펼칠 때만 나가고, 여러 개가 동시에 열려 화면이 늘어지지 않는다.
		<Accordion className="flex flex-col gap-3">
			{interviews.map((interview) => (
				<InterviewAccordionItem interview={interview} key={interview.id} />
			))}
		</Accordion>
	);
}

function InterviewAccordionItem({
	interview,
}: {
	interview: InterviewListItem;
}) {
	const counterpart = interview.counterpartName ?? "상대 정보 없음";
	const job = interview.jobTitle ?? "공고 정보 없음";

	return (
		<AccordionItem
			className="rounded-xl border border-border bg-card px-4"
			value={interview.id}
		>
			<AccordionTrigger className="gap-3 py-4 hover:no-underline">
				<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
					<span className="inline-flex size-5">
						<CalendarIcon />
					</span>
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="flex flex-wrap items-center gap-2">
						<span className="break-words font-extrabold text-foreground text-lg [font-family:var(--font-display)]">
							{formatSchedule(interview.scheduledAt)}
						</span>
						<StatusBadge tone={resolveStatusTone(interview.status)}>
							{resolveStatusLabel(interview.status)}
						</StatusBadge>
					</span>
					<span className="break-words text-muted-foreground text-sm">
						{counterpart} · {job}
					</span>
				</span>
			</AccordionTrigger>
			<AccordionContent className="flex flex-col gap-4 pb-4">
				<div className="flex flex-col gap-1 rounded-lg bg-secondary p-3">
					<div className="font-bold text-sm">
						{formatSchedule(interview.scheduledAt)}
					</div>
					<div className="text-muted-foreground text-xs">
						{interview.locationNote ?? "장소 메모가 없어요."}
					</div>
				</div>
				{interview.viewerIsEmployer && interview.status === "confirmed" ? (
					<CompleteInterviewAction interviewScheduleId={interview.id} />
				) : null}
				<InterviewChatHistory interviewScheduleId={interview.id} />
			</AccordionContent>
		</AccordionItem>
	);
}

// 면접 완료는 구인자만 누른다. 성공하면 목록을 무효화해 같은 카드가 완료 뱃지로 바뀐다.
function CompleteInterviewAction({
	interviewScheduleId,
}: {
	interviewScheduleId: string;
}) {
	const queryClient = useQueryClient();
	const completeMutation = useMutation(
		orpc.bambi.chats.setInterviewStatus.mutationOptions({
			onSuccess: () => {
				queryClient
					.invalidateQueries({
						queryKey: orpc.bambi.chats.listMyUpcomingInterviews.key(),
					})
					.catch(() => undefined);
			},
		})
	);

	return (
		<div className="flex flex-col gap-2">
			<Button
				className="w-full sm:w-fit"
				disabled={completeMutation.isPending}
				onClick={() =>
					completeMutation.mutate({ interviewScheduleId, status: "completed" })
				}
				size="lg"
			>
				{completeMutation.isPending ? "처리 중" : "면접 완료 처리"}
			</Button>
			{completeMutation.isError ? (
				<p className="m-0 font-semibold text-destructive text-xs">
					완료 처리에 실패했어요. 잠시 후 다시 시도해 주세요.
				</p>
			) : null}
		</div>
	);
}

// 펼친 면접의 채팅 내역(읽기 전용). 커서로 위로 거슬러 올라가며, 읽음영수증은 남지 않는다.
// 나간 방이어도 열린다 — 면접이 걸린 방은 열람 예외다(서버도 같은 기준).
function InterviewChatHistory({
	interviewScheduleId,
}: {
	interviewScheduleId: string;
}) {
	const historyQuery = useInfiniteQuery(
		orpc.bambi.chats.getInterviewChatContext.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as null | { createdAt: string; id: string },
			input: (cursor: null | { createdAt: string; id: string }) => ({
				cursor: cursor ?? undefined,
				interviewScheduleId,
			}),
		})
	);

	if (historyQuery.isLoading) {
		return <Skeleton className="h-24 w-full rounded-lg" />;
	}

	if (historyQuery.isError) {
		return (
			<p className="m-0 text-muted-foreground text-sm">
				채팅 내역을 불러오지 못했어요.
			</p>
		);
	}

	const pages = historyQuery.data?.pages ?? [];
	const currentUserId = pages[0]?.currentUserId;
	// 페이지는 최신 → 과거 순으로 쌓이므로, 화면에는 뒤집어 이어 붙인다(각 페이지 안은
	// 이미 오래된 → 최신 순).
	const messages = [...pages].reverse().flatMap((page) => page.messages);

	if (messages.length === 0) {
		return (
			<p className="m-0 text-muted-foreground text-sm">
				주고받은 메시지가 없어요.
			</p>
		);
	}

	return (
		<div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3">
			{historyQuery.hasNextPage ? (
				<Button
					className="self-center"
					disabled={historyQuery.isFetchingNextPage}
					onClick={() => {
						historyQuery.fetchNextPage().catch(() => undefined);
					}}
					size="sm"
					variant="ghost"
				>
					{historyQuery.isFetchingNextPage
						? "불러오는 중"
						: "이전 메시지 더 보기"}
				</Button>
			) : null}
			{messages.map((message) => (
				<InterviewChatBubble
					body={message.body}
					createdAt={message.createdAt}
					isMine={message.senderUserId === currentUserId}
					key={message.id}
					kind={message.kind}
				/>
			))}
		</div>
	);
}

function InterviewChatBubble({
	body,
	createdAt,
	isMine,
	kind,
}: {
	body: string;
	createdAt: Date | string;
	isMine: boolean;
	kind: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1",
				isMine ? "items-end" : "items-start"
			)}
		>
			{/* 첨부·연락처 요청은 본문이 이미 사람이 읽는 문구라("첨부 파일을 보냈습니다.")
			    안내 톤으로만 구분한다. */}
			<div
				className={cn(
					"max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
					isMine
						? "bg-primary text-primary-foreground"
						: "bg-secondary text-foreground",
					kind === "text" ? "" : "italic"
				)}
			>
				{body}
			</div>
			<span className="text-muted-foreground text-xs">
				{formatMessageTime(createdAt)}
			</span>
		</div>
	);
}
