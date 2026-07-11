# Windows Distribution And SmartScreen

Microsoft Defender SmartScreen is reputation based. A new unsigned installer can show
"Windows protected your PC" even when the app is clean. The durable fix is to sign
every public release with the same trusted code signing identity and distribute it
from a stable, trustworthy location.

## What Is Required

1. Get a code signing identity.
   - Recommended for small publishers: Microsoft Trusted Signing / Artifact Signing.
   - Traditional option: OV or EV code signing certificate from a public CA.
2. Keep signing secrets outside the repository.
   - Do not commit `.pfx`, passwords, Azure credentials, or signing scripts with secrets.
3. Build the public installer with signing enabled.
4. Verify the final installer signature before sharing it.
5. Keep the same publisher identity across releases so reputation can accumulate.

## PFX Certificate Build

Set these only on the release machine or CI secret store:

```powershell
[Environment]::SetEnvironmentVariable('WIN_CSC_LINK', 'C:\secure\pc-life-assistant-code-signing.pfx', 'User')
[Environment]::SetEnvironmentVariable('WIN_CSC_KEY_PASSWORD', '<pfx-password>', 'User')
```

Then open a new terminal and run the fail-closed signed build:

```powershell
npm run package:signed
```

Electron Builder also supports `CSC_LINK` and `CSC_KEY_PASSWORD`; the `WIN_*`
variables are preferred for Windows-specific signing.

## Certificate Store / EV Token Build

If the certificate is installed in the Windows certificate store, set the
certificate subject name before building:

```powershell
[Environment]::SetEnvironmentVariable('CSC_NAME', '<exact certificate subject>', 'User')
npm run package:signed
```

Hardware-backed EV certificates may require the token or provider UI during the
build.

## Verify The Installer

```powershell
$installer = Get-ChildItem .\release-auto\PC-Life-Assistant-Setup-*.exe |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
Get-AuthenticodeSignature -LiteralPath $installer.FullName | Format-List
Get-AuthenticodeSignature -LiteralPath '.\release-auto\win-unpacked\PC Life Assistant.exe' | Format-List
```

Expected result:

- `Status` is `Valid`
- `SignerCertificate.Subject` matches your publisher identity
- The installer and unpacked executable are both signed

## Local Development Versus Public Release

- `npm run package` and `npm run package:dir` allow unsigned local development builds.
- `npm run package:signed` requires signing credentials and passes `forceCodeSigning=true` to electron-builder.
- `npm run release:github` and `npm run release:signed` require signing credentials before publishing.
- `scripts/check-signing-env.mjs` validates only credential presence. It never prints or reads certificate contents.

The signed commands fail before packaging when neither a complete `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` pair nor `CSC_NAME` exists. This prevents the tag workflow from silently publishing an unsigned installer.

## GitHub Actions Secrets

Configure these repository or environment secrets before pushing a version tag:

- `WIN_CSC_LINK`: a GitHub-secret-compatible electron-builder certificate link or base64-encoded PFX payload.
- `WIN_CSC_KEY_PASSWORD`: the PFX password.

The workflow passes them directly to electron-builder. Do not write them into workflow YAML, `.env` files, artifacts, logs, or repository settings templates. Certificate-store and hardware-token builds are normally performed on a controlled self-hosted Windows runner using `CSC_NAME` and the provider's secure token setup.

If trusted credentials are absent, the honest status is:

> Signing configuration prepared, trusted certificate unavailable.

## SmartScreen Notes

- Unsigned files start with no publisher trust.
- Signed files still need reputation, but the warning can show a publisher name
  and reputation can attach to the signing identity over time.
- New file hashes and new certificates may need time to build reputation.
- If Defender falsely flags the file as malware, submit the signed installer to
  Microsoft Security Intelligence for analysis.
