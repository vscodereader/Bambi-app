"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import type { Job } from "@/lib/bambi/types";
import { interviewStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";
import { AppBar, Avatar, Badge, Button, Card } from "../ds";
import { CheckIcon, PhoneIcon, ShieldIcon } from "../icons";

interface ContactRevealProps {
	job?: Job;
	onBack: () => void;
	onDone: () => void;
	roomId?: string;
}

type ContactMethod = "email" | "kakao" | "phone";

const contactMethodLabels: Record<ContactMethod, string> = {
	email: "이메일",
	kakao: "카카오톡",
	phone: "전화번호",
};

const contactMethodPlaceholders: Record<ContactMethod, string> = {
	email: "예: bambi@example.com",
	kakao: "예: 카카오톡 ID",
	phone: "예: 010-0000-0000",
};

const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

const getMutationErrorMessage = (error: Error): string => {
	if ("code" in error && error.code === "FORBIDDEN") {
		return "연락처 공개 조건을 만족하지 못했어요. 면접 확정과 휴대폰 인증 상태를 확인해 주세요.";
	}

	if ("code" in error && error.code === "UNAUTHORIZED") {
		return "로그인 후 다시 시도해 주세요.";
	}

	return "연락처 공개 동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

interface ContactRow {
	contactMethod: string;
	contactValue: string;
}

const formatContact = ({ contactMethod, contactValue }: ContactRow): string =>
	`${contactMethodLabels[contactMethod as ContactMethod] ?? contactMethod} · ${contactValue}`;

// 완료된 면접이면 "확정"이 아니라 실제 상태(완료) 라벨을 보여준다. enum 원값은
// 노출하지 않고 라벨 맵을 거친다.
const getScheduleBadgeLabel = (status?: string): string => {
	if (!status) {
		return "대기";
	}

	return (
		interviewStatusLabels[status as keyof typeof interviewStatusLabels] ??
		status
	);
};

function MineContactCard({ contacts }: { contacts: ContactRow[] }) {
	return (
		<Card className="rounded-lg" pad="lg" tone="outline">
			<div className="flex items-center gap-3">
				<div className="inline-flex size-11 items-center justify-center rounded-xl bg-coral-50 text-coral-700">
					<span className="inline-flex size-[22px]">
						<PhoneIcon />
					</span>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<Badge tone="success">
							<span className="inline-flex size-3">
								<CheckIcon />
							</span>
							내가 공개함
						</Badge>
					</div>
					{contacts.map((contact) => (
						<p
							className="mt-2 mb-0 break-words font-extrabold text-foreground text-lg"
							key={`${contact.contactMethod}-${contact.contactValue}`}
						>
							{formatContact(contact)}
						</p>
					))}
				</div>
			</div>
		</Card>
	);
}

// 연락처 공개는 구인자만 한다. 서버가 조건 미충족 시 값을 아예 안 싣기 때문에
// 구직자 화면에서는 canView만 보고 안내 문구를 고르면 된다.
function EmployerContactCard({
	canView,
	contacts,
}: {
	canView: boolean;
	contacts: ContactRow[];
}) {
	return (
		<Card className="rounded-lg" pad="lg" tone="outline">
			<div className="flex items-center justify-between gap-3">
				<h2 className="m-0 font-extrabold text-lg">구인자 연락처</h2>
				<Badge tone={canView ? "success" : "pending"}>
					{canView ? "공개됨" : "비공개"}
				</Badge>
			</div>
			{canView ? (
				<div className="mt-3 flex flex-col gap-2">
					{contacts.map((contact) => (
						<p
							className="m-0 break-words font-extrabold text-foreground text-lg"
							key={`${contact.contactMethod}-${contact.contactValue}`}
						>
							{formatContact(contact)}
						</p>
					))}
				</div>
			) : (
				<p className="mt-3 mb-0 text-muted-foreground text-sm">
					구인자가 아직 연락처를 공개하지 않았어요. 공개되면 여기에 표시돼요.
				</p>
			)}
		</Card>
	);
}

function EmployerRevealForm({
	contactMethod,
	contactValue,
	errorMessage,
	hasConfirmedSchedule,
	isPending,
	onContactMethodChange,
	onContactValueChange,
	onSubmit,
}: {
	contactMethod: ContactMethod;
	contactValue: string;
	errorMessage: null | string;
	hasConfirmedSchedule: boolean;
	isPending: boolean;
	onContactMethodChange: (value: ContactMethod) => void;
	onContactValueChange: (value: string) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<form className="grid gap-4" onSubmit={onSubmit}>
			<Card className="rounded-lg" pad="lg" tone="outline">
				<label
					className="font-bold text-muted-foreground text-xs"
					htmlFor="contact-method"
				>
					공개할 연락 방식
				</label>
				<select
					className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-coral-100"
					id="contact-method"
					onChange={(event) =>
						onContactMethodChange(event.target.value as ContactMethod)
					}
					value={contactMethod}
				>
					{Object.entries(contactMethodLabels).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
				<label
					className="mt-4 block font-bold text-muted-foreground text-xs"
					htmlFor="contact-value"
				>
					연락처
				</label>
				<input
					className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-coral-100"
					id="contact-value"
					onChange={(event) => onContactValueChange(event.target.value)}
					placeholder={contactMethodPlaceholders[contactMethod]}
					value={contactValue}
				/>
				{errorMessage ? (
					<p className="mt-3 mb-0 font-semibold text-red-600 text-xs">
						{errorMessage}
					</p>
				) : null}
				<Button
					block
					className="mt-4"
					disabled={!hasConfirmedSchedule || isPending}
					size="lg"
					type="submit"
					variant={hasConfirmedSchedule ? "primary" : "secondary"}
				>
					{isPending ? "저장 중" : "내 연락처 공개"}
				</Button>
			</Card>
		</form>
	);
}

export function ContactReveal({
	job,
	onBack,
	onDone,
	roomId,
}: ContactRevealProps) {
	if (!roomId) {
		return <ContactRevealPreview job={job} onBack={onBack} onDone={onDone} />;
	}

	return <ContactRevealApi onBack={onBack} onDone={onDone} roomId={roomId} />;
}

function ContactRevealApi({
	onBack,
	onDone,
	roomId,
}: Required<Pick<ContactRevealProps, "onBack" | "onDone" | "roomId">>) {
	const queryClient = useQueryClient();
	const [contactMethod, setContactMethod] = useState<ContactMethod>("phone");
	const [contactValue, setContactValue] = useState("");
	const [errorMessage, setErrorMessage] = useState<null | string>(null);
	const roomQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({ input: { id: roomId } })
	);
	// 공개 상태의 진실의 원천. 로컬 state에만 담으면 새로고침 시 내 공개 연락처가 사라진다.
	const revealQuery = useQuery(
		orpc.bambi.chats.getContactReveal.queryOptions({
			input: { chatRoomId: roomId },
		})
	);
	const mineContacts = revealQuery.data?.mineContacts ?? [];
	const counterpartContacts = revealQuery.data?.counterpartContacts ?? [];
	const canViewCounterpart = revealQuery.data?.canViewCounterpart ?? false;
	const viewerIsEmployer = revealQuery.data?.viewerIsEmployer ?? false;
	const hasMineConsent = mineContacts.length > 0;
	// 완료된 면접도 확정을 거친 것이라 연락처 공개·열람을 계속 허용한다.
	const confirmedSchedule = roomQuery.data?.schedules.find(
		(schedule) =>
			schedule.status === "confirmed" || schedule.status === "completed"
	);
	const revealContactMutation = useMutation(
		orpc.bambi.chats.revealContact.mutationOptions({
			onError: (error) => {
				setErrorMessage(getMutationErrorMessage(error));
			},
			onSuccess: async () => {
				setErrorMessage(null);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.chats.getById.queryKey({
							input: { id: roomId },
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.chats.getContactReveal.queryKey({
							input: { chatRoomId: roomId },
						}),
					}),
				]);
			},
		})
	);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!confirmedSchedule) {
			setErrorMessage("확정된 면접 일정이 있어야 연락처를 공개할 수 있어요.");
			return;
		}

		const trimmedContactValue = contactValue.trim();

		if (trimmedContactValue.length < 3) {
			setErrorMessage("공개할 연락처를 3자 이상 입력해 주세요.");
			return;
		}

		revealContactMutation.mutate({
			contactMethod,
			contactValue: trimmedContactValue,
			interviewScheduleId: confirmedSchedule.id,
		});
	};

	if (roomQuery.isLoading || revealQuery.isLoading) {
		return (
			<div
				className={cn(
					"mx-auto w-full px-5 py-10 text-center font-bold text-muted-foreground md:px-6",
					SEEKER_CONTENT_WIDTH
				)}
			>
				연락처 공개 조건을 확인하고 있어요.
			</div>
		);
	}

	if (roomQuery.isError || !roomQuery.data) {
		return (
			<div
				className={cn(
					"mx-auto flex min-h-0 w-full flex-1 flex-col",
					SEEKER_CONTENT_WIDTH
				)}
			>
				<AppBar className="md:px-6" onBack={onBack} title="연락처 공개" />
				<div className="px-6 py-6">
					<Card className="rounded-lg text-center" pad="lg" tone="outline">
						<h1 className="m-0 font-extrabold text-xl">
							채팅방을 확인할 수 없어요
						</h1>
						<p className="mt-2 mb-4 text-muted-foreground text-sm">
							로그인 상태나 채팅방 접근 권한을 확인해 주세요.
						</p>
						<Button onClick={() => roomQuery.refetch()} variant="secondary">
							다시 시도
						</Button>
					</Card>
				</div>
			</div>
		);
	}

	const latestSchedule = roomQuery.data.schedules[0];

	return (
		<div
			className={cn(
				"mx-auto flex min-h-0 w-full flex-1 flex-col",
				SEEKER_CONTENT_WIDTH
			)}
		>
			<AppBar className="md:px-6" onBack={onBack} title="연락처 공개" />
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-2 pb-5">
				<div className="flex flex-col items-center gap-2.5 pt-2 pb-1 text-center">
					<div className="flex size-16 items-center justify-center rounded-[20px] bg-coral-50 text-coral-700">
						<span className="inline-flex size-[30px]">
							<ShieldIcon />
						</span>
					</div>
					<h1 className="mt-1 font-extrabold text-[22px] text-foreground">
						확정된 면접 뒤에만 공개돼요
					</h1>
					<p className="m-0 max-w-[320px] text-muted-foreground text-sm leading-[1.55]">
						{viewerIsEmployer
							? "공개한 연락처는 구직자에게 표시돼요. 면접이 확정된 뒤 공개할 수 있어요."
							: "면접이 확정되고 구인자가 공개하면 여기에서 연락처를 볼 수 있어요."}
					</p>
				</div>

				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h2 className="m-0 font-extrabold text-lg">면접 일정</h2>
							<p className="mt-1 mb-0 text-muted-foreground text-sm">
								{confirmedSchedule
									? formatDateTime(confirmedSchedule.scheduledAt)
									: "확정된 일정이 아직 없습니다"}
							</p>
						</div>
						<Badge tone={confirmedSchedule ? "success" : "pending"}>
							{getScheduleBadgeLabel(
								confirmedSchedule?.status ?? latestSchedule?.status
							)}
						</Badge>
					</div>
					{confirmedSchedule?.locationNote ? (
						<p className="mt-3 mb-0 text-muted-foreground text-sm">
							{confirmedSchedule.locationNote}
						</p>
					) : null}
				</Card>

				{viewerIsEmployer ? (
					<EmployerRevealForm
						contactMethod={contactMethod}
						contactValue={contactValue}
						errorMessage={errorMessage}
						hasConfirmedSchedule={Boolean(confirmedSchedule)}
						isPending={revealContactMutation.isPending}
						onContactMethodChange={setContactMethod}
						onContactValueChange={setContactValue}
						onSubmit={handleSubmit}
					/>
				) : null}

				{viewerIsEmployer ? (
					<>
						{hasMineConsent ? (
							<MineContactCard contacts={mineContacts} />
						) : null}
						<p className="m-0 text-muted-foreground text-sm">
							구직자 연락처는 제공되지 않아요.
						</p>
					</>
				) : (
					<EmployerContactCard
						canView={canViewCounterpart}
						contacts={counterpartContacts}
					/>
				)}
			</div>
			<div className="border-border border-t px-6 pt-3 pb-1.5">
				<Button
					block
					disabled={viewerIsEmployer && !hasMineConsent}
					onClick={onDone}
					size="lg"
					variant={
						viewerIsEmployer && !hasMineConsent ? "secondary" : "primary"
					}
				>
					채팅방으로 돌아가기
				</Button>
			</div>
		</div>
	);
}

function ContactRevealPreview({
	job,
	onBack,
	onDone,
}: Pick<ContactRevealProps, "job" | "onBack" | "onDone">) {
	const company = job?.company ?? "달밤 라운지";

	return (
		<div
			className={cn(
				"mx-auto flex min-h-0 w-full flex-1 flex-col",
				SEEKER_CONTENT_WIDTH
			)}
		>
			<AppBar className="md:px-6" onBack={onBack} title="연락처 공개" />
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-2 pb-5">
				<div className="flex flex-col items-center gap-2.5 pt-2 pb-1 text-center">
					<div className="flex size-16 items-center justify-center rounded-[20px] bg-coral-50 text-coral-700">
						<span className="inline-flex size-[30px]">
							<ShieldIcon />
						</span>
					</div>
					<h1 className="mt-1 font-extrabold text-[22px] text-foreground">
						면접 일정이 확정됐어요
					</h1>
					<p className="m-0 max-w-[280px] text-muted-foreground text-sm leading-[1.55]">
						면접이 확정되면 구인자가 연락처를 공개해요. 구인자가 공개한 연락처는
						이 화면에서 확인할 수 있어요.
					</p>
				</div>
				<Card className="overflow-hidden rounded-lg" pad="none">
					<div className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<Avatar name={company} square />
							<div className="flex flex-col">
								<span className="font-bold text-[15px] text-foreground">
									{company}
								</span>
								<span className="text-muted-foreground text-xs">구인자</span>
							</div>
						</div>
						<Badge dot tone="success">
							동의 가능
						</Badge>
					</div>
				</Card>
				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="flex items-center gap-3">
						<div className="inline-flex size-11 items-center justify-center rounded-xl bg-coral-50 text-coral-700">
							<span className="inline-flex size-[22px]">
								<PhoneIcon />
							</span>
						</div>
						<div className="flex flex-col">
							<span className="text-muted-foreground text-xs">
								프리뷰 연락처
							</span>
							<span className="font-extrabold text-foreground text-lg">
								면접 확정 후 직접 입력
							</span>
						</div>
					</div>
				</Card>
			</div>
			<div className="border-border border-t px-6 pt-3 pb-1.5">
				<Button block onClick={onDone} size="lg" variant="primary">
					완료
				</Button>
			</div>
		</div>
	);
}
