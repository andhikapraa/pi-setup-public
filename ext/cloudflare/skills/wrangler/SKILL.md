---
name: wrangler
description: Route Cloudflare Wrangler work through the repository's pinned CLI, local config/schema, Context7, and current official Cloudflare documentation. Use before developing, deploying, or managing Workers, Pages, KV, R2, D1, Queues, Workflows, Pipelines, Vectorize, Hyperdrive, Workers AI, Containers, bindings, secrets, or Wrangler configuration.
---

# Wrangler CLI

Your knowledge of Wrangler CLI flags, config fields, and subcommands may be outdated. **Prefer retrieval over pre-training** for any Wrangler task.

This file is adapted from Cloudflare's official `cloudflare/skills` Wrangler skill at commit `f96bff754e428838818017f75817f0f9428acd48`. The Pi adaptation changes only dependency ownership, authorization, secret handling, and agent-skill update behavior.

## Pi ownership and safety

- Resolve and use the repository's declared Wrangler version, package manager, workspace boundary, existing scripts, and local binary. The reference commands below show Wrangler syntax; translate them to the verified repository-local invocation before execution.
- Do not install or upgrade Wrangler, change its major version, or run a package runner that can fetch an undeclared version unless the user explicitly requests that dependency change.
- Do not run `wrangler --install-skills`, accept Wrangler's post-command skill-install prompt, or allow Wrangler to update agent skill directories. Pi owns and pins this skill.
- Read-only inspection is the default. Deployments, version traffic changes, rollbacks, remote writes or queries, migrations, resource provisioning or deletion, secret mutations, route changes, and paid remote bindings require explicit user authorization and a confirmed account, environment, and resource.
- Never create, modify, or delete DNS records or zones programmatically. Worker routes and custom-domain changes are also production routing changes and require explicit authorization.
- Never place secret values, passwords, tokens, private keys, or connection strings in command arguments, logs, generated files, or chat output. Use an established interactive prompt, protected file input, CI secret injection, or another approved secret channel.

## Retrieval Sources

Fetch the **latest** information before writing or reviewing Wrangler commands and config. Do not rely on baked-in knowledge for CLI flags, config fields, or binding shapes.

| Source | How to retrieve | Use for |
|--------|----------------|---------|
| Wrangler docs | Resolve Cloudflare Workers in Context7, then use `https://developers.cloudflare.com/workers/wrangler/` | CLI commands, flags, config reference |
| Wrangler config schema | `node_modules/wrangler/config-schema.json` | Config fields, binding shapes, allowed values |
| Cloudflare docs | Narrow Context7 query or `https://developers.cloudflare.com/workers/` | API reference, compatibility dates/flags |

## FIRST: Resolve repository state and pinned Wrangler

Before proposing or running a command:

1. Locate the nearest `package.json`, package-manager lockfile, workspace boundary, and associated `wrangler.json`, `wrangler.jsonc`, or `wrangler.toml`.
2. Read the declared Wrangler range, scripts, and `packageManager`. Preserve the repository's package manager and configuration format.
3. Resolve the installed repository-local binary, including a hoisted workspace binary, and record its version. Prefer an existing package script or the local executable over a global command.
4. Read the existing config and, when installed, `node_modules/wrangler/config-schema.json` before editing fields or bindings.
5. Inspect the pinned binary's `--help` for the exact command and flags. Local help and the matching schema take precedence over examples for a newer release.
6. Cloudflare's current skill targets Wrangler v4+, but an existing v3 project stays on its pinned major until the user explicitly requests and approves a migration.

If Wrangler is absent, do not fetch `wrangler@latest` implicitly. Report the manifest and lockfile evidence, then ask for permission to restore existing dependencies or add a specific version. Wherever the verified local CLI supports the operation, prefer Wrangler over manually constructing Cloudflare API requests.

## Key Guidelines

- **Use `wrangler.jsonc` for new v4 projects**: Preserve JSON, JSONC, or TOML in existing projects unless migration is explicitly requested. Some newer features require JSON configuration.
- **Treat `compatibility_date` as runtime behavior**: Preserve an existing date. For a new Worker, retrieve the current recommendation; update an existing date only as an explicit compatibility change with verification.
- **Generate types after relevant config changes**: Run the pinned `wrangler types`, and use `wrangler types --check` when the repository commits generated bindings or enforces them in CI.
- **Local dev defaults to local storage**: Bindings use local simulation unless `remote: true`; remote bindings touch live services and may incur charges.
- **Profile Worker startup when relevant**: Use the pinned `wrangler check startup` for startup-limit or bundle-initialization work.
- **Respect existing environments**: Preserve the repository's staging and production conventions. Define new `env.*` blocks only when the requested architecture needs them.
- **Treat automatic provisioning as a remote mutation**: Omitted resource IDs may create Cloudflare resources during deployment and therefore require explicit authorization.

## Quick Start: New Worker

Create or scaffold a Worker only when the user explicitly requests a new project and authorizes dependency and filesystem changes. Retrieve the current Create Cloudflare CLI or Wrangler initialization instructions, select explicit versions, and use the chosen package manager. Do not execute `npx ...@latest` as an implicit installer.

## Quick Reference: Core Commands

| Task | Command |
|------|---------|
| Start local dev server | `wrangler dev` |
| Deploy to Cloudflare | `wrangler deploy` |
| Deploy dry run | `wrangler deploy --dry-run` |
| Generate TypeScript types | `wrangler types` |
| Profile Worker startup time | `wrangler check startup` |
| View live logs | `wrangler tail` |
| Delete Worker | `wrangler delete` |
| Auth status | `wrangler whoami` |

---

## Configuration (wrangler.jsonc)

### Minimal Config

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-29"
}
```

### Full Config with Bindings

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-29",
  "compatibility_flags": ["nodejs_compat"],

  // Environment variables
  "vars": {
    "ENVIRONMENT": "production"
  },

  // KV Namespace
  "kv_namespaces": [
    { "binding": "KV", "id": "<KV_NAMESPACE_ID>" }
  ],

  // R2 Bucket
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "my-bucket" }
  ],

  // D1 Database
  "d1_databases": [
    { "binding": "DB", "database_name": "my-db", "database_id": "<DB_ID>" }
  ],

  // Workers AI (always remote)
  "ai": { "binding": "AI" },

  // Vectorize
  "vectorize": [
    { "binding": "VECTOR_INDEX", "index_name": "my-index" }
  ],

  // Hyperdrive
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "<HYPERDRIVE_ID>" }
  ],

  // Durable Objects
  "durable_objects": {
    "bindings": [
      { "name": "COUNTER", "class_name": "Counter" }
    ]
  },

  // Cron triggers
  "triggers": {
    "crons": ["0 * * * *"]
  },

  // Environments
  "env": {
    "staging": {
      "name": "my-worker-staging",
      "vars": { "ENVIRONMENT": "staging" }
    }
  }
}
```

### Generate Types from Config

```bash
# Generate worker-configuration.d.ts
wrangler types

# Custom output path
wrangler types ./src/env.d.ts

# Check types are up to date (CI)
wrangler types --check
```

---

## Local Development

### Start Dev Server

```bash
# Local mode (default) - uses local storage simulation
wrangler dev

# With specific environment
wrangler dev --env staging

# Force local-only (disable remote bindings)
wrangler dev --local

# Remote mode - runs on Cloudflare edge (legacy)
wrangler dev --remote

# Custom port
wrangler dev --port 8787

# Live reload for HTML changes
wrangler dev --live-reload

# Test scheduled/cron handlers
wrangler dev --test-scheduled
# Then visit: http://localhost:8787/__scheduled
```

### Remote Bindings for Local Dev

Use `remote: true` in binding config to connect local code to live resources. Confirm the exact account, environment, and resource first; remote bindings can mutate production data or incur charges:

```jsonc
{
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "my-bucket", "remote": true }
  ],
  "ai": { "binding": "AI", "remote": true },
  "vectorize": [
    { "binding": "INDEX", "index_name": "my-index", "remote": true }
  ]
}
```

Cloudflare commonly recommends remote bindings for AI, Vectorize, Browser Rendering, mTLS, and Images; Workers AI always runs remotely. Enable them only when the task requires live-resource behavior.

### Local Secrets

Create `.dev.vars` only for local development secrets, keep it out of version control, and never copy production values into it:

```
API_KEY=local-dev-key
DATABASE_URL=postgres://localhost:5432/dev
```

---

## Deployment

Deployment commands are consequential external actions. A dry run may be used for validation when the pinned version supports it; an actual deploy, rollback, version traffic change, route update, or secret mutation requires explicit authorization for the named target.

### Deploy Worker

```bash
# Deploy to production
wrangler deploy

# Deploy specific environment
wrangler deploy --env staging

# Dry run (validate without deploying)
wrangler deploy --dry-run

# Keep dashboard-set variables
wrangler deploy --keep-vars

# Minify code
wrangler deploy --minify
```

### Manage Secrets

> **Security**: Never pass secret values as command arguments or pipe them via `echo`.
> Use the interactive prompt (preferred), pipe from a file, or use `secret bulk`.
> Never output, log, or hardcode secret values in commands.

```bash
# Set secret — interactive prompt (preferred, wrangler will ask for the value securely)
wrangler secret put API_KEY

# Set secret from a file (useful for PEM keys, CI environments)
wrangler secret put PRIVATE_KEY < path/to/private-key.pem

# List secrets
wrangler secret list

# Delete secret
wrangler secret delete API_KEY

# Bulk secrets from JSON file (do not commit this file to version control)
wrangler secret bulk secrets.json
```

### Versions and Rollback

```bash
# List recent versions
wrangler versions list

# View specific version
wrangler versions view <VERSION_ID>

# Rollback to previous version
wrangler rollback

# Rollback to specific version
wrangler rollback <VERSION_ID>
```

---

## KV (Key-Value Store)

### Manage Namespaces

```bash
# Create namespace
wrangler kv namespace create MY_KV

# List namespaces
wrangler kv namespace list

# Delete namespace
wrangler kv namespace delete --namespace-id <ID>
```

### Manage Keys

```bash
# Put value
wrangler kv key put --namespace-id <ID> "key" "value"

# Put with expiration (seconds)
wrangler kv key put --namespace-id <ID> "key" "value" --expiration-ttl 3600

# Get value
wrangler kv key get --namespace-id <ID> "key"

# List keys
wrangler kv key list --namespace-id <ID>

# Delete key
wrangler kv key delete --namespace-id <ID> "key"

# Bulk put from JSON
wrangler kv bulk put --namespace-id <ID> data.json
```

### Config Binding

```jsonc
{
  "kv_namespaces": [
    { "binding": "CACHE", "id": "<NAMESPACE_ID>" }
  ]
}
```

---

## R2 (Object Storage)

### Manage Buckets

```bash
# Create bucket
wrangler r2 bucket create my-bucket

# Create with location hint
wrangler r2 bucket create my-bucket --location wnam

# List buckets
wrangler r2 bucket list

# Get bucket info
wrangler r2 bucket info my-bucket

# Delete bucket
wrangler r2 bucket delete my-bucket
```

### Manage Objects

```bash
# Upload object
wrangler r2 object put my-bucket/path/file.txt --file ./local-file.txt

# Download object
wrangler r2 object get my-bucket/path/file.txt

# Delete object
wrangler r2 object delete my-bucket/path/file.txt
```

### Config Binding

```jsonc
{
  "r2_buckets": [
    { "binding": "ASSETS", "bucket_name": "my-bucket" }
  ]
}
```

---

## D1 (SQL Database)

Wrangler v4 resource commands default to local mode, but every `--remote` D1 command touches a live database. Confirm the database and environment before read-only queries; remote writes, migrations, imports, exports, and deletes require explicit authorization and a rollback or backup path when applicable.

### Manage Databases

```bash
# Create database
wrangler d1 create my-database

# Create with location
wrangler d1 create my-database --location wnam

# List databases
wrangler d1 list

# Get database info
wrangler d1 info my-database

# Delete database
wrangler d1 delete my-database
```

### Execute SQL

```bash
# Execute SQL command (remote)
wrangler d1 execute my-database --remote --command "SELECT * FROM users"

# Execute SQL file (remote)
wrangler d1 execute my-database --remote --file ./schema.sql

# Execute locally
wrangler d1 execute my-database --local --command "SELECT * FROM users"
```

### Migrations

```bash
# Create migration
wrangler d1 migrations create my-database create_users_table

# List pending migrations
wrangler d1 migrations list my-database --local

# Apply migrations locally
wrangler d1 migrations apply my-database --local

# Apply migrations to remote
wrangler d1 migrations apply my-database --remote
```

### Export/Backup

```bash
# Export schema and data
wrangler d1 export my-database --remote --output backup.sql

# Export schema only
wrangler d1 export my-database --remote --output schema.sql --no-data
```

### Config Binding

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-database",
      "database_id": "<DATABASE_ID>",
      "migrations_dir": "./migrations"
    }
  ]
}
```

---

## Vectorize (Vector Database)

### Manage Indexes

```bash
# Create index with dimensions
wrangler vectorize create my-index --dimensions 768 --metric cosine

# Create with preset (auto-configures dimensions/metric)
wrangler vectorize create my-index --preset @cf/baai/bge-base-en-v1.5

# List indexes
wrangler vectorize list

# Get index info
wrangler vectorize get my-index

# Delete index
wrangler vectorize delete my-index
```

### Manage Vectors

```bash
# Insert vectors from NDJSON file
wrangler vectorize insert my-index --file vectors.ndjson

# Query vectors
wrangler vectorize query my-index --vector "[0.1, 0.2, ...]" --top-k 10
```

### Config Binding

```jsonc
{
  "vectorize": [
    { "binding": "SEARCH_INDEX", "index_name": "my-index" }
  ]
}
```

---

## Hyperdrive (Database Accelerator)

### Manage Configs

Credential-bearing Hyperdrive create and update syntax can expose passwords or connection strings through process arguments. Retrieve the pinned command's current help and use an approved secure input path; never place database credentials in the command line.

```bash
# Read-only inspection
wrangler hyperdrive list
wrangler hyperdrive get <HYPERDRIVE_ID>

# Destructive; run only when explicitly authorized
wrangler hyperdrive delete <HYPERDRIVE_ID>
```

### Config Binding

```jsonc
{
  "compatibility_flags": ["nodejs_compat"],
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "<HYPERDRIVE_ID>" }
  ]
}
```

---

## Workers AI

### List Models

```bash
# List available models
wrangler ai models

# List finetunes
wrangler ai finetune list
```

### Config Binding

```jsonc
{
  "ai": { "binding": "AI" }
}
```

**Note**: Workers AI always runs remotely and incurs usage charges even in local dev.

---

## Queues

### Manage Queues

```bash
# Create queue
wrangler queues create my-queue

# List queues
wrangler queues list

# Delete queue
wrangler queues delete my-queue

# Add consumer to queue
wrangler queues consumer add my-queue my-worker

# Remove consumer
wrangler queues consumer remove my-queue my-worker
```

### Config Binding

```jsonc
{
  "queues": {
    "producers": [
      { "binding": "MY_QUEUE", "queue": "my-queue" }
    ],
    "consumers": [
      {
        "queue": "my-queue",
        "max_batch_size": 10,
        "max_batch_timeout": 30
      }
    ]
  }
}
```

---

## Containers

### Build and Push Images

```bash
# Build container image
wrangler containers build -t my-app:latest .

# Build and push in one command
wrangler containers build -t my-app:latest . --push

# Push existing image to Cloudflare registry
wrangler containers push my-app:latest
```

### Manage Containers

```bash
# List containers
wrangler containers list

# Get container info
wrangler containers info <CONTAINER_ID>

# Delete container
wrangler containers delete <CONTAINER_ID>
```

### Manage Images

```bash
# List images in registry
wrangler containers images list

# Delete image
wrangler containers images delete my-app:latest
```

### Manage External Registries

> **Security**: Never hardcode registry credentials in commands. Use environment variables.

```bash
# List configured registries
wrangler containers registries list

# Configure external registry (e.g., ECR)
wrangler containers registries configure <DOMAIN> \
  --aws-access-key-id "$AWS_ACCESS_KEY_ID"

# Configure DockerHub
wrangler containers registries configure <DOMAIN> \
  --dockerhub-username "$DOCKERHUB_USERNAME"

# Delete registry configuration
wrangler containers registries delete <DOMAIN>
```

---

## Workflows

### Manage Workflows

```bash
# List workflows
wrangler workflows list

# Describe workflow
wrangler workflows describe my-workflow

# Trigger workflow instance
wrangler workflows trigger my-workflow

# Trigger with parameters
wrangler workflows trigger my-workflow --params '{"key": "value"}'

# Delete workflow
wrangler workflows delete my-workflow
```

### Manage Workflow Instances

```bash
# List instances
wrangler workflows instances list my-workflow

# Describe instance
wrangler workflows instances describe my-workflow <INSTANCE_ID>

# Terminate instance
wrangler workflows instances terminate my-workflow <INSTANCE_ID>
```

### Config Binding

```jsonc
{
  "workflows": [
    {
      "binding": "MY_WORKFLOW",
      "name": "my-workflow",
      "class_name": "MyWorkflow"
    }
  ]
}
```

---

## Pipelines

### Manage Pipelines

```bash
# Create pipeline
wrangler pipelines create my-pipeline --r2 my-bucket

# List pipelines
wrangler pipelines list

# Show pipeline details
wrangler pipelines show my-pipeline

# Update pipeline
wrangler pipelines update my-pipeline --batch-max-mb 100

# Delete pipeline
wrangler pipelines delete my-pipeline
```

### Config Binding

```jsonc
{
  "pipelines": [
    { "binding": "MY_PIPELINE", "pipeline": "my-pipeline" }
  ]
}
```

---

## Secrets Store

### Manage Stores

```bash
# Create store
wrangler secrets-store store create my-store

# List stores
wrangler secrets-store store list

# Delete store
wrangler secrets-store store delete <STORE_ID>
```

### Manage Secrets in Store

`secret get` may return secret material. Do not retrieve or display a secret value unless the user explicitly requests that exact operation and the value can remain inside an approved secure channel; never include it in chat or logs.

```bash
# Add secret to store
wrangler secrets-store secret put <STORE_ID> my-secret

# List secrets in store
wrangler secrets-store secret list <STORE_ID>

# Get secret
wrangler secrets-store secret get <STORE_ID> my-secret

# Delete secret from store
wrangler secrets-store secret delete <STORE_ID> my-secret
```

### Config Binding

```jsonc
{
  "secrets_store_secrets": [
    {
      "binding": "MY_SECRET",
      "store_id": "<STORE_ID>",
      "secret_name": "my-secret"
    }
  ]
}
```

---

## Pages (Frontend Deployment)

Pages project creation and deployment are remote mutations. Confirm the Cloudflare account, project, branch, and target environment before running them.

```bash
# Create Pages project
wrangler pages project create my-site

# Deploy directory to Pages
wrangler pages deploy ./dist

# Deploy with specific branch
wrangler pages deploy ./dist --branch main

# List deployments
wrangler pages deployment list --project-name my-site
```

---

## Observability

### Tail Logs

```bash
# Stream live logs
wrangler tail

# Tail specific Worker
wrangler tail my-worker

# Filter by status
wrangler tail --status error

# Filter by search term
wrangler tail --search "error"

# JSON output
wrangler tail --format json
```

### Config Logging

```jsonc
{
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  }
}
```

---

## Testing

### Local Testing with Vitest

If the repository already uses Vitest for Workers, preserve its pinned versions and package-manager conventions. Adding `@cloudflare/vitest-pool-workers` or `vitest` is a dependency change and requires an explicit request.

`vitest.config.ts`:
```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
```

### Test Scheduled Events

```bash
wrangler dev --test-scheduled
```

Then exercise `/__scheduled` with the repository's existing HTTP smoke-test route or OMP's request tooling; do not assume `curl` is available or appropriate.

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `command not found: wrangler` | Inspect the manifest and lockfile; ask before restoring dependencies or adding a specific Wrangler version. Never fetch implicitly. |
| Auth errors | Inspect the pinned `wrangler whoami --json` result. `wrangler login` changes local authentication and requires explicit user participation; never expose credentials. |
| Startup time limit exceeded | Run `wrangler check startup` to profile startup and generate CPU profiles |
| Type errors after config change | Run `wrangler types` |
| Local storage not persisting | Check `.wrangler/state` directory |
| Binding undefined in Worker | Verify binding name matches config exactly |

### Debug Commands

```bash
# Check auth status
wrangler whoami

# Profile Worker startup time
wrangler check startup

# View config schema
wrangler docs configuration
```

---

## Best Practices

1. **Version control the existing Wrangler config**: Treat it as source of truth and preserve its format.
2. **Gate automatic provisioning**: Omit resource IDs only when the user has authorized creation of the resulting remote resources.
3. **Keep generated types current**: Use `wrangler types --check` when committed bindings or CI require it.
4. **Preserve environment conventions**: Keep staging and production targets explicit and non-ambiguous.
5. **Change `compatibility_date` deliberately**: Retrieve current guidance, assess behavior changes, and verify the affected runtime path.
6. **Keep local secrets local**: Never commit `.dev.vars`, secret bulk files, keys, or credentials.
7. **Test locally first**: Use local bindings unless live-resource behavior is required and authorized.
8. **Use dry runs where supported**: Validate bundles and config before an authorized deployment.
9. **Never embed secrets in commands**: Use interactive prompts, protected file input, or secure CI injection. Never echo, log, or pass secret values as arguments.
10. **Keep OMP skill ownership isolated**: Decline Wrangler-managed skill installation or update prompts; update this vendored skill only through the explicit Native Workflows refresh process.

## Verification and reporting

- For config edits, validate with the pinned schema and the narrowest non-mutating command supported by that version, such as `wrangler types --check`, a dry run, or local startup.
- For development changes, run the repository's existing dev command and exercise the changed Worker route or event path.
- For an authorized remote mutation, report the exact account, environment, resource, command class, and observed result. Never report secret values.
- State the config path, package manager, declared and installed Wrangler versions, documentation/schema sources consulted, side effects performed, and any unresolved version mismatch.
