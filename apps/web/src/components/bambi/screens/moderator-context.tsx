"use client";

// 밤비 — 운영자 콘솔 라우트 간 공유 상태(검수 큐/신고/사용자/선택/토스트).
// 레이아웃에 ModProvider를 두면 /moderator/* 라우트 전환에도 상태가 유지된다.

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

export function ModProvider({ children }: { children: ReactNode }) {
	const [queue, setQueue] = useState<QueueItem[]>(QUEUE);
	const [reports, setReports] = useState<Report[]>(REPORTS);
	const [users, setUsers] = useState<ManagedUser[]>(USERS);
	const [selected, setSelected] = useState<string[]>(
		QUEUE.length ? [QUEUE[0].id] : []
	);
	const [toast, setToast] = useState<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const value = useMemo<ModContextValue>(() => {
		const flash = (msg: string) => {
			setToast(msg);
			if (timer.current) {
				clearTimeout(timer.current);
			}
			timer.current = setTimeout(() => setToast(null), 2200);
		};
		const toggleSelect = (id: string) =>
			setSelected((s) =>
				s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
			);
		const clearSelection = () => setSelected([]);
		const resolveQueue = (id: string, action: "approve" | "reject") => {
			setQueue((q) => q.filter((x) => x.id !== id));
			setSelected((s) => s.filter((x) => x !== id));
			flash(action === "approve" ? "공고를 승인했어요" : "공고를 반려했어요");
		};
		const resolveReport = (id: string, action: "dismiss" | "act") => {
			setReports((r) =>
				r.map((x) => (x.id === id ? { ...x, status: "closed" as const } : x))
			);
			flash(action === "dismiss" ? "신고를 기각했어요" : "조치를 적용했어요");
		};
		const sanction = (id: string, status: UserStatus, label: string) => {
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
			queue,
			reports,
			users,
			selected,
			toast,
			openReports: reports.filter((r) => r.status === "open").length,
			warnedUsers: users.filter((u) => u.status === "warned").length,
			toggleSelect,
			clearSelection,
			resolveQueue,
			resolveReport,
			sanction,
			bulkAction,
		};
	}, [queue, reports, users, selected, toast]);

	return <ModContext.Provider value={value}>{children}</ModContext.Provider>;
}

export function useMod(): ModContextValue {
	const ctx = useContext(ModContext);
	if (!ctx) {
		throw new Error("useMod must be used within ModProvider");
	}
	return ctx;
}
