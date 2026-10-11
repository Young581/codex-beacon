# Marketplace publication

The independent listing uses publisher ID `Young581` (pending account confirmation).
The primary extension is `Young581.codex-beacon` version 0.8.0; its companion is
`Young581.codex-beacon-collector` version 0.5.0. This is separate from the upstream
`lengmo1996` listings. GitHub access does not grant Marketplace publisher permissions.

Create or sign in to the publisher at https://marketplace.visualstudio.com/manage.
Confirm that the signed-in Microsoft account owns the publisher ID used in both manifests.
If the actual publisher ID differs, update both manifests, the companion locator,
build identity validation and the relevant test fixtures, then rebuild and audit.

Run all Windows checks and build with `python -B build.py` before publication.
The extension payloads are governed by `packaging/package_policy.py` and include
only reviewed source and public documentation. They do not include personal
settings, Codex session data, tokens or development outputs.

After checking the exact archives with `packaging/release-audit.py`, publish the
collector first and then the primary extension. The official CLI supports:

```text
vsce publish --packagePath dist/codex-beacon-collector-0.5.0.vsix
vsce publish --packagePath dist/codex-beacon-0.8.0.vsix
```

Use an authenticated publisher session. Keep any PAT in the local credential
store or process environment (`VSCE_PAT`), never in source, terminal commands,
chat messages or release files. Microsoft's current documentation recommends
Entra ID for automated publication. Alternatively, use **New extension → Visual
Studio Code** in the publisher portal and upload these same audited files.

Publication is complete only after the portal validates both uploads and the
public listing reports the intended versions. Build artifacts alone are not
evidence of publication.

## Migrating local installations

When tasks are idle, disable or uninstall the old `lengmo1996.codex-notifier-ui`
and `lengmo1996.codex-notifier-collector` extensions in each affected environment
before enabling Beacon. Commands are isolated, but running both products can
produce duplicate reminders for the same Codex events.

Beacon settings use `codexBeacon.*`. Reapply custom settings (Python path,
audio file, model prices) under that namespace. Beacon has its own notification
history, keys, cache and approval-hook owner; old records are not automatically
copied. Codex conversations and project files are unaffected. If the old approval
hook was enabled, remove it using the old extension before disabling that
extension, then configure and trust Beacon's hook if required.

## Official references

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- https://github.com/microsoft/vscode-vsce
