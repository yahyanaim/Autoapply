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
api_secret_json="$(
  kubectl get secret api-secrets \
    --namespace "$K8S_NAMESPACE" \
    --output json
)"

secret_has_value() {
  local secret_key="$1"
  jq --exit-status \
    --arg key "$secret_key" \
    '.data[$key] | type == "string" and length > 0' \
    <<<"$api_secret_json" >/dev/null
}

read_secret_value() {
  local secret_key="$1"
  jq --exit-status \
    --raw-output \
    --arg key "$secret_key" \
    '.data[$key] | @base64d' \
    <<<"$api_secret_json"
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

required_api_secret_keys=(
  DATABASE_URL
  REDIS_URL
  JWT_SECRET
  MFA_ENCRYPTION_KEY
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
)
for secret_key in "${required_api_secret_keys[@]}"; do
  if ! secret_has_value "$secret_key"; then
    echo "api-secrets is missing required key: $secret_key" >&2
    exit 1
  fi
done

ai_provider="$(read_secret_value AI_PROVIDER)"
case "$ai_provider" in
  openai) selected_provider_key="OPENAI_API_KEY" ;;
  claude) selected_provider_key="ANTHROPIC_API_KEY" ;;
  gemini) selected_provider_key="GOOGLE_AI_API_KEY" ;;
  *)
    echo "AI_PROVIDER must be one of: openai, claude, gemini" >&2
    exit 1
    ;;
esac
if ! secret_has_value "$selected_provider_key"; then
  echo "api-secrets is missing $selected_provider_key for AI_PROVIDER=$ai_provider" >&2
  exit 1
fi

validate_positive_number \
  AI_INPUT_COST_PER_MILLION \
  "$(read_secret_value AI_INPUT_COST_PER_MILLION)"
validate_positive_number \
  AI_OUTPUT_COST_PER_MILLION \
  "$(read_secret_value AI_OUTPUT_COST_PER_MILLION)"

validate_https_url DASHBOARD_URL "$(read_secret_value DASHBOARD_URL)" true
validate_https_url STRIPE_SUCCESS_URL "$(read_secret_value STRIPE_SUCCESS_URL)"
validate_https_url STRIPE_CANCEL_URL "$(read_secret_value STRIPE_CANCEL_URL)"

if secret_has_value CORS_ALLOWED_ORIGINS; then
  cors_allowed_origins="$(read_secret_value CORS_ALLOWED_ORIGINS)"
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

if secret_has_value CAREER_CHAT_ENABLED; then
  career_chat_enabled="$(read_secret_value CAREER_CHAT_ENABLED)"
  normalized_career_chat_enabled="$(
    printf '%s' "$career_chat_enabled" | tr '[:upper:]' '[:lower:]'
  )"
  case "$normalized_career_chat_enabled" in
    true | "1")
      if ! secret_has_value DAHL_CAREER_CHAT_API_KEY; then
        echo "DAHL_CAREER_CHAT_API_KEY is required when CAREER_CHAT_ENABLED=true" >&2
        exit 1
      fi
      if secret_has_value DAHL_CAREER_CHAT_BASE_URL; then
        validate_https_url \
          DAHL_CAREER_CHAT_BASE_URL \
          "$(read_secret_value DAHL_CAREER_CHAT_BASE_URL)"
      fi
      ;;
    false | "0") ;;
    *)
      echo "CAREER_CHAT_ENABLED must be true or false" >&2
      exit 1
      ;;
  esac
fi

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
