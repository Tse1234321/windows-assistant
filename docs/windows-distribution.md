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

Then open a new terminal and build:

```powershell
npm run package
```

Electron Builder also supports `CSC_LINK` and `CSC_KEY_PASSWORD`; the `WIN_*`
variables are preferred for Windows-specific signing.

## Certificate Store / EV Token Build

If the certificate is installed in the Windows certificate store, set the
certificate subject name before building:

```powershell
[Environment]::SetEnvironmentVariable('CSC_NAME', '<exact certificate subject>', 'User')
npm run package
```

Hardware-backed EV certificates may require the token or provider UI during the
build.

## Verify The Installer

```powershell
Get-AuthenticodeSignature .\release-auto\PC-Life-Assistant-Setup-2.2.0.exe | Format-List
```

Expected result:

- `Status` is `Valid`
- `SignerCertificate.Subject` matches your publisher identity
- The installer and unpacked executable are both signed

## SmartScreen Notes

- Unsigned files start with no publisher trust.
- Signed files still need reputation, but the warning can show a publisher name
  and reputation can attach to the signing identity over time.
- New file hashes and new certificates may need time to build reputation.
- If Defender falsely flags the file as malware, submit the signed installer to
  Microsoft Security Intelligence for analysis.

