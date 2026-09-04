// bambi-screen의 formatDateTime과 같은 규칙. 이 파일은 순수 모듈(node에서 테스트가 그대로
// 돈다)이라 react-native·@expo/vector-icons를 끌고 오는 컴포넌트 모듈을 import하지 않고 같이
// 둔다(bambi-native.ts의 formatJobPay와 같은 이유).
const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));

// web bambi-options.ts biznumStatusLabels/getBiznumStatusLabel 이식.
export const biznumStatusLabels: Record<string, string> = {
	"01": "계속사업자",
	"02": "휴업자",
	"03": "폐업자",
};

export const getBiznumStatusLabel = (code: null | string): string =>
	(code ? biznumStatusLabels[code] : undefined) ?? "상태 미상";

// web /employer/me/page.tsx getBiznumCheckText 이식.
export const getBiznumCheckText = (input: {
	biznumCheckEnabled: boolean;
	biznumCheckedAt: Date | null | string;
	biznumStatusCode: null | string;
}): string => {
	if (!input.biznumCheckedAt) {
		return input.biznumCheckEnabled ? "미확인" : "곧 준비될 기능입니다";
	}

	return `확인 완료(${getBiznumStatusLabel(input.biznumStatusCode)}) · ${formatDateTime(input.biznumCheckedAt)}`;
};

const BRN_PATTERN = /^\d{3}-\d{2}-\d{5}$/;
const START_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface BusinessForm {
	businessRegistrationNumber: string;
	businessStartDate: string;
	displayName: string;
	representativeName: string;
}

export type BusinessSubmitInput = BusinessForm;

export const validateBusinessForm = (
	form: BusinessForm
):
	| {
			errors: Partial<Record<keyof BusinessForm, string>>;
			message: string;
			ok: false;
	  }
	| { input: BusinessSubmitInput; ok: true } => {
	const errors: Partial<Record<keyof BusinessForm, string>> = {};
	const displayName = form.displayName.trim();
	const businessRegistrationNumber = form.businessRegistrationNumber.trim();
	const representativeName = form.representativeName.trim();
	const businessStartDate = form.businessStartDate.trim();

	if (!displayName) {
		errors.displayName = "업체명을 입력해 주세요.";
	}

	if (!BRN_PATTERN.test(businessRegistrationNumber)) {
		errors.businessRegistrationNumber =
			"사업자등록번호는 000-00-00000 형식으로 입력해 주세요.";
	}

	if (!representativeName) {
		errors.representativeName = "대표자 성명을 입력해 주세요.";
	}

	if (!START_DATE_PATTERN.test(businessStartDate)) {
		errors.businessStartDate = "개업일자를 YYYY-MM-DD 형식으로 입력해 주세요.";
	}

	const message = Object.values(errors).find(Boolean);

	if (message) {
		return { errors, message, ok: false };
	}

	return {
		input: {
			businessRegistrationNumber,
			businessStartDate,
			displayName,
			representativeName,
		},
		ok: true,
	};
};

export type VerificationStatus =
	| "changes_unsubmitted"
	| "none"
	| "pending"
	| "rejected"
	| "verified";

export interface BusinessScreenState {
	canDeleteDocuments: boolean;
	inputsLocked: boolean;
	requiresConfirmation: boolean;
	statusNotice: null | string;
	submitLabel: string;
}

// web /employer/me/page.tsx + business-document-uploader.tsx 상태 규칙 이식.
export const resolveBusinessScreenState = (
	status: string
): BusinessScreenState => {
	const isPending = status === "pending";
	const requiresConfirmation =
		status === "verified" || status === "changes_unsubmitted";

	let statusNotice: null | string = null;

	if (status === "verified") {
		statusNotice =
			"인증 완료 후 업체 정보나 인증 서류를 변경하면 변경사항 미제출 상태로 전환됩니다. 기존 공고와 광고는 비공개 처리되며, 재승인 전까지 공고·광고 등록과 채팅 송수신을 이용할 수 없습니다.";
	} else if (status === "changes_unsubmitted") {
		statusNotice =
			"변경사항이 아직 제출되지 않았습니다. 기존 공고와 광고가 비공개 처리되었으며 채팅 송수신이 제한됩니다. 업체 정보 제출 후 운영자 승인을 받아야 다시 이용할 수 있습니다.";
	} else if (isPending) {
		statusNotice =
			"운영자 승인 대기 중입니다. 심사 중에는 업체 정보를 수정할 수 없어요.";
	}

	return {
		canDeleteDocuments: !isPending,
		inputsLocked: isPending,
		requiresConfirmation,
		statusNotice,
		submitLabel: status === "rejected" ? "업체 정보 재제출" : "업체 정보 제출",
	};
};

export interface EmployerGateNotice {
	actionLabel: null | string;
	description: string;
	title: string;
}

// web employer-gate-banner.tsx 이식. verified면 null(배너 없음). action 예: "공고를 등록".
export const getEmployerGateNotice = (
	status: string,
	action: string
): EmployerGateNotice | null => {
	switch (status) {
		case "none":
			return {
				actionLabel: "업체 정보 입력",
				description: `${action}하려면 업체명과 사업자등록번호를 입력하세요.`,
				title: "업체 정보 등록이 필요합니다",
			};
		case "pending":
			return {
				actionLabel: null,
				description: `${action}하려면 운영자 승인이 완료되어야 합니다.`,
				title: "운영자 승인 대기 중",
			};
		case "rejected":
			return {
				actionLabel: "업체 정보 다시 제출",
				description: `반려 사유를 확인하고 업체 정보를 다시 제출해 주세요. 승인 후 ${action}할 수 있습니다.`,
				title: "업체 인증이 반려되었습니다",
			};
		case "changes_unsubmitted":
			return {
				actionLabel: "변경사항 제출",
				description: `변경한 업체 정보를 제출하고 운영자 승인을 받아야 ${action}할 수 있습니다.`,
				title: "업체 인증 변경사항을 제출해 주세요",
			};
		default:
			return null;
	}
};

// oRPC 코드형 오류 → 한국어. 서버가 한국어 message를 실은 경우(국세청 대조 등)만 그대로 쓴다.
const ENGLISH_FALLBACK_PATTERN = /^[A-Za-z .]+$/;
const BUSINESS_ERROR_MESSAGES: Record<string, string> = {
	BAD_REQUEST: "입력한 사업자 정보를 다시 확인해 주세요.",
	CONFLICT: "이미 처리 중인 요청이 있어요. 잠시 후 다시 시도해 주세요.",
	FORBIDDEN: "지금은 업체 정보를 변경할 수 없어요.",
	NOT_FOUND: "대상을 찾을 수 없어요.",
	TOO_MANY_REQUESTS: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.",
	UNAUTHORIZED: "로그인 후 다시 시도해 주세요.",
};

export const businessErrorMessage = (error: unknown): string => {
	if (
		error instanceof Error &&
		error.message &&
		!ENGLISH_FALLBACK_PATTERN.test(error.message)
	) {
		return error.message;
	}

	const code =
		typeof error === "object" && error !== null && "code" in error
			? String((error as { code: unknown }).code)
			: "";

	return (
		BUSINESS_ERROR_MESSAGES[code] ??
		"요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
	);
};

// 임시 저장(saveEmployerBusinessDraft)을 걸어도 되는 상태인지. 조직이 만들어지기 전에는
// 저장 대상이 없고, 심사 대기(pending) 중에는 서버가 거부한다. web /employer/me와 같은 규칙.
export const canAutosaveBusinessDraft = ({
	organizationId,
	status,
}: {
	organizationId: string | undefined;
	status: string;
}): boolean =>
	Boolean(organizationId) &&
	(status === "verified" || status === "changes_unsubmitted");

export interface BusinessDraftValues {
	brn: string;
	displayName: string;
	representativeName: string;
	startDate: string;
}

// 값이 서버에 저장된 것과 같으면 저장하지 않는다. saveEmployerBusinessDraft는 값이 같아도
// verified 조직을 changes_unsubmitted로 강등하므로, 이 가드가 없으면 화면을 열기만 해도
// 업체 인증이 풀린다. web /employer/me의 changed 판정과 같은 규칙(개업일자는 이미 같은
// 표기로 정규화돼 있어 그대로 비교한다).
export const hasBusinessDraftChanges = (
	next: BusinessDraftValues,
	saved: BusinessDraftValues
): boolean =>
	next.displayName.trim() !== saved.displayName.trim() ||
	next.brn.trim() !== saved.brn.trim() ||
	next.representativeName.trim() !== saved.representativeName.trim() ||
	next.startDate !== saved.startDate;
