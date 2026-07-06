#!/usr/bin/env bash
# 원타임 글로벌 LB 셋업: api.bambialba.com → bambi-server, test.bambialba.com → bambi-server-dev.
# 서울 리전은 Cloud Run 도메인 매핑을 지원하지 않아(501) 글로벌 외부 ALB + 서버리스 NEG로 연결한다.
# 웹소켓 지원·구글 관리 인증서·정적 IP 1개. 실행: bash scripts/setup-gcp-lb.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-bambi-app-501604}"
REGION="${REGION:-asia-northeast3}"
DOMAIN_PROD="api.bambialba.com"
DOMAIN_TEST="test.bambialba.com"

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "▶ 1/6 Compute API 활성화"
gcloud services enable compute.googleapis.com

echo "▶ 2/6 정적 IP + 관리 인증서"
if ! gcloud compute addresses describe bambi-lb-ip --global >/dev/null 2>&1; then
	gcloud compute addresses create bambi-lb-ip --global --ip-version=IPV4
fi
LB_IP="$(gcloud compute addresses describe bambi-lb-ip --global --format='value(address)')"
if ! gcloud compute ssl-certificates describe bambi-api-cert --global >/dev/null 2>&1; then
	gcloud compute ssl-certificates create bambi-api-cert --global \
		--domains="${DOMAIN_PROD},${DOMAIN_TEST}"
fi

echo "▶ 3/6 서버리스 NEG (Cloud Run 연결점)"
for SVC in bambi-server bambi-server-dev; do
	if ! gcloud compute network-endpoint-groups describe "${SVC}-neg" --region="${REGION}" >/dev/null 2>&1; then
		gcloud compute network-endpoint-groups create "${SVC}-neg" \
			--region="${REGION}" \
			--network-endpoint-type=serverless \
			--cloud-run-service="${SVC}"
	fi
done

echo "▶ 4/6 백엔드 서비스"
for SVC in bambi-server bambi-server-dev; do
	if ! gcloud compute backend-services describe "${SVC}-backend" --global >/dev/null 2>&1; then
		gcloud compute backend-services create "${SVC}-backend" \
			--global --load-balancing-scheme=EXTERNAL_MANAGED
		gcloud compute backend-services add-backend "${SVC}-backend" --global \
			--network-endpoint-group="${SVC}-neg" \
			--network-endpoint-group-region="${REGION}"
	fi
done

echo "▶ 5/6 URL 맵(호스트 분기) + HTTPS 프록시 + 포워딩 룰"
if ! gcloud compute url-maps describe bambi-api-lb --global >/dev/null 2>&1; then
	gcloud compute url-maps create bambi-api-lb --default-service=bambi-server-backend --global
	gcloud compute url-maps add-path-matcher bambi-api-lb --global \
		--path-matcher-name=prod --default-service=bambi-server-backend \
		--new-hosts="${DOMAIN_PROD}"
	gcloud compute url-maps add-path-matcher bambi-api-lb --global \
		--path-matcher-name=test --default-service=bambi-server-dev-backend \
		--new-hosts="${DOMAIN_TEST}"
fi
if ! gcloud compute target-https-proxies describe bambi-api-https-proxy --global >/dev/null 2>&1; then
	gcloud compute target-https-proxies create bambi-api-https-proxy \
		--url-map=bambi-api-lb --ssl-certificates=bambi-api-cert --global
fi
if ! gcloud compute forwarding-rules describe bambi-api-https-fr --global >/dev/null 2>&1; then
	gcloud compute forwarding-rules create bambi-api-https-fr --global \
		--load-balancing-scheme=EXTERNAL_MANAGED \
		--address=bambi-lb-ip --target-https-proxy=bambi-api-https-proxy --ports=443
fi

echo "▶ 6/6 HTTP→HTTPS 리다이렉트"
if ! gcloud compute url-maps describe bambi-api-http-redirect --global >/dev/null 2>&1; then
	TMP_MAP="$(mktemp)"
	cat > "${TMP_MAP}" <<'YAML'
name: bambi-api-http-redirect
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
YAML
	gcloud compute url-maps import bambi-api-http-redirect --source="${TMP_MAP}" --global --quiet
	rm -f "${TMP_MAP}"
fi
if ! gcloud compute target-http-proxies describe bambi-api-http-proxy --global >/dev/null 2>&1; then
	gcloud compute target-http-proxies create bambi-api-http-proxy --url-map=bambi-api-http-redirect --global
fi
if ! gcloud compute forwarding-rules describe bambi-api-http-fr --global >/dev/null 2>&1; then
	gcloud compute forwarding-rules create bambi-api-http-fr --global \
		--load-balancing-scheme=EXTERNAL_MANAGED \
		--address=bambi-lb-ip --target-http-proxy=bambi-api-http-proxy --ports=80
fi

echo
echo "✅ LB 셋업 완료. LB IP: ${LB_IP}"
cat <<NOTE

# Cloudflare DNS에 추가 (반드시 프록시 OFF = DNS only, 회색 구름):
#   A  api   → ${LB_IP}
#   A  test  → ${LB_IP}
# 인증서는 DNS 전파 후 자동 발급(15~60분): 상태 확인
#   gcloud compute ssl-certificates describe bambi-api-cert --global --format='value(managed.status, managed.domainStatus)'
NOTE
