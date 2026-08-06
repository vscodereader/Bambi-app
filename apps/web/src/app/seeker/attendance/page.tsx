import { AttendancePanel } from "@/components/bambi/attendance-panel";
import { RequireAuth } from "@/components/bambi/require-auth";

export default function SeekerAttendancePage() {
	return (
		<RequireAuth>
			<AttendancePanel />
		</RequireAuth>
	);
}
