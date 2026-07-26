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
aws eks update-kubeconfig --region "$AWS_REGION" --name "$EKS_CLUSTER_NAME"
kubectl create namespace "$K8S_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl get secret api-secrets --namespace "$K8S_NAMESPACE" >/dev/null
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
