import { Button } from "@bambi-app/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
} from "@bambi-app/ui/components/empty";
import Link from "next/link";

// 앱 전역 404. 루트 not-found는 어떤 라우트에도 매칭되지 않는 URL과, 하위 세그먼트에서
// 호출한 notFound()를 모두 받는다(공고·커뮤니티 상세 등). 루트 레이아웃만 남고 역할별
// 셸은 벗겨지므로 여기서 화면 전체를 직접 구성한다.
//
// metadata/generateMetadata는 not-found 규약에서 지원되지 않는다(global-not-found 전용).
// 대신 Next가 404 상태 응답에 <meta name="robots" content="noindex" />를 자동으로 넣어준다.
export default function NotFound() {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-background px-6 py-16">
			<Empty className="max-w-md border-none">
				<EmptyHeader>
					<EmptyMedia className="font-extrabold text-5xl text-primary tabular-nums sm:text-6xl">
						404
					</EmptyMedia>
					<h1 className="m-0 font-extrabold text-xl sm:text-2xl">
						페이지를 찾을 수 없어요
					</h1>
					<EmptyDescription className="text-sm">
						주소가 바뀌었거나 삭제·이동된 페이지예요. 홈에서 다시 찾아보세요.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					{/* 역할별 홈은 미들웨어·루트 페이지가 판단한다. 여기선 "/"로만 보낸다. */}
					<Button
						className="w-full sm:w-auto"
						nativeButton={false}
						render={<Link href="/">홈으로 가기</Link>}
						size="lg"
					/>
				</EmptyContent>
			</Empty>
		</main>
	);
}
