# native 본인인증(포트원 KCP 인증창) 도입 타당성 조사

조사 범위: `apps/web`(브라우저 SDK 호출부) → `packages/api`(발급·검증·소진) → `apps/native`(현 상태·가용 수단). 모든 주장에 파일:라인 또는 공식 문서 근거를 단다. 코드는 한 줄도 수정하지 않았다.

## 현행 웹 흐름(정확한 심볼·엔드포인트)

### 1) 인증창을 여는 공통 훅

`apps/web/src/components/bambi/use-portone-verification.ts` 하나가 "발급 → 인증창 → 복귀"를 전담하고, 결과로 무엇을 할지는 호출부(`onVerified`)가 정한다(:3-5, :43-49).

| 단계 | 코드 | 내용 |
|---|---|---|
| 발급 | `use-portone-verification.ts:133-134` | `client.bambi.onboarding.startIdentityVerification()` → `{ identityVerificationId }`. 인증창을 열기 **전에** await(모바일은 여기서 페이지가 통째로 떠남, :131-132 주석) |
| 인증창 | `:138-148` | `requestIdentityVerification({ channelKey, identityVerificationId, redirectUrl: window.location.href, storeId, windowType: { pc: "POPUP", mobile: "REDIRECTION" }, popup: { center: true } })` — SDK는 `@portone/browser-sdk/v2`(`:10`, `apps/web/package.json:20` `@portone/browser-sdk@^0.1.9`) |
| PC 복귀 | `:150-154` | 팝업이 닫히며 `response.code` 유무로 성패 판정 후 `onVerified(identityVerificationId)` |
| 모바일 복귀 | `:92-120` | 리디렉션으로 돌아온 쿼리 `identityVerificationId` / `code` / `message`를 읽고, `getPortOneReturnUrl`(`apps/web/src/lib/bambi/portone-verification-return.ts:13-25`)로 그 3개 파라미터만 지운 뒤 처리 |
| 진입점 구분 | `:24-41, :103-108` | 한 화면에 인증 버튼이 여럿일 때 `sessionStorage`의 `bambi:phone-verify-intent`로 복귀 처리 주체를 하나로 고정 |
| 미구성 판정 | `:60-64` | `NEXT_PUBLIC_PORTONE_STORE_ID` + `NEXT_PUBLIC_PORTONE_CHANNEL_KEY` 존재 여부 |

즉 **클라이언트가 하는 일은 "서버가 발급한 ID로 창을 열고, 끝나면 그 ID를 호출부에 넘기는 것"뿐**이다. 이름·주민번호는 KCP 창에 직접 입력되고 우리 코드는 ID만 다룬다(`:6-7`).

### 2) 호출부(=`onVerified`가 부르는 엔드포인트)

- 회원 재인증: `apps/web/src/components/bambi/screens/account-settings-screen.tsx:297-304`의 `PhoneVerifyDialog` → `onboarding.verifyMyPhone`
- 비회원(게스트): `apps/web/src/components/bambi/phone-verify-dialog.tsx:116-131` → `POST /api/guest`
- 아이디 찾기·비밀번호 재설정: `apps/web/src/components/bambi/auth/account-recovery-dialog.tsx:214, :229` → `accountRecovery.lookupAccountByIdentity` / `resetPasswordByIdentity`
- 가입 전 확인: `onboarding.checkIdentityForSignup`
- 포트원 미구성(dev)이면 `PhoneVerifyDialog`가 목 폼으로 폴백(`phone-verify-dialog.tsx:58-75`)

### 3) 서버 계약(여기가 핵심 — native에서 그대로 재사용 가능)

| 프로시저 | 위치 | 권한 |
|---|---|---|
| `bambi.onboarding.startIdentityVerification` | `packages/api/src/routers/bambi/onboarding.ts:1130-1132` | **rateLimitedPublicProcedure**(비로그인 가능, IP 레이트리밋 `services/rate-limit.ts:99`) |
| `bambi.onboarding.verifyMyPhone` | `onboarding.ts:1177-1227` | **protectedProcedure**(세션 필요) |
| `bambi.onboarding.checkIdentityForSignup` | `onboarding.ts:1138-1172` | publicProcedure |
| `bambi.accountRecovery.lookupAccountByIdentity` / `resetPasswordByIdentity` | `account-recovery.ts:144, :159` | rateLimitedPublicProcedure |

인증 건(ticket) 수명은 `packages/api/src/services/bambi-identity-ticket.ts`가 단독으로 관리한다: 발급 `issueIdentityVerificationId`(:42-48), TTL 30분(:22), 재사용·만료 판정 `assertIdentityVerificationUsable`(:53-65), 최종 소진 `consumeIdentityVerification`(:71-83, 조건부 UPDATE로 동시성 방어). 진위·연령·CI/DI는 `services/bambi-identity.ts:24-84`가 포트원 단건조회(`services/portone-identity.ts:34-48`, `GET https://api.portone.io/identity-verifications/{id}`)로 검증한다 — **클라이언트가 보낸 값은 신뢰하지 않는다**(`portone-identity.ts:32-33`).

이 구조가 결론을 지배한다: **native가 브라우저 SDK를 못 쓰는 것은 "창을 여는 방법" 하나뿐이고, 발급·검증·소진은 이미 native에서 호출 가능한 oRPC 계약 뒤에 있다.**

## native 실행의 제약(왜 지금 안 되는가)

1. **`@portone/browser-sdk`는 브라우저 전용이다.** `requestIdentityVerification`은 `window.location` 리디렉션 또는 `window.open` 팝업으로 KCP 인증창을 띄운다(웹 코드가 `redirectUrl: window.location.href`, `windowType: { pc: "POPUP", mobile: "REDIRECTION" }`를 넘기는 이유 — `use-portone-verification.ts:141-147`). React Native에는 `window.open`도 DOM도 없다. 현재 native 화면도 이 사실을 그대로 안내로 노출 중이다: `apps/native/app/(seeker)/me/settings.tsx:288-293`("아직 앱에서 지원하지 않아요… 웹사이트에서"), `apps/native/app/login.tsx:199-208, :306-334`(아이디 찾기·비밀번호 재설정·비회원 인증 전부 `notifyWebOnly`).
2. **웹뷰 런타임이 앱에 없다.** `apps/native/package.json`에 `react-native-webview`도 `@portone/react-native-sdk`도 없다(이번 라운드 설치 금지 대상). 있는 것은 `expo-web-browser ~56.0.5`, `expo-linking ~56.0.11`, `expo-secure-store`, `expo-image-picker`뿐.
3. **native 세션은 시스템 브라우저와 공유되지 않는다.** 세션 쿠키는 `@better-auth/expo`가 SecureStore에 보관하고(`apps/native/lib/auth-client.ts:12-28`), oRPC 링크가 `Cookie` 헤더로 수동 주입한다(`apps/native/src/lib/orpc.ts:21-34`). 따라서 외부 브라우저·웹뷰로 웹 페이지를 열어도 **그 페이지는 비로그인 상태**다 → 웹 페이지가 `verifyMyPhone`(protected)을 대신 호출하는 설계는 세션 브리지 없이는 불가능하다.
4. **native는 웹 오리진을 모른다.** `packages/env/src/native.ts:7,12`에는 `EXPO_PUBLIC_SERVER_URL`(Hono API)과 `EXPO_PUBLIC_GCS_PUBLIC_BASE_URL`뿐 — 웹 도메인 값이 없다.
5. **포트원 공개 키가 native env에 없다.** `NEXT_PUBLIC_PORTONE_STORE_ID/CHANNEL_KEY`는 web 전용(`packages/env/src/web.ts:11-12`), 서버 env에는 `PORTONE_API_SECRET`만 있다(`packages/env/src/server.ts:29`).
6. **(이 워크트리 한정) 인증 ID 형식 수정이 브랜치 라인에 없다.** `bambi-identity-ticket.ts:43`이 아직 `iv-${randomUUID()}`다. KCP는 `identityVerificationId`(ordr_idxx)에 "영문 대소문자·숫자만 40자 이하"를 요구하고([KCP V2 본인인증 연동 문서](https://github.com/portone-io/developers.portone.io/blob/main/src/routes/(root)/opi/ko/integration/pg/v2/kcp-v2-identity-verification.mdx)), 하이픈 때문에 테스트 채널 prepare가 500 나는 문제가 커밋 `bff5076d`("본인인증 ID에서 하이픈 제거")로 이미 고쳐져 있다. **native 작업 브랜치에는 이 커밋이 들어와 있어야 개발 환경에서 인증창이 아예 뜬다.**

한 줄 요약: 막힌 건 **인증창 렌더러 하나**이고, 세션·발급·검증은 이미 native가 쓸 수 있는 형태로 서버에 있다.

## 방안 비교

세 안 모두 서버 계약(`startIdentityVerification` → 인증창 → `verifyMyPhone`)은 **무변경**이다. 차이는 "창을 어디서 여는가"뿐.

### 방안 A — expo-web-browser + web 릴레이 라우트 + 딥링크 (신규 의존성 0)

흐름:

1. native가 `client.bambi.onboarding.startIdentityVerification()`으로 ID를 받는다(publicProcedure라 세션 유무 무관).
2. `WebBrowser.openAuthSessionAsync("https://<web>/app-verify?identityVerificationId=<id>&redirect=<앱스킴>", "bambi-app://identity")`로 시스템 브라우저(Android=Chrome Custom Tabs, iOS=`ASWebAuthenticationSession`)를 연다 — [Expo WebBrowser 문서](https://docs.expo.dev/versions/latest/sdk/webbrowser/): 지정한 redirect URL로 이동하면 세션이 종료되고 `{ type: 'success', url }`을 돌려준다.
3. `/app-verify`는 **로그인 불필요한 얇은 릴레이**다: 쿼리의 ID로 기존 훅을 그대로 태워 인증창을 띄우고, 복귀 시 `location.href = bambi-app://identity?...`로 앱에 제어를 돌려준다. 서버 호출은 하지 않는다.
4. native가 브라우저 종료를 감지하면 **자기가 이미 들고 있는 ID로** `verifyMyPhone`을 호출한다. 서버가 포트원 단건조회로 `status === "VERIFIED"`를 확인하므로(`bambi-identity.ts:54-58`), 인증 미완료면 서버가 거절한다.

필요 변경:

- **web 신규 라우트** `apps/web/src/app/app-verify/page.tsx`(client component, `noindex`). `resolve-gate.ts:118-120`이 게이트 목록(`GATED_ROOTS`)에 없는 최상위 경로를 `next`로 흘리므로 **미들웨어·게이트 수정 불필요**.
- **공통 훅 5줄 변경**: `usePortOneVerification`에 `identityVerificationId?: string` 옵션을 추가해, 주어지면 `startIdentityVerification` 호출을 건너뛰고 그 값을 쓴다(`use-portone-verification.ts:133-134`). 기존 web 호출부는 옵션 미지정 → 동작 불변.
- **native env 1종**: `packages/env/src/native.ts`에 `EXPO_PUBLIC_WEB_URL`(z.url()) 추가. 부수 이득으로 `login.tsx`의 `notifyWebOnly` 안내를 실제 링크로 바꿀 수 있다.
- **native**: 훅 1개(`use-identity-verification.ts`)와 `settings.tsx:288-293` 카드의 안내 문구 → 실제 버튼 교체.
- 딥링크: `app.json:2`의 `scheme: "bambi-app"`이 이미 있어 추가 네이티브 설정 없음. **prebuild·재빌드 불필요** → 기존 dev client·Expo Go에서 바로 검증 가능.

보안:

- **비밀이 딥링크를 타지 않는다.** ID는 native가 직접 발급받아 이미 갖고 있고, 딥링크는 "브라우저가 끝났다"는 신호로만 쓴다. 스킴 하이재킹(같은 스킴을 등록한 악성 앱)으로 얻을 수 있는 건 이미 유출 가치가 낮은 신호뿐이다. 실제 바인딩은 native가 **자기 세션으로** `verifyMyPhone`을 호출할 때 일어난다.
- 세션 브리지 없음 — 릴레이 페이지는 비로그인이고 세션 쿠키·토큰을 일절 만지지 않는다.
- ID가 URL 쿼리에 노출되는 범위는 현행 웹 모바일 리디렉션과 동일(`use-portone-verification.ts:99-114`). TTL 30분 + 1회 소진(`bambi-identity-ticket.ts:22, :71-83`)이 그대로 적용된다.
- 잔여 리스크: 릴레이 URL이 공개 경로라 임의의 ID로 창을 띄울 수 있으나, 발급은 여전히 레이트리밋된 서버 프로시저를 거쳐야 하고(`rate-limit.ts:99`) 아무 효과가 없다.

규모: 신규 파일 2, 수정 4~5, 대략 **200~250줄 / 0.5~1일**(실기기 검증 별도). 신규 의존성 0, 네이티브 빌드 0.

> 변형 A′: 릴레이를 web 대신 Hono 서버(`EXPO_PUBLIC_SERVER_URL`)에서 정적 HTML로 서빙하면 native env 추가가 필요 없다. 대신 서버에 포트원 공개 키 env 2종을 새로 넣어야 하고(`packages/env/src/server.ts:29`엔 시크릿만 있음), 검증된 React 훅 대신 SDK 부트스트랩을 생 JS로 다시 써야 한다. 재사용 관점에서 A가 낫다.

### 방안 B — 공식 `@portone/react-native-sdk` (앱 내 웹뷰)

[PortOne RN SDK README](https://github.com/portone-io/react-native-sdk/blob/main/README.md)의 `IdentityVerification` 컴포넌트를 화면에 얹는다. `request`는 `storeId / channelKey / identityVerificationId / redirectUrl`, 콜백은 `onComplete / onError`.

필요 변경:

- 신규 의존성: `npx expo install @portone/react-native-sdk react-native-webview`(README 명시). **이번 라운드 설치 금지 대상.**
- `app.json` plugins에 `"@portone/react-native-sdk/plugin"` 추가 → AndroidManifest·Info.plist 자동 구성(앱 링크). iOS 15+ `LSApplicationQueriesSchemes` 50개 상한 주의(README).
- **prebuild + 새 dev client/스토어 빌드 필수** — Expo Go 불가.
- native env에 포트원 공개 키 2종(store id / channel key) 추가. 즉 **키가 앱 번들에 박힌다**(웹에서도 공개 값이라 등급은 같지만 회전 비용은 앱 배포 주기에 묶인다).
- web 변경 0.

보안: 세션 브리지 없음(A와 동일하게 native가 직접 `verifyMyPhone` 호출). ID·결과가 앱 프로세스 밖으로 나가지 않아 A보다 표면이 좁다. 반면 앱 내 웹뷰에서 PASS·통신사 앱으로 앱투앱 전환이 일어나므로 SDK 플러그인의 스킴 구성에 의존한다.

규모: 코드 자체는 화면 1개(~150줄)로 A와 비슷하지만, **의존성 3종 + 네이티브 재빌드 + 실기기 앱투앱 검증 사이클**이 붙어 실작업은 **1.5~2일**. 사용자 허가(의존성) 필요.

### 방안 C — 생 `react-native-webview`로 릴레이 페이지 직접 로드

A의 릴레이 페이지를 시스템 브라우저 대신 인앱 웹뷰에 띄우는 안. 의존성이 붙는데(방안 B와 동일한 `react-native-webview`) PASS 앱 호출(`intent://`·커스텀 스킴) 인터셉트를 **직접 구현**해야 한다 — 그건 정확히 방안 B의 SDK가 해 주는 일이다. **B의 열등 버전이므로 채택 이유 없음.**

## 권장안과 근거

**방안 A를 권장한다. 실기기에서 앱투앱 복귀가 깨지면 그때 B로 승격한다.**

1. **이미 프로덕션에서 도는 경로를 그대로 태운다.** 모바일 웹 리디렉션 흐름(`windowType.mobile: "REDIRECTION"` + 쿼리 복귀)은 실사용 중인 코드고, 시스템 브라우저는 사용자가 모바일 웹에서 인증할 때와 동일한 환경이다. 새로 검증할 미지수가 "브라우저 세션 종료 감지" 하나로 줄어든다.
2. **사다리 상단에서 멈춘다.** 신규 의존성 0, 네이티브 재빌드 0, 미들웨어 변경 0(`resolve-gate.ts:118-120`), 서버 계약 변경 0. 이번 라운드 제약(웹뷰 설치 금지)과도 충돌하지 않는다.
3. **딥링크가 실패해도 인증이 유실되지 않는다.** native가 ID를 먼저 들고 있으므로, 브라우저가 어떻게 닫히든(success/cancel/dismiss) `verifyMyPhone` 한 번으로 서버가 최종 판정한다. 딥링크 손실은 "다시 확인" 버튼으로 복구 가능하고, 이 성질이 스킴 하이재킹 리스크도 같이 없앤다.
4. **릴레이 하나로 native의 인증 공백 4곳이 모두 열린다** — 재인증(`verifyMyPhone`), 아이디 찾기·비밀번호 재설정(`account-recovery.ts:144, :159`는 public), 가입 전 확인(`checkIdentityForSignup`). `login.tsx:199-208, :306-334`의 "웹에서 이용해 주세요" 안내를 순차로 걷어낼 수 있다.
5. B의 유일한 우위는 "앱을 벗어나지 않는 UX"다. Custom Tabs/`ASWebAuthenticationSession`은 앱 위에 시트로 뜨므로 체감 차이가 크지 않고, 그 차이가 문제로 확인된 뒤에 의존성을 지불하는 편이 싸다.

**A의 검증 필수 항목(실기기, 사용자 수행):**
- Android Custom Tabs 안에서 PASS/통신사 앱 전환 후 복귀가 정상인가(가장 큰 미지수).
- 인증 도중 앱 전환으로 `openAuthSessionAsync`가 `cancel`/`dismiss`를 먼저 돌려주는 케이스 — 위 4번 성질(무조건 `verifyMyPhone` 한 번)로 흡수되는지.
- KCP `bypass.media_type`(PC `MC01` / 모바일 `MC02`, [KCP 연동 문서](https://github.com/portone-io/developers.portone.io/blob/main/src/routes/(root)/opi/ko/integration/pg/v2/kcp-v2-identity-verification.mdx))를 현재 웹 호출이 넘기지 않는데(`use-portone-verification.ts:138-148`) 모바일 창이 정상 동작해 온 만큼 기본값으로 충분해 보이나, 릴레이에서도 동일한지 확인.

## 사용자 선행 조건

코드 밖 작업(대부분 기존 포트원 잔여 과제와 동일 축):

1. **KCP 본인인증 실계약 → 사이트코드/사이트키 수령**(유흥 업종 심사 리스크, 영업팀 사전 확인 권고) — 기존 잔여 과제 1번.
2. **포트원 콘솔 실연동 채널 생성 → `channelKey` 교체**(현재 테스트 채널) — 기존 잔여 과제 2번. 테스트 채널은 통신사 대조 없이 통과하므로 서버가 `INTERNAL_SERVER_ERROR`로 막는다(`bambi-identity.ts:49-53`).
3. **KCP 관리자 → 부가서비스 → 휴대폰본인확인 → 인증결과URL에 `checkout-service.prod.iamport.co` 등록**([KCP 연동 문서](https://github.com/portone-io/developers.portone.io/blob/main/src/routes/(root)/opi/ko/integration/pg/v2/kcp-v2-identity-verification.mdx)) — **native 추가 등록은 불필요**. 인증창은 포트원 checkout 서비스가 호스팅하고, 우리 `redirectUrl`은 그 뒤 단계라 KCP 콘솔에 앱 스킴을 넣을 필요가 없다(방안 A·B 공통).
4. **env**
   - 신규: `EXPO_PUBLIC_WEB_URL`(native `.env`·EAS) — 방안 A 전용.
   - 기존 유지: web `NEXT_PUBLIC_PORTONE_STORE_ID` / `NEXT_PUBLIC_PORTONE_CHANNEL_KEY` / `PORTONE_API_SECRET`(`packages/env/src/web.ts:11-12,17`, 프로덕션 빌드 가드 :61-79), 서버 `PORTONE_API_SECRET`(`packages/env/src/server.ts:29`).
   - `ALLOW_TEST_IDENTITY_CHANNEL`은 test 환경에만. **실서비스 프로덕션에 절대 넣지 말 것**(넣으면 테스트 채널 default-deny가 무력화).
5. **브랜치 라인에 커밋 `bff5076d`(본인인증 ID 하이픈 제거) 반영** — 현재 워크트리의 `bambi-identity-ticket.ts:43`은 아직 `iv-${randomUUID()}`라, 이 상태로 native 개발을 시작하면 테스트 채널에서 인증창이 500으로 안 뜬다.
6. **web 배포 선행**: 릴레이 라우트 `/app-verify`가 앱이 가리키는 도메인(prod/test)에 배포돼 있어야 native가 동작한다. 앱 릴리스와 web 배포의 순서 결합이 생긴다(web 먼저).
7. **/privacy 개정 법무 검토 + `BAMBI_PROCESSORS` 수탁사 자리표시자 교체**(company.ts) — 기존 잔여 과제 5번. 앱에서도 같은 CI/DI를 수집하므로 앱 내 처리방침 링크가 개정본을 가리키는지 확인 필요.
8. **실기기 검증은 사용자가 수행**(에뮬레이터 실측·조작 정책). 위 "A의 검증 필수 항목" 3건.

## 구현 태스크 개요(방안 A 기준)

| # | 대상 | 내용 | 규모 |
|---|---|---|---|
| 1 | `packages/env/src/native.ts` | `EXPO_PUBLIC_WEB_URL: z.url()` 추가(+ `.env.example`) | ~5줄 |
| 2 | `apps/web/src/components/bambi/use-portone-verification.ts` | 옵션 `identityVerificationId?: string` 추가 — 주어지면 `startIdentityVerification`(:133-134) 생략. 기존 호출부 동작 불변 | ~5줄 |
| 3 | `apps/web/src/app/app-verify/page.tsx` (신규) | 비로그인 릴레이. 쿼리에서 ID·리턴 스킴을 읽어 훅에 넘기고, `onVerified`에서 `location.href = <스킴>?identityVerificationId=…`, 실패 시 `code`/`message`를 실어 같은 스킴으로 복귀. `metadata: { robots: { index: false } }`, 안내 문구 1줄 + 스피너 | ~60줄 |
| 4 | `apps/native/src/lib/identity-verification.ts` (신규, 순수 함수) | 릴레이 URL 조립 + 복귀 URL 파싱(성공/실패/취소 판별). **여기에 테스트 1개**(vitest) | ~40줄 + 테스트 |
| 5 | `apps/native/src/hooks`(또는 `src/lib`) `useIdentityVerification` (신규) | ① `startIdentityVerification` → ② `WebBrowser.openAuthSessionAsync` → ③ 종료 시 종류 불문 `verifyMyPhone` 1회 → ④ `queryClient.invalidateQueries(orpc.bambi.onboarding.getMine)`. 오류는 oRPC 코드 → 한국어 맵(영어 message 노출 금지) | ~80줄 |
| 6 | `apps/native/app/(seeker)/me/settings.tsx:288-293` | 안내 문구를 실제 버튼으로 교체. 이 화면의 primary는 "저장"이므로 인증 버튼은 `secondary`, `active:opacity-75`, 카드는 기존 `Surface variant="secondary" rounded-lg` 유지, 상태 배지는 기존 `Pill` 재사용 | ~30줄 |
| 7 | 검증 | `pnpm exec ultracite check <변경 경로>` + `pnpm exec vitest run <새 테스트>` + `check-types`. 실기기 흐름은 사용자 확인 | — |

후속(같은 릴레이 재사용, 이번 범위 밖):

- `login.tsx:199-208`의 아이디 찾기·비밀번호 재설정 → `accountRecovery.*`(public) 배선.
- 비회원 인증(`login.tsx:306-334`): 웹은 `POST /api/guest`가 **브라우저 쿠키**를 굽는 방식이라(`apps/web/src/app/api/guest/route.ts:75-95`) native에 그대로 못 쓴다. 게스트 토큰을 본문으로 돌려주는 엔드포인트 신설이 별도로 필요 — 설계 결정이 걸린 항목이라 분리 권장.
- 가입 흐름(`checkIdentityForSignup` → 프로필 생성): native에 회원가입 라우트 자체가 없어 인증보다 큰 작업.

**건드리지 않는 것**: `packages/api`·`packages/db`(계약·스키마 무변경), 목 인증 폼(웹 dev 전용, `phone-verify-dialog.tsx:58-75`), 인증 건 TTL·소진 로직.
