// Build-time namespaces; these are data separation, not an origin security boundary.
export const SECURITY_SANDBOX = import.meta.env?.VITE_SAKEFOLIO_SECURITY_TEST === '20261019';
export const LOCAL_DATABASE_NAME = SECURITY_SANDBOX
  ? 'sakefolio-security-test-20261019-international-local-v1'
  : 'sakefolio-international-local-v1';
