# Interactive Platform CLI App Plan (Codex-Style TUI) for Client Management

## Summary
Build a full-screen terminal app for platform operations using TypeScript + Ink so platform operators can navigate and manage client organizations end-to-end: provisioning, subscriptions, features, tenant admins, and audit history.

This is a terminal application workflow, not only one-off command scripts.

## Goals
1. Manage client lifecycle from one interactive CLI app.
2. Keep all high-risk actions safe with typed confirmations.
3. Capture operator identity for every write action.
4. Keep existing legacy scripts working during migration.

## Launch and Entry
- Primary command: `pnpm platform --actor <operator-email>`
- Optional: `--company-id <uuid>` to open focused context
- Optional: `--read-only` for non-mutating support sessions
- Optional: `--json` for command-mode automation output

## Delivery Governance (Mandatory)
### Team Leader
- One designated Team Leader coordinates the multi-agent delivery.
- Team Leader owns planning board, task assignment, integration, and final verification.
- Team Leader is the only role that merges agent work into the integration branch.

### Git Worktree Policy
- Every agent must work in a dedicated git worktree to avoid local conflicts.
- Each worktree tracks a dedicated agent branch created from the integration branch.
- Agents do not share directories and do not commit directly to integration branch.
- Recommended naming:
  - branches: `feat/platform-cli-app-agent-a` ... `feat/platform-cli-app-agent-e`
  - worktrees: `.worktrees/platform-cli-agent-a` ... `.worktrees/platform-cli-agent-e`

### Worktree Bootstrap Commands (Team Leader)
```bash
# 1) Create integration branch (once)
git switch -c feat/platform-cli-app

# 2) Create per-agent branches from integration branch
git branch feat/platform-cli-app-agent-a
git branch feat/platform-cli-app-agent-b
git branch feat/platform-cli-app-agent-c
git branch feat/platform-cli-app-agent-d
git branch feat/platform-cli-app-agent-e

# 3) Create per-agent worktrees
git worktree add .worktrees/platform-cli-agent-a feat/platform-cli-app-agent-a
git worktree add .worktrees/platform-cli-agent-b feat/platform-cli-app-agent-b
git worktree add .worktrees/platform-cli-agent-c feat/platform-cli-app-agent-c
git worktree add .worktrees/platform-cli-agent-d feat/platform-cli-app-agent-d
git worktree add .worktrees/platform-cli-agent-e feat/platform-cli-app-agent-e

# 4) Verify active worktrees
git worktree list
```

PowerShell (Windows):
```powershell
# 0) Ensure worktrees parent folder exists
New-Item -ItemType Directory -Force -Path .worktrees | Out-Null

# 1) Create integration branch (once)
git switch -c feat/platform-cli-app

# 2) Create per-agent branches from integration branch
git branch feat/platform-cli-app-agent-a
git branch feat/platform-cli-app-agent-b
git branch feat/platform-cli-app-agent-c
git branch feat/platform-cli-app-agent-d
git branch feat/platform-cli-app-agent-e

# 3) Create per-agent worktrees
git worktree add .worktrees/platform-cli-agent-a feat/platform-cli-app-agent-a
git worktree add .worktrees/platform-cli-agent-b feat/platform-cli-app-agent-b
git worktree add .worktrees/platform-cli-agent-c feat/platform-cli-app-agent-c
git worktree add .worktrees/platform-cli-agent-d feat/platform-cli-app-agent-d
git worktree add .worktrees/platform-cli-agent-e feat/platform-cli-app-agent-e

# 4) Verify active worktrees
git worktree list
```

### Worktree Cleanup Commands (After Integration)
```bash
git worktree remove .worktrees/platform-cli-agent-a
git worktree remove .worktrees/platform-cli-agent-b
git worktree remove .worktrees/platform-cli-agent-c
git worktree remove .worktrees/platform-cli-agent-d
git worktree remove .worktrees/platform-cli-agent-e

git branch -d feat/platform-cli-app-agent-a
git branch -d feat/platform-cli-app-agent-b
git branch -d feat/platform-cli-app-agent-c
git branch -d feat/platform-cli-app-agent-d
git branch -d feat/platform-cli-app-agent-e
```

PowerShell (Windows):
```powershell
git worktree remove .worktrees/platform-cli-agent-a
git worktree remove .worktrees/platform-cli-agent-b
git worktree remove .worktrees/platform-cli-agent-c
git worktree remove .worktrees/platform-cli-agent-d
git worktree remove .worktrees/platform-cli-agent-e

git branch -d feat/platform-cli-app-agent-a
git branch -d feat/platform-cli-app-agent-b
git branch -d feat/platform-cli-app-agent-c
git branch -d feat/platform-cli-app-agent-d
git branch -d feat/platform-cli-app-agent-e
```

## TUI Architecture
### Global layout
1. Left sidebar: module navigation
2. Main pane: table/list and detail views
3. Right pane: inspector, warnings, effective status
4. Footer bar: actor identity, selected org, shortcut hints

### Keyboard model
- `Up`/`Down`: move in lists
- `Left`/`Right`: pane or tab navigation
- `Enter`: open/execute
- `Esc`: back/close
- `/`: search
- `g`: module switcher
- `p`: command palette
- `r`: refresh
- `q`: quit

### Command palette
Global quick actions:
- Provision organization
- Suspend/activate organization
- Set subscription state
- Enable/disable feature
- Create/deactivate/reset tenant admin
- Open filtered audit timeline

## v1 Modules (Scope Locked)
1. **Organizations**
   - list, filter, search, detail
   - provision org with subdomain + initial admin
   - update metadata/subdomain
   - suspend / activate / disable
2. **Subscriptions**
   - show current state and history
   - set status and contract dates
   - extend subscription window
3. **Features**
   - list features and effective org toggles
   - enable/disable per org
   - sync default feature set
4. **Tenant Admins**
   - list admins by org
   - create admin user
   - reset password
   - activate/deactivate admin
5. **Audit**
   - timeline by org/action/actor/date
   - detail view of payload and action result

## Data + Service Layer
Build shared services used by both TUI and command-mode execution:
- `lib/platform/org-service.ts`
- `lib/platform/subscription-service.ts`
- `lib/platform/feature-service.ts`
- `lib/platform/admin-service.ts`
- `lib/platform/audit-service.ts`

Each mutation returns structured results:
- `ok`
- `changed`
- `warnings`
- `resource`
- `errorCode`

## Safety and Controls
### Typed confirmation (required)
For risky actions:
- org suspend/disable/activate
- subdomain reassignment
- admin password reset
- subscription transitions that lock/unlock access

Confirmation phrase format:
- `CONFIRM <action> <org-slug>`

### Actor traceability
- `--actor` required at launch
- Every mutation writes audit event with:
  - actor
  - target resource
  - action name
  - before/after summary
  - timestamp
  - operation result

## Client Management Operating Flows
### Onboard client
1. Open Organizations module
2. Run Provision action
3. Enter org name, subdomain, admin details, subscription defaults
4. Validate and confirm
5. Auto-open org detail with next steps and warnings

### Service interruption
1. Select organization
2. Suspend with reason and typed confirmation
3. Review effective access status and audit event

### Reactivation
1. Activate org
2. Validate subscription state
3. Confirm tenant access restored

### Contract/feature management
1. Update subscription status, dates, and notes
2. Toggle feature flags per org
3. Record all updates to audit timeline

### Tenant admin support
1. Create/deactivate admins
2. Reset passwords with typed confirmation
3. Track all identity operations in audit logs

## Backward Compatibility and Rollout
1. Ship new TUI CLI while retaining existing `manage-*` scripts.
2. Add optional command-mode parity via same new runtime.
3. Publish deprecation warnings in old scripts after adoption.
4. Remove old scripts only after stable migration window.

## Parallel Agent Execution Plan
1. **Team Leader**: Coordination, branch/worktree setup, integration sequencing, final verification.
2. **Agent A**: TUI shell, layout, navigation, keybindings, command palette.
3. **Agent B**: Org + subscription services and views.
4. **Agent C**: Feature + admin services and views.
5. **Agent D**: Audit timeline and activity detail views.
6. **Agent E**: Command-mode wrappers + migration docs.

Integration order:
1. Merge shared services first.
2. Merge module views in parallel batches.
3. Finalize global shortcuts and command registry.
4. Run lint + smoke flows end-to-end.
5. Team Leader performs final integration pass from all worktree branches.

## Tests and Scenarios
1. CLI fails fast if `--actor` missing.
2. Provisioning works and creates org/admin/subscription/audit records.
3. Duplicate subdomain is blocked with conflict message.
4. Suspend/activate requires typed confirmation.
5. Subscription updates reflect in effective access status.
6. Feature toggles persist and reload correctly.
7. Admin password reset writes audited mutation event.
8. Audit filters by org/action/actor/date correctly.
9. Keyboard shortcuts function across all v1 modules.
10. Existing legacy scripts remain functional during rollout.

## Assumptions
- Framework is TypeScript + Ink.
- UX is full-screen TUI (Codex-like terminal experience).
- Rollout is side-by-side with existing scripts first.
- v1 is focused on client lifecycle management, not all domain modules.
