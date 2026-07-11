import process from 'node:process';

const certificateLink = process.env.WIN_CSC_LINK || process.env.CSC_LINK || '';
const certificatePassword = process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD || '';
const certificateName = process.env.CSC_NAME || '';

const pfxReady = Boolean(certificateLink && certificatePassword);
const storeReady = Boolean(certificateName);

if (certificateLink && !certificatePassword) {
  process.stderr.write(
    'Signing credentials are incomplete: a CSC certificate link was provided without its key password.\n',
  );
  process.exit(1);
}

if (!pfxReady && !storeReady) {
  process.stderr.write(
    'Trusted Windows signing credentials are required. Set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD, or set CSC_NAME for a certificate-store/token identity. Unsigned development builds remain available through npm run package.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `Signing credential source detected: ${pfxReady ? 'secure PFX/CSC link' : 'Windows certificate store or hardware token'}. Certificate contents were not read or printed.\n`,
);
