// Extract complete public OAuth client identifiers, never credentials.
export function oauthClientIds(body) {
  return [...new Set(body.split(/[^A-Za-z0-9_.-]+/).filter(value =>
    /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(value)))];
}
