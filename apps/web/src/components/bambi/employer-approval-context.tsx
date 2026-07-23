"use client";

import { createContext, type ReactNode, useContext } from "react";

export type EmployerApprovalStatus =
	| "none"
	| "pending"
	| "verified"
	| "rejected";

const EmployerApprovalContext = createContext<EmployerApprovalStatus>("none");

export function EmployerApprovalProvider({
	children,
	value,
}: {
	children: ReactNode;
	value: EmployerApprovalStatus;
}) {
	return (
		<EmployerApprovalContext.Provider value={value}>
			{children}
		</EmployerApprovalContext.Provider>
	);
}

export function useEmployerApproval(): EmployerApprovalStatus {
	return useContext(EmployerApprovalContext);
}

// 승인 완료 여부 단축 헬퍼.
export function useEmployerVerified(): boolean {
	return useEmployerApproval() === "verified";
}
