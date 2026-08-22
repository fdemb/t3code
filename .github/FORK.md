# Fork automation

This fork tracks `pingdotgg/t3code`. Upstream's workflow files are left exactly as
upstream wrote them and are **disabled through the Actions API** instead of being
edited or deleted, because editing them would conflict on every upstream merge.
Fork-specific automation lives in separate files named `fork-*.yml`, which upstream
will never touch.

## What runs here

| Workflow                 | Trigger                      | Purpose                                                                                                         |
| ------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `fork-ci.yml`            | PR, push to `main`, dispatch | check, typecheck, desktop build, tests, Rust, release smoke — on GitHub-hosted runners                          |
| `fork-nightly.yml`       | 03:00 UTC, dispatch          | build the Linux x64 AppImage and publish it as a prerelease tagged `fork-nightly-<version>`; keeps the 7 newest |
| `fork-upstream-sync.yml` | 01:30 UTC, dispatch          | merge `upstream/main` into `main` when clean; on conflict, leave `main` alone and file an issue                 |

Everything else upstream ships is disabled: it either needs `blacksmith-*`
self-hosted runners that do not exist here, or org secrets this fork does not have
(Clerk, Cloudflare, Vercel, Expo/EAS, Apple/Azure signing, the AUR SSH key).

## Managing the disabled state

```bash
# see current state
gh api repos/fdemb/t3code/actions/workflows --jq '.workflows[]|"\(.state)\t\(.path)"'

# disable a workflow upstream adds later (new files arrive enabled)
gh api -X PUT repos/fdemb/t3code/actions/workflows/<id>/disable

# re-enable one
gh api -X PUT repos/fdemb/t3code/actions/workflows/<id>/enable
```

`release.yml` reads `disabled_fork`: GitHub disables scheduled workflows inherited
by a fork automatically. Do not enable it — it would try to publish to upstream's
npm package, Vercel project, and AUR package.

After an upstream merge brings in a **new** workflow file, disable it explicitly:
new files are active by default.

## Nightly release notes

- Cloud (T3 Connect) config comes from `.env.example`, which the build copies to
  `.env`. Those identifiers are public and are the same ones in official builds.
- Signing is skipped, so the AppImage is unsigned. Fine on Linux.
- To add macOS or Windows, add a matrix entry in `fork-nightly.yml`. Windows also
  needs the WSL `node-pty` prebuild job from upstream `release.yml`, and unsigned
  macOS builds are blocked by Gatekeeper.

## Upstream sync notes

- It merges (never rebases): `main` carries published fork commits.
- A push made with `GITHUB_TOKEN` does not trigger workflows, so the sync job
  dispatches `fork-ci.yml` on the merge commit itself.
- GitHub disables cron triggers after 60 days of repository inactivity.
- Conflicts are reported into a single reused issue titled
  "Upstream sync blocked by merge conflicts", which is closed on the next clean sync.
- Fork changes to files upstream also edits (for example the `omp` provider work)
  are the only real conflict source. Keeping fork edits additive and narrow keeps
  the sync green.
