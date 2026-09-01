import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Button, Skeleton, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	canRespondToInterview,
	interviewStatusLabel,
	interviewStatusTone,
} from "@/src/lib/me-interviews";
import { orpc, queryClient } from "@/src/lib/orpc";

// 웹 InterviewListItem과 같은 규칙 — 화면이 실제로 쓰는 필드만 좁혀서 받는다.
// scheduledAt이 Date | string인 이유는 oRPC 경유 값이 둘 다 올 수 있어서다(formatDateTime이 처리).
interface InterviewListItem {
	counterpartName: null | string;
	id: string;
	jobTitle: null | string;
	locationNote: null | string;
	proposedByUserId: string;
	scheduledAt: Date | string;
	status: string;
}

// 웹 아코디언과 같은 엔드포인트를 쓴다 — 이 목록은 나간 방(soft-deleted)의 면접도
// 내려주는데(chats.ts:1029 "방이 사라져도 일정 카드는 남아야 한다"), chats.getById는
// 나간 방이면 NOT_FOUND라 채팅방 화면으로 보내면 되돌아올 길 없는 막다른 길이 된다.
// getInterviewChatContext만 allowLeftRoom: true다(chats.ts:1755). 읽기 전용이라
// 읽음 영수증도 남지 않는다.
function InterviewChatHistory({
	interviewScheduleId,
}: {
	interviewScheduleId: string;
}) {
	const query = useQuery(
		orpc.bambi.chats.getInterviewChatContext.queryOptions({
			input: { interviewScheduleId },
		})
	);

	if (query.isPending) {
		return <Skeleton className="h-24 rounded-lg" />;
	}

	if (query.isError) {
		return (
			<View className="gap-2 rounded-lg bg-background p-3">
				<Text className="text-muted text-sm" selectable>
					채팅 내역을 불러오지 못했어요.
				</Text>
				<Button onPress={() => query.refetch()} size="sm" variant="secondary">
					<Button.Label>다시 시도</Button.Label>
				</Button>
			</View>
		);
	}

	const { counterpartName, currentUserId, messages } = query.data;

	if (messages.length === 0) {
		return (
			<Text className="text-muted text-sm" selectable>
				주고받은 메시지가 없어요.
			</Text>
		);
	}

	// ponytail: 첫 페이지(서버 기본 개수)만 그린다 — nextCursor "더 보기"는 필요해지면.
	return (
		<View className="gap-2">
			{messages.map((message) => (
				<View className="gap-1 rounded-lg bg-background p-3" key={message.id}>
					<Text className="text-muted text-xs" selectable>
						{message.senderUserId === currentUserId
							? "나"
							: (counterpartName ?? "상대")}{" "}
						· {formatDateTime(message.createdAt)}
					</Text>
					<Text className="text-foreground leading-5" selectable>
						{message.body}
					</Text>
				</View>
			))}
		</View>
	);
}

function InterviewCard({
	interview,
	isResponding,
	onRespond,
	viewerUserId,
}: {
	interview: InterviewListItem;
	isResponding: boolean;
	onRespond: (status: "confirmed" | "declined") => void;
	viewerUserId: string | undefined;
}) {
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);
	const scheduledLabel = formatDateTime(interview.scheduledAt);
	const counterpart = interview.counterpartName ?? "상대 정보 없음";

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row flex-wrap items-center justify-between gap-2">
				<Text className="font-bold text-foreground text-lg" selectable>
					{scheduledLabel}
				</Text>
				<Pill tone={interviewStatusTone(interview.status)}>
					{interviewStatusLabel(interview.status)}
				</Pill>
			</View>
			<Text className="text-muted text-sm" selectable>
				{counterpart} · {interview.jobTitle ?? "공고 정보 없음"}
			</Text>
			{/* 장소 메모가 없으면 줄 자체를 뺀다 — 웹의 "장소 메모가 없어요" 자리표시는 모바일에서 소음. */}
			{interview.locationNote ? (
				<View className="rounded-lg bg-background p-3">
					<Text className="text-muted text-xs" selectable>
						{interview.locationNote}
					</Text>
				</View>
			) : null}
			<View className="flex-row flex-wrap gap-2">
				{canRespondToInterview(interview, viewerUserId) ? (
					<>
						<Button
							// 카드마다 반복되는 버튼이라 스크린리더가 구분할 수 있게 일시를 넣는다.
							accessibilityLabel={`${scheduledLabel} 면접 수락`}
							isDisabled={isResponding}
							onPress={() => onRespond("confirmed")}
							size="sm"
						>
							<Button.Label>수락</Button.Label>
						</Button>
						<Button
							accessibilityLabel={`${scheduledLabel} 면접 거절`}
							isDisabled={isResponding}
							onPress={() => onRespond("declined")}
							size="sm"
							variant="secondary"
						>
							<Button.Label>거절</Button.Label>
						</Button>
					</>
				) : null}
				{/* 채팅방 화면(chats/[id])으로 보내지 않는다 — 나간 방이면 그쪽은 영구 NOT_FOUND다. */}
				<Button
					accessibilityLabel={`${scheduledLabel} 면접 채팅 내역 ${isHistoryOpen ? "접기" : "보기"}`}
					onPress={() => setIsHistoryOpen((isOpen) => !isOpen)}
					size="sm"
					variant="tertiary"
				>
					<Button.Label>
						{isHistoryOpen ? "내역 접기" : "내역 보기"}
					</Button.Label>
				</Button>
			</View>
			{isHistoryOpen ? (
				<InterviewChatHistory interviewScheduleId={interview.id} />
			) : null}
		</Surface>
	);
}

// ponytail: 후기 작성(reviews.create + reviews.listMine)은 후속 — 웹은 completed 면접 후기를
// 채팅 사이드바에서 이 화면으로 의도적으로 옮겨(방을 나가도 남길 수 있게) 여기가 유일한 진입점인데,
// native 전체에 reviews.create 호출부가 아직 없다. 폼·REVIEW_ERROR_MESSAGES 한국어 맵 이식 필요.
//
// 면접 목록 화면. 구직자는 상대가 제안한 면접의 수락·거절까지만 한다 —
// 완료 처리는 서버 canSetInterviewStatus가 구인자 전용이고(chats.ts:293), 취소는 기존
// 채팅방 화면에 있다. 정렬(진행중 먼저 → 완료 뒤)은 서버가 정하므로 다시 세우지 않는다.
export default function SeekerMeInterviewsScreen() {
	const session = authClient.useSession();
	const sessionUserId = session.data?.user?.id;
	const query = useQuery(
		orpc.bambi.chats.listMyUpcomingInterviews.queryOptions()
	);
	const setStatus = useMutation(
		orpc.bambi.chats.setInterviewStatus.mutationOptions({
			// 실패 쪽에서도 목록을 다시 읽는다 — CONFLICT(그 사이 상대가 취소·확정)면 화면이
			// 최신 상태를 따라가야 한다.
			onError: async (error) => {
				Alert.alert(
					"처리하지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.chats.listMyUpcomingInterviews.key(),
				});
			},
			// 별도 알림 없이 카드가 확정·거절 배지로 바뀌는 것이 피드백이다.
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.chats.listMyUpcomingInterviews.key(),
				});
			},
		})
	);

	const interviews = query.data ?? [];

	return (
		<BambiScreen>
			{/* _layout.tsx의 Stack.Screen 목록에 이 라우트가 없어 기본 제목이 파일명으로 뜬다.
			    SeekerStackHeader가 options.title을 그대로 그리므로 화면에서 지정한다. */}
			<Stack.Screen options={{ title: "예정된 면접" }} />
			<BambiHeader
				description="제안·확정된 면접과 최근 완료한 면접을 확인해요."
				title="예정된 면접"
			/>
			{renderBody()}
		</BambiScreen>
	);

	function renderBody() {
		// 전체화면 LoadingState 대신 스켈레톤 — 헤더가 먼저 자리를 잡아 화면이 튀지 않는다.
		if (query.isPending) {
			return (
				<View className="gap-4">
					<Skeleton className="h-28 rounded-lg" />
					<Skeleton className="h-28 rounded-lg" />
					<Skeleton className="h-28 rounded-lg" />
				</View>
			);
		}

		// ErrorState를 쓰지 않는다 — 그 안이 BambiScreen(=flex-1 Container)이라 여기(높이 auto인
		// gap-4 p-4 래퍼) 안에 넣으면 높이가 0으로 접히고 스크롤도 중첩된다. StateCard는 Surface라
		// 그대로 흐른다. 헤더의 Stack.Screen title을 살리려고 최상위 early return 대신 인라인이다.
		if (query.isError) {
			return (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="로그인 상태와 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
					title="면접 일정을 불러오지 못했어요"
				/>
			);
		}

		if (interviews.length === 0) {
			return (
				<StateCard
					description="제안·확정된 면접과 최근 완료한 면접이 여기에 표시됩니다."
					title="예정된 면접이 없어요"
				/>
			);
		}

		return (
			<View className="gap-4">
				{interviews.map((interview) => (
					<InterviewCard
						interview={interview}
						isResponding={setStatus.isPending}
						key={interview.id}
						onRespond={(status) =>
							setStatus.mutate({
								interviewScheduleId: interview.id,
								status,
							})
						}
						viewerUserId={sessionUserId}
					/>
				))}
			</View>
		);
	}
}
