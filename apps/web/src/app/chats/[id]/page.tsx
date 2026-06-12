"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { FieldError, FormError } from "@/components/bambi/form-message";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { formatDateTime, formatNullable, formatPay } from "@/lib/bambi-format";
import { interviewStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

const textareaClassName =
	"min-h-24 w-full min-w-0 rounded-none border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50";

const getErrorCode = (error: Error): string | undefined =>
	"code" in error && typeof error.code === "string" ? error.code : undefined;

const getInterviewStatusLabel = (status: string): string =>
	interviewStatusLabels[status as keyof typeof interviewStatusLabels] ?? status;

const getInterviewStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "confirmed" || status === "completed") {
		return "good";
	}

	if (status === "proposed") {
		return "warning";
	}

	if (status === "declined" || status === "canceled") {
		return "danger";
	}

	return "default";
};

const getMutationErrorMessage = (fallback: string, error: Error): string => {
	const errorCode = getErrorCode(error);

	if (errorCode === "FORBIDDEN") {
		return "권한이 없거나 차단된 채팅방입니다.";
	}

	if (errorCode === "UNAUTHORIZED") {
		return "로그인 후 다시 시도해 주세요.";
	}

	return error.message || fallback;
};

export default function ChatDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const queryClient = useQueryClient();
	const [messageBody, setMessageBody] = useState("");
	const [messageError, setMessageError] = useState<null | string>(null);
	const [scheduledAt, setScheduledAt] = useState("");
	const [locationNote, setLocationNote] = useState("");
	const [interviewError, setInterviewError] = useState<null | string>(null);
	const [scheduleActionError, setScheduleActionError] = useState<null | string>(
		null
	);

	const roomQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({ input: { id } })
	);

	const invalidateRoom = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.chats.getById.queryKey({ input: { id } }),
		});
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.chats.listMine.queryKey(),
		});
	};

	const sendMessageMutation = useMutation(
		orpc.bambi.chats.sendMessage.mutationOptions({
			onError: (error) => {
				const message = getMutationErrorMessage(
					"메시지를 전송하지 못했습니다.",
					error
				);
				setMessageError(message);
				toast.error(message);
			},
			onSuccess: async () => {
				setMessageBody("");
				setMessageError(null);
				await invalidateRoom();
			},
		})
	);

	const proposeInterviewMutation = useMutation(
		orpc.bambi.chats.proposeInterview.mutationOptions({
			onError: (error) => {
				const message = getMutationErrorMessage(
					"면접 일정을 제안하지 못했습니다.",
					error
				);
				setInterviewError(message);
				toast.error(message);
			},
			onSuccess: async () => {
				setScheduledAt("");
				setLocationNote("");
				setInterviewError(null);
				await invalidateRoom();
			},
		})
	);

	const setInterviewStatusMutation = useMutation(
		orpc.bambi.chats.setInterviewStatus.mutationOptions({
			onError: (error) => {
				const message = getMutationErrorMessage(
					"면접 일정 상태를 변경하지 못했습니다.",
					error
				);
				setScheduleActionError(message);
				toast.error(message);
			},
			onSuccess: async () => {
				setScheduleActionError(null);
				await invalidateRoom();
			},
		})
	);

	const handleSendMessage = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const body = messageBody.trim();

		if (!body) {
			setMessageError("메시지를 입력해 주세요.");
			return;
		}

		if (body.length > 2000) {
			setMessageError("메시지는 2,000자 이하로 입력해 주세요.");
			return;
		}

		sendMessageMutation.mutate({
			body,
			chatRoomId: id,
		});
	};

	const handleProposeInterview = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!scheduledAt) {
			setInterviewError("면접 일시를 선택해 주세요.");
			return;
		}

		const scheduledDate = new Date(scheduledAt);

		if (Number.isNaN(scheduledDate.getTime())) {
			setInterviewError("올바른 면접 일시를 선택해 주세요.");
			return;
		}

		proposeInterviewMutation.mutate({
			chatRoomId: id,
			locationNote: locationNote.trim() || undefined,
			scheduledAt: scheduledDate.toISOString(),
		});
	};

	const handleSetInterviewStatus = (
		interviewScheduleId: string,
		status: "confirmed" | "declined"
	) => {
		setInterviewStatusMutation.mutate({
			interviewScheduleId,
			status,
		});
	};

	if (roomQuery.isLoading) {
		return <Loader />;
	}

	if (roomQuery.isError && getErrorCode(roomQuery.error) === "NOT_FOUND") {
		return (
			<PageShell
				description="삭제되었거나 참여 권한이 없는 채팅방입니다."
				title="채팅 상세"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href={"/chats" as Route}
						>
							채팅 목록으로
						</Link>
					}
					description="참여 중인 채팅방만 상세 내용을 확인할 수 있습니다."
					title="채팅방을 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (roomQuery.isError) {
		return (
			<PageShell
				description="채팅방 정보를 불러오지 못했습니다."
				title="채팅 상세"
			>
				<EmptyState
					action={
						<Button onClick={() => roomQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="채팅방을 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	const roomDetail = roomQuery.data;

	if (!roomDetail) {
		return (
			<PageShell
				description="삭제되었거나 참여 권한이 없는 채팅방입니다."
				title="채팅 상세"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href={"/chats" as Route}
						>
							채팅 목록으로
						</Link>
					}
					description="참여 중인 채팅방만 상세 내용을 확인할 수 있습니다."
					title="채팅방을 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

	const { currentUserId, jobPost, messages, room, schedules } = roomDetail;

	return (
		<PageShell
			description="지원 대화를 이어가고 면접 일정을 제안하거나 확정합니다."
			title="채팅 상세"
		>
			<section className="grid gap-4 border p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<div className="min-w-0 space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<StatusBadge tone={room.isBlocked ? "danger" : "good"}>
							{room.isBlocked ? "차단됨" : "대화 가능"}
						</StatusBadge>
						<span className="text-muted-foreground text-xs">
							업데이트 {formatDateTime(room.updatedAt)}
						</span>
					</div>
					<div className="space-y-1">
						<h2 className="break-words font-semibold text-xl tracking-normal">
							{jobPost?.title ?? "공고 정보 없음"}
						</h2>
						<p className="break-all text-muted-foreground text-sm">
							공고 {room.jobPostId}
						</p>
					</div>
				</div>
				<aside className="grid gap-3 border-t pt-4 text-sm lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
					<div>
						<p className="text-muted-foreground text-xs">업종 · 지역</p>
						<p className="mt-1 break-words">
							{jobPost
								? `${jobPost.industryCategory} · ${jobPost.region}`
								: "미입력"}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs">급여</p>
						<p className="mt-1">
							{jobPost
								? formatPay(jobPost.payAmount, jobPost.payUnit)
								: "미입력"}
						</p>
					</div>
					<Link
						className={buttonVariants({
							className: "w-full",
							variant: "outline",
						})}
						href={`/jobs/${room.jobPostId}` as Route}
					>
						공고 보기
					</Link>
				</aside>
			</section>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<section className="min-w-0 space-y-4">
					<div className="flex items-center justify-between gap-3">
						<h2 className="font-medium text-base">메시지</h2>
						<span className="text-muted-foreground text-xs">
							{messages.length}개
						</span>
					</div>

					<div className="min-h-80 space-y-3 border p-4">
						{messages.length === 0 ? (
							<EmptyState
								description="첫 메시지를 보내 지원 대화를 시작해 보세요."
								title="아직 메시지가 없습니다"
							/>
						) : (
							messages.map((message) => {
								const isMine = message.senderUserId === currentUserId;

								return (
									<article
										className={
											isMine
												? "ml-auto max-w-[82%] space-y-1 text-right"
												: "mr-auto max-w-[82%] space-y-1 text-left"
										}
										key={message.id}
									>
										<div
											className={
												isMine
													? "inline-block rounded-md bg-primary px-3 py-2 text-left text-primary-foreground"
													: "inline-block rounded-md border bg-muted/40 px-3 py-2 text-left"
											}
										>
											<p className="whitespace-pre-wrap break-words text-sm leading-6">
												{message.body}
											</p>
										</div>
										<p className="text-muted-foreground text-xs">
											{isMine ? "나" : "상대"} ·{" "}
											{formatDateTime(message.createdAt)}
										</p>
									</article>
								);
							})
						)}
					</div>

					<form className="space-y-3 border p-4" onSubmit={handleSendMessage}>
						<FormError message={messageError} />
						<div className="space-y-2">
							<Label htmlFor="messageBody">메시지</Label>
							<textarea
								aria-describedby={
									messageError ? "message-body-error" : undefined
								}
								aria-invalid={Boolean(messageError)}
								className={textareaClassName}
								disabled={sendMessageMutation.isPending}
								id="messageBody"
								maxLength={2000}
								name="messageBody"
								onChange={(event) => {
									setMessageBody(event.target.value);
									setMessageError(null);
								}}
								placeholder="메시지를 입력하세요."
								required
								value={messageBody}
							/>
							<FieldError
								id="message-body-error"
								message={
									messageBody.length > 1900
										? `${messageBody.length}/2000`
										: undefined
								}
							/>
						</div>
						<div className="flex justify-end">
							<Button disabled={sendMessageMutation.isPending} type="submit">
								{sendMessageMutation.isPending ? "전송 중…" : "전송"}
							</Button>
						</div>
					</form>
				</section>

				<aside className="space-y-4">
					<section className="space-y-3 border p-4">
						<div>
							<h2 className="font-medium text-base">면접 일정 제안</h2>
							<p className="mt-1 text-muted-foreground text-xs">
								상대에게 확인받을 면접 일시와 장소 메모를 보냅니다.
							</p>
						</div>
						<form className="space-y-3" onSubmit={handleProposeInterview}>
							<FormError message={interviewError} />
							<div className="space-y-2">
								<Label htmlFor="scheduledAt">면접 일시</Label>
								<Input
									aria-describedby={
										interviewError ? "scheduled-at-error" : undefined
									}
									aria-invalid={Boolean(interviewError)}
									disabled={proposeInterviewMutation.isPending}
									id="scheduledAt"
									name="scheduledAt"
									onChange={(event) => {
										setScheduledAt(event.target.value);
										setInterviewError(null);
									}}
									required
									type="datetime-local"
									value={scheduledAt}
								/>
								<FieldError id="scheduled-at-error" />
							</div>
							<div className="space-y-2">
								<Label htmlFor="locationNote">장소 메모</Label>
								<textarea
									className="min-h-20 w-full min-w-0 rounded-none border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50"
									disabled={proposeInterviewMutation.isPending}
									id="locationNote"
									maxLength={300}
									name="locationNote"
									onChange={(event) => {
										setLocationNote(event.target.value);
										setInterviewError(null);
									}}
									placeholder="예: 강남역 2번 출구 근처 매장"
									value={locationNote}
								/>
							</div>
							<Button
								className="w-full"
								disabled={proposeInterviewMutation.isPending}
								type="submit"
							>
								{proposeInterviewMutation.isPending ? "제안 중…" : "일정 제안"}
							</Button>
						</form>
					</section>

					<section className="space-y-3 border p-4">
						<div className="flex items-center justify-between gap-3">
							<h2 className="font-medium text-base">면접 일정</h2>
							<span className="text-muted-foreground text-xs">
								{schedules.length}개
							</span>
						</div>
						<FormError message={scheduleActionError} />
						{schedules.length === 0 ? (
							<EmptyState
								description="제안된 면접 일정이 없습니다."
								title="일정 없음"
							/>
						) : (
							<div className="divide-y border">
								{schedules.map((schedule) => {
									const canRespond =
										schedule.status === "proposed" &&
										schedule.proposedByUserId !== currentUserId;
									const isStatusPending = setInterviewStatusMutation.isPending;

									return (
										<article className="space-y-3 p-3" key={schedule.id}>
											<div className="flex flex-wrap items-center gap-2">
												<StatusBadge
													tone={getInterviewStatusTone(schedule.status)}
												>
													{getInterviewStatusLabel(schedule.status)}
												</StatusBadge>
												<span className="text-muted-foreground text-xs">
													{schedule.proposedByUserId === currentUserId
														? "내 제안"
														: "상대 제안"}
												</span>
											</div>
											<div className="space-y-1">
												<p className="font-medium text-sm">
													{formatDateTime(schedule.scheduledAt)}
												</p>
												<p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">
													{formatNullable(schedule.locationNote)}
												</p>
											</div>
											{canRespond ? (
												<div className="grid grid-cols-2 gap-2">
													<Button
														disabled={isStatusPending}
														onClick={() =>
															handleSetInterviewStatus(schedule.id, "confirmed")
														}
														size="sm"
														type="button"
													>
														확정
													</Button>
													<Button
														disabled={isStatusPending}
														onClick={() =>
															handleSetInterviewStatus(schedule.id, "declined")
														}
														size="sm"
														type="button"
														variant="outline"
													>
														거절
													</Button>
												</div>
											) : null}
										</article>
									);
								})}
							</div>
						)}
					</section>
				</aside>
			</div>
		</PageShell>
	);
}
