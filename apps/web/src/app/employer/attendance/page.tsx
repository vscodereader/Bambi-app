import { AttendancePanel } from "@/components/bambi/attendance-panel";
import { MyPageAdRailLayout } from "@/components/bambi/my-page-ad-rail-layout";
import { RequireAuth } from "@/components/bambi/require-auth";

export default function EmployerAttendancePage() {
	return (
		<RequireAuth>
			<MyPageAdRailLayout>
				<AttendancePanel />
			</MyPageAdRailLayout>
		</RequireAuth>
	);
}
