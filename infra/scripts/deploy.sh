#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${EKS_CLUSTER_NAME:?EKS_CLUSTER_NAME is required}"
: "${K8S_NAMESPACE:?K8S_NAMESPACE is required}"
: "${ECR_REGISTRY:?ECR_REGISTRY is required}"
: "${ECR_REPOSITORY:?ECR_REPOSITORY is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${DEPLOY_OVERLAY:?DEPLOY_OVERLAY is required}"

case "$DEPLOY_OVERLAY" in
  staging) tls_secret="applyai-staging-tls" ;;
  production) tls_secret="applyai-tls" ;;
  *)
    echo "DEPLOY_OVERLAY must be staging or production" >&2
    exit 2
    ;;
esac

api_image="$ECR_REGISTRY/$ECR_REPOSITORY-api:$IMAGE_TAG"
dashboard_image="$ECR_REGISTRY/$ECR_REPOSITORY-dashboard:$IMAGE_TAG"
migration_job="api-migrate-${IMAGE_TAG:0:12}"
overlay_path="infra/k8s/overlays/$DEPLOY_OVERLAY"
free_worker_secret_name="resume-worker-free-secrets"
paid_worker_secret_name="resume-worker-paid-secrets"

cleanup_migration_job() {
  kubectl delete job "$migration_job" \
    --namespace "$K8S_NAMESPACE" \
    --ignore-not-found \
    --wait=false >/dev/null 2>&1 || true
}

for required_command in aws kubectl jq node; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required deployment command is unavailable: $required_command" >&2
    exit 1
  fi
done

aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER_NAME"
kubectl create namespace "$K8S_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

get_secret_json() {
  local secret_name="$1"
  local secret_json
  if ! secret_json="$(
    kubectl get secret "$secret_name" \
      --namespace "$K8S_NAMESPACE" \
      --output json
  )"; then
    echo "Required Kubernetes secret is unavailable: $secret_name" >&2
    return 1
  fi
  printf '%s' "$secret_json"
}

secret_has_value() {
  local secret_json="$1"
  local secret_key="$2"
  jq --exit-status \
    --arg key "$secret_key" \
    '.data[$key] | type == "string" and length > 0' \
    <<<"$secret_json" >/dev/null
}

read_secret_value() {
  local secret_json="$1"
  local secret_key="$2"
  jq --exit-status \
    --raw-output \
    --arg key "$secret_key" \
    '.data[$key] | @base64d' \
    <<<"$secret_json"
}

require_secret_keys() {
  local secret_name="$1"
  local secret_json="$2"
  shift 2

  local secret_key
  for secret_key in "$@"; do
    if ! secret_has_value "$secret_json" "$secret_key"; then
      echo "$secret_name is missing required key: $secret_key" >&2
      exit 1
    fi
  done
}

provider_key_for() {
  case "$1" in
    openai) printf '%s\n' 'OPENAI_API_KEY' ;;
    claude) printf '%s\n' 'ANTHROPIC_API_KEY' ;;
    gemini) printf '%s\n' 'GOOGLE_AI_API_KEY' ;;
    *) return 1 ;;
  esac
}

validate_positive_number() {
  local setting_name="$1"
  local setting_value="$2"
  if ! VALIDATION_VALUE="$setting_value" node -e \
    'const value = Number(process.env.VALIDATION_VALUE); process.exit(Number.isFinite(value) && value > 0 ? 0 : 1)'; then
    echo "$setting_name must be a positive number" >&2
    exit 1
  fi
}

validate_https_url() {
  local setting_name="$1"
  local setting_value="$2"
  local require_origin_only="${3:-false}"
  local setting_kind="URL"
  if [[ "$require_origin_only" == "true" ]]; then
    setting_kind="origin"
  fi
  if ! VALIDATION_VALUE="$setting_value" \
    VALIDATION_ORIGIN_ONLY="$require_origin_only" \
    node -e '
      try {
        const url = new URL(process.env.VALIDATION_VALUE);
        const originOnly =
          url.pathname === "/" && url.search === "" && url.hash === "";
        const valid =
          url.protocol === "https:" &&
          url.username === "" &&
          url.password === "" &&
          (process.env.VALIDATION_ORIGIN_ONLY !== "true" || originOnly);
        process.exit(valid ? 0 : 1);
      } catch {
        process.exit(1);
      }
    '; then
    echo "$setting_name must be a credential-free HTTPS $setting_kind" >&2
    exit 1
  fi
}

api_secret_json="$(get_secret_json api-secrets)"
free_worker_secret_json="$(get_secret_json "$free_worker_secret_name")"
paid_worker_secret_json="$(get_secret_json "$paid_worker_secret_name")"

required_api_secret_keys=(
  DATABASE_URL
  REDIS_URL
  JWT_SECRET
  MFA_ENCRYPTION_KEY
  RESUME_QUEUE_SIGNING_KEY
  S3_BUCKET_RESUMES
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRO_PRICE_ID
  STRIPE_PREMIUM_PRICE_ID
  AI_PROVIDER
  AI_INPUT_COST_PER_MILLION
  AI_OUTPUT_COST_PER_MILLION
  DASHBOARD_URL
  STRIPE_SUCCESS_URL
  STRIPE_CANCEL_URL
  GLM_FREE_PLAN_API_KEY
  GLM_FREE_PLAN_MODEL
  GLM_FREE_PLAN_BASE_URL
)
require_secret_keys api-secrets "$api_secret_json" "${required_api_secret_keys[@]}"

ai_provider="$(read_secret_value "$api_secret_json" AI_PROVIDER)"
if ! selected_provider_key="$(provider_key_for "$ai_provider")"; then
  echo "AI_PROVIDER must be one of: openai, claude, gemini" >&2
  exit 1
fi
if ! secret_has_value "$api_secret_json" "$selected_provider_key"; then
  echo "api-secrets is missing $selected_provider_key for AI_PROVIDER=$ai_provider" >&2
  exit 1
fi

validate_positive_number \
  AI_INPUT_COST_PER_MILLION \
  "$(read_secret_value "$api_secret_json" AI_INPUT_COST_PER_MILLION)"
validate_positive_number \
  AI_OUTPUT_COST_PER_MILLION \
  "$(read_secret_value "$api_secret_json" AI_OUTPUT_COST_PER_MILLION)"

validate_https_url DASHBOARD_URL "$(read_secret_value "$api_secret_json" DASHBOARD_URL)" true
validate_https_url STRIPE_SUCCESS_URL "$(read_secret_value "$api_secret_json" STRIPE_SUCCESS_URL)"
validate_https_url STRIPE_CANCEL_URL "$(read_secret_value "$api_secret_json" STRIPE_CANCEL_URL)"
validate_https_url \
  GLM_FREE_PLAN_BASE_URL \
  "$(read_secret_value "$api_secret_json" GLM_FREE_PLAN_BASE_URL)"

if secret_has_value "$api_secret_json" CORS_ALLOWED_ORIGINS; then
  cors_allowed_origins="$(read_secret_value "$api_secret_json" CORS_ALLOWED_ORIGINS)"
  if ! VALIDATION_VALUE="$cors_allowed_origins" node -e '
    try {
      const origins = process.env.VALIDATION_VALUE
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const valid = origins.length > 0 && origins.every((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          url.username === "" &&
          url.password === "" &&
          url.pathname === "/" &&
          url.search === "" &&
          url.hash === ""
        );
      });
      process.exit(valid ? 0 : 1);
    } catch {
      process.exit(1);
    }
  '; then
    echo "CORS_ALLOWED_ORIGINS must be a comma-separated list of credential-free HTTPS origins" >&2
    exit 1
  fi
fi

# Workers receive separate secrets so the Free process never receives paid
# provider or Stripe credentials, and the paid process never receives GLM.
# Each still needs its own database, Redis, signing-key, and object-storage
# access to validate and process the trusted job.
required_worker_common_secret_keys=(
  DATABASE_URL
  REDIS_URL
  JWT_SECRET
  MFA_ENCRYPTION_KEY
  RESUME_QUEUE_SIGNING_KEY
  S3_BUCKET_RESUMES
  DASHBOARD_URL
)
required_free_worker_secret_keys=(
  "${required_worker_common_secret_keys[@]}"
  GLM_FREE_PLAN_API_KEY
  GLM_FREE_PLAN_MODEL
  GLM_FREE_PLAN_BASE_URL
)
required_paid_worker_secret_keys=(
  "${required_worker_common_secret_keys[@]}"
  AI_PROVIDER
  AI_INPUT_COST_PER_MILLION
  AI_OUTPUT_COST_PER_MILLION
)
require_secret_keys \
  "$free_worker_secret_name" \
  "$free_worker_secret_json" \
  "${required_free_worker_secret_keys[@]}"
require_secret_keys \
  "$paid_worker_secret_name" \
  "$paid_worker_secret_json" \
  "${required_paid_worker_secret_keys[@]}"

api_resume_queue_signing_key="$(
  read_secret_value "$api_secret_json" RESUME_QUEUE_SIGNING_KEY
)"
for worker_secret_name_and_json in \
  "$free_worker_secret_name:$free_worker_secret_json" \
  "$paid_worker_secret_name:$paid_worker_secret_json"; do
  worker_secret_name="${worker_secret_name_and_json%%:*}"
  worker_secret_json="${worker_secret_name_and_json#*:}"
  if [[ "$(read_secret_value "$worker_secret_json" RESUME_QUEUE_SIGNING_KEY)" != "$api_resume_queue_signing_key" ]]; then
    echo "$worker_secret_name RESUME_QUEUE_SIGNING_KEY must match api-secrets" >&2
    exit 1
  fi
done

validate_https_url \
  "$free_worker_secret_name/DASHBOARD_URL" \
  "$(read_secret_value "$free_worker_secret_json" DASHBOARD_URL)" \
  true
validate_https_url \
  "$free_worker_secret_name/GLM_FREE_PLAN_BASE_URL" \
  "$(read_secret_value "$free_worker_secret_json" GLM_FREE_PLAN_BASE_URL)"
validate_https_url \
  "$paid_worker_secret_name/DASHBOARD_URL" \
  "$(read_secret_value "$paid_worker_secret_json" DASHBOARD_URL)" \
  true

paid_worker_provider="$(read_secret_value "$paid_worker_secret_json" AI_PROVIDER)"
if [[ "$paid_worker_provider" != "$ai_provider" ]]; then
  echo "$paid_worker_secret_name AI_PROVIDER must match api-secrets" >&2
  exit 1
fi
if ! paid_worker_provider_key="$(provider_key_for "$paid_worker_provider")"; then
  echo "$paid_worker_secret_name AI_PROVIDER must be one of: openai, claude, gemini" >&2
  exit 1
fi
if ! secret_has_value "$paid_worker_secret_json" "$paid_worker_provider_key"; then
  echo "$paid_worker_secret_name is missing $paid_worker_provider_key for AI_PROVIDER=$paid_worker_provider" >&2
  exit 1
fi
validate_positive_number \
  "$paid_worker_secret_name/AI_INPUT_COST_PER_MILLION" \
  "$(read_secret_value "$paid_worker_secret_json" AI_INPUT_COST_PER_MILLION)"
validate_positive_number \
  "$paid_worker_secret_name/AI_OUTPUT_COST_PER_MILLION" \
  "$(read_secret_value "$paid_worker_secret_json" AI_OUTPUT_COST_PER_MILLION)"

tls_type="$(kubectl get secret "$tls_secret" --namespace "$K8S_NAMESPACE" -o jsonpath='{.type}')"
if [[ "$tls_type" != "kubernetes.io/tls" ]]; then
  echo "$tls_secret must be a kubernetes.io/tls secret in namespace $K8S_NAMESPACE" >&2
  exit 1
fi

trap cleanup_migration_job EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

kubectl delete job "$migration_job" --namespace "$K8S_NAMESPACE" --ignore-not-found --wait=true
kubectl apply --namespace "$K8S_NAMESPACE" -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: $migration_job
spec:
  backoffLimit: 1
  activeDeadlineSeconds: 180
  ttlSecondsAfterFinished: 600
  template:
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: migrate
          image: $api_image
          imagePullPolicy: IfNotPresent
          command:
            - /app/node_modules/.bin/prisma
          args:
            - migrate
            - deploy
            - --schema
            - /app/src/database/prisma/schema.prisma
          envFrom:
            - secretRef:
                name: api-secrets
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
EOF

if ! kubectl wait --for=condition=complete "job/$migration_job" --namespace "$K8S_NAMESPACE" --timeout=180s; then
  kubectl logs "job/$migration_job" --namespace "$K8S_NAMESPACE" || true
  exit 1
fi
kubectl logs "job/$migration_job" --namespace "$K8S_NAMESPACE"

kubectl kustomize "$overlay_path" \
  | sed \
      -e "s#image: applyai-api#image: $api_image#" \
      -e "s#image: applyai-dashboard#image: $dashboard_image#" \
  | kubectl apply --namespace "$K8S_NAMESPACE" -f -

kubectl rollout status deployment/api --namespace "$K8S_NAMESPACE" --timeout=300s
kubectl rollout status deployment/dashboard --namespace "$K8S_NAMESPACE" --timeout=300s
kubectl rollout status deployment/resume-worker-free --namespace "$K8S_NAMESPACE" --timeout=300s
kubectl rollout status deployment/resume-worker-paid --namespace "$K8S_NAMESPACE" --timeout=300s
