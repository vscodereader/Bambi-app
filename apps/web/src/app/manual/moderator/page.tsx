import type { Metadata } from "next";
import { ManualScreen } from "@/components/bambi/manual/manual-screen";

export const metadata: Metadata = { title: "운영자 매뉴얼" };

export default function ModeratorManualPage() {
	return <ManualScreen manualKey="moderator" />;
}
