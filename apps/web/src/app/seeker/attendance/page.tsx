import { AttendancePanel } from "@/components/bambi/attendance-panel";
import { MyPageAdRailLayout } from "@/components/bambi/my-page-ad-rail-layout";
import { MyPageShell } from "@/components/bambi/my-page-shell";
import { RequireAuth } from "@/components/bambi/require-auth";

export default function SeekerAttendancePage() {
	return (
		<RequireAuth>
			{/* MyPageShell이 폭 캡을 내려놔서(me/layout rail이 대신 건다) rail 없는 이 화면은
			    같은 캡·센터링을 페이지에서 건다. */}
			<MyPageAdRailLayout>
				<MyPageShell title="포인트 내역">
					<AttendancePanel embedded />
				</MyPageShell>
			</MyPageAdRailLayout>
		</RequireAuth>
	);
}
