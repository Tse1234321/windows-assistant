# ADR-0001: Fail-closed Windows release signing

- Date: 2026-07-11
- Status: amended 2026-07-11

## Context

The project must continue to support unsigned local development packages, while a public tag release must never silently publish an unsigned installer. Signing keys and certificates are external publisher credentials and cannot be stored in the repository.

## Decision

- `npm run package` and `npm run package:dir` remain unsigned-capable development commands.
- `npm run package:signed` and `npm run release:signed` first execute `scripts/check-signing-env.mjs` and then run electron-builder with `forceCodeSigning=true`.
- Accepted credential sources are electron-builder's `WIN_CSC_LINK` plus `WIN_CSC_KEY_PASSWORD` pair, compatible `CSC_*` variables, or `CSC_NAME` for a certificate-store/hardware-token identity.
- The tag release workflow uses `release:signed` when GitHub Actions signing secrets are present; otherwise it explicitly uses `release:unsigned` and must disclose that status in the release notes.
- `.pfx`, `.p12`, PEM, and key files are ignored by Git.

## Consequences

- Contributors can still build and install an unsigned local package without owning a certificate.
- Explicit signed commands still fail clearly until trusted signing secrets are configured; the public tag workflow may publish an explicitly labelled unsigned installer when the user has chosen availability over publisher trust.
- Unsigned public releases can trigger SmartScreen warnings and do not provide publisher identity or accumulated reputation.
- A successful build is not sufficient evidence of trust; release validation must still verify both the installer and unpacked executable with `Get-AuthenticodeSignature` and confirm the expected publisher subject.
- The repository contains no certificate, private key, password, signing token, or fabricated publisher identity.

- Revisit when: the publisher adopts Microsoft Trusted Signing/Artifact Signing or another hardware-backed service requiring a different electron-builder signing adapter.
