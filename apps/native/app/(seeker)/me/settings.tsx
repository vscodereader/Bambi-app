import { env } from "@bambi-app/env/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	type ImagePickerResult,
	launchImageLibraryAsync,
} from "expo-image-picker";
import { type Href, router, Stack } from "expo-router";
import { Avatar, Button, Input, Surface, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiScreen,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";
import { publicObjectUri } from "@/src/lib/bambi-native";
import { readLocalFileBytes } from "@/src/lib/local-file-bytes";
import {
	formatBirthDate8,
	formatPhoneNumber,
	genderLabel,
	resolveProfileImageUpload,
	validateDisplayName,
} from "@/src/lib/me-settings";
import { orpc, queryClient } from "@/src/lib/orpc";
import { useIdentityVerification } from "@/src/lib/use-identity-verification";

// (seeker)/_layout.tsx의 Stack.Screen 목록에 이 라우트가 없어 커스텀 헤더가 제목을
// 빈 문자열로 읽는다 — 형제 화면들과 같이 화면이 스스로 제목을 주입한다. 로딩 조기
// 반환에서도 제목이 유지되게 두 분기에서 함께 렌더한다.
const SCREEN_OPTIONS = { title: "계정 설정" } as const;

// 카드는 Pressable이 아니라 accessibilityRole을 붙이지 않는다 — 값만 selectable로 둔다.
function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<View className="flex-row items-center justify-between gap-3">
			<Text className="text-muted text-sm">{label}</Text>
			<Text className="text-foreground text-sm" selectable>
				{value}
			</Text>
		</View>
	);
}

// 프로필을 못 읽은 두 경우(조회 실패·프로필 없음)를 한 카드로 합친다 — 어느 쪽이든
// 화면은 계속 그려져야 회원 탈퇴 카드가 살아 있다(ErrorState는 자체 BambiScreen을 쓴다).
function NoProfileCard({
	isError,
	onRetry,
}: {
	isError: boolean;
	onRetry: () => void;
}) {
	return (
		<StateCard
			action={
				isError ? (
					<Button onPress={onRetry} size="sm">
						<Button.Label>다시 시도</Button.Label>
					</Button>
				) : null
			}
			description={
				isError
					? "로그인 상태와 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
					: "프로필 설정을 먼저 마친 뒤 다시 시도해 주세요."
			}
			title={
				isError
					? "계정 정보를 불러오지 못했어요"
					: "프로필 정보를 찾을 수 없어요"
			}
		/>
	);
}

const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

// oRPC·better-auth 오류 message는 영어 기본값이 섞여 있어 그대로 노출하지 않는다
// (me-interviews.ts의 interviewStatusErrorMessage와 같은 규칙). createProfileImageUpload의
// BAD_REQUEST만 서버가 한국어를 싣는데 뜻이 같아 맵으로 덮어도 문구가 어긋나지 않는다.
const PROFILE_IMAGE_ERROR_MESSAGES: Record<string, string> = {
	BAD_REQUEST: "JPG, PNG, WebP 이미지만 등록할 수 있어요.",
	FORBIDDEN: "지금은 프로필 사진을 변경할 수 없어요.",
	UNAUTHORIZED: "로그인 후 다시 시도해 주세요.",
};

const profileImageErrorMessage = (error: unknown): string => {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String(error.code)
			: "";

	return (
		PROFILE_IMAGE_ERROR_MESSAGES[code] ??
		"프로필 사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."
	);
};

// 프로필 사진. 웹은 고른 뒤 별도 저장 버튼을 누르는 2단계지만 native는 선택 즉시 반영한다.
// 아바타 정본은 세션 user.image 하나라(getMine에는 없다) refetch 한 번이면 이 화면과
// 내 정보 탭 ProfileCard가 함께 갱신된다.
function ProfileImageCard() {
	const session = authClient.useSession();
	const imageUrl = session.data?.user?.image ?? null;
	const [isSaving, setIsSaving] = useState(false);
	const uploadMutation = useMutation(
		orpc.bambi.onboarding.createProfileImageUpload.mutationOptions()
	);

	const saveImage = async (image: null | string) => {
		// better-auth 클라이언트는 throw 하지 않고 {data,error}를 돌려준다.
		const result = await authClient.updateUser({ image });

		if (result.error) {
			throw new Error(result.error.message);
		}

		await session.refetch();
	};

	const handlePick = async () => {
		let picked: ImagePickerResult;

		try {
			// SDK 56의 시스템 포토 피커는 사전 권한 요청이 필요 없다 — 권한이 막힌 구형 OS는
			// 여기서 예외로 떨어지므로 그 경로만 안내한다.
			picked = await launchImageLibraryAsync({
				allowsEditing: true,
				aspect: [1, 1],
				mediaTypes: ["images"],
				quality: 0.8,
			});
		} catch {
			// allowsEditing 경로(iOS 레거시 피커·Android 시스템 피커)는 권한 없이 열리므로
			// 여기 예외는 대부분 권한이 아니다 — 설정 앱으로 보내는 안내는 오히려 오도한다.
			Alert.alert("사진을 불러오지 못했어요", "잠시 후 다시 시도해 주세요.");

			return;
		}

		const asset = picked.canceled ? null : picked.assets[0];

		if (!asset) {
			return;
		}

		setIsSaving(true);

		try {
			// 서명에 content-length가 묶여 있어 실제 전송 바이트와 1바이트라도 다르면 GCS가 403이다.
			// asset.fileSize는 크롭·압축 뒤 어긋날 수 있으므로 읽은 바이트 길이를 정본으로 쓴다.
			const { bytes } = await readLocalFileBytes(asset.uri);
			const resolved = resolveProfileImageUpload(asset, bytes.byteLength);

			if ("error" in resolved) {
				Alert.alert("등록할 수 없는 사진이에요", resolved.error);

				return;
			}

			const intent = await uploadMutation.mutateAsync(resolved);

			if (!intent.uploadUrl.startsWith("https://")) {
				// 서버 GCS 미구성(dev)이면 local:// 플레이스홀더가 내려온다 — 올리지 않고 멈춘다.
				Alert.alert(
					"지금은 프로필 사진을 등록할 수 없어요",
					"잠시 후 다시 시도해 주세요."
				);

				return;
			}

			// Content-Length는 손대지 않는다 — 네트워크 스택이 body 길이로 채운다.
			const response = await fetch(intent.uploadUrl, {
				body: bytes,
				headers: { "Content-Type": intent.mimeType },
				method: "PUT",
			});

			if (!response.ok) {
				// GCS 오류 본문은 영어 XML이라 화면에 싣지 않는다.
				throw new Error("upload failed");
			}

			await saveImage(
				// env 미설정 기기 폴백: 서명 URL에서 쿼리만 떼면 공개 객체 URL과 같다(gcs.ts:71).
				publicObjectUri(intent.storageKey, GCS_PUBLIC_BASE_URL) ??
					intent.uploadUrl.split("?")[0]
			);
			Alert.alert("저장했어요", "프로필 사진을 변경했어요.");
		} catch (error) {
			Alert.alert("저장하지 못했어요", profileImageErrorMessage(error));
		} finally {
			setIsSaving(false);
		}
	};

	const handleReset = () => {
		Alert.alert("프로필 사진을 지울까요?", "기본 이미지로 돌아가요.", [
			{ style: "cancel", text: "취소" },
			{
				onPress: async () => {
					setIsSaving(true);

					try {
						await saveImage(null);
						// 등록 성공 Alert와 대칭 — 아바타 폴백 전환만으로는 완료 신호가 약하다.
						Alert.alert("변경했어요", "기본 이미지로 돌아갔어요.");
					} catch (error) {
						Alert.alert("저장하지 못했어요", profileImageErrorMessage(error));
					} finally {
						setIsSaving(false);
					}
				},
				style: "destructive",
				text: "기본 이미지로 변경",
			},
		]);
	};

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="gap-1">
				<Text className="font-semibold text-base text-foreground">
					프로필 사진
				</Text>
				<Text className="text-muted text-sm">
					JPG, PNG, WebP 형식의 5MB 이하 이미지를 등록할 수 있어요.
				</Text>
			</View>
			<View className="flex-row items-center gap-4">
				<Avatar alt="프로필 사진" size="lg">
					{imageUrl ? <Avatar.Image source={{ uri: imageUrl }} /> : null}
					<Avatar.Fallback />
				</Avatar>
				<View className="flex-1 gap-2">
					<Button
						accessibilityLabel="프로필 사진 선택"
						isDisabled={isSaving}
						onPress={handlePick}
						variant="secondary"
					>
						<Button.Label>{isSaving ? "저장 중" : "사진 선택"}</Button.Label>
					</Button>
					{imageUrl ? (
						<Button
							accessibilityLabel="프로필 사진을 기본 이미지로 변경"
							isDisabled={isSaving}
							onPress={handleReset}
							variant="tertiary"
						>
							<Button.Label>기본 이미지로 변경</Button.Label>
						</Button>
					) : null}
				</View>
			</View>
		</Surface>
	);
}

// 본인인증. 포트원 KCP 인증창을 @portone/react-native-sdk의 인앱 WebView로 앱 안에서
// 연다 — EXPO_PUBLIC_PORTONE_STORE_ID/CHANNEL_KEY가 하나라도 없으면 인증창을 열 수 없어
// 기존 "웹사이트에서" 안내로 폴백한다. 이 화면의 primary는 표시 이름 저장이라 인증
// 버튼은 secondary로 둔다.
function PhoneVerificationCard({
	isPhoneVerified,
	phoneNumber,
}: {
	isPhoneVerified: boolean;
	phoneNumber: null | string | undefined;
}) {
	const { isAvailable, isPending, startIdentityVerification, verification } =
		useIdentityVerification();

	let description =
		"휴대폰 본인인증은 아직 앱에서 지원하지 않아요. 밤비알바 웹사이트의 마이페이지 > 계정 설정에서 인증할 수 있어요.";

	if (isAvailable) {
		description = isPhoneVerified
			? "번호가 바뀌었다면 다시 인증해 주세요."
			: "인증 화면이 앱 안에서 열려요.";
	} else if (isPhoneVerified) {
		description = "휴대폰 본인인증이 완료됐어요.";
	}

	let label = "휴대폰 본인인증";

	if (isPending) {
		label = "인증 중";
	} else if (isPhoneVerified) {
		label = "다시 인증하기";
	}

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-center justify-between gap-3">
				<Text className="font-semibold text-base text-foreground">
					본인인증
				</Text>
				<Pill tone={isPhoneVerified ? "accent" : "neutral"}>
					{isPhoneVerified ? "인증완료" : "인증 필요"}
				</Pill>
			</View>
			{isPhoneVerified && phoneNumber ? (
				<InfoRow label="인증된 번호" value={formatPhoneNumber(phoneNumber)} />
			) : null}
			<Text className="text-muted text-sm">{description}</Text>
			{isAvailable ? (
				<Button
					accessibilityLabel={label}
					className="active:opacity-75"
					isDisabled={isPending}
					onPress={startIdentityVerification}
					variant="secondary"
				>
					<Button.Label>{label}</Button.Label>
				</Button>
			) : null}
			{verification}
		</Surface>
	);
}

// 위험 구역. 탈퇴 흐름은 bambiProfile에 아무 의존도 없어(세션 + 자격 조회만) 프로필을
// 못 읽은 상태에서도 그대로 그린다 — 탈퇴는 개인정보 삭제 요구 경로라 막히면 안 된다.
// 표시 이름 저장이 이 화면의 primary라 탈퇴 버튼은 danger로 둔다.
function WithdrawSection({ isSignedIn }: { isSignedIn: boolean }) {
	// 보관일수 안내. 운영자 설정 → 코드 기본값 → 30 순 폴백이라 로딩 중에도 문장이 비지 않는다.
	const memberPolicyQuery = useQuery(
		orpc.bambi.siteSettings.getMemberPolicy.queryOptions()
	);
	const retentionDays =
		memberPolicyQuery.data?.days ?? memberPolicyQuery.data?.defaultDays ?? 30;
	// 소유 조직에 다른 멤버가 남아 있으면 사전 차단. 로딩 중에는 활성 유지하고
	// 명시적 true일 때만 막는다 — 최종 가드는 withdrawMyAccount의 서버 검사다.
	const eligibilityQuery = useQuery({
		...orpc.bambi.onboarding.getWithdrawEligibility.queryOptions(),
		enabled: isSignedIn,
	});
	const blockedByTeamMembers =
		eligibilityQuery.data?.blockedByTeamMembers === true;

	const withdrawMutation = useMutation(
		orpc.bambi.onboarding.withdrawMyAccount.mutationOptions({
			onError: (error) => {
				// 팀 멤버 잔존 등 서버 거절 사유가 메시지에 들어 있어 그대로 노출한다.
				Alert.alert(
					"탈퇴하지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			onSuccess: async () => {
				// 서버가 전 기기 세션을 끊었으므로 signOut 실패는 무시한다(LogoutButton과 같은 규칙).
				await authClient.signOut().catch(() => undefined);
				// 탈퇴 계정의 역할·목록이 캐시에 남으면 다음 사용자가 그 값으로 잘못 라우팅된다.
				queryClient.clear();
				router.replace("/login" as Href);
			},
		})
	);

	const confirmWithdraw = () => {
		Alert.alert(
			"정말 탈퇴하시겠어요?",
			// 웹 확인 다이얼로그와 문장 단위로 같은 문구. 포인트 아이템·쿠폰 소멸은 법적 고지라 축약 금지.
			"탈퇴 즉시 모든 기기에서 로그아웃되고 계정은 스스로 되돌릴 수 없어요. 남긴 채팅·리뷰는 '탈퇴한 회원'으로 표시돼요. 포인트로 구매한 보유 아이템·쿠폰도 함께 사라지며 복구되지 않아요.",
			[
				{ style: "cancel", text: "취소" },
				{
					onPress: () => withdrawMutation.mutate(undefined),
					style: "destructive",
					text: "탈퇴하기",
				},
			]
		);
	};

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<Text className="font-semibold text-base text-foreground">회원 탈퇴</Text>
			<Text className="text-muted text-sm">
				탈퇴하면 즉시 로그아웃되고 다시 로그인할 수 없어요. 프로필은 '탈퇴한
				회원'으로 표시되고, 아이디·이메일·연락처 등 개인정보는 {retentionDays}일
				동안 보관한 뒤 파기돼요. 그동안에는 같은 명의로 본인인증을 다시 할 수
				없어요.
			</Text>
			{blockedByTeamMembers ? (
				<Text className="text-danger-soft-foreground text-sm dark:text-danger">
					팀에 다른 멤버가 남아 있어 지금은 탈퇴할 수 없어요. 팀 관리에서 멤버를
					모두 정리한 뒤 탈퇴할 수 있어요.
				</Text>
			) : null}
			<Button
				accessibilityLabel="회원 탈퇴"
				isDisabled={blockedByTeamMembers || withdrawMutation.isPending}
				onPress={confirmWithdraw}
				variant="danger"
			>
				<Button.Label>
					{withdrawMutation.isPending ? "탈퇴 처리 중" : "회원 탈퇴"}
				</Button.Label>
			</Button>
		</Surface>
	);
}

// 뒤로가기는 (seeker)/_layout.tsx의 커스텀 헤더가 그리고 제목은 이 화면이 Stack.Screen으로
// 직접 등록한다(BambiHeader를 쓰면 이중 제목).
function SeekerAccountSettingsInner() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});
	// 표시 이름 정본은 bambiProfile이 아니라 세션 user.name이다(bambi_profile.display_name은 제거됨).
	const currentName = session.data?.user?.name ?? "";
	const [displayName, setDisplayName] = useState(currentName);
	const [isNameTouched, setIsNameTouched] = useState(false);

	useEffect(() => {
		if (currentName) {
			setDisplayName(currentName);
		}
	}, [currentName]);

	const updateMutation = useMutation(
		orpc.bambi.onboarding.updateMyProfile.mutationOptions({
			onError: (error) => {
				// 운영자 금칙어 사유가 메시지에 들어 있어 그대로 노출한다.
				Alert.alert(
					"저장하지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			onSuccess: async () => {
				Alert.alert("저장했어요", "표시 이름을 변경했어요.");
				setIsNameTouched(false);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.key(),
				});
				// 응답에 새 표시명이 없다 — 세션을 다시 불러와야 이 화면과 내 정보 탭이 갱신된다.
				session.refetch();
			},
		})
	);

	const nameError = validateDisplayName(displayName, currentName);

	if (session.isPending || mineQuery.isPending) {
		return (
			<>
				<Stack.Screen options={SCREEN_OPTIONS} />
				<LoadingState label="계정 정보를 불러오고 있어요." />
			</>
		);
	}

	const profile = mineQuery.data?.bambiProfile ?? null;
	const isPhoneVerified = Boolean(profile?.isPhoneVerified);

	// 조회 실패·프로필 없음에서도 조기 반환하지 않는다 — 탈퇴는 개인정보 삭제 요구 경로라
	// profile에 의존하지 않는 회원 탈퇴 카드가 어느 상태에서도 살아 있어야 한다(웹과 동일).
	return (
		<BambiScreen>
			<Stack.Screen options={SCREEN_OPTIONS} />
			{profile ? (
				<>
					{/* 허브 ProfileCard의 아바타를 눌러 들어오는 동선이라 사진 카드를 맨 위에 둔다
					    (웹은 본인인증 카드 뒤 — 의도적 차이). */}
					<ProfileImageCard />

					<Surface className="gap-4 rounded-lg p-4" variant="secondary">
						<View className="gap-1">
							<Text className="font-semibold text-base text-foreground">
								프로필
							</Text>
							<Text className="text-muted text-sm">
								공고·채팅에 표시되는 이름이에요.
							</Text>
						</View>
						<TextField>
							<Input
								accessibilityLabel="표시 이름"
								autoComplete="name"
								onChangeText={(value) => {
									setIsNameTouched(true);
									setDisplayName(value);
								}}
								placeholder="공고·채팅에 표시되는 이름"
								textContentType="name"
								value={displayName}
							/>
						</TextField>
						<Text className="text-muted text-xs">
							2자 이상 80자까지 입력할 수 있어요.
						</Text>
						{isNameTouched && nameError ? (
							<Text className="text-danger text-sm">{nameError}</Text>
						) : null}
						{/* phoneNumber는 함께 보내지 않는다 — 서버가 번호를 덮어쓰며 인증 상태를 내린다. */}
						<Button
							accessibilityLabel="표시 이름 저장"
							isDisabled={nameError !== null || updateMutation.isPending}
							onPress={() =>
								updateMutation.mutate({ displayName: displayName.trim() })
							}
						>
							<Button.Label>
								{updateMutation.isPending ? "저장 중" : "저장"}
							</Button.Label>
						</Button>
					</Surface>

					<Surface className="gap-3 rounded-lg p-4" variant="secondary">
						<View className="gap-1">
							<Text className="font-semibold text-base text-foreground">
								기본 정보
							</Text>
							<Text className="text-muted text-sm">
								성별·생년월일은 휴대폰 본인인증으로 확인돼요.
							</Text>
						</View>
						<InfoRow label="성별" value={genderLabel(profile.gender)} />
						<InfoRow
							label="생년월일"
							value={formatBirthDate8(profile.birthDate)}
						/>
					</Surface>

					<PhoneVerificationCard
						isPhoneVerified={isPhoneVerified}
						phoneNumber={profile.phoneNumber}
					/>
				</>
			) : (
				<NoProfileCard
					isError={mineQuery.isError}
					onRetry={() => mineQuery.refetch()}
				/>
			)}

			<WithdrawSection isSignedIn={Boolean(session.data?.user)} />
		</BambiScreen>
	);
}

export default function SeekerAccountSettingsScreen() {
	return (
		<MemberOnly>
			<SeekerAccountSettingsInner />
		</MemberOnly>
	);
}
