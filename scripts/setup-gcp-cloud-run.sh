#!/usr/bin/env bash
# 원타임 GCP 셋업: Cloud Run 배포용 Artifact Registry + 배포 서비스계정 + GitHub WIF.
# 사전 조건: 새 계정으로 `gcloud auth login` 완료, bambi-app 프로젝트 존재.
# 실행: bash scripts/setup-gcp-cloud-run.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-bambi-app-501604}"
REGION="${REGION:-asia-northeast3}"
REPOSITORY="${REPOSITORY:-bambi}"
GITHUB_REPO="${GITHUB_REPO:-beyondsoft-kr/bambi-app}"
SA_NAME="github-deployer"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
# 프로덕션 버킷 등 추가 버킷은 실행 시 환경변수로 지정한다(레포에 이름을 남기지 않음).
GCS_PUBLIC_BUCKET="${GCS_PUBLIC_BUCKET:-bambi-storage-public}"

echo "▶ 프로젝트: ${PROJECT_ID} / 리전: ${REGION} / GitHub: ${GITHUB_REPO}"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo "▶ 1/7 API 활성화"
gcloud services enable \
	run.googleapis.com \
	artifactregistry.googleapis.com \
	iamcredentials.googleapis.com \
	sts.googleapis.com \
	secretmanager.googleapis.com \
	storage.googleapis.com

echo "▶ 2/7 Artifact Registry(docker) 저장소: ${REPOSITORY}"
if ! gcloud artifacts repositories describe "${REPOSITORY}" --location="${REGION}" >/dev/null 2>&1; then
	gcloud artifacts repositories create "${REPOSITORY}" \
		--repository-format=docker \
		--location="${REGION}" \
		--description="bambi container images"
fi

echo "▶ 3/7 배포용 서비스계정: ${SA_NAME}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1; then
	gcloud iam service-accounts create "${SA_NAME}" --display-name="GitHub Actions deployer"
fi
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
	--member="serviceAccount:${SA_EMAIL}" --role="roles/run.admin" --condition=None >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
	--member="serviceAccount:${SA_EMAIL}" --role="roles/artifactregistry.writer" --condition=None >/dev/null
# CI에서 cloud-sql-proxy로 마이그레이션을 돌리기 위한 권한
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
	--member="serviceAccount:${SA_EMAIL}" --role="roles/cloudsql.client" --condition=None >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
# Cloud Run 서비스가 기본 컴퓨트 SA로 실행되므로, 배포자가 그 SA를 "사용"할 권한 필요.
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
	--member="serviceAccount:${SA_EMAIL}" --role="roles/iam.serviceAccountUser" >/dev/null

echo "▶ 4/7 런타임 SA의 GCS 권한: gs://${GCS_PUBLIC_BUCKET}"
# 공고 이미지·광고 배너 CRUD. 버킷 스코프로만 부여해 다른 버킷에는 손대지 못하게 한다.
# (objectUser = objects create/get/list/update/delete)
# 다른 버킷(프로덕션 등)에 부여하려면 GCS_PUBLIC_BUCKET=<버킷명>으로 재실행한다.
gcloud storage buckets add-iam-policy-binding "gs://${GCS_PUBLIC_BUCKET}" \
	--member="serviceAccount:${RUNTIME_SA}" --role="roles/storage.objectUser" >/dev/null
# 업로드용 V4 서명 URL은 JSON 키 없이 IAM signBlob으로 서명한다. 서명자와 대상이 같은 SA라
# 런타임 SA가 "자기 자신"에 대해 TokenCreator를 가져야 한다. 없으면 createMediaUpload가 500.
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
	--member="serviceAccount:${RUNTIME_SA}" --role="roles/iam.serviceAccountTokenCreator" >/dev/null

echo "▶ 5/7 Workload Identity Federation (키리스 GitHub 인증)"
if ! gcloud iam workload-identity-pools describe "${POOL_ID}" --location=global >/dev/null 2>&1; then
	gcloud iam workload-identity-pools create "${POOL_ID}" \
		--location=global --display-name="GitHub Actions"
fi
if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
	--location=global --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then
	gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
		--location=global \
		--workload-identity-pool="${POOL_ID}" \
		--display-name="GitHub OIDC" \
		--issuer-uri="https://token.actions.githubusercontent.com" \
		--attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
		--attribute-condition="assertion.repository == '${GITHUB_REPO}'"
fi
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
	--role="roles/iam.workloadIdentityUser" \
	--member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPO}" >/dev/null

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo "▶ 6/7 Secret Manager: 서비스별 시크릿 생성 + 런타임 SA 접근권한"
# 값은 넣지 않는다(버전 등록은 사람이 실제 값으로). Cloud Run이 env로 마운트한다.
for SVC in bambi-server bambi-server-dev; do
	for KEY in database-url better-auth-secret google-ai-key portone-api-secret; do
		SID="${SVC}-${KEY}"
		if ! gcloud secrets describe "${SID}" >/dev/null 2>&1; then
			gcloud secrets create "${SID}" --replication-policy=automatic
		fi
		gcloud secrets add-iam-policy-binding "${SID}" \
			--member="serviceAccount:${RUNTIME_SA}" \
			--role="roles/secretmanager.secretAccessor" >/dev/null
		# 배포 SA는 CI 마이그레이션에 DATABASE_URL만 필요
		if [ "${KEY}" = "database-url" ]; then
			gcloud secrets add-iam-policy-binding "${SID}" \
				--member="serviceAccount:${SA_EMAIL}" \
				--role="roles/secretmanager.secretAccessor" >/dev/null
		fi
	done
done

echo "▶ 7/7 남은 수동 단계 안내"
cat <<CMDS

# ── ① 시크릿 실제 값 등록 (필수 — 없으면 배포 시 revision 생성 실패) ──
printf '%s' 'postgresql://...(test DB)' | gcloud secrets versions add bambi-server-dev-database-url --data-file=-
openssl rand -base64 48 | tr -d '\n'   | gcloud secrets versions add bambi-server-dev-better-auth-secret --data-file=-
printf '%s' 'AIza...'                  | gcloud secrets versions add bambi-server-dev-google-ai-key --data-file=-
printf '%s' '(포트원 V2 API Secret)'   | gcloud secrets versions add bambi-server-dev-portone-api-secret --data-file=-

printf '%s' 'postgresql://...(prod DB)' | gcloud secrets versions add bambi-server-database-url --data-file=-
openssl rand -base64 48 | tr -d '\n'    | gcloud secrets versions add bambi-server-better-auth-secret --data-file=-
printf '%s' 'AIza...'                   | gcloud secrets versions add bambi-server-google-ai-key --data-file=-
printf '%s' '(포트원 V2 API Secret)'    | gcloud secrets versions add bambi-server-portone-api-secret --data-file=-

# ── ② GitHub 변수 (인증용 레포 변수 + 환경별 URL/CORS) ──
gh variable set GCP_WIF_PROVIDER --repo ${GITHUB_REPO} --body "${WIF_PROVIDER}"
gh variable set GCP_DEPLOYER_SA  --repo ${GITHUB_REPO} --body "${SA_EMAIL}"
gh api -X PUT repos/${GITHUB_REPO}/environments/production >/dev/null
gh api -X PUT repos/${GITHUB_REPO}/environments/test >/dev/null
gh variable set BETTER_AUTH_URL --repo ${GITHUB_REPO} --env production --body "https://bambi-server-${PROJECT_NUMBER}.${REGION}.run.app"
gh variable set CORS_ORIGIN     --repo ${GITHUB_REPO} --env production --body "https://(웹 도메인)"
gh variable set BETTER_AUTH_URL --repo ${GITHUB_REPO} --env test --body "https://bambi-server-dev-${PROJECT_NUMBER}.${REGION}.run.app"
gh variable set CORS_ORIGIN     --repo ${GITHUB_REPO} --env test --body "https://(웹 프리뷰 도메인)"

# ── ③ Vercel(웹) 환경변수 — 빌드타임에 필요 ──
# next.config.ts가 이 값으로 images.remotePatterns를 만든다. 없으면 배포된 웹에서
# next/image가 GCS 호스트를 거부한다. 환경별 버킷이 다르니 프로젝트별로 등록:
# dev 웹  : NEXT_PUBLIC_GCS_PUBLIC_BASE_URL=https://storage.googleapis.com/${GCS_PUBLIC_BUCKET}
# prod 웹 : NEXT_PUBLIC_GCS_PUBLIC_BASE_URL=https://storage.googleapis.com/(프로덕션 버킷명)

# ── ④ 버킷 CORS — 버킷별 확인(public은 적용됨, prod는 신규 생성 시 필요) ──
# 브라우저가 서명 URL로 직접 PUT 하므로 웹 오리진이 CORS에 있어야 한다. 콘솔 UI가 없어
# gcloud로만 설정하며, --cors-file은 병합이 아니라 전체 교체다. 오리진 추가가 필요하면
# 현재 값을 먼저 확인한 뒤 갱신한다:
#   gcloud storage buckets describe gs://<버킷> --format="value(cors_config)"
#   gcloud storage buckets update   gs://<버킷> --cors-file=<json>
# ──────────────────────────────────────────────────────────

CMDS
echo "✅ GCP 셋업 완료. 시크릿 버전 등록(①) 후 develop에 푸시하면 첫 배포가 시작됩니다."
