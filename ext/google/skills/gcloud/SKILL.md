---
name: gcloud
description: "Provide safety-critical validation, scoping, guardrails, and output reduction for planning, proposing, explaining, or executing gcloud CLI commands. Use for any gcloud syntax or operation. Do not use for Google Cloud client-library code or raw REST/gRPC requests."
metadata:
  category: CloudInfrastructureAndServices
---

# gcloud CLI

Treat remembered `gcloud` syntax as stale. Before proposing final flags, generating an executable command, or executing a command, run:

```bash
gcloud help <exact leaf command>
```

Parent-group help is not sufficient. Never use web search as a substitute for leaf-command syntax. If `gcloud` is unavailable, report the prerequisite instead of guessing. Do not install or update the CLI unless explicitly requested.

## Planning and execution

For plans, preserve this order:

1. syntax validation with exact leaf help;
2. parameter verification, including `--dry-run` or `--validate-only` when available;
3. dry-run or preview proposal;
4. explicit target project/location and mutation authorization.

- Preserve every user-specified flag.
- Resource commands must include explicit `--project=<PROJECT_ID>` and required `--region`, `--zone`, or `--location`. Never rely on active configuration for a remote target.
- Execute one `gcloud` command per Bash call. No pipes, redirection, command substitution, or chained commands.
- Do not execute an unconstrained `list`; include `--limit`, `--filter`, or `--format`.
- When output schema is unknown, use a one-item read such as `list --limit=1 --format=json`, then construct the narrow query.
- Use `--format="json(field1,field2)"` to return only required fields.
- Use `--async` only when exact leaf help supports it and later work does not require immediate completion.
- `--quiet` prevents prompts; it is not authorization.

## Safety boundary

Read-only inspection may proceed when it does not touch production or expose secrets. Any remote state change requires explicit instruction for the target and purpose.

Never autonomously execute:

- IAM policy, role, binding, service-account, or organization changes;
- API enablement;
- delete, destructive replacement, or irreversible operations;
- billing changes;
- KMS key or encryption-policy changes;
- Infrastructure Manager apply operations;
- production, live-database, or daily-driver changes;
- DNS records, zones, nameservers, registrar settings, or routing changes.

For DNS, provide the exact manual change and verify it read-only after the user applies it.

Run a supported dry-run, validate-only, plan, or describe operation before mutation whenever the leaf exposes one. If no preview exists, state that risk before authorization.

## Credentials and identity

- Reuse existing authenticated state only for the requested Google Cloud scope.
- Authentication, account switching, ADC creation, impersonation setup, and service-account selection are identity-affecting actions; ask when not explicitly authorized.
- Prefer short-lived user credentials, Workload Identity Federation, or service-account impersonation over JSON keys.
- Never create or store plaintext service-account keys, access tokens, refresh tokens, or passwords in project or Pi configuration.
- Never print tokens or credential-file contents.

## Completion evidence

For execution, report the exact validated leaf, project/location scope, command, exit status, and observed result. A submitted asynchronous operation is not completion; inspect final state when the requested outcome depends on it.
