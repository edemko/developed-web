# Product predecessor retirement checkpoint — 2026-09-20

Completed and independently checked at `2026-09-20T20:03:08Z`. This checkpoint
covers only the five superseded service units, two old containers and six
replacement boot dependencies. It does not enable human SSO, alter app policy,
restart the import worker, or claim end-to-end authenticated-user acceptance.

## Applied scope and deliberate partial-stop recovery

The initial reviewed operator required the final product Caddy source hash
`501bbc47de35e94a45c24b9281b1e88ac918ae75d02750fd70c8f13bb1c63946`
and its protected applied proof. It drained both host TCP families and each exact
container's network namespace/internal port3000. Six already-running replacements
were added to `multi-user.target` without restarting them. Both old Mega account
units stopped normally. Old ScreenTime stopped but reported a failed exit143,
so the strict initial post-stop assertion halted before KešTrek, Otázkomat or
the containers were touched.

Reviewed resume source `65a632d` added only `--resume-screen-143`. Its immutable
copy at `/opt/developed-operators/retire-product-predecessors-65a632d/` ran once.
It revalidated the root-protected original snapshot/unit texts, two completed
Mega records, exact untouched remainder and unchanged replacement PIDs/UIDs and
boot symlinks. The ScreenTime exception required all of:

- `MainPID=0`, `ControlPID=0`, `ActiveState=failed`, `UnitFileState=disabled`;
- `Result=exit-code`, `ExecMainCode=1`, `ExecMainStatus=143`, `NRestarts=0`;
- no listener on its retired3127 port, or either retired Mega port, in IPv4/IPv6.

No ScreenTime stop/restart/reset-failed command was replayed. After another
connection drain, only the remaining two service units and two containers were
retired. KešTrek and Otázkomat stopped normally; no broader failed-exit exception
was needed. Every target received an exclusive fsynced protected record.

## Final process and boot evidence

All old service units have `MainPID=0`, `ControlPID=0` and are disabled:

| Old unit | Final state |
| --- | --- |
| System `mega-music-accounts.service` | inactive, success |
| System `mega-music-accounts-green.service` | inactive, success |
| User `screentime-prod.service` | failed exit143, stopped, zero restarts; diagnostic preserved |
| User `kestrek-prod.service` | inactive, success |
| User `otazkomat-prod.service` | inactive, success |

The exact containers `airsoft-marketplace`
(`50465ad5f6b3f7a93a16cc238b963cc6f583fb730051ea3d9ae37731d2906a38`)
and `voc-builder`
(`b4a090ae4a9129109d0f819a2a9538e77e9ba1b0100f810eb86d0af2e8272581`)
remain present, stopped, PID0, with restart policy `no`. Neither container was
deleted. Independent checks found no listener on any of
3137,3138,3127,3124,3126,3001,3002 in either TCP family.

The following replacement units remain active and enabled; each PID exactly
matches the original protected pre-retirement snapshot and each has zero
restarts:

| Replacement unit | UID | PID |
| --- | --- | --- |
| `mega-music-accounts-isolated@4ca877f89a3d.service` | 984 | 3534993 |
| `developed-screentime@a3df8a458169-central.service` | 983 | 3538874 |
| `developed-kestrek@1c102674a293.service` | 982 | 239785 |
| `developed-otazkomat@7393f6b095f0.service` | 981 | 3540915 |
| `developed-airsoft-green.service` | 986 | 3542385 |
| `developed-vocabulum-green.service` | 985 | 4056033 |

Exact root-owned `multi-user.target.wants` symlinks point to the reviewed unit
or template fragments. An offline disposable systemd fixture had established
that `add-wants` enables both static units and template instances on this host.

## Public checks and recovery boundaries

Before and after the resume, Mega Music, ScreenTime, KešTrek and its test host,
Educatio and its test host, Airsoft `/sk`, and Vocabulum returned200. Airsoft root
retains its expected307 to `/sk`. Both `www.developed.sk/login` and
`test.developed.sk/login` remained404. These are reachability/admission checks,
not owner-login, finance/MCP, device or application-data acceptance tests.

Seven focused operator tests passed. The protected checkpoint directory
`/var/backups/developed-predecessor-retirement-20260920` is root:root0700;
`before.json`, original unit backups, per-target records,
`resume-screen-143.started.json` and `completed.json` are root:root0600. Files
and their directory are fsynced. Unit backups may contain sensitive configuration
and must not be printed or copied into Git.

No service definitions, releases, container layers/volumes, repository files or
application data were deleted. Stop/disable/restart-policy changes are
recoverable, but restoring a privileged predecessor would reopen a retired
security boundary and requires separate review and authorization. There is no
automatic restart, rollback or general-purpose resume. Preserve the failed
ScreenTime diagnostic; it does not represent a running old process.
