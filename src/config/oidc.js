const { Issuer, generators } = require('openid-client');

let client;
const rawId = process.env.LINKEDIN_CLIENT_ID;
const rawSecret = process.env.LINKEDIN_CLIENT_SECRET;
const id = (rawId || '').trim();
const secret = (rawSecret || '').trim();
if (!id) throw new Error('Missing LINKEDIN_CLIENT_ID');
if (!secret) throw new Error('Missing LINKEDIN_CLIENT_SECRET');

console.log('[OIDC] LinkedIn client_id:', id);
console.log('[OIDC] client_secret: [redacted], length:', secret.length);
async function initOidcClient() {
  if (client) return client;

  const redirectUri = process.env.LINKEDIN_CALLBACK_URL;
  if (!redirectUri) {
    throw new Error('Missing LINKEDIN_CALLBACK_URL for OIDC');
  }

  const issuer = process.env.OIDC_ISSUER;
  const authorization_endpoint = process.env.OIDC_AUTHORIZATION_ENDPOINT;
  const token_endpoint = process.env.OIDC_TOKEN_ENDPOINT;
  const jwks_uri = process.env.OIDC_JWKS_URI;
  const userinfo_endpoint = process.env.OIDC_USERINFO_ENDPOINT; // optional

  if (!issuer || !authorization_endpoint || !token_endpoint || !jwks_uri) {
    throw new Error('Missing OIDC endpoint env vars. Require OIDC_ISSUER, OIDC_AUTHORIZATION_ENDPOINT, OIDC_TOKEN_ENDPOINT, OIDC_JWKS_URI');
  }

  const issuerMeta = new Issuer({
    issuer,
    authorization_endpoint,
    token_endpoint,
    jwks_uri,
    userinfo_endpoint
  });

  let tokenAuthMethod = (process.env.OIDC_TOKEN_AUTH_METHOD || 'client_secret_post').trim();
  // LinkedIn expects client_id and client_secret in the POST body
  if (issuer && issuer.includes('linkedin.com')) {
    tokenAuthMethod = 'client_secret_post';
  }

  client = new issuerMeta.Client({
    client_id: id,
    client_secret: secret,
    redirect_uris: [redirectUri],
    response_types: ['code'],
    token_endpoint_auth_method: tokenAuthMethod
  });
  console.log('[OIDC] token_endpoint_auth_method:', tokenAuthMethod);
  return client;
}

function getClient() {
  if (!client) {
    throw new Error('OIDC client not initialized. Call initOidcClient() during startup.');
  }
  return client;
}

module.exports = {
  initOidcClient,
  getClient,
  generators
};


