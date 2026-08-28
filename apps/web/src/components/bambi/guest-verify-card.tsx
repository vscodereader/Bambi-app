// 공개 영역(/board)에서 아직 쓰기 자격이 없는 방문자에게 보여주는 인증 안내 카드.
// 인증에 성공하면 redirectTo로 돌아와 하던 작업(글쓰기·댓글)을 이어간다.
// 회원 로그인은 테두리·연한 primary 배경의 보조 액션으로 둔다 — 주 액션은 본인인증 하나다.

import { buttonVariants } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { cn } from "@bambi-app/ui/lib/utils";
import Link from "next/link";
import { PhoneVerifyDialog } from "@/components/bambi/phone-verify-dialog";
import { SEEKER_LOGIN_PATH } from "@/lib/bambi/auth-paths";

export function GuestVerifyCard({
	description,
	redirectTo,
	title,
	triggerLabel,
}: {
	description: string;
	redirectTo: string;
	title: string;
	triggerLabel: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<PhoneVerifyDialog
						className="sm:w-auto"
						redirectTo={redirectTo}
						size="md"
						triggerLabel={triggerLabel}
						variant="primary"
					/>
					<Link
						className={cn(
							buttonVariants({ size: "sm", variant: "outline" }),
							"bg-primary/10 text-foreground no-underline hover:bg-primary/20 hover:text-foreground"
						)}
						href={SEEKER_LOGIN_PATH}
					>
						회원이라면 로그인하기
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
