"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "@/utils/orpc";
import { Badge, Button, Card } from "../ds";
import { ClockIcon, DollarCircle, Message, ShieldIcon } from "../icons";

interface SeekerChatRoomResponsiveProps {
	onBack: () => void;
	onReveal: () => void;
	roomId: string;
}

const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

const formatPay = (amount?: number, unit?: string): string => {
	if (!(amount && unit)) {
		return "채팅으로 확인";
	}
	return `${unit} ${amount.toLocaleString("ko-KR")}원`;
};

const getMutationErrorMessage = (error: Error): string => {
	if ("code" in error && error.code === "UNAUTHORIZED") {
		return "로그인 후 다시 시도해 주세요.";
	}

	if ("code" in error && error.code === "FORBIDDEN") {
		return "권한이 없거나 차단된 채팅방입니다.";
	}

	return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

export function SeekerChatRoomResponsive({
	onBack,
	onReveal,
	roomId,
}: SeekerChatRoomResponsiveProps) {
	const queryClient = useQueryClient();
	const [message, setMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState<null | string>(null);
	const roomQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({ input: { id: roomId } })
	);
	const invalidateRoom = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.chats.getById.queryKey({ input: { id: roomId } }),
		});
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.chats.listMine.queryKey(),
		});
	};
	const sendMessageMutation = useMutation(
		orpc.bambi.chats.sendMessage.mutationOptions({
			onError: (error) => {
				setErrorMessage(getMutationErrorMessage(error));
			},
			onSuccess: async () => {
				setMessage("");
				setErrorMessage(null);
				await invalidateRoom();
			},
		})
	);

	if (roomQuery.isLoading) {
		return (
			<div className="mx-auto w-full max-w-[720px] px-4 py-10 text-center font-bold text-muted-foreground">
				채팅방을 불러오고 있어요.
			</div>
		);
	}

	if (roomQuery.isError || !roomQuery.data) {
		return (
			<div className="mx-auto w-full max-w-[720px] px-4 py-10">
				<Card className="rounded-lg text-center" pad="lg" tone="outline">
					<h1 className="m-0 font-extrabold text-xl">
						채팅방을 불러올 수 없어요
					</h1>
					<p className="mt-2 mb-4 text-muted-foreground text-sm">
						로그인 상태나 채팅방 접근 권한을 확인해 주세요.
					</p>
					<Button onClick={() => roomQuery.refetch()} variant="secondary">
						다시 시도
					</Button>
				</Card>
			</div>
		);
	}

	const { currentUserId, jobPost, messages, room, schedules } = roomQuery.data;
	const confirmedSchedule = schedules.find(
		(schedule) => schedule.status === "confirmed"
	);
	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const body = message.trim();

		if (!body) {
			setErrorMessage("메시지를 입력해 주세요.");
			return;
		}

		sendMessageMutation.mutate({
			body,
			chatRoomId: room.id,
		});
	};

	return (
		<div className="mx-auto grid w-full max-w-[1180px] gap-5 px-4 py-5 pb-28 md:px-6 md:py-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-8">
			<main className="min-w-0 rounded-lg bg-card shadow-sm ring-1 ring-border">
				<header className="flex items-center gap-3 border-border border-b p-4">
					<button
						className="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 font-bold text-sm"
						onClick={onBack}
						type="button"
					>
						목록
					</button>
					<div className="min-w-0 flex-1">
						<h1 className="m-0 truncate font-extrabold text-lg">
							{jobPost?.title ?? "공고 채팅"}
						</h1>
						<p className="mt-1 mb-0 truncate text-muted-foreground text-xs">
							{jobPost?.industryCategory ?? "공고"} ·{" "}
							{jobPost?.region ?? "지역 확인"}
						</p>
					</div>
					<Badge tone={room.isBlocked ? "danger" : "success"}>
						{room.isBlocked ? "차단됨" : "대화 가능"}
					</Badge>
				</header>
				<div className="border-coral-100 border-b bg-coral-50 px-4 py-3 text-coral-700">
					<div className="flex items-center gap-2 font-extrabold text-sm">
						<span className="inline-flex size-4">
							<ShieldIcon />
						</span>
						면접 확정 전 연락처 보호 중
					</div>
					<p className="mt-1 mb-0 text-xs leading-relaxed">
						외부 연락처 공유 유도나 조건 불일치는 신고할 수 있어요.
					</p>
				</div>
				<div className="flex min-h-[420px] flex-col gap-3 p-4">
					{messages.length === 0 ? (
						<div className="m-auto text-center text-muted-foreground text-sm">
							아직 메시지가 없어요. 안전하게 첫 메시지를 보내보세요.
						</div>
					) : (
						messages.map((chatMessage) => {
							const mine = chatMessage.senderUserId === currentUserId;
							return (
								<div
									className={mine ? "flex justify-end" : "flex justify-start"}
									key={chatMessage.id}
								>
									<div
										className={
											mine
												? "max-w-[78%] rounded-lg bg-coral-500 px-4 py-2 text-white"
												: "max-w-[78%] rounded-lg bg-secondary px-4 py-2 text-foreground"
										}
									>
										<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">
											{chatMessage.body}
										</p>
										<p className="mt-1 mb-0 text-[11px] opacity-70">
											{formatDateTime(chatMessage.createdAt)}
										</p>
									</div>
								</div>
							);
						})
					)}
				</div>
				<form
					className="flex items-center gap-2 border-border border-t p-4"
					onSubmit={handleSubmit}
				>
					<label className="sr-only" htmlFor="chat-message">
						메시지
					</label>
					<input
						className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-coral-100"
						id="chat-message"
						onChange={(event) => setMessage(event.target.value)}
						placeholder="메시지를 입력하세요"
						value={message}
					/>
					<Button
						disabled={sendMessageMutation.isPending}
						rightIcon={<Message />}
						size="md"
					>
						전송
					</Button>
				</form>
				{errorMessage ? (
					<div className="border-border border-t px-4 py-3 font-semibold text-red-600 text-sm">
						{errorMessage}
					</div>
				) : null}
			</main>
			<aside className="min-w-0">
				<div className="sticky top-20 grid gap-4">
					<Card className="rounded-lg" pad="lg" tone="outline">
						<h2 className="m-0 font-extrabold text-lg">공고 조건</h2>
						<div className="mt-4 grid gap-3 text-sm">
							<div className="flex items-center gap-2 font-bold">
								<span className="inline-flex size-4 text-coral-600">
									<DollarCircle />
								</span>
								{formatPay(jobPost?.payAmount, jobPost?.payUnit)}
							</div>
							<div className="flex items-center gap-2 font-bold">
								<span className="inline-flex size-4 text-coral-600">
									<ClockIcon />
								</span>
								{jobPost?.status ?? "상태 확인"}
							</div>
						</div>
					</Card>
					<Card className="rounded-lg" pad="lg" tone="outline">
						<h2 className="m-0 font-extrabold text-lg">면접 일정</h2>
						{schedules.length === 0 ? (
							<p className="mt-3 mb-0 text-muted-foreground text-sm leading-relaxed">
								아직 제안된 면접 일정이 없어요. 채팅에서 가능한 시간을
								조율해보세요.
							</p>
						) : (
							<div className="mt-3 grid gap-2">
								{schedules.map((schedule) => (
									<div
										className="rounded-lg border border-border bg-secondary p-3"
										key={schedule.id}
									>
										<div className="flex items-center justify-between gap-2">
											<strong className="text-sm">
												{formatDateTime(schedule.scheduledAt)}
											</strong>
											<Badge
												tone={
													schedule.status === "confirmed"
														? "success"
														: "pending"
												}
											>
												{schedule.status}
											</Badge>
										</div>
										{schedule.locationNote ? (
											<p className="mt-2 mb-0 text-muted-foreground text-xs">
												{schedule.locationNote}
											</p>
										) : null}
									</div>
								))}
							</div>
						)}
						<Button
							block
							className="mt-4"
							disabled={!confirmedSchedule}
							onClick={onReveal}
							size="md"
							variant={confirmedSchedule ? "primary" : "secondary"}
						>
							연락처 공개하기
						</Button>
					</Card>
				</div>
			</aside>
		</div>
	);
}
