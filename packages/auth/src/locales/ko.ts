import type { TranslationDictionary } from "@better-auth/i18n";

// better-auth 에러 코드 → 한국어 메시지 사전.
// 코드 목록은 설치된 better-auth 1.6.11의 auth.$ERROR_CODES(core + organization
// 플러그인) 기준. 여기 없는 코드는 영어 원문이 그대로 노출되므로, better-auth를
// 올리거나 플러그인을 추가하면 $ERROR_CODES와 대조해 누락분을 채운다.
// 순수 서버 설정 오류(MISSING_AC_INSTANCE 등 사용자 플로우에서 나올 수 없는
// 개발자용 코드)는 의도적으로 제외 — 원문이 로그 검색에 더 유리하다.
// 어미는 웹 UI와 동일한 해요체("~해 주세요", "~했어요")로 맞춘다.
export const koTranslations: TranslationDictionary = {
	// 계정 · 로그인
	USER_NOT_FOUND: "사용자를 찾을 수 없어요.",
	INVALID_USER: "유효하지 않은 사용자예요.",
	FAILED_TO_CREATE_USER: "회원가입에 실패했어요. 잠시 후 다시 시도해 주세요.",
	FAILED_TO_UPDATE_USER: "회원 정보를 수정하지 못했어요.",
	FAILED_TO_CREATE_SESSION: "로그인 처리에 실패했어요. 다시 시도해 주세요.",
	FAILED_TO_GET_SESSION: "로그인 정보를 확인하지 못했어요.",
	INVALID_EMAIL: "이메일 형식이 올바르지 않아요.",
	INVALID_PASSWORD: "비밀번호가 올바르지 않아요.",
	INVALID_EMAIL_OR_PASSWORD: "이메일 또는 비밀번호가 올바르지 않아요.",
	PASSWORD_TOO_SHORT: "비밀번호가 너무 짧아요.",
	PASSWORD_TOO_LONG: "비밀번호가 너무 길어요.",
	USER_ALREADY_EXISTS: "이미 가입된 이메일이에요.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"이미 가입된 이메일이에요. 다른 이메일을 사용해 주세요.",
	USER_EMAIL_NOT_FOUND: "가입된 이메일을 찾을 수 없어요.",
	SESSION_EXPIRED: "로그인이 만료됐어요. 다시 로그인해 주세요.",
	SESSION_NOT_FRESH: "보안을 위해 다시 로그인한 뒤 시도해 주세요.",
	CROSS_SITE_NAVIGATION_LOGIN_BLOCKED:
		"보안상 차단된 요청이에요. 다시 시도해 주세요.",

	// 계정 연결 · 소셜 로그인
	ACCOUNT_NOT_FOUND: "계정을 찾을 수 없어요.",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "이메일·비밀번호 계정을 찾을 수 없어요.",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "이미 연결된 소셜 계정이에요.",
	LINKED_ACCOUNT_ALREADY_EXISTS: "이미 연결된 계정이 있어요.",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "마지막 남은 로그인 수단은 해제할 수 없어요.",
	PROVIDER_NOT_FOUND: "지원하지 않는 로그인 방식이에요.",
	ID_TOKEN_NOT_SUPPORTED: "지원하지 않는 인증 방식이에요.",
	FAILED_TO_GET_USER_INFO: "사용자 정보를 가져오지 못했어요.",
	USER_ALREADY_HAS_PASSWORD:
		"이미 비밀번호가 설정돼 있어요. 비밀번호를 입력해 주세요.",
	PASSWORD_ALREADY_SET: "이미 비밀번호가 설정돼 있어요.",

	// 이메일 인증 · 변경
	EMAIL_NOT_VERIFIED: "이메일 인증이 필요해요.",
	EMAIL_ALREADY_VERIFIED: "이미 인증된 이메일이에요.",
	EMAIL_MISMATCH: "이메일이 일치하지 않아요.",
	EMAIL_CAN_NOT_BE_UPDATED: "이메일은 변경할 수 없어요.",
	CHANGE_EMAIL_DISABLED: "이메일 변경 기능이 꺼져 있어요.",
	VERIFICATION_EMAIL_NOT_ENABLED: "이메일 인증 기능이 꺼져 있어요.",
	FAILED_TO_CREATE_VERIFICATION: "인증 정보를 만들지 못했어요.",
	INVALID_TOKEN: "인증 정보가 유효하지 않아요. 다시 시도해 주세요.",
	TOKEN_EXPIRED: "인증이 만료됐어요. 다시 시도해 주세요.",

	// 요청 검증
	VALIDATION_ERROR: "입력값이 올바르지 않아요.",
	MISSING_FIELD: "필수 항목이 비어 있어요.",
	FIELD_NOT_ALLOWED: "설정할 수 없는 항목이에요.",
	INVALID_ORIGIN: "허용되지 않은 접속 경로예요.",
	MISSING_OR_NULL_ORIGIN: "요청 출처를 확인할 수 없어요.",
	INVALID_CALLBACK_URL: "유효하지 않은 이동 주소예요.",
	INVALID_REDIRECT_URL: "유효하지 않은 이동 주소예요.",
	INVALID_ERROR_CALLBACK_URL: "유효하지 않은 이동 주소예요.",
	INVALID_NEW_USER_CALLBACK_URL: "유효하지 않은 이동 주소예요.",
	CALLBACK_URL_REQUIRED: "이동할 주소가 필요해요.",

	// 조직
	ORGANIZATION_NOT_FOUND: "조직을 찾을 수 없어요.",
	ORGANIZATION_ALREADY_EXISTS: "이미 존재하는 조직이에요.",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "이미 사용 중인 조직 주소예요.",
	NO_ACTIVE_ORGANIZATION: "선택된 조직이 없어요.",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "조직 멤버 수 한도에 도달했어요.",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"조직을 만들 권한이 없어요.",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"만들 수 있는 조직 수를 초과했어요.",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"조직 정보를 수정할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"조직을 삭제할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"이 조직에 접근할 권한이 없어요.",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "이 조직의 멤버가 아니에요.",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "조직에 소속된 멤버가 아니에요.",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "이미 이 조직의 멤버예요.",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"유일한 소유자는 조직을 나갈 수 없어요.",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"소유자가 없는 상태로는 조직을 나갈 수 없어요.",

	// 조직 멤버
	MEMBER_NOT_FOUND: "멤버를 찾을 수 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "이 멤버를 수정할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "이 멤버를 내보낼 권한이 없어요.",

	// 초대
	INVITATION_NOT_FOUND: "초대를 찾을 수 없어요.",
	INVITATION_LIMIT_REACHED: "초대 한도에 도달했어요.",
	FAILED_TO_RETRIEVE_INVITATION: "초대 정보를 가져오지 못했어요.",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "이미 초대된 사용자예요.",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"이 조직에 초대할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"이 역할로는 초대할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"이 초대를 취소할 권한이 없어요.",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "본인에게 온 초대가 아니에요.",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"초대한 사람이 더 이상 조직의 멤버가 아니에요.",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"초대를 수락하거나 거절하려면 이메일 인증이 필요해요.",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"초대를 확인하려면 이메일 인증이 필요해요.",

	// 팀
	TEAM_NOT_FOUND: "팀을 찾을 수 없어요.",
	TEAM_ALREADY_EXISTS: "이미 존재하는 팀이에요.",
	TEAM_MEMBER_LIMIT_REACHED: "팀 멤버 수 한도에 도달했어요.",
	UNABLE_TO_REMOVE_LAST_TEAM: "마지막 팀은 삭제할 수 없어요.",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "팀에 소속된 멤버가 아니에요.",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "선택된 팀이 없어요.",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"만들 수 있는 팀 수를 초과했어요.",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "팀을 만들 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"이 조직에서 팀을 만들 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM: "이 팀을 수정할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "이 팀을 삭제할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"이 조직에서 팀을 삭제할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"팀 멤버를 추가할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"팀 멤버를 내보낼 권한이 없어요.",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"이 팀의 멤버를 볼 권한이 없어요.",

	// 역할
	ROLE_NOT_FOUND: "역할을 찾을 수 없어요.",
	ROLE_NAME_IS_ALREADY_TAKEN: "이미 사용 중인 역할 이름이에요.",
	TOO_MANY_ROLES: "역할이 너무 많아요.",
	INVALID_RESOURCE: "유효하지 않은 권한 대상이 포함돼 있어요.",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "기본 제공 역할은 삭제할 수 없어요.",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"멤버에게 지정된 역할은 삭제할 수 없어요. 먼저 다른 역할로 바꿔 주세요.",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"역할을 만들려면 조직에 소속돼 있어야 해요.",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "역할을 만들 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "역할을 수정할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "역할을 삭제할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "역할을 볼 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "역할을 조회할 권한이 없어요.",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "역할 목록을 볼 권한이 없어요.",
};
