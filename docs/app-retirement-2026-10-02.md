# App retirement and repository archival — 2026-10-02

Completed at the owner's request:

- Odonto Feedback (the anonymous exam-feedback app, **not OdontoAI**) no longer
  runs. Removed its two Docker containers, dedicated `odonto-feedback_app`
  network, app images and `/opt/odonto-feedback` deployment directory. Caddy's
  former upstream is replaced by HTTP 410; verified through public HTTPS.
- Kept the shared Cloudflare tunnel/DNS so the retired hostname returns 410.
  No other routes, services, networks or shared database were removed.
- Exported only the `odonto_feedback` database schema to a private custom-format
  archive. The original schema remains dormant; its runtime role has NOLOGIN.
  Existing submissions were preserved, not deleted.
- ZIP-archived `esp32-2432s028r-idf-clock`, `sms-scheduler` and `claude-chat`, with
  Git history, local files and build/dependency files included. Verified ZIP CRCs,
  SHA-256 hashes and source-file sizes before removing their active directories.
- Stopped and disabled the user `claude-chat.service`; removed its private runtime
  configuration after separately archiving it. Port 7420 no longer listens. The
  Tailscale Serve endpoint on 9443 belongs to Mega Music and was left unchanged.

Archives, manifests, checksums and recovery notes are in the private directory
`/home/openclaw/Archives/2026-10-02/`, outside all web roots. Do not copy their
contents into Git or public documentation. The earlier Odonto deployment and CSP
records are historical; their rollback image tags and live paths no longer exist.

My Clinic reporting is a separate source change in `my-clinic`: it uses its own
API and existing Mailjet configuration, with no central login or identity change.
It has not been deployed as part of this retirement operation.
