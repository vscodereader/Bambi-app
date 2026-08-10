import type { Metadata } from "next";
import { ManualScreen } from "@/components/bambi/manual/manual-screen";

export const metadata: Metadata = { title: "구인자 가이드" };

export default function EmployerManualPage() {
	return <ManualScreen manualKey="employer" />;
}
