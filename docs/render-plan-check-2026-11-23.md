# Render plan check: does PlateQuote need Pro? (2026-11-23)

Read-only check, Mac Studio Chrome, 2026-11-23 about 20:30 local. Nothing was clicked that changes state; the plan picker was not opened.

Sources read tonight:
- P = https://render.com/pricing (feature comparison table, "Compare features across workspace plans")
- F = https://render.com/docs/free
- S = https://dashboard.render.com/w/tea-dbh6haek1f9s73ek779g/settings (workspace settings)
- B = https://dashboard.render.com/w/tea-dbh6haek1f9s73ek779g/billing (workspace billing usage)
- D = https://dashboard.render.com/ (workspace overview)
- BP = https://dashboard.render.com/blueprints
- PL = https://dashboard.render.com/private-links
- WS = https://dashboard.render.com/web/srv-dbh6lcvlk1mc73fdojrg/settings (platequote-web settings)

## Feature by feature

| Feature | What PlateQuote uses | Hobby limit | Pro limit | Fits Hobby | Source |
|---|---|---|---|---|---|
| Plan base price | Pro today | $0/mo + compute | $25/mo + compute | n/a | P, S |
| Services in workspace | 3 total: platequote-web, platequote-worker, platequote-db; no Projects, all Ungrouped | Max 25 services | Unlimited | Yes | P, D |
| Web service on Free instance | platequote-web, Free | Free instances available, 750 free instance hours per workspace per month | Same | Yes | P, F |
| Free instance hours | 306.4 h of 750 h month to date | 750 h/month | 750 h/month | Yes | F, B |
| Docker background service | platequote-worker, Docker, Starter $7/mo | Custom Docker containers and compute plans are listed for all plans | Same | Yes | P, D |
| Postgres | platequote-db, Basic-256mb, PostgreSQL 18 | Postgres included; point-in-time recovery 3 days | PITR 7 days | Yes (PITR window shrinks 7 to 3 days) | P, D |
| Custom domains | 1 domain counted of 15 included | 2 included, then $0.25/domain/month | 15 included | Yes | P, B |
| Bandwidth | 315 MB month to date | 5 GB/month, then $0.15/GB | 25 GB/month | Yes | P, B |
| Build pipeline minutes | 21 min of 1,000 included, Starter tier | 500 min/month, then $5 per 1K | 1K min/month | Yes | P, B, S |
| Team seats | 1 member (Admin) | 1 seat | Unlimited | Yes | P, S |
| Workspaces | this one | 1 | 1 | Yes | P |
| Blueprint / infrastructure as code, auto-deploy on commit | 1 Blueprint (platequote), synced; Auto-Deploy On Commit | Infrastructure as code and auto-deploys listed for all plans | Same | Yes | P, BP, WS |
| Environment groups | 1 | Listed for all plans (environment variables and secret files) | Same | Yes | P |
| Environments per project | 0 Projects in use | 2 per project | Unlimited | Yes | P, D |
| PR previews | platequote-web PR Previews: Off | Single-service previews only | Full-stack preview environments | Yes | P, WS |
| Horizontal autoscaling | Not observed in use (single instances) | Not available | Available | Yes | P |
| AWS Private Links | None (Private Links page empty) | Not available | $30/mo for up to 3 | Yes | P, PL |
| Log retention | Not a usage figure | 7 days | 14 days | Yes, shorter | P |
| Instant rollbacks | Not a usage figure | 5 builds retained | 15 builds retained | Yes, shorter | P |
| Support | Not a usage figure | Email | Chat | Yes, lesser | P |
| Workspace audit logs, user roles, OIDC, HTTP request logs | Not observed in use | Not available | Available | Yes if unused | P |

## Verdict

PlateQuote fits the Hobby plan on every measured line: 3 of 25 services, 1 of 1 seat, 1 custom domain against 2 included, 315 MB against 5 GB bandwidth, 21 against 500 pipeline minutes, and no Pro-only feature found switched on (PR previews off, no private links, no Projects). [Inference] Moving to Hobby would save the $25/month plan fee; the $7 worker and the Postgres compute are billed the same on either plan. What gets worse on Hobby is retention, not capacity: Postgres point-in-time recovery drops from 7 to 3 days, logs from 14 to 7 days, rollback history from 15 to 5 builds, and support from chat to email. Pro is needed only if a second team member, preview environments, autoscaling, or the longer recovery windows are wanted.

## Could not read

- Custom Domains section on platequote-web settings (WS) stayed blank after load, so the domain list itself (including whether www.platequote.tech exists) was not read. The billing page (B) counts 1 domain; under the Hobby cap of 2 even if www were a second one.
- What a downgrade to Hobby would say: the plan picker behind "Update Plan" was not opened.
- Whether other workspaces exist under this account: only this workspace's services were listed (D).
- Horizontal autoscaling and audit-log settings were not opened per service; "not in use" for those is inferred from the pricing table and single-instance plans, not read from a toggle.
