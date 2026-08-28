// 밤비 — 공용 사이트 푸터. 구직자(/seeker)·구인자(/employer) 셸과 약관·개인정보
// 처리방침 페이지가 함께 재사용한다. 운영자 콘솔(/moderator)에는 노출하지 않는다.
//
// 사업자 정보는 운영자 콘솔(/moderator/site-settings)에서 저장한 값을 쓰고, 값이
// 없으면 BAMBI_COMPANY 상수로 폴백한다. 재사용처 중 하나(responsive-shell)가
// "use client" 트리라 서버 컴포넌트 async 페치를 쓸 수 없어, 클라이언트에서 react
// query로 불러오되 폴백 값을 먼저 표시해 로딩 깜빡임을 없앤다.
"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@bambi-app/ui/components/dialog";
import { Separator } from "@bambi-app/ui/components/separator";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";
import { MANUAL_PATH } from "@/lib/bambi/manual";
import { SUPPORT_PATH } from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";
import { BOTTOM_NAV_CONTENT_SPACER } from "./bottom-nav-shell";
import { Logo } from "./ds";

interface FooterLink {
	// 개인정보 처리방침만 켠다 — 아래 FOOTER_LINKS 주석 참고(법정 표시 요건).
	distinct?: boolean;
	href: Route;
	label: string;
}

// 개인정보 처리방침은 표준 개인정보 보호지침(개인정보보호위원회 고시) 제20조에 따라
// "글자 크기, 색상 등을 활용하여 다른 고지사항과 구분"해야 한다. 구분 수단은 굵기가
// 아니라 색만 쓴다 — 굵기까지 주면 이용약관이 덜 중요한 문서처럼 읽히는데, 고시가
// 요구하는 건 "구분"이지 "강조 정도"가 아니다. 색 대비만으로 요건을 만족한다.
const FOOTER_LINKS: FooterLink[] = [
	{ href: "/terms" as Route, label: "이용약관" },
	{ href: "/privacy" as Route, label: "개인정보 처리방침", distinct: true },
];

// 로그인 없이 열리는 영역(/jobs·/board)으로 가는 링크. 이 푸터는 공개 랜딩·공개
// 게시판·약관 셸은 물론 인증 게이트 화면(seeker-auth-gate-screen)과 로그인 셸
// (responsive-shell)에도 붙는다 — 어느 화면에서 시작하든 크롤러가 한 홉 안에
// 공개 영역 전체에 닿게 하는 유일한 공통 지점이다. 앵커 텍스트는 목적지가 무엇인지
// 그대로 말한다("여기" 같은 문구 금지).
const PUBLIC_NAV_LINKS: FooterLink[] = [
	{ href: "/jobs" as Route, label: "지역별 채용 정보" },
	{ href: "/board" as Route, label: "커뮤니티 게시판" },
	{ href: "/board/notice" as Route, label: "공지사항" },
	// 이용 가이드(/manual)는 로그인 필요 영역이라 위 "로그인 없이 열리는" 묶음의
	// 예외다 — 비로그인 클릭은 로그인 화면을 거친다. 회원이 푸터에서 매뉴얼을 찾는
	// 동선이 우선이라 여기 함께 둔다.
	{ href: MANUAL_PATH, label: "이용 가이드" },
];

const FOOTER_LINK_CLASS =
	"text-muted-foreground text-sm no-underline transition-colors hover:text-foreground";

// 사업자 정보 줄 안에 섞여 있는 연락처 링크. 크기·색은 감싼 문단에서 물려받고
// 밑줄은 호버에서만 켠다(위 링크 묶음과 같은 규칙).
const FOOTER_INLINE_LINK_CLASS =
	"underline-offset-2 transition-colors hover:text-foreground hover:underline";

const HAS_DIGIT = /\d/;

// 전화번호는 숫자가 있을 때만 tel: 링크로 만든다 — 운영자 콘솔에 값이 들어오기 전에는
// 자리표시자 문자열(BAMBI_COMPANY.tel의 "TODO_…")이라 걸 수 있는 번호가 아니다.
function FooterTel({ tel }: { tel: string }) {
	if (!HAS_DIGIT.test(tel)) {
		return <>{tel}</>;
	}
	return (
		<a className={FOOTER_INLINE_LINK_CLASS} href={`tel:${tel}`}>
			{tel}
		</a>
	);
}

// 서버에서 미리 조회한 푸터 설정(getFooter 응답). ISR 셸이 SSR HTML에 DB 값을
// 박아 넣을 때 initialData로 내려준다.
export type SiteFooterSettings = Awaited<
	ReturnType<AppRouterClient["bambi"]["siteSettings"]["getFooter"]>
>;

interface SiteFooterProps {
	// 콘텐츠 폭 — 헤더와 정렬. 기본은 앱 공통 고정폭.
	contentWidthClassName?: string;
	// 서버 컴포넌트 셸이 publicClient로 미리 조회해 내려주는 초기값. 없으면 기존처럼
	// 클라이언트 조회 전까지 BAMBI_COMPANY 폴백을 그린다. JS를 실행하지 않는
	// 크롤러(AI봇 등)는 SSR HTML만 보므로, 공개 SEO 표면(/jobs)은 이 값을 내려
	// 사업자 정보 실값이 정적 HTML에 실리게 한다.
	initialData?: SiteFooterSettings;
	// 모바일 고정 하단 탭바가 있는 셸에서 겹침을 막기 위한 하단 여백.
	withBottomNavClearance?: boolean;
}

export function SiteFooter({
	contentWidthClassName = APP_CONTENT_MAX_W,
	initialData,
	withBottomNavClearance = false,
}: SiteFooterProps) {
	const { data } = useQuery({
		...orpc.bambi.siteSettings.getFooter.queryOptions(),
		initialData,
	});

	// DB에 값이 있으면 그 값, 없으면 코드 상수로 폴백.
	const intro = data?.footerIntro ?? BAMBI_COMPANY.footerIntro;
	const operator = data?.operator ?? BAMBI_COMPANY.operator;
	const ceo = data?.ceo ?? BAMBI_COMPANY.ceo;
	const bizRegNo = data?.bizRegNo ?? BAMBI_COMPANY.bizRegNo;
	const address = data?.address ?? BAMBI_COMPANY.address;
	const email = data?.email ?? BAMBI_COMPANY.email;
	const tel = data?.tel ?? BAMBI_COMPANY.tel;

	return (
		<footer
			className={cn(
				"mt-auto border-border border-t bg-background",
				withBottomNavClearance && BOTTOM_NAV_CONTENT_SPACER,
				withBottomNavClearance && "md:pb-0"
			)}
		>
			<div
				className={cn(
					"mx-auto flex w-full flex-col gap-8 px-6 py-10",
					contentWidthClassName
				)}
			>
				<div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
					<div className="flex flex-col gap-3">
						<Logo lang="ko" size="md" />
						<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
							{intro}
						</p>
					</div>
					<div className="flex flex-col gap-4 md:items-end">
						<nav
							aria-label="공개 정보"
							className="flex flex-wrap items-center gap-x-6 gap-y-2"
						>
							{PUBLIC_NAV_LINKS.map((link) => (
								<Link
									className={FOOTER_LINK_CLASS}
									href={link.href}
									key={link.href}
								>
									{link.label}
								</Link>
							))}
						</nav>
						<nav
							aria-label="약관 및 정책"
							className="flex flex-wrap items-center gap-x-6 gap-y-2"
						>
							{FOOTER_LINKS.map((link) => (
								<Link
									className={cn(
										FOOTER_LINK_CLASS,
										link.distinct && "text-foreground"
									)}
									href={link.href}
									key={link.href}
								>
									{link.label}
								</Link>
							))}
							{/* 환불 정책은 페이지 이동 대신 안내 다이얼로그로 노출한다. 링크 톤 유지. */}
							<Dialog>
								<DialogTrigger className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground text-sm no-underline transition-colors hover:text-foreground">
									환불 정책
								</DialogTrigger>
								<DialogContent>
									<div className="flex flex-col gap-2">
										<DialogTitle>환불 정책</DialogTitle>
										<DialogDescription>
											무통장: 수수료 5% + 광고 게재 기간을 제외한 금액
										</DialogDescription>
									</div>
								</DialogContent>
							</Dialog>
							{/* 직업정보제공사업자 준수사항: 체불사업주 명단은 반드시 독립된
							    고정 링크로 유지한다. 다른 공공정보 배열 변경과 무관하게 빠지면 안 된다. */}
							<a
								className={FOOTER_LINK_CLASS}
								href="https://www.moel.go.kr/info/defaulter/defaulterList.do"
								rel="noreferrer"
								target="_blank"
							>
								체불사업주 명단
							</a>
							{/* 고객센터는 메일 클라이언트를 띄우는 대신 1:1 문의 창구로 보낸다 —
							    문의 이력이 남고 답변을 서비스 안에서 받을 수 있는 경로다.
							    /support는 로그인 뒤에 있지만, 비로그인 방문자도 아래 사업자 정보
							    줄의 메일 주소(mailto)로 연락할 수 있어 창구가 막히지는 않는다. */}
							<Link className={FOOTER_LINK_CLASS} href={SUPPORT_PATH}>
								고객센터
							</Link>
						</nav>
					</div>
				</div>

				<Separator />

				<div className="flex flex-col gap-1 text-muted-foreground text-xs leading-relaxed">
					<p>
						{operator} · 대표 {ceo} · 사업자등록번호 {bizRegNo} ·
						직업정보제공사업 신고번호 {BAMBI_COMPANY.jobInfoProviderNo}
					</p>
					{/* 연락처는 읽는 값이 아니라 거는 값이다 — 모바일에서 번호를 받아 적지 않고
					    바로 통화·메일로 이어지도록 각각 tel:·mailto:로 건다. */}
					<p>
						{address} · TEL <FooterTel tel={tel} /> · 고객문의{" "}
						<a className={FOOTER_INLINE_LINK_CLASS} href={`mailto:${email}`}>
							{email}
						</a>
					</p>
					{/* 연도는 서버(UTC)와 클라이언트(사용자 타임존)가 연말 경계에서 갈릴 수
					    있어 하이드레이션 불일치(#418)를 낸다. 실제로 갈리는 건 1년에 몇
					    시간뿐이라 값을 서버에서 내리기보다 이 노드만 경고를 억제한다. */}
					<p className="pt-2 text-muted-foreground/80" suppressHydrationWarning>
						© {new Date().getFullYear()} {operator}. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
}
