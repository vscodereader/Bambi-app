import { AttendancePanel } from "@/components/bambi/attendance-panel";
import { RequireAuth } from "@/components/bambi/require-auth";

export default function EmployerAttendancePage() {
	return (
		<RequireAuth>
			<AttendancePanel />
		</RequireAuth>
	);
}
