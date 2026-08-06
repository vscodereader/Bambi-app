import { AttendancePanel } from "@/components/bambi/attendance-panel";
import { MyPageShell } from "@/components/bambi/my-page-shell";
import { RequireAuth } from "@/components/bambi/require-auth";

export default function SeekerAttendancePage() {
	return (
		<RequireAuth>
			<MyPageShell title="출석체크">
				<AttendancePanel embedded />
			</MyPageShell>
		</RequireAuth>
	);
}
