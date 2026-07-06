#!/usr/bin/env bash
# 원타임 Cloud SQL 셋업: PostgreSQL 18 인스턴스 2개(bambi-dev/bambi-prod) 생성,
# bambi DB·유저 생성, DATABASE_URL을 Secret Manager에 자동 등록.
# Cloud Run과는 --add-cloudsql-instances(유닉스 소켓)로 연결된다 (deploy-server.yml).
# 실행: bash scripts/setup-cloud-sql.sh   (인스턴스 생성에 10~20분 소요)
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-bambi-app-501604}"
REGION="${REGION:-asia-northeast3}"
DB_VERSION="POSTGRES_18"
DB_NAME="bambi"
DB_USER="bambi"

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "▶ 1/4 Cloud SQL Admin API 활성화 + 런타임 SA에 cloudsql.client"
gcloud services enable sqladmin.googleapis.com
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
	--member="serviceAccount:${RUNTIME_SA}" --role="roles/cloudsql.client" --condition=None >/dev/null

create_instance() {
	local NAME="$1"
	shift
	if gcloud sql instances describe "${NAME}" >/dev/null 2>&1; then
		echo "  - ${NAME}: 이미 존재, 건너뜀"
		return
	fi
	echo "  - ${NAME}: 생성 중 (수 분 소요)…"
	gcloud sql instances create "${NAME}" \
		--database-version="${DB_VERSION}" \
		--region="${REGION}" \
		--edition=enterprise \
		--storage-size=10GB \
		--storage-auto-increase \
		"$@"
}

echo "▶ 2/4 인스턴스 생성 (PostgreSQL 18, ${REGION})"
# dev: 공유코어 최소 사양, 백업 없음
create_instance bambi-dev --tier=db-g1-small --no-backup
# prod: 1vCPU/3.75GB, 새벽(KST 02시) 백업 + PITR, 삭제 보호
create_instance bambi-prod --tier=db-custom-1-3840 \
	--backup-start-time=17:00 --enable-point-in-time-recovery --deletion-protection

setup_db_and_secret() {
	local INSTANCE="$1" SECRET_ID="$2"
	if ! gcloud sql databases describe "${DB_NAME}" --instance="${INSTANCE}" >/dev/null 2>&1; then
		gcloud sql databases create "${DB_NAME}" --instance="${INSTANCE}"
	fi
	local EXISTING_USERS
	EXISTING_USERS="$(gcloud sql users list --instance="${INSTANCE}" --format='value(name)')"
	if printf '%s\n' "${EXISTING_USERS}" | grep -qx "${DB_USER}"; then
		echo "  - ${INSTANCE}: 유저 ${DB_USER} 이미 존재 — 비밀번호·시크릿 갱신 생략"
		return
	fi
	local PASS
	# 파이프라인 없이 생성 (pipefail + /dev/urandom|head 조합은 SIGPIPE로 죽는다)
	PASS="$(openssl rand -hex 16)"
	gcloud sql users create "${DB_USER}" --instance="${INSTANCE}" --password="${PASS}"
	# Cloud Run 유닉스 소켓 경유 URL (pg가 host 쿼리 파라미터를 소켓 경로로 해석)
	printf '%s' "postgresql://${DB_USER}:${PASS}@localhost/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${INSTANCE}" \
		| gcloud secrets versions add "${SECRET_ID}" --data-file=-
	echo "  - ${INSTANCE}: DB·유저 생성 + ${SECRET_ID} 시크릿 등록 완료"
}

echo "▶ 3/4 DB·유저 생성 + DATABASE_URL 시크릿 자동 등록"
setup_db_and_secret bambi-dev bambi-server-dev-database-url
setup_db_and_secret bambi-prod bambi-server-database-url

echo "▶ 4/4 연결 이름 (마이그레이션 시 cloud-sql-proxy에 사용)"
gcloud sql instances list --format="table(name,connectionName,databaseVersion,state)"

cat <<'NOTE'

# 로컬에서 마이그레이션 돌리는 법 (cloud-sql-proxy):
#   brew install cloud-sql-proxy
#   cloud-sql-proxy bambi-app-501604:asia-northeast3:bambi-dev --port 15432
#   DATABASE_URL="postgresql://bambi:(시크릿의 비밀번호)@127.0.0.1:15432/bambi" pnpm db:migrate
# 비밀번호 확인: gcloud secrets versions access latest --secret=bambi-server-dev-database-url
NOTE
echo "✅ Cloud SQL 셋업 완료."
