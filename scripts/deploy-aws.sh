#!/usr/bin/env bash
# Update the live Lumina server on AWS with the latest code from GitHub.
#
#   bash scripts/deploy-aws.sh            # deploy origin/main
#   bash scripts/deploy-aws.sh my-branch  # deploy another pushed branch
#
# Push your commits first: the server pulls from GitHub, not from this machine.
# Runs over AWS Systems Manager (no SSH): the server fetches the branch, rebuilds
# the changed images and restarts only the containers whose image changed.
# Database data is kept (named volumes); apply schema changes with the project's
# migration scripts. Expect a short interruption while the web app restarts.
set -euo pipefail
BRANCH="${1:-main}"
PROFILE="${AWS_PROFILE:-lumina}"
REGION="${AWS_REGION:-eu-north-1}"
aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

if ! git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null; then
  echo "Branch '$BRANCH' is not on GitHub. Push it first: git push origin $BRANCH" >&2; exit 1
fi
if [ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] && [ -n "$(git log "origin/$BRANCH..$BRANCH" 2>/dev/null)" ]; then
  echo "Warning: you have local commits on $BRANCH that are not pushed; they will NOT be deployed." >&2
fi

INSTANCE=$(aws ec2 describe-instances \
  --filters Name=tag:Name,Values=lumina-server Name=instance-state-name,Values=running \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ -z "$INSTANCE" ] || [ "$INSTANCE" = "None" ]; then
  echo "No running instance tagged Name=lumina-server (is it stopped?)." >&2; exit 1
fi

echo "Deploying origin/$BRANCH to $INSTANCE ..."
COMMAND_ID=$(aws ssm send-command --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript --timeout-seconds 1800 \
  --comment "Lumina deploy $BRANCH" \
  --parameters "$(printf '{"commands":["set -e","cd /opt/lumina","git fetch --quiet origin %s","git checkout --quiet --force -B %s origin/%s","git log -1 --format=\\"Deploying %%h %%s\\"","cd deploy","docker compose -f compose.prod.yml up -d --build --remove-orphans","docker image prune -f >/dev/null","docker compose -f compose.prod.yml ps --format \\"table {{.Service}}\\\\t{{.Status}}\\""]}' "$BRANCH" "$BRANCH" "$BRANCH")" \
  --query Command.CommandId --output text)

# Wait (builds can take several minutes), then show the server's output.
while :; do
  STATUS=$(aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE" \
    --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in Pending|InProgress|Delayed) sleep 10 ;; *) break ;; esac
done
aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE" \
  --query '[StandardOutputContent,StandardErrorContent]' --output text | tail -40
echo "Result: $STATUS"
[ "$STATUS" = Success ]
