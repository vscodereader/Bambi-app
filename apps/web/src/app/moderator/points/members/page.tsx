import { redirect } from "next/navigation";

// 포인트 관리 화면은 출석 관리로 통합됐다. 기존 북마크·링크는 그대로 흡수된 화면으로 보낸다.
export default function ModeratorPointMembersPage() {
	redirect("/moderator/attendance");
}
