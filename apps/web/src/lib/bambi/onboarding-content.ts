import type { LucideIcon } from "lucide-react";
import {
	Bell,
	BriefcaseBusiness,
	CalendarCheck,
	FileCheck2,
	FileText,
	Inbox,
	MapPin,
	MessageCircle,
	Paperclip,
	ShieldCheck,
	Star,
	UserRoundCheck,
} from "lucide-react";
import type { StaticImageData } from "next/image";
import type { OnboardingCodePreviewKind } from "@/components/bambi/onboarding/employer-onboarding-preview";
import commonChatAttachment from "../../../public/bambi/onboarding/screens/common-chat-attachment.png";
import commonInterviewContact from "../../../public/bambi/onboarding/screens/common-interview-contact.png";
import commonNotificationMessage from "../../../public/bambi/onboarding/screens/common-notification-message.png";
import commonSafetySupport from "../../../public/bambi/onboarding/screens/common-safety-support.png";
import employerBusinessInfo from "../../../public/bambi/onboarding/screens/employer-business-info.png";
import employerChat from "../../../public/bambi/onboarding/screens/employer-chat.png";
import employerInterviewContact from "../../../public/bambi/onboarding/screens/employer-interview-contact.png";
import employerJobCreate from "../../../public/bambi/onboarding/screens/employer-job-create.png";
import seekerChatEmpty from "../../../public/bambi/onboarding/screens/seeker-chat-empty.png";
import seekerInterviewContactEmpty from "../../../public/bambi/onboarding/screens/seeker-interview-contact-empty.png";
import seekerMarketplace from "../../../public/bambi/onboarding/screens/seeker-marketplace.png";
import seekerReviewEmpty from "../../../public/bambi/onboarding/screens/seeker-review-empty.png";
import type { OnboardingAudience } from "./onboarding";

export interface OnboardingSlideContent {
	codePreview?: OnboardingCodePreviewKind;
	description: string;
	icon: LucideIcon;
	id: string;
	mobileDescription?: string;
	mobileTitle?: string;
	reviewScenarios?: readonly {
		body: string;
		rating: number;
	}[];
	screen: StaticImageData;
	screenAfterAction?: StaticImageData;
	screenAlt: string;
	screenSequence?: readonly StaticImageData[];
	screenSequenceDirection?: "left" | "up";
	secondaryIcon: LucideIcon;
	title: string;
}

export const ONBOARDING_CONTENT: Readonly<
	Record<OnboardingAudience, readonly OnboardingSlideContent[]>
> = {
	job_seeker: [
		{
			codePreview: "seeker-marketplace",
			description:
				"지역과 업종, 근무 조건을 살펴보고 원하는 공고를 빠르게 찾을 수 있어요.",
			icon: MapPin,
			id: "seeker-marketplace",
			mobileDescription:
				"지역과 업종, 근무 조건을 살펴보고\n원하는 공고를 빠르게 찾을 수 있어요!",
			mobileTitle: "내게 맞는 일자리,\n밤비에서 찾아보세요!",
			screen: seekerMarketplace,
			screenAlt: "밤비알바 공고 목록과 지역·업종 필터 화면",
			secondaryIcon: BriefcaseBusiness,
			title: "내게 맞는 일자리, 밤비에서 찾아보세요",
		},
		{
			codePreview: "seeker-chat",
			description:
				"마음에 드는 공고에서 구인자와 대화하고 이미지나 PDF도 주고받을 수 있어요.",
			icon: MessageCircle,
			id: "seeker-chat",
			mobileDescription:
				"마음에 드는 공고에서 구인자와 대화하고\n이미지나 PDF도 주고받을 수 있어요!",
			mobileTitle: "궁금한 내용은 채팅으로\n바로 물어보세요!",
			screen: seekerChatEmpty,
			screenAlt: "밤비알바 구직자 채팅과 첨부 화면",
			secondaryIcon: Paperclip,
			title: "궁금한 내용은 채팅으로 바로 확인하세요",
		},
		{
			codePreview: "seeker-interview",
			description:
				"채팅에서 면접 일정을 확인하고 필요한 경우에만 연락처를 공개할 수 있어요.",
			icon: CalendarCheck,
			id: "seeker-interview-contact",
			mobileDescription:
				"채팅에서 면접일정을 확인하고\n필요한 경우에만 연락처를 공유해요!",
			mobileTitle: "면접과 연락처를\n안전하게 관리해요!",
			screen: seekerInterviewContactEmpty,
			screenAlt: "면접 일정과 연락처 공개 요청 화면",
			secondaryIcon: ShieldCheck,
			title: "면접과 연락처를 안전하게 관리해요",
		},
		{
			description:
				"별점과 후기를 작성해 다른 구직자가 업체를 판단하는 데 도움을 줄 수 있어요.",
			icon: Star,
			id: "seeker-review-safety",
			mobileDescription:
				"별점과 후기를 남겨 다른 구직자가\n업체를 판단하는데 도움을 줄 수 있어요!",
			mobileTitle: "면접 경험을\n후기로 남겨주세요!",
			reviewScenarios: [
				{ body: "여기 괜찮은거 같아요", rating: 5 },
				{ body: "여기 완전 최악이에요", rating: 1 },
			],
			screen: seekerReviewEmpty,
			screenAlt: "별점과 면접 후기를 입력하는 후기 작성 화면",
			secondaryIcon: ShieldCheck,
			title: "면접 경험을 후기로 남겨주세요",
		},
	],
	employer: [
		{
			description:
				"업체와 사업자 정보를 제출하면 운영자 확인 후 밤비의 구인 기능을 이용할 수 있어요.",
			icon: FileCheck2,
			id: "employer-business-info",
			codePreview: "business-info",
			mobileDescription:
				"업체와 사업자 정보를 제공하면 운영자가\n확인 후 밤비에서 구직자를 채용할 수 있어요!",
			mobileTitle: "안전한 채용을 위해\n업체 정보를 등록하세요!",
			screen: employerBusinessInfo,
			screenAlt: "업체 정보와 사업자 서류 제출 화면",
			secondaryIcon: ShieldCheck,
			title: "안전한 채용을 위해 업체 정보를 등록해요",
		},
		{
			description:
				"급여와 지역, 업종, 상세 내용과 이미지를 입력해 이해하기 쉬운 공고를 만들 수 있어요.",
			icon: FileText,
			id: "employer-job-create",
			codePreview: "job-create",
			mobileDescription:
				"급여와 지역, 업종, 상세 내용과 사진을\n입력하시면 공고의 질을 높일 수 있어요!",
			mobileTitle: "내 업체의 공고를\n쉽고 자세하게!",
			screen: employerJobCreate,
			screenAlt: "구인자 공고 등록 화면",
			secondaryIcon: BriefcaseBusiness,
			title: "우리 업체의 공고를 쉽고 자세하게",
		},
		{
			description:
				"채팅에서 문의에 답하고 이미지나 PDF를 주고받으며 지원자를 응대할 수 있어요.",
			icon: MessageCircle,
			id: "employer-chat",
			codePreview: "chat",
			mobileDescription:
				"면접 일정을 제안하고 연락처 공개를\n요청해 채용 과정을 이어가세요!",
			screen: employerChat,
			screenAlt: "밤비알바 구인자 채팅과 첨부 화면",
			secondaryIcon: Paperclip,
			title: "지원자와 바로 대화하세요",
		},
		{
			description:
				"면접 일정을 제안하고 연락처 공개를 요청해 채용 과정을 이어갈 수 있어요.",
			icon: CalendarCheck,
			id: "employer-interview-contact",
			codePreview: "interview-contact",
			mobileTitle: "면접 제안부터\n지원자 관리까지!",
			screen: employerInterviewContact,
			screenAlt: "구인자의 면접 제안과 연락처 요청 화면",
			secondaryIcon: UserRoundCheck,
			title: "면접 제안부터 지원자 관리까지",
		},
	],
	common: [
		{
			codePreview: "seeker-chat",
			description: "",
			icon: MessageCircle,
			id: "common-chat-attachment",
			screen: commonChatAttachment,
			screenAlt: "채팅과 첨부 미리보기 화면",
			secondaryIcon: Paperclip,
			mobileTitle: "채팅과 첨부로\n편하게 대화해요!",
			title: "채팅과 첨부로 편하게 대화해요!",
		},
		{
			codePreview: "seeker-interview",
			description:
				"면접 일정을 함께 확인하고 동의한 경우에만 연락처 공개가 가능해요!",
			icon: CalendarCheck,
			id: "common-interview-contact",
			screen: commonInterviewContact,
			mobileDescription:
				"면접 일정을 함께 확인하고 동의한\n경우에만 연락처 공개가 가능해요!",
			mobileTitle: "면접과 연락처는\n필요한 순간에",
			screenAlt: "면접 일정과 연락처 공개 화면",
			secondaryIcon: ShieldCheck,
			title: "면접과 연락처는 필요한 순간에",
		},
		{
			codePreview: "common-notifications",
			description:
				"채팅, 면접, 서비스 소식은 알림과 쪽지로 다시 확인할 수 있어요",
			icon: Bell,
			id: "common-notification-message",
			screen: commonNotificationMessage,
			mobileDescription:
				"채팅, 면접, 서비스 소식은 알림과\n쪽지로 다시 확인할 수 있어요",
			mobileTitle: "알람과 쪽지로\n중요한 소식을 빠르게!",
			screenAlt: "알림과 쪽지함 화면",
			secondaryIcon: Inbox,
			title: "알람과 쪽지로 중요한 소식을 빠르게!",
		},
		{
			codePreview: "common-safety",
			description: "신고와 차단 기능을 이용하고, 고객센터에 빠르게 문의하세요!",
			icon: ShieldCheck,
			id: "common-safety-support",
			screen: commonSafetySupport,
			mobileDescription:
				"신고와 차단 기능을 이용하고,\n고객센터에 빠르게 문의하세요!",
			mobileTitle: "불편한 상황은\n밤비가 도와드려요!",
			screenAlt: "신고·차단과 고객센터 화면",
			secondaryIcon: MessageCircle,
			title: "불편한 상황은 밤비가 도와드려요!",
		},
	],
};
