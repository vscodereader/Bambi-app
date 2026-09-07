import { MemberOnly } from "@/src/components/member-only";
import { NotificationsScreen } from "@/src/components/notifications-screen";

export default function SeekerNotificationsScreen() {
	return (
		<MemberOnly>
			{/* biome-ignore lint/a11y/useValidAriaRole: 화면 역할 prop이며 DOM ARIA role이 아니다. */}
			<NotificationsScreen role="seeker" />
		</MemberOnly>
	);
}
