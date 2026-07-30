import type { ReactNode } from "react";
import { SeekerAuthGateScreen } from "@/components/bambi/auth/seeker-auth-gate-screen";
import { SeekerShell } from "@/components/bambi/seeker-shell";
import { readVisitorState } from "@/lib/bambi/visitor";

export default async function SeekerLayout({
	children,
}: {
	children: ReactNode;
}) {
	const visitor = await readVisitorState();

	// anon은 게이트상 /seeker 외에는 도달할 수 없으므로 children을 버려도 안전하다.
	if (visitor === "anon") {
		return <SeekerAuthGateScreen />;
	}

	// 게스트는 셸을 여기서 씌우지 않고 page에 넘긴다. "로그인이 필요한 것을 눌렀는지"는
	// ?auth=login|signup 쿼리로만 알 수 있는데 layout은 searchParams를 받을 수 없다
	// (page만 받는다). 게스트도 게이트상 /seeker 루트 외엔 도달하지 못하므로, 이 분기를
	// page로 내려도 다른 seeker 화면이 셸을 잃는 일은 없다 — resolve-gate.ts 참고.
	if (visitor === "guest") {
		return children;
	}

	return <SeekerShell>{children}</SeekerShell>;
}
