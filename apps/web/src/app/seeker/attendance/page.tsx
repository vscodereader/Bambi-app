import { cn } from "@bambi-app/ui/lib/utils";
import { AttendancePanel } from "@/components/bambi/attendance-panel";
import { MyPageShell } from "@/components/bambi/my-page-shell";
import { RequireAuth } from "@/components/bambi/require-auth";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";

export default function SeekerAttendancePage() {
	return (
		<RequireAuth>
			{/* MyPageShell이 폭 캡을 내려놔서(me/layout rail이 대신 건다) rail 없는 이 화면은
			    같은 캡·센터링을 페이지에서 건다. */}
			<div
				className={cn(
					"mx-auto flex min-h-0 w-full flex-1 flex-col",
					APP_CONTENT_WIDTH
				)}
			>
				<MyPageShell title="출석체크">
					<AttendancePanel embedded />
				</MyPageShell>
			</div>
		</RequireAuth>
	);
}
