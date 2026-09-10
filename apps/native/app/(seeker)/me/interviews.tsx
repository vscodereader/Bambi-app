import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import {
	Button,
	Checkbox,
	Skeleton,
	Surface,
	TextArea,
	TextField,
	useThemeColor,
} from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	ChatActionConfirmation,
	type ChatActionTarget,
} from "@/src/components/chat/chat-action-confirmation";
import { MemberOnly } from "@/src/components/member-only";
import { chatActionDecision } from "@/src/lib/chat/chat-availability";
import {
	canCancelInterview,
	canRespondToInterview,
	canSubmitReview,
	interviewStatusErrorMessage,
	interviewStatusLabel,
	interviewStatusTone,
	REVIEW_BODY_MAX_LENGTH,
	REVIEW_RATINGS,
	reviewBodyError,
	reviewErrorMessage,
	reviewStatusLabel,
	reviewStatusTone,
} from "@/src/lib/me-interviews";
import { orpc, queryClient } from "@/src/lib/orpc";

// 웹 InterviewListItem과 같은 규칙 — 화면이 실제로 쓰는 필드만 좁혀서 받는다.
// scheduledAt이 Date | string인 이유는 oRPC 경유 값이 둘 다 올 수 있어서다(formatDateTime이 처리).
interface InterviewListItem {
	chatRoomId: string;
	counterpartName: null | string;
	id: string;
	jobTitle: null | string;
	locationNote: null | string;
	proposedByUserId: string;
	scheduledAt: Date | string;
	status: string;
	viewerIsEmployer: boolean;
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

// 후기는 구직자만, 완료된 면접에만 남긴다 — reviews.create는 그 방에 status="completed"인
// 면접이 1건 이상 있을 것을 요구한다(reviews.ts:96). 서버 message는 "confirmed or completed"
// 라고 하지만 쿼리는 completed만 보므로 UI도 completed에만 연다.
// 나간 방에서도 열린다(allowLeftRoom: true)라 채팅방이 아니라 이 카드가 유일한 진입점이다.
function InterviewReviewSection({
	chatRoomId,
	scheduledLabel,
}: {
	chatRoomId: string;
	scheduledLabel: string;
}) {
	const [body, setBody] = useState("");
	const [rating, setRating] = useState(0);
	const [isAnonymous, setIsAnonymous] = useState(false);
	const [errorMessage, setErrorMessage] = useState<null | string>(null);
	const mutedColor = useThemeColor("muted");
	const warningColor = useThemeColor("warning");
	// 카드마다 이 컴포넌트가 서지만 react-query 키가 같아 요청은 1회다.
	const reviewsQuery = useQuery(orpc.bambi.reviews.listMine.queryOptions());
	const createReview = useMutation(
		orpc.bambi.reviews.create.mutationOptions({
			onError: (error) => {
				setErrorMessage(
					reviewErrorMessage("code" in error ? String(error.code) : "")
				);
			},
			// 목록이 갱신되면 폼이 읽기 카드로 바뀌는 것이 피드백이다. 면접 자체는 후기로
			// 변하지 않으므로 listMyUpcomingInterviews는 건드리지 않는다.
			onSuccess: async () => {
				setErrorMessage(null);
				// 탭 화면은 언마운트되지 않아 폼 상태가 그대로 남는다 — 직접 비워야 재진입 시
				// 지운 줄 알았던 초안이 되살아나지 않는다.
				setBody("");
				setRating(0);
				setIsAnonymous(false);
				// reviews.create가 트랜잭션 안에서 review_write 포인트를 적립하고 등급까지
				// 바꾼다(reviews.ts:173). 내 정보 탭은 언마운트되지 않아 remount refetch가
				// 없으므로 잔액·등급 캐시도 함께 친다(me/attendance.tsx:477과 같은 형태).
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.reviews.listMine.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.attendance.getMine.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointSettings.getMineHistory.key(),
					}),
				]);
			},
		})
	);

	return (
		<View className="gap-3 rounded-lg bg-background p-3">
			<Text className="font-semibold text-foreground text-sm" selectable>
				후기 남기기
			</Text>
			{renderContent()}
		</View>
	);

	function renderContent() {
		if (reviewsQuery.isPending) {
			return <Skeleton className="h-24 rounded-lg" />;
		}

		if (reviewsQuery.isError) {
			return (
				<View className="gap-2">
					<Text className="text-muted text-sm" selectable>
						후기 상태를 확인하지 못했어요.
					</Text>
					<Button
						onPress={() => reviewsQuery.refetch()}
						size="sm"
						variant="secondary"
					>
						<Button.Label>다시 시도</Button.Label>
					</Button>
				</View>
			);
		}

		// 웹과 같이 방 기준으로 찾는다. 서버의 중복 검사는 공고 기준이라 여기서 못 찾아도
		// 제출이 CONFLICT일 수 있고, 그건 reviewErrorMessage가 받아낸다.
		const existingReview = reviewsQuery.data.find(
			(item) => item.chatRoomId === chatRoomId
		);

		if (existingReview) {
			return (
				<View className="gap-2">
					<Pill tone={reviewStatusTone(existingReview.status)}>
						{reviewStatusLabel(existingReview.status)}
					</Pill>
					<Text className="text-foreground text-sm leading-5" selectable>
						별점 {existingReview.rating}점 · {existingReview.body}
					</Text>
				</View>
			);
		}

		// 서버 validateReviewInput과 같은 기준. 제출 전까지 붉은 오류를 띄우는 대신 안내 톤으로
		// 두고 버튼을 막는다 — 별점 미선택은 폼에 단서가 없으므로 항상 보이게 한다.
		const bodyHint = reviewBodyError(body);
		const hint =
			rating === 0
				? "별점을 선택해 주세요."
				: (bodyHint ??
					"개인 연락처나 외부 메신저 아이디는 공개되지 않을 수 있어요.");

		return (
			<View className="gap-3">
				<Text className="text-muted text-xs leading-5" selectable>
					면접 이후 경험을 남기면 다른 구직자가 업체를 더 잘 판단할 수 있어요.
				</Text>
				{/* 별 5개가 각각 버튼으로 읽히므로 라벨에 점수를 넣는다. hitSlop은 부모 경계를
				    넘지 못해 터치 타깃은 패딩으로 확보한다. */}
				<View className="flex-row gap-1">
					{REVIEW_RATINGS.map((score) => (
						<Pressable
							accessibilityLabel={`별점 ${score}점`}
							accessibilityRole="button"
							accessibilityState={{ selected: score === rating }}
							className="p-2 active:opacity-75"
							key={score}
							onPress={() => setRating(score)}
						>
							<Ionicons
								color={score <= rating ? warningColor : mutedColor}
								name={score <= rating ? "star" : "star-outline"}
								size={28}
							/>
						</Pressable>
					))}
				</View>
				<TextField>
					<TextArea
						accessibilityLabel="후기 내용"
						maxLength={REVIEW_BODY_MAX_LENGTH}
						onChangeText={setBody}
						placeholder="면접 안내, 공고와 실제 조건 일치 여부, 응대 경험을 남겨주세요."
						value={body}
					/>
				</TextField>
				<View className="flex-row items-start justify-between gap-2">
					<Text className="flex-1 text-muted text-xs leading-5" selectable>
						{hint}
					</Text>
					<Text className="text-muted text-xs">
						{body.trim().length}/{REVIEW_BODY_MAX_LENGTH}
					</Text>
				</View>
				{/* 익명 여부는 프라이버시에 직접 영향이라 기본값(false)에 맡기지 않고 노출한다.
				    Checkbox 루트는 24px + hitSlop 6뿐인데 hitSlop이 부모 경계를 못 넘으므로,
				    행 전체를 Pressable로 감싸 라벨까지 타깃으로 쓰고 세로 패딩으로 높이를 준다. */}
				<Pressable
					accessibilityLabel="익명으로 표시"
					accessibilityRole="checkbox"
					accessibilityState={{ checked: isAnonymous }}
					className="flex-row items-start gap-3 py-2.5 active:opacity-75"
					onPress={() => setIsAnonymous((isOn) => !isOn)}
				>
					<Checkbox
						isSelected={isAnonymous}
						onSelectedChange={setIsAnonymous}
					/>
					<View className="flex-1 gap-1">
						<Text className="font-semibold text-foreground text-sm">
							익명으로 표시
						</Text>
						<Text className="text-muted text-xs leading-5">
							선택하지 않으면 이름이 마스킹되어 표시돼요(예: 김*지).
						</Text>
					</View>
				</Pressable>
				{errorMessage ? (
					<Text className="text-danger text-sm" selectable>
						{errorMessage}
					</Text>
				) : null}
				<Button
					accessibilityLabel={`${scheduledLabel} 면접 후기 등록`}
					isDisabled={
						!canSubmitReview({ body, rating }) || createReview.isPending
					}
					onPress={confirmSubmit}
				>
					<Button.Label>
						{createReview.isPending ? "등록 중" : "후기 등록"}
					</Button.Label>
				</Button>
			</View>
		);
	}

	function confirmSubmit() {
		Alert.alert(
			"후기를 등록할까요?",
			"한 번 등록한 후기는 삭제하거나 다시 작성할 수 없어요.",
			[
				{ style: "cancel", text: "닫기" },
				{
					onPress: () =>
						createReview.mutate({
							body: body.trim(),
							chatRoomId,
							isAnonymous,
							rating,
						}),
					text: "등록",
				},
			]
		);
	}
}

function InterviewCard({
	interview,
	isResponding,
	onRespond,
	viewerUserId,
}: {
	interview: InterviewListItem;
	isResponding: boolean;
	onRespond: (status: "canceled" | "confirmed" | "declined") => void;
	viewerUserId: string | undefined;
}) {
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);
	const scheduledLabel = formatDateTime(interview.scheduledAt);
	const counterpart = interview.counterpartName ?? "상대 정보 없음";

	const confirmCancel = () => {
		Alert.alert(
			"면접을 취소할까요?",
			"취소하면 되돌릴 수 없고 상대에게 알림이 갑니다.",
			[
				{ style: "cancel", text: "닫기" },
				{
					onPress: () => onRespond("canceled"),
					style: "destructive",
					text: "면접 취소",
				},
			]
		);
	};

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
				{/* 서버는 proposed·confirmed면 양측 누구나 취소할 수 있지만(제안자 제한 없음),
				    거절과 취소는 결과가 같은데(둘 다 목록에서 사라지고 되돌릴 수 없다) 구분할
				    단서가 없다. 그래서 웹(seeker-chat-room-responsive.tsx)과 같이 수락·거절이
				    뜨는 카드에는 겹쳐 내지 않는다 — 내가 제안한 proposed(철회)와 confirmed에만.
				    나간 방·차단된 방은 서버가 막으므로 문구로 받아낸다. */}
				{canCancelInterview(interview) &&
				!canRespondToInterview(interview, viewerUserId) ? (
					<Button
						accessibilityLabel={`${scheduledLabel} 면접 취소`}
						isDisabled={isResponding}
						onPress={confirmCancel}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>면접 취소</Button.Label>
					</Button>
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
			{!interview.viewerIsEmployer && interview.status === "completed" ? (
				<InterviewReviewSection
					chatRoomId={interview.chatRoomId}
					scheduledLabel={scheduledLabel}
				/>
			) : null}
			{isHistoryOpen ? (
				<InterviewChatHistory interviewScheduleId={interview.id} />
			) : null}
		</Surface>
	);
}

// 면접 목록 화면. 구직자는 상대가 제안한 면접의 수락·거절과, 진행 중인 면접의 취소를 한다 —
// 완료 처리는 서버 canSetInterviewStatus가 구인자 전용이라(chats.ts:293) 이 (seeker) 스택에
// 두지 않는다. 정렬(진행중 먼저 → 완료 뒤)은 서버가 정하므로 다시 세우지 않는다.
function SeekerMeInterviewsInner() {
	const [confirmation, setConfirmation] = useState<ChatActionTarget | null>(
		null
	);
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
				// error.message를 그대로 쓰지 않는다 — oRPC가 message 없는 ORPCError에 영어
				// 기본 문구를 채워 넣어("Forbidden"), 취소가 붙은 뒤로는 그 경로가 자주 뜬다.
				Alert.alert("처리하지 못했어요", interviewStatusErrorMessage(error));
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
			<ChatActionConfirmation
				isPending={setStatus.isPending}
				onClose={() => setConfirmation(null)}
				onDecision={(confirmed) => {
					if (!confirmation) {
						return;
					}
					setStatus.mutate(
						{
							interviewScheduleId: confirmation.id,
							status: chatActionDecision("interview", confirmed),
						},
						{ onSuccess: () => setConfirmation(null) }
					);
				}}
				target={confirmation}
			/>
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
						onRespond={(status) => {
							if (status === "confirmed") {
								setConfirmation({ id: interview.id, kind: "interview" });
								return;
							}
							setStatus.mutate({
								interviewScheduleId: interview.id,
								status,
							});
						}}
						viewerUserId={sessionUserId}
					/>
				))}
			</View>
		);
	}
}

export default function SeekerMeInterviewsScreen() {
	return (
		<MemberOnly>
			<SeekerMeInterviewsInner />
		</MemberOnly>
	);
}
