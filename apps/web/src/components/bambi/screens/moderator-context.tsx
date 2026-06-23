"use client";

// 밤비 — 운영자 콘솔 라우트 간 공유 상태(검수 큐/신고/사용자/선택/토스트).
// 레이아웃에 ModProvider를 두면 /moderator/* 라우트 전환에도 상태가 유지된다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { QUEUE, REPORTS, USERS } from "@/lib/bambi/data";
import type {
	ManagedUser,
	QueueItem,
	Report,
	UserStatus,
} from "@/lib/bambi/types";
import { orpc } from "@/utils/orpc";

interface ModContextValue {
	bulkAction: (action: "reject" | "hold" | "approve" | "sanction") => void;
	clearSelection: () => void;
	openReports: number;
	queue: QueueItem[];
	reports: Report[];
	resolveQueue: (id: string, action: "approve" | "reject") => void;
	resolveReport: (id: string, action: "dismiss" | "act") => void;
	sanction: (id: string, status: UserStatus, label: string) => void;
	selected: string[];
	toast: string | null;
	toggleSelect: (id: string) => void;
	users: ManagedUser[];
	warnedUsers: number;
}

const ModContext = createContext<ModContextValue | null>(null);
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_ID_PATTERN = /^[qru]\d+$/;

const isUuid = (value: string) => UUID_PATTERN.test(value);
const isPreviewId = (value: string) => PREVIEW_ID_PATTERN.test(value);
const formatDate = (value: Date | string) =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
const getRoleLabel = (role: string) => {
	if (role === "admin") {
		return "운영자";
	}

	if (role === "employer") {
		return "구인자";
	}

	return "구직자";
};

export function ModProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const [queue, setQueue] = useState<QueueItem[]>(QUEUE);
	const [reports, setReports] = useState<Report[]>(REPORTS);
	const [users, setUsers] = useState<ManagedUser[]>(USERS);
	const [selected, setSelected] = useState<string[]>(
		QUEUE.length ? [QUEUE[0].id] : []
	);
	const [toast, setToast] = useState<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const moderationQueueQuery = useQuery(
		orpc.bambi.moderation.listJobPosts.queryOptions({
			input: { limit: 50, status: "pending_review" },
		})
	);
	const moderationReportsQuery = useQuery(
		orpc.bambi.moderation.listReports.queryOptions({
			input: { limit: 50 },
		})
	);
	const moderationUsersQuery = useQuery(
		orpc.bambi.moderation.listUsers.queryOptions({
			input: { limit: 50 },
		})
	);
	const setJobPostStatusMutation = useMutation(
		orpc.bambi.moderation.setJobPostStatus.mutationOptions()
	);
	const setReportStatusMutation = useMutation(
		orpc.bambi.moderation.setReportStatus.mutationOptions()
	);
	const setUserStatusMutation = useMutation(
		orpc.bambi.moderation.setUserStatus.mutationOptions()
	);

	const value = useMemo<ModContextValue>(() => {
		const flash = (msg: string) => {
			setToast(msg);
			if (timer.current) {
				clearTimeout(timer.current);
			}
			timer.current = setTimeout(() => setToast(null), 2200);
		};
		const apiQueue =
			moderationQueueQuery.data?.map<QueueItem>((item) => ({
				company: item.organizationDisplayName,
				desc: item.description,
				detected: item.riskFlags.length ? item.riskFlags : ["검수 필요"],
				flags: item.riskFlags.length
					? item.riskFlags.map((flag) => ({
							label: "정책 확인",
							match: flag,
							sev: "review" as const,
						}))
					: [
							{
								label: "검수 대기",
								match: item.status,
								sev: "review" as const,
							},
						],
				id: item.id,
				location: item.region,
				pay: `${item.payUnit} ${item.payAmount.toLocaleString("ko-KR")}원`,
				receivedAt: formatDate(item.createdAt),
				refId: `#${item.id.slice(0, 8)}`,
				risk: item.riskFlags.length ? "review" : "warn",
				riskLevel: item.riskFlags.length ? "mid" : "low",
				role: item.industryCategory,
				submitted: formatDate(item.createdAt),
				title: item.title,
			})) ?? [];
		const apiReports =
			moderationReportsQuery.data?.map<Report>((item) => ({
				id: item.id,
				note: item.details ?? "상세 신고 내용이 없습니다.",
				reason: item.reason,
				reporter: `신고자 ${item.reporterUserId.slice(0, 6)}`,
				reporterRole: "사용자",
				sev: item.status === "open" ? "mid" : "low",
				status:
					item.status === "open" || item.status === "reviewing"
						? "open"
						: "closed",
				target: `${item.targetType} ${item.targetId.slice(0, 8)}`,
				targetRole: "대상",
				thread: [
					{
						mine: false,
						text: item.details ?? "신고 상세 내용을 확인해 주세요.",
					},
				],
				time: formatDate(item.createdAt),
			})) ?? [];
		const apiUsers =
			moderationUsersQuery.data?.map<ManagedUser>((item) => ({
				id: item.userId,
				joined: formatDate(item.createdAt),
				name: item.displayName ?? item.email,
				note: item.isPhoneVerified
					? "휴대폰 인증 완료"
					: "휴대폰 인증이 필요합니다.",
				reports: 0,
				role: getRoleLabel(item.role),
				status: item.status,
				warnings: item.status === "warned" ? 1 : 0,
			})) ?? [];
		const visibleQueue = apiQueue.length > 0 ? apiQueue : queue;
		const visibleReports = apiReports.length > 0 ? apiReports : reports;
		const visibleUsers = apiUsers.length > 0 ? apiUsers : users;
		const toggleSelect = (id: string) =>
			setSelected((s) =>
				s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
			);
		const clearSelection = () => setSelected([]);
		const resolveQueue = (id: string, action: "approve" | "reject") => {
			if (isUuid(id)) {
				setJobPostStatusMutation.mutate(
					{
						jobPostId: id,
						reason:
							action === "approve"
								? "운영자가 공고를 승인했습니다."
								: "운영자가 정책 위반으로 공고를 반려했습니다.",
						status: action === "approve" ? "published" : "rejected",
					},
					{
						onSuccess: async () => {
							await queryClient.invalidateQueries({
								queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
									input: { limit: 50, status: "pending_review" },
								}),
							});
						},
						onError: () =>
							flash("공고 상태를 API에 반영하지 못했어요. 다시 시도해 주세요."),
					}
				);
			}

			setQueue((q) => q.filter((x) => x.id !== id));
			setSelected((s) => s.filter((x) => x !== id));
			flash(action === "approve" ? "공고를 승인했어요" : "공고를 반려했어요");
		};
		const resolveReport = (id: string, action: "dismiss" | "act") => {
			if (isUuid(id)) {
				setReportStatusMutation.mutate(
					{
						reason:
							action === "dismiss"
								? "운영자가 신고를 기각했습니다."
								: "운영자가 신고 조치를 완료했습니다.",
						reportId: id,
						status: action === "dismiss" ? "dismissed" : "resolved",
					},
					{
						onSuccess: async () => {
							await queryClient.invalidateQueries({
								queryKey: orpc.bambi.moderation.listReports.queryKey({
									input: { limit: 50 },
								}),
							});
						},
						onError: () =>
							flash("신고 상태를 API에 반영하지 못했어요. 다시 시도해 주세요."),
					}
				);
			}

			setReports((r) =>
				r.map((x) => (x.id === id ? { ...x, status: "closed" as const } : x))
			);
			flash(action === "dismiss" ? "신고를 기각했어요" : "조치를 적용했어요");
		};
		const sanction = (id: string, status: UserStatus, label: string) => {
			if (!isPreviewId(id)) {
				setUserStatusMutation.mutate(
					{
						reason: label,
						status: status === "blocked" ? "suspended" : status,
						targetUserId: id,
					},
					{
						onSuccess: async () => {
							await queryClient.invalidateQueries({
								queryKey: orpc.bambi.moderation.listUsers.queryKey({
									input: { limit: 50 },
								}),
							});
						},
						onError: () =>
							flash(
								"사용자 상태를 API에 반영하지 못했어요. 다시 시도해 주세요."
							),
					}
				);
			}

			setUsers((u) =>
				u.map((x) =>
					x.id === id
						? {
								...x,
								status,
								warnings: status === "warned" ? x.warnings + 1 : x.warnings,
							}
						: x
				)
			);
			flash(label);
		};
		const bulkAction = (action: "reject" | "hold" | "approve" | "sanction") => {
			const n = selected.length;
			if (action === "approve") {
				setQueue((q) => q.filter((x) => !selected.includes(x.id)));
				flash(`${n}건을 승인했어요`);
			} else if (action === "reject") {
				setQueue((q) => q.filter((x) => !selected.includes(x.id)));
				flash(`${n}건을 반려했어요`);
			} else if (action === "hold") {
				flash(`${n}건을 보류했어요`);
			} else {
				flash(`${n}건에 경고를 보냈어요`);
			}
			setSelected([]);
		};

		return {
			queue: visibleQueue,
			reports: visibleReports,
			users: visibleUsers,
			selected,
			toast,
			openReports: visibleReports.filter((r) => r.status === "open").length,
			warnedUsers: visibleUsers.filter((u) => u.status === "warned").length,
			toggleSelect,
			clearSelection,
			resolveQueue,
			resolveReport,
			sanction,
			bulkAction,
		};
	}, [
		moderationQueueQuery.data,
		moderationReportsQuery.data,
		moderationUsersQuery.data,
		queue,
		queryClient,
		reports,
		selected,
		setJobPostStatusMutation,
		setReportStatusMutation,
		setUserStatusMutation,
		toast,
		users,
	]);

	return <ModContext.Provider value={value}>{children}</ModContext.Provider>;
}

export function useMod(): ModContextValue {
	const ctx = useContext(ModContext);
	if (!ctx) {
		throw new Error("useMod must be used within ModProvider");
	}
	return ctx;
}
