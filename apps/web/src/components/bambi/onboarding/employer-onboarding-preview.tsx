"use client";

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Avatar, AvatarFallback } from "@bambi-app/ui/components/avatar";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { GiftIcon } from "lucide-react";
import type { StaticImageData } from "next/image";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
	ONBOARDING_AUTO_SWIPE_PAUSE_MS,
	ONBOARDING_POINT_SHOP_DIALOG_MS,
	ONBOARDING_POINT_SHOP_HISTORY_MS,
	ONBOARDING_REVIEW_SUBMIT_PRESS_MS,
	ONBOARDING_REVIEW_TYPING_INTERVAL_MS,
	ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS,
} from "@/lib/bambi/onboarding";
import { Logo } from "../ds";
import {
	BellIcon,
	CalendarIcon,
	ClipboardListIcon,
	FileTextIcon,
	Message,
	MessagesIcon,
	PaperclipIcon,
	PlusIcon,
	Search2,
	ShieldIcon,
	StoreIcon,
	UserIcon,
} from "../icons";

export type OnboardingCodePreviewKind =
	| "business-info"
	| "chat"
	| "common-notifications"
	| "common-safety"
	| "interview-contact"
	| "job-create"
	| "point-shop"
	| "seeker-chat"
	| "seeker-interview"
	| "seeker-marketplace";

const Header = () => (
	<header className="flex h-15 items-center border-border border-b bg-background px-5">
		<Logo lang="ko" size="sm" />
		<div className="ml-auto flex items-center gap-3 text-muted-foreground">
			<span className="inline-flex size-5">
				<Message />
			</span>
			<span className="inline-flex size-5">
				<BellIcon />
			</span>
		</div>
	</header>
);

const BottomNav = ({
	active,
}: {
	active: "business" | "create" | "postings";
}) => {
	const items = [
		{ id: "postings", label: "내 공고", icon: ClipboardListIcon },
		{ id: "business", label: "업체 정보", icon: StoreIcon },
		{ id: "create", label: "공고 등록", icon: PlusIcon },
		{ id: "settings", label: "조직 설정", icon: ShieldIcon },
		{ id: "me", label: "내 정보", icon: UserIcon },
	] as const;
	return (
		<nav className="absolute inset-x-0 bottom-0 grid h-17 grid-cols-5 border-border border-t bg-background">
			{items.map((item) => {
				const Icon = item.icon;
				return (
					<div
						className={`flex flex-col items-center justify-center gap-1 text-xs ${item.id === active ? "text-primary" : "text-muted-foreground"}`}
						key={item.id}
					>
						<span className="inline-flex size-5">
							<Icon />
						</span>
						{item.label}
					</div>
				);
			})}
		</nav>
	);
};

const Field = ({
	label,
	value,
	type = "text",
}: {
	label: string;
	type?: string;
	value: string;
}) => (
	<div className="flex flex-col gap-1.5">
		<Label>{label}</Label>
		<Input readOnly type={type} value={value} />
	</div>
);
const PageTitle = ({
	description,
	title,
}: {
	description: string;
	title: string;
}) => (
	<div>
		<h2 className="m-0 font-bold text-2xl">{title}</h2>
		<p className="mt-1 mb-0 text-muted-foreground text-sm">{description}</p>
	</div>
);

const BUSINESS_DEMO_VALUES = [
	"밤비",
	"111-11-11111",
	"홍길동",
	"2000-01-01",
] as const;
const BUSINESS_DEMO_TOTAL_LENGTH = BUSINESS_DEMO_VALUES.reduce(
	(total, value) => total + value.length,
	0
);
type BusinessDemoPhase =
	| "attaching"
	| "pressing"
	| "ready"
	| "scroll-documents"
	| "scroll-submit"
	| "typing"
	| "waiting";

const advanceBusinessDemo = (
	phase: BusinessDemoPhase,
	typingProgress: number,
	setPhase: (phase: BusinessDemoPhase) => void,
	setTypingProgress: (progress: number) => void,
	scroller: HTMLDivElement | null
) => {
	if (phase === "waiting") {
		setPhase("typing");
	} else if (phase === "typing") {
		const next = typingProgress + 1;
		setTypingProgress(next);
		if (next >= BUSINESS_DEMO_TOTAL_LENGTH) {
			setPhase("scroll-documents");
		}
	} else if (phase === "scroll-documents") {
		setPhase("attaching");
	} else if (phase === "attaching") {
		setPhase("scroll-submit");
	} else if (phase === "scroll-submit") {
		setPhase("ready");
	} else if (phase === "ready") {
		setPhase("pressing");
	} else {
		setTypingProgress(0);
		setPhase("waiting");
		scroller?.scrollTo({ top: 0 });
	}
};

const getTypedBusinessValues = (progress: number): readonly string[] => {
	let remaining = progress;
	return BUSINESS_DEMO_VALUES.map((value) => {
		const length = Math.min(remaining, value.length);
		remaining = Math.max(0, remaining - value.length);
		return value.slice(0, length);
	});
};

function useBusinessRegistrationDemo() {
	const [phase, setPhase] = useState<BusinessDemoPhase>("waiting");
	const [typingProgress, setTypingProgress] = useState(0);
	const documentRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const submitRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const scroller = scrollRef.current;
		let delay = ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS;
		if (phase === "typing") {
			delay = ONBOARDING_REVIEW_TYPING_INTERVAL_MS;
		} else if (phase === "pressing") {
			delay = ONBOARDING_REVIEW_SUBMIT_PRESS_MS;
		}
		if (phase === "scroll-documents") {
			scroller?.scrollTo({
				behavior: "smooth",
				top: documentRef.current?.offsetTop ?? 0,
			});
			delay = ONBOARDING_AUTO_SWIPE_PAUSE_MS;
		} else if (phase === "scroll-submit") {
			scroller?.scrollTo({
				behavior: "smooth",
				top: submitRef.current?.offsetTop ?? scroller.scrollHeight,
			});
			delay = ONBOARDING_AUTO_SWIPE_PAUSE_MS;
		}

		const timer = window.setTimeout(
			() =>
				advanceBusinessDemo(
					phase,
					typingProgress,
					setPhase,
					setTypingProgress,
					scroller
				),
			delay
		);
		return () => window.clearTimeout(timer);
	}, [phase, typingProgress]);

	return {
		documentAttached: [
			"attaching",
			"scroll-submit",
			"ready",
			"pressing",
		].includes(phase),
		documentRef,
		isPressing: phase === "pressing",
		phase,
		scrollRef,
		submitRef,
		values: getTypedBusinessValues(typingProgress),
	};
}

const JOB_DEMO_VALUES = [
	"OO바",
	"주말 라운지 모집",
	"룸싸롱",
	"서울",
	"강남구",
	"일급",
	"2,000,000원",
	"금·토 20:00–02:00",
	"주말 저녁 라운지에서 홀 안내와 고객 응대를 담당합니다.",
	"면접은 역삼역 인근 매장에서 진행하며 신분증을 지참해 주세요.",
] as const;
const JOB_PRIMARY_VALUE_COUNT = 8;
const JOB_PRIMARY_LENGTH = JOB_DEMO_VALUES.slice(
	0,
	JOB_PRIMARY_VALUE_COUNT
).reduce((total, value) => total + value.length, 0);
const JOB_TOTAL_LENGTH = JOB_DEMO_VALUES.reduce(
	(total, value) => total + value.length,
	0
);
const getTypedJobValues = (progress: number): readonly string[] => {
	let remaining = progress;
	return JOB_DEMO_VALUES.map((value) => {
		const length = Math.min(remaining, value.length);
		remaining = Math.max(0, remaining - value.length);
		return value.slice(0, length);
	});
};
type JobDemoPhase =
	| "attaching"
	| "pressing"
	| "ready"
	| "scroll-details"
	| "scroll-exposure"
	| "scroll-media"
	| "scroll-submit"
	| "selecting"
	| "typing-details"
	| "typing-primary"
	| "waiting";

const advanceJobDemo = (
	phase: JobDemoPhase,
	progress: number,
	setPhase: (phase: JobDemoPhase) => void,
	setProgress: (progress: number) => void,
	scroller: HTMLDivElement | null
) => {
	if (phase === "waiting") {
		setPhase("typing-primary");
	} else if (phase === "typing-primary" || phase === "typing-details") {
		const next = progress + 1;
		setProgress(next);
		if (phase === "typing-primary" && next >= JOB_PRIMARY_LENGTH) {
			setPhase("scroll-details");
		} else if (phase === "typing-details" && next >= JOB_TOTAL_LENGTH) {
			setPhase("scroll-media");
		}
	} else if (phase === "scroll-details") {
		setPhase("typing-details");
	} else if (phase === "scroll-media") {
		setPhase("attaching");
	} else if (phase === "attaching") {
		setPhase("scroll-exposure");
	} else if (phase === "scroll-exposure") {
		setPhase("selecting");
	} else if (phase === "selecting") {
		setPhase("scroll-submit");
	} else if (phase === "scroll-submit") {
		setPhase("ready");
	} else if (phase === "ready") {
		setPhase("pressing");
	} else {
		setProgress(0);
		setPhase("waiting");
		scroller?.scrollTo({ top: 0 });
	}
};

function useJobRegistrationDemo() {
	const [phase, setPhase] = useState<JobDemoPhase>("waiting");
	const [progress, setProgress] = useState(0);
	const detailsRef = useRef<HTMLDivElement | null>(null);
	const exposureRef = useRef<HTMLDivElement | null>(null);
	const mediaRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const submitRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const scroller = scrollRef.current;
		let delay = ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS;
		if (phase === "typing-primary" || phase === "typing-details") {
			delay = ONBOARDING_REVIEW_TYPING_INTERVAL_MS;
		} else if (phase === "pressing") {
			delay = ONBOARDING_REVIEW_SUBMIT_PRESS_MS;
		}
		const targets: Partial<Record<JobDemoPhase, HTMLDivElement | null>> = {
			"scroll-details": detailsRef.current,
			"scroll-exposure": exposureRef.current,
			"scroll-media": mediaRef.current,
			"scroll-submit": submitRef.current,
		};
		const target = targets[phase];
		if (target) {
			scroller?.scrollTo({ behavior: "smooth", top: target.offsetTop });
			delay = ONBOARDING_AUTO_SWIPE_PAUSE_MS;
		}
		const timer = window.setTimeout(
			() => advanceJobDemo(phase, progress, setPhase, setProgress, scroller),
			delay
		);
		return () => window.clearTimeout(timer);
	}, [phase, progress]);

	return {
		detailsRef,
		exposureRef,
		imagesAttached: [
			"attaching",
			"scroll-exposure",
			"selecting",
			"scroll-submit",
			"ready",
			"pressing",
		].includes(phase),
		isPressing: phase === "pressing",
		mediaRef,
		phase,
		scrollRef,
		selectionComplete: [
			"selecting",
			"scroll-submit",
			"ready",
			"pressing",
		].includes(phase),
		submitRef,
		values: getTypedJobValues(progress),
	};
}

const BusinessInfo = () => {
	const {
		documentAttached,
		documentRef,
		isPressing,
		phase,
		scrollRef,
		submitRef,
		values,
	} = useBusinessRegistrationDemo();
	return (
		<>
			<Header />
			<div
				className="h-[717px] overflow-hidden"
				data-business-phase={phase}
				ref={scrollRef}
			>
				<div className="flex flex-col gap-6 px-5 pt-6 pb-24">
					<PageTitle
						description="계정과 사업자 인증 상태를 확인하고 설정을 관리합니다."
						title="업체 정보"
					/>
					<Card>
						<CardContent className="flex items-center gap-4">
							<Avatar size="lg">
								<AvatarFallback>밤비</AvatarFallback>
							</Avatar>
							<div className="flex min-w-0 flex-col gap-1">
								<div className="flex items-center gap-2">
									<span className="font-semibold text-lg">신규 구인자</span>
									<Badge variant="secondary">구인자</Badge>
									<Badge variant="outline">정상</Badge>
								</div>
								<p className="m-0 text-muted-foreground text-sm">
									전화 인증 완료 · 연락처 010-2000-0001
								</p>
								<p className="m-0 text-muted-foreground text-xs">
									가입 2026. 8. 4. 오후 12:35
								</p>
							</div>
						</CardContent>
					</Card>
					<Separator />
					<section className="flex flex-col gap-3">
						<div>
							<h3 className="m-0 font-semibold text-lg">사업자 인증</h3>
							<p className="mt-1 mb-0 text-muted-foreground text-sm">
								인증 상태는 공고 공개 여부에 영향을 줄 수 있습니다.
							</p>
						</div>
						<Alert className="hidden border-primary/40 bg-primary/5">
							<AlertTitle>인증 정보 변경 전 확인해 주세요</AlertTitle>
							<AlertDescription>
								인증 완료 후 업체 정보나 인증 서류를 변경하면 변경사항 미제출
								상태로 전환됩니다. 기존 공고와 광고는 비공개 처리되며 재승인
								전까지 공고·광고 등록과 채팅 송수신을 이용할 수 없습니다.
							</AlertDescription>
						</Alert>
						<Card>
							<CardContent className="flex flex-col gap-4">
								<div className="grid grid-cols-2 gap-4">
									<Field label="업체명" value={values[0] ?? ""} />
									<Field label="사업자 등록 번호" value={values[1] ?? ""} />
									<Field label="대표자 성명" value={values[2] ?? ""} />
									<Field label="개업일자" value={values[3] ?? ""} />
								</div>
								<p className="m-0 text-muted-foreground text-xs">
									대표자 성명과 개업일자는 사업자등록증에 적힌 그대로 입력해야
									국세청 진위확인을 통과합니다.
								</p>
								<div
									className="flex min-h-56 flex-col justify-center gap-2"
									ref={documentRef}
								>
									<Label>사업자 인증 서류</Label>
									<div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
										<span className="mr-2 inline-flex size-4">
											<FileTextIcon />
										</span>
										{documentAttached
											? "사업자등록증.pdf"
											: "사업자등록증을 추가해 주세요"}
									</div>
								</div>
								<div
									className="flex min-h-40 items-end justify-end"
									ref={submitRef}
								>
									<Button
										className={
											isPressing
												? "[animation:bambiReviewSubmitPress_var(--dur-slow)_var(--ease-in-out)] motion-reduce:animate-none"
												: undefined
										}
										disabled={!documentAttached}
									>
										업체 정보 제출
									</Button>
								</div>
							</CardContent>
						</Card>
						<div className="min-h-64 rounded-lg border border-dashed p-5 text-center text-muted-foreground text-sm">
							제출 후 운영자 승인을 기다려 주세요.
						</div>
						<Card className="hidden">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									클럽 루나 <Badge variant="outline">인증 완료</Badge>
								</CardTitle>
							</CardHeader>
							<CardContent className="grid grid-cols-2 gap-3 text-sm">
								<div>
									<span className="text-muted-foreground text-xs">
										사업자 등록 번호
									</span>
									<p className="m-0">123-45-67890</p>
								</div>
								<div>
									<span className="text-muted-foreground text-xs">대표자</span>
									<p className="m-0">owner</p>
								</div>
								<div>
									<span className="text-muted-foreground text-xs">
										개업일자
									</span>
									<p className="m-0">2020-01-01</p>
								</div>
								<div>
									<span className="text-muted-foreground text-xs">
										국세청 확인
									</span>
									<p className="m-0">확인 완료</p>
								</div>
							</CardContent>
						</Card>
					</section>
				</div>
			</div>
			<BottomNav active="business" />
		</>
	);
};

const FormSection = ({
	children,
	description,
	title,
}: {
	children: React.ReactNode;
	description: string;
	title: string;
}) => (
	<section className="flex flex-col gap-3">
		<div>
			<h3 className="m-0 font-semibold text-lg">{title}</h3>
			<p className="mt-1 mb-0 text-muted-foreground text-sm">{description}</p>
		</div>
		<Card>
			<CardContent className="grid grid-cols-2 gap-4">{children}</CardContent>
		</Card>
	</section>
);

const JobCreate = () => {
	const {
		detailsRef,
		exposureRef,
		imagesAttached,
		isPressing,
		mediaRef,
		phase,
		scrollRef,
		selectionComplete,
		submitRef,
		values,
	} = useJobRegistrationDemo();
	return (
		<>
			<Header />
			<div
				className="h-[717px] overflow-hidden"
				data-job-phase={phase}
				ref={scrollRef}
			>
				<div className="flex flex-col gap-6 px-5 pt-6 pb-24">
					<PageTitle
						description="조직과 팀을 선택하고 공개할 공고 정보를 입력합니다."
						title="새 공고 등록"
					/>
					<FormSection
						description="공고를 등록할 조직·팀 범위를 선택하세요."
						title="소속 정보"
					>
						<div className="col-span-2">
							<Field label="공고 등록 범위" value={values[0] ?? ""} />
						</div>
					</FormSection>
					<FormSection
						description="제목·업종·지역·급여 등 핵심 조건을 입력하세요."
						title="공고 조건"
					>
						<div className="col-span-2">
							<Field label="공고 제목" value={values[1] ?? ""} />
						</div>
						<Field label="업종" value={values[2] ?? ""} />
						<Field label="시/도" value={values[3] ?? ""} />
						<Field label="세부지역" value={values[4] ?? ""} />
						<Field label="급여 단위" value={values[5] ?? ""} />
						<Field label="급여 금액" value={values[6] ?? ""} />
						<div className="col-span-2">
							<Field label="근무 일정" value={values[7] ?? ""} />
						</div>
						<Label className="flex items-center gap-2">
							<Checkbox checked />
							초보 가능
						</Label>
						<Label className="flex items-center gap-2">
							<Checkbox checked />
							당일면접 가능
						</Label>
					</FormSection>
					<div ref={detailsRef}>
						<FormSection
							description="기본 상세 설명과 면접 안내를 입력하세요."
							title="상세 내용"
						>
							<div className="col-span-2 flex flex-col gap-2">
								<Label>상세 설명</Label>
								<Textarea readOnly value={values[8] ?? ""} />
							</div>
							<div className="col-span-2 flex flex-col gap-2">
								<Label>면접 안내</Label>
								<Textarea readOnly value={values[9] ?? ""} />
							</div>
						</FormSection>
					</div>
					<div ref={mediaRef}>
						<FormSection
							description="공고에 표시할 이미지와 광고 배너를 등록하세요."
							title="공고 이미지"
						>
							<div className="col-span-2 flex min-h-48 flex-col justify-center gap-3 rounded-lg border border-dashed p-6 text-center text-muted-foreground">
								<div>
									공고 썸네일:{" "}
									{imagesAttached ? "공고_썸네일_예시.png" : "이미지 추가"}
								</div>
								<div>
									실제 내용:{" "}
									{imagesAttached ? "실제_내용_예시.png" : "이미지 추가"}
								</div>
							</div>
						</FormSection>
					</div>
					<div ref={exposureRef}>
						<FormSection
							description="노출 상품과 기간, 결제 방식을 선택하세요."
							title="노출 설정"
						>
							<Field
								label="기간권"
								value={selectionComplete ? "60일 기간권" : ""}
							/>
							<Field
								label="결제 방식"
								value={selectionComplete ? "무통장입금" : ""}
							/>
						</FormSection>
					</div>
					<Alert>
						<AlertTitle>등록하면 검수를 거쳐 공개됩니다</AlertTitle>
						<AlertDescription>
							제출 후 검수 중에는 내 공고 화면에서 진행 상태를 확인할 수
							있습니다.
						</AlertDescription>
					</Alert>
					<div
						className="flex min-h-40 items-end justify-end gap-2"
						ref={submitRef}
					>
						<Button variant="outline">취소</Button>
						<Button
							className={
								isPressing
									? "[animation:bambiReviewSubmitPress_var(--dur-slow)_var(--ease-in-out)] motion-reduce:animate-none"
									: undefined
							}
							disabled={!selectionComplete}
						>
							공고 등록
						</Button>
					</div>
				</div>
			</div>
			<BottomNav active="create" />
		</>
	);
};

const SeekerBottomNav = () => (
	<nav className="absolute inset-x-0 bottom-0 grid h-17 grid-cols-4 border-border border-t bg-background text-center text-xs">
		<div className="flex flex-col items-center justify-center gap-1 text-primary">
			<span className="inline-flex size-5">
				<Search2 />
			</span>
			탐색
		</div>
		<div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
			<span className="inline-flex size-5">
				<Message />
			</span>
			채팅
		</div>
		<div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
			<span className="inline-flex size-5">
				<MessagesIcon />
			</span>
			수다방
		</div>
		<div className="flex flex-col items-center justify-center gap-1 text-muted-foreground">
			<span className="inline-flex size-5">
				<UserIcon />
			</span>
			내 정보
		</div>
	</nav>
);

const SeekerHeader = () => (
	<header className="flex h-15 items-center border-border border-b bg-background px-5">
		<Logo lang="ko" size="sm" />
		<div className="ml-auto flex items-center gap-3 text-muted-foreground">
			<span className="inline-flex size-5">
				<Search2 />
			</span>
			<span className="inline-flex size-5">
				<StoreIcon />
			</span>
			<span className="inline-flex size-5">
				<BellIcon />
			</span>
		</div>
	</header>
);

const MARKETPLACE_CARD_BORDER = {
	organic: "border-border",
	recommended: "border-sky-300",
	special: "border-coral-300",
} as const;

const MarketplaceCard = ({
	image,
	pay,
	title,
	tone = "special",
}: {
	image: string;
	pay: string;
	title: string;
	tone?: "organic" | "recommended" | "special";
}) => {
	const borderClass = MARKETPLACE_CARD_BORDER[tone];
	return (
		<article
			className={`flex flex-col gap-2 rounded-lg border bg-card p-2 ${borderClass}`}
		>
			<div className="flex items-start gap-3">
				<Image
					alt=""
					className="h-14 w-30 shrink-0 rounded-md border border-white object-fill"
					height={56}
					src={image}
					width={120}
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<h4 className="m-0 truncate font-extrabold text-[15px]">{title}</h4>
					<span className="truncate font-semibold text-muted-foreground text-xs">
						루나 Club
					</span>
					<span className="truncate text-muted-foreground text-xs">
						서울 · 강남구 · 룸싸롱
					</span>
				</div>
			</div>
			<div className="flex h-9 items-center gap-1.5">
				<Badge variant="destructive">시급</Badge>
				<span className="font-extrabold text-base text-coral-600">{pay}</span>
			</div>
		</article>
	);
};

const Marketplace = () => {
	const scrollRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const scroller = scrollRef.current;
		if (
			!scroller ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}
		scroller.scrollTop = 0;
		let timer: number | undefined;
		const schedule = () => {
			timer = window.setTimeout(() => {
				const end = scroller.scrollHeight - scroller.clientHeight;
				if (scroller.scrollTop >= end) {
					return;
				}
				scroller.scrollTo({
					behavior: "smooth",
					top: Math.min(end, scroller.scrollTop + scroller.clientHeight / 2),
				});
				schedule();
			}, ONBOARDING_AUTO_SWIPE_PAUSE_MS);
		};
		schedule();
		return () => {
			if (timer !== undefined) {
				window.clearTimeout(timer);
			}
		};
	}, []);
	return (
		<>
			<SeekerHeader />
			<div
				className="h-[717px] overflow-hidden"
				data-marketplace-scroll
				ref={scrollRef}
			>
				<div className="flex flex-col gap-5 px-5 pt-5 pb-24">
					<section className="flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<Badge variant="secondary">프리미엄</Badge>
							<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
						</div>
						<div className="grid gap-3">
							<Image
								alt="프리미엄 광고 배너"
								className="aspect-[16/9] w-full rounded-lg object-cover"
								height={197}
								src="/bambi/sample-thumbnails/sample-20.png"
								width={350}
							/>
							<Image
								alt="프리미엄 광고 배너"
								className="aspect-[16/9] w-full rounded-lg object-cover"
								height={197}
								src="/bambi/sample-thumbnails/sample-18.jpg"
								width={350}
							/>
							<Image
								alt="프리미엄 광고 배너"
								className="aspect-[16/9] w-full rounded-lg object-cover"
								height={197}
								src="/bambi/sample-thumbnails/sample-12.png"
								width={350}
							/>
						</div>
					</section>
					<div className="flex items-center justify-between">
						<h2 className="m-0 font-extrabold text-lg">추천 공고</h2>
						<span className="font-semibold text-muted-foreground text-sm">
							57개 · 실시간
						</span>
					</div>
					<section className="grid gap-2">
						<h3 className="m-0 flex items-center gap-2 font-extrabold text-base">
							<span className="h-4 w-1 rounded-full bg-coral-500" />
							스페셜 채용
						</h3>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-7.jpg"
							pay="123,123,123원"
							title="강남 라운지 주말 스태프"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-17.jpg"
							pay="15,578,884원"
							title="초보 가능 홀 서빙"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-16.jpg"
							pay="123,123,123원"
							title="야간 파트타임 모집"
						/>
					</section>
					<section className="grid gap-2">
						<h3 className="m-0 flex items-center gap-2 font-extrabold text-base">
							<span className="h-4 w-1 rounded-full bg-sky-400" />
							추천 채용
						</h3>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-9.png"
							pay="60,000원"
							title="강남 주말 파트타임"
							tone="recommended"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-8.jpg"
							pay="500,000원"
							title="라운지 초보 가능"
							tone="recommended"
						/>
					</section>
					<section className="grid gap-2">
						<h3 className="m-0 flex items-center gap-2 font-extrabold text-base">
							<span className="h-4 w-1 rounded-full bg-gray-300" />
							전체 공고
						</h3>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-6.jpeg"
							pay="140,000원"
							title="분당 파트타임"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-5.jpeg"
							pay="12,000,000원"
							title="강남 야간 홀 서빙"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-4.jpeg"
							pay="180,000원"
							title="초보 가능 파트타임"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-3.jpeg"
							pay="200,000원"
							title="금요일 저녁 스태프"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-2.jpeg"
							pay="170,000원"
							title="역삼 라운지 보조"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-10.png"
							pay="160,000원"
							title="선릉 주말 근무"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-13.jpg"
							pay="190,000원"
							title="논현 야간 파트타임"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-14.jpg"
							pay="210,000원"
							title="청담 홀 안내"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-16.jpg"
							pay="150,000원"
							title="강남 초보 스태프"
							tone="organic"
						/>
						<MarketplaceCard
							image="/bambi/sample-thumbnails/sample-18.jpg"
							pay="220,000원"
							title="주말 고정 근무"
							tone="organic"
						/>
					</section>
				</div>
			</div>
			<SeekerBottomNav />
		</>
	);
};

const Chat = ({
	menuPressing = false,
	perspective,
	visibleCount,
}: {
	menuPressing?: boolean;
	perspective: "employer" | "seeker";
	visibleCount: number;
}) => {
	const isSeeker = perspective === "seeker";
	return (
		<>
			<Header />
			<div className="flex items-center border-border border-b px-4 py-3">
				<span className="mr-3 text-xl">‹</span>
				<div>
					<p className="m-0 font-bold">
						{isSeeker ? "루나 라운지 강남점" : "지원자 밤비"}
					</p>
					<p className="m-0 text-muted-foreground text-xs">
						{isSeeker ? "강남점 주말 파트타임 모집" : "지원자와 채용 상담 중"}
					</p>
				</div>
				<span
					className={
						menuPressing
							? "ml-auto [animation:bambiReviewSubmitPress_var(--dur-slow)_var(--ease-in-out)] motion-reduce:animate-none"
							: "ml-auto"
					}
				>
					☰
				</span>
			</div>
			<div className="flex items-center gap-2 border-coral-100 border-b bg-coral-50 px-4 py-1.5 font-bold text-coral-700 text-xs">
				<span className="inline-flex size-4">
					<ShieldIcon />
				</span>
				면접 확정 전 연락처 보호 중
			</div>
			<div className="flex flex-col gap-5 p-5">
				<p className="m-0 text-center text-muted-foreground text-xs">
					2026년 9월 1일 화요일
				</p>
				{visibleCount >= 1 ? (
					<div className="ml-auto max-w-[75%] rounded-lg bg-primary px-4 py-3 text-white [animation:bambiSheetUp_var(--dur-slow)_var(--ease-out)] motion-reduce:animate-none">
						{isSeeker
							? "안녕하세요. 금요일 저녁 면접 가능할까요?"
							: "네, 오후 7시 가능합니다. 일정을 보내드릴게요."}
					</div>
				) : null}
				{visibleCount >= 2 ? (
					<div className="[animation:bambiSheetUp_var(--dur-slow)_var(--ease-out)] motion-reduce:animate-none">
						<p className="m-0 text-muted-foreground text-xs">
							{isSeeker ? "루나 라운지 강남점" : "지원자 밤비"}
						</p>
						<div className="mt-1 max-w-[75%] rounded-lg border border-border bg-card px-4 py-3">
							{isSeeker
								? "네, 오후 7시 가능합니다. 면접 일정을 보내드릴게요."
								: "안녕하세요. 금요일 저녁 면접 가능할까요?"}
						</div>
					</div>
				) : null}
				{visibleCount >= 3 ? (
					<div className="flex w-fit items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 [animation:bambiSheetUp_var(--dur-slow)_var(--ease-out)] motion-reduce:animate-none">
						<span className="inline-flex size-6 text-primary">
							<PaperclipIcon />
						</span>
						<div>
							<p className="m-0 font-semibold">근무조건_안내.pdf</p>
							<p className="m-0 text-muted-foreground text-xs">
								안전하게 파일 확인하기
							</p>
						</div>
					</div>
				) : null}
			</div>
			<div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-border border-t bg-background p-3">
				<Button size="icon" variant="outline">
					<PlusIcon />
				</Button>
				<div className="flex-1 rounded-full bg-muted px-4 py-2 text-muted-foreground">
					메시지를 입력하세요
				</div>
				<Button>전송</Button>
			</div>
		</>
	);
};

const Schedule = ({ label, value }: { label: string; value: string }) => (
	<div className="flex items-center rounded-lg bg-muted/40 px-4 py-3">
		<span className="mr-3 inline-flex size-5 text-primary">
			<CalendarIcon />
		</span>
		<span>{value}</span>
		<span className="ml-auto text-amber-600 text-sm">{label}</span>
	</div>
);
const InterviewContact = ({
	perspective,
	visibleCount,
}: {
	perspective: "employer" | "seeker";
	visibleCount: number;
}) => {
	const isSeeker = perspective === "seeker";
	const contactAction = isSeeker ? (
		<div className="rounded-lg border border-border bg-card px-4 py-3 [animation:bambiSlideInFromRight_calc(var(--dur-slow)*2)_var(--ease-out)] motion-reduce:animate-none">
			<p className="m-0 text-muted-foreground text-xs">구인자 인증 연락처</p>
			<p className="m-0 mt-1 font-bold">010-0000-0000</p>
		</div>
	) : (
		<Button className="w-full [animation:bambiSlideInFromRight_calc(var(--dur-slow)*2)_var(--ease-out)] motion-reduce:animate-none">
			연락처 공개 요청
		</Button>
	);
	return (
		<>
			<Header />
			<div className="flex flex-col gap-4 p-5">
				<h2 className="m-0 font-bold text-2xl">‹　채팅 정보</h2>
				<Card>
					<CardContent>
						<div className="flex justify-between">
							<strong>공고 조건</strong>
							<Badge variant="secondary">대화 가능</Badge>
						</div>
						<p className="font-bold">시급 18,000원</p>
						<p className="m-0 text-muted-foreground">
							강남 · 라운지 · 주말 근무
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex flex-col gap-3">
						<strong>면접 일정</strong>
						<div className="min-h-12">
							{visibleCount >= 1 ? (
								<div className="[animation:bambiSlideInFromRight_calc(var(--dur-slow)*2)_var(--ease-out)] motion-reduce:animate-none">
									<Schedule label="확정" value="2026. 9. 4. 오후 7:00" />
								</div>
							) : null}
						</div>
						<div className="min-h-12">
							{visibleCount >= 2 ? (
								<div className="[animation:bambiSlideInFromRight_calc(var(--dur-slow)*2)_var(--ease-out)] motion-reduce:animate-none">
									<Schedule label="제안" value="2026. 9. 6. 오후 6:30" />
								</div>
							) : null}
						</div>
						<div className="min-h-10">
							{visibleCount >= 3 ? contactAction : null}
						</div>
					</CardContent>
				</Card>
				{isSeeker ? null : (
					<Card>
						<CardHeader>
							<CardTitle>면접 일정 제안</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<Field
								label="면접 일시"
								type="datetime-local"
								value="2026-09-08T19:00"
							/>
							<Field label="장소 메모" value="역삼역 3번 출구 근처" />
							<Button>면접 일정 제안</Button>
						</CardContent>
					</Card>
				)}
			</div>
		</>
	);
};

const NOTIFICATION_ITEMS = [
	{
		title: "새 채팅 메시지",
		body: "루나 라운지 강남점에서 새 메시지를 보냈어요.",
	},
	{
		title: "면접 일정 제안",
		body: "2026년 9월 4일 오후 7시 면접 일정이 제안됐어요.",
	},
	{
		title: "연락처 공개 요청",
		body: "면접 진행을 위해 연락처 공개 요청이 도착했어요.",
	},
	{
		title: "면접 일정 확정",
		body: "면접 일정이 확정됐어요. 채팅에서 상세 내용을 확인하세요.",
	},
] as const;

const NotificationsPreview = ({ visibleCount }: { visibleCount: number }) => (
	<>
		<SeekerHeader />
		<div className="h-[717px] overflow-hidden">
			<div className="flex flex-col gap-4 px-5 py-6">
				<div className="flex items-center justify-between gap-3">
					<h2 className="m-0 font-extrabold text-2xl">알림</h2>
					<div className="flex gap-2">
						<Button size="sm" variant="outline">
							모두 확인
						</Button>
						<Button size="sm" variant="outline">
							알림 비우기
						</Button>
					</div>
				</div>
				<Alert>
					<AlertTitle>탭이 꺼져 있어도 알림을 받을 수 있어요</AlertTitle>
					<AlertDescription>
						브라우저 알림을 허용하면 다른 탭을 보고 있을 때도 새 알림을 바로
						알려드려요.
					</AlertDescription>
				</Alert>
				<ul className="m-0 flex list-none flex-col gap-3 p-0">
					{NOTIFICATION_ITEMS.slice(0, visibleCount).map((item) => (
						<li
							className="[animation:bambiSheetUp_var(--dur-slow)_var(--ease-out)] motion-reduce:animate-none"
							key={item.title}
						>
							<div className="flex w-full flex-col gap-2 rounded-xl border border-primary bg-card p-4 text-left">
								<div className="flex items-center gap-2">
									<Badge>새 알림</Badge>
									<span className="font-semibold text-sm">{item.title}</span>
								</div>
								<p className="m-0 text-muted-foreground text-sm">{item.body}</p>
								<span className="text-muted-foreground text-xs">
									2026.09.02 12:30
								</span>
							</div>
						</li>
					))}
				</ul>
			</div>
		</div>
		<SeekerBottomNav />
	</>
);

const SafetySheetPreview = ({ visibleCount }: { visibleCount: number }) => (
	<>
		<Chat
			menuPressing={visibleCount === 0}
			perspective="seeker"
			visibleCount={3}
		/>
		{visibleCount >= 1 ? (
			<aside className="absolute inset-y-0 right-0 w-[88%] border-border border-l bg-background p-5 shadow-[var(--shadow-lg)] [animation:bambiSlideInFromRight_calc(var(--dur-slow)*2)_var(--ease-out)] motion-reduce:animate-none">
				<h2 className="m-0 mb-4 font-bold text-xl">채팅 정보</h2>
				<div className="flex flex-col gap-4">
					<Card>
						<CardContent>
							<div className="flex justify-between">
								<strong>공고 조건</strong>
								<Badge variant="secondary">대화 가능</Badge>
							</div>
							<p className="font-bold">시급 18,000원</p>
							<p className="m-0 text-muted-foreground text-sm">
								강남 · 라운지 · 주말 근무
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="flex flex-col gap-3">
							<strong>면접 일정</strong>
							<Schedule label="확정" value="2026. 9. 4. 오후 7:00" />
							<div className="rounded-lg border border-border px-4 py-3">
								<p className="m-0 text-muted-foreground text-xs">
									구인자 인증 연락처
								</p>
								<p className="m-0 mt-1 font-bold">010-0000-0000</p>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="flex flex-col gap-3">
							<h3 className="m-0 font-bold text-lg">안전</h3>
							<p className="m-0 text-muted-foreground text-sm">
								외부 연락처 공유 유도나 조건 불일치는 신고할 수 있어요.
							</p>
							<div className="flex gap-2">
								<Button size="sm" variant="secondary">
									신고
								</Button>
								<Button size="sm" variant="outline">
									차단하기
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</aside>
		) : null}
	</>
);

const PointItemCard = ({
	className,
	image,
	name,
	price,
}: {
	className?: string;
	image?: string;
	name: string;
	price: string;
}) => (
	<div
		className={`flex aspect-square w-full flex-col overflow-hidden rounded-xl border border-border bg-card ${className ?? ""}`}
	>
		<div className="relative min-h-0 w-full flex-1 bg-secondary">
			{image ? (
				<Image
					alt=""
					className="object-contain"
					fill
					sizes="175px"
					src={image}
				/>
			) : (
				<span className="flex size-full items-center justify-center text-coral-300">
					<GiftIcon className="size-10" />
				</span>
			)}
			<Badge className="absolute top-2 right-2 h-7 px-3 font-extrabold text-sm">
				{price}
			</Badge>
		</div>
		<div className="border-border border-t px-3 py-2.5">
			<p className="m-0 truncate font-extrabold text-sm">{name}</p>
		</div>
	</div>
);

type PointShopDemoPhase =
	| "dialog"
	| "history"
	| "item-pressing"
	| "purchase-pressing"
	| "shop";

const NEXT_POINT_SHOP_PHASE: Record<PointShopDemoPhase, PointShopDemoPhase> = {
	dialog: "purchase-pressing",
	history: "shop",
	"item-pressing": "dialog",
	"purchase-pressing": "history",
	shop: "item-pressing",
};

const PointPurchaseHistory = () => (
	<>
		<SeekerHeader />
		<div className="flex h-[717px] flex-col gap-4 overflow-hidden px-5 py-6">
			<h2 className="m-0 font-extrabold text-2xl">포인트 내역</h2>
			<Card>
				<CardHeader>
					<CardTitle>내 아이템</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="m-0 text-muted-foreground text-sm">
						사용할 수 있는 혜택 0건
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>구매 내역</CardTitle>
					<p className="m-0 text-muted-foreground text-sm">
						포인트몰에서 신청한 아이템 1건
					</p>
				</CardHeader>
				<CardContent>
					<div className="rounded-xl border border-border p-4">
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="m-0 font-bold">배민 5만원 상품권</p>
								<p className="m-0 mt-1 text-muted-foreground text-xs">
									주문 2026. 9. 2. 오후 3:56
								</p>
							</div>
							<div className="text-right">
								<Badge variant="secondary">주문완료</Badge>
								<p className="m-0 mt-1 font-bold">-50,000P</p>
							</div>
						</div>
						<p className="m-0 mt-4 text-muted-foreground text-sm">
							본인인증 휴대폰 번호로 발송돼요.
						</p>
						<div className="mt-4 flex justify-end">
							<Button size="sm" variant="outline">
								취소·환불
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
		<SeekerBottomNav />
	</>
);

const PointPurchaseDialog = ({ pressing }: { pressing: boolean }) => (
	<div className="absolute inset-0 flex items-end bg-ink-900/40">
		<div className="w-full rounded-t-2xl bg-background p-5 shadow-[var(--shadow-lg)]">
			<div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-secondary">
				<Image
					alt=""
					className="object-contain"
					fill
					sizes="350px"
					src="/bambi/onboarding/point-shop/baemin-50000.jpg"
				/>
			</div>
			<div className="mt-4 flex items-center gap-2">
				<h2 className="m-0 font-bold text-xl">배민 5만원 상품권</h2>
				<Badge variant="secondary">쿠폰 발송</Badge>
			</div>
			<p className="mt-2 mb-0 text-muted-foreground text-sm">
				배달의민족 5만원 상품권을 본인인증 휴대폰 번호로 발송해요.
			</p>
			<dl className="mt-4 flex flex-col gap-2 rounded-lg bg-secondary px-4 py-3 text-sm">
				<div className="flex justify-between">
					<dt>필요 포인트</dt>
					<dd className="m-0 font-bold">50,000P</dd>
				</div>
				<div className="flex justify-between">
					<dt>내 포인트</dt>
					<dd className="m-0 font-bold">50,000P</dd>
				</div>
			</dl>
			<Alert className="mt-4" variant="brand">
				<AlertDescription>
					본인인증 시 등록된 휴대폰 번호로 발송돼요. 지급완료 전에는 취소·환불할
					수 있어요.
				</AlertDescription>
			</Alert>
			<div className="mt-4 flex justify-end gap-2">
				<Button variant="outline">닫기</Button>
				<Button
					className={
						pressing
							? "[animation:bambiReviewSubmitPress_var(--dur-slow)_var(--ease-in-out)] motion-reduce:animate-none"
							: undefined
					}
				>
					구매하기
				</Button>
			</div>
		</div>
	</div>
);

const PointShopPreview = () => {
	const [phase, setPhase] = useState<PointShopDemoPhase>("shop");
	const itemRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (phase === "shop") {
			scrollRef.current?.scrollTo({
				behavior: "smooth",
				top:
					(itemRef.current?.offsetTop ?? 0) -
					(scrollRef.current?.clientHeight ?? 0) / 3,
			});
		}
		let delay = ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS;
		if (phase === "item-pressing" || phase === "purchase-pressing") {
			delay = ONBOARDING_REVIEW_SUBMIT_PRESS_MS;
		} else if (phase === "dialog") {
			delay = ONBOARDING_POINT_SHOP_DIALOG_MS;
		} else if (phase === "history") {
			delay = ONBOARDING_POINT_SHOP_HISTORY_MS;
		}
		const timer = window.setTimeout(
			() => setPhase((current) => NEXT_POINT_SHOP_PHASE[current]),
			delay
		);
		return () => window.clearTimeout(timer);
	}, [phase]);
	if (phase === "history") {
		return <PointPurchaseHistory />;
	}
	return (
		<>
			<SeekerHeader />
			<div
				className="h-[717px] overflow-hidden"
				data-point-shop-phase={phase}
				ref={scrollRef}
			>
				<div className="flex flex-col gap-6 px-5 py-6">
					<section className="flex flex-col gap-3" ref={itemRef}>
						<div className="flex items-center gap-2">
							<Badge variant="secondary">프리미엄</Badge>
							<h2 className="m-0 font-extrabold text-base">프리미엄 광고</h2>
						</div>
						<div className="grid gap-3">
							<Image
								alt=""
								className="aspect-[16/9] w-full rounded-lg object-cover"
								height={197}
								src="/bambi/sample-thumbnails/sample-20.png"
								width={350}
							/>
							<Image
								alt=""
								className="aspect-[16/9] w-full rounded-lg object-cover"
								height={197}
								src="/bambi/sample-thumbnails/sample-18.jpg"
								width={350}
							/>
						</div>
					</section>
					<section className="flex flex-col gap-3">
						<div className="flex flex-col gap-1">
							<h2 className="m-0 font-extrabold text-lg">포인트 아이템</h2>
							<p className="m-0 text-muted-foreground text-sm">
								출석·글쓰기로 모은 포인트로 교환해요. 신청하면 운영자가 확인 후
								지급해요.
							</p>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<PointItemCard
								className={
									phase === "item-pressing"
										? "[animation:bambiReviewSubmitPress_var(--dur-slow)_var(--ease-in-out)] motion-reduce:animate-none"
										: undefined
								}
								image="/bambi/onboarding/point-shop/baemin-50000.jpg"
								name="배민 5만원 상품권"
								price="50,000P"
							/>
						</div>
					</section>
				</div>
			</div>
			<SeekerBottomNav />
			{phase === "dialog" || phase === "purchase-pressing" ? (
				<PointPurchaseDialog pressing={phase === "purchase-pressing"} />
			) : null}
		</>
	);
};

const getPreviewSequenceLength = (kind: OnboardingCodePreviewKind): number => {
	if (kind === "common-notifications") {
		return 4;
	}
	if (kind === "common-safety") {
		return 1;
	}
	return [
		"chat",
		"interview-contact",
		"seeker-chat",
		"seeker-interview",
	].includes(kind)
		? 3
		: 0;
};

export function OnboardingCodePreview({
	alt,
	kind,
	src,
}: {
	alt: string;
	kind: OnboardingCodePreviewKind;
	src: StaticImageData;
}) {
	const sequenceLength = getPreviewSequenceLength(kind);
	const [visibleCount, setVisibleCount] = useState(0);

	useEffect(() => {
		if (visibleCount >= sequenceLength) {
			return;
		}
		const timer = window.setTimeout(
			() => setVisibleCount((count) => count + 1),
			ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS
		);
		return () => window.clearTimeout(timer);
	}, [sequenceLength, visibleCount]);

	let content = <BusinessInfo />;
	if (kind === "job-create") {
		content = <JobCreate />;
	} else if (kind === "chat") {
		content = <Chat perspective="employer" visibleCount={visibleCount} />;
	} else if (kind === "interview-contact") {
		content = (
			<InterviewContact perspective="employer" visibleCount={visibleCount} />
		);
	} else if (kind === "seeker-marketplace") {
		content = <Marketplace />;
	} else if (kind === "seeker-chat") {
		content = <Chat perspective="seeker" visibleCount={visibleCount} />;
	} else if (kind === "seeker-interview") {
		content = (
			<InterviewContact perspective="seeker" visibleCount={visibleCount} />
		);
	} else if (kind === "common-notifications") {
		content = <NotificationsPreview visibleCount={visibleCount} />;
	} else if (kind === "common-safety") {
		content = <SafetySheetPreview visibleCount={visibleCount} />;
	} else if (kind === "point-shop") {
		content = <PointShopPreview />;
	}
	return (
		<div className="relative h-full min-h-0 w-auto max-w-full lg:h-auto">
			<Image
				alt=""
				aria-hidden="true"
				className="invisible h-full min-h-0 w-auto max-w-full object-contain object-top lg:h-auto"
				priority
				src={src}
				unoptimized
			/>
			<section
				aria-hidden="true"
				aria-label={alt}
				className="@container pointer-events-none absolute inset-0 overflow-hidden bg-[var(--surface-subtle)] text-foreground"
				inert
			>
				<div className="h-[844px] w-[390px] origin-top-left [zoom:calc(100cqw/390px)]">
					{content}
				</div>
			</section>
		</div>
	);
}
