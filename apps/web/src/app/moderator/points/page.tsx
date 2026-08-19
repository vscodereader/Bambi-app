import { Card } from "@bambi-app/ui/components/card";
import Link from "next/link";

const links = [
	{
		description: "회원의 출석 현황과 포인트를 관리합니다.",
		href: "/moderator/points/attendance",
		label: "출석 관리",
	},
	{
		description: "누적 포인트별 회원 등급과 최대 보유 포인트를 관리합니다.",
		href: "/moderator/points/grades",
		label: "등급 관리",
	},
	{
		description: "회원별 포인트와 지급·차감·사용 이력을 관리합니다.",
		href: "/moderator/points/members",
		label: "포인트 관리",
	},
	{
		description: "가입·출석·게시판·공고 결제 포인트를 설정합니다.",
		href: "/moderator/points/settings",
		label: "기타 포인트 설정",
	},
] as const;

export default function ModeratorPointsPage() {
	return (
		<main className="mx-auto flex w-full flex-col gap-5 px-5 py-6 md:px-6">
			<div>
				<h1 className="m-0 font-extrabold text-2xl">포인트 관리</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					포인트 적립 정책과 회원 포인트를 한곳에서 관리합니다.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-4">
				{links.map((item) => (
					<Link href={item.href} key={item.href}>
						<Card className="h-full p-5 transition-colors hover:border-primary">
							<h2 className="m-0 font-bold text-lg">{item.label}</h2>
							<p className="mt-2 text-muted-foreground text-sm">
								{item.description}
							</p>
						</Card>
					</Link>
				))}
			</div>
		</main>
	);
}
