const express = require('express');
const router = express.Router();
const { generateToken } = require('../middleware/auth');
const { User } = require('../models');
const jwt = require('jsonwebtoken');
const { getClient, generators } = require('../config/oidc');

// Initiate LinkedIn OIDC flow (Authorization Code; PKCE optional)
router.get('/linkedin', async (req, res, next) => {
  try {
    const client = getClient();
    const state = generators.state();
    const nonce = generators.nonce();

    const enablePkce = String(process.env.OIDC_ENABLE_PKCE || 'true').toLowerCase() !== 'false';
    let codeVerifier;
    let codeChallenge;
    if (enablePkce) {
      codeVerifier = generators.codeVerifier();
      codeChallenge = generators.codeChallenge(codeVerifier);
    }

    req.session.oidc = { state, nonce, codeVerifier };

    const scope = (process.env.LINKEDIN_SCOPES || 'openid profile email w_member_social')
      .split(/\s+/)
      .filter(Boolean)
      .join(' ');

    const authParams = { scope, state, nonce };
    if (enablePkce && codeChallenge) {
      authParams.code_challenge = codeChallenge;
      authParams.code_challenge_method = 'S256';
    }
    const authorizationUrl = client.authorizationUrl(authParams);

    res.redirect(authorizationUrl);
  } catch (err) {
    next(err);
  }
});

// LinkedIn OIDC callback
router.get('/linkedin/callback', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'development') console.log('step 1 done');
    const client = getClient();
    const params = client.callbackParams(req);
    if (process.env.NODE_ENV === 'development') console.log('step 2 done');
    const { state, nonce, codeVerifier } = req.session.oidc || {};
    const enablePkce = String(process.env.OIDC_ENABLE_PKCE || 'true').toLowerCase() !== 'false';
    if (!state || !nonce || (enablePkce && !codeVerifier)) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/?error=session_expired`);
    }
    if (process.env.NODE_ENV === 'development') console.log('step 3 done');
    // Avoid logging the whole client (may include secrets)
    if (process.env.NODE_ENV === 'development') {
      console.log('process.env.LINKEDIN_CALLBACK_URL', process.env.LINKEDIN_CALLBACK_URL);
      console.log('state', state);
      console.log('nonce', nonce);
      console.log('pkce?', Boolean(codeVerifier));
    }
    const checks = { state, nonce };
    if (enablePkce && codeVerifier) {
      checks.code_verifier = codeVerifier;
    }
    let tokenSet;
    try {
      tokenSet = await client.callback(process.env.LINKEDIN_CALLBACK_URL, params, checks);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.log('error in callback doing curl', err.message);
      // Fallback: do direct token exchange like working curl in case of client auth quirks
      const isInvalidClient = err?.error === 'invalid_client' || err?.message?.includes('invalid_client');
      if (!isInvalidClient) throw err;

      const formData = new URLSearchParams();
      formData.append('grant_type', 'authorization_code');
      formData.append('code', params.code);
      formData.append('client_id', process.env.LINKEDIN_CLIENT_ID);
      formData.append('client_secret', process.env.LINKEDIN_CLIENT_SECRET);
      formData.append('redirect_uri', process.env.LINKEDIN_CALLBACK_URL);

      const fetch = (await import('node-fetch')).default;
      const resp = await fetch(process.env.OIDC_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`LinkedIn token fallback failed: ${resp.status} ${text}`);
      }
      const json = await resp.json();
      // Normalize to tokenSet-like shape for downstream usage
      tokenSet = {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        id_token: json.id_token,
        expires_in: json.expires_in,
        claims: () => {
          // If id_token exists, openid-client would normally decode; here we rely on userinfo below
          return {};
        }
      };
    }
    if (process.env.NODE_ENV === 'development') console.log('step 4 done');
    let claims = tokenSet.claims?.() || {};
    if (process.env.NODE_ENV === 'development') console.log('step 5 done');
    // When fallback path was used, we may not have claims; use userinfo
    if ((!claims || !claims.sub) && process.env.OIDC_USERINFO_ENDPOINT) {
      try {
        const fetch = (await import('node-fetch')).default;
        const uiResp = await fetch(process.env.OIDC_USERINFO_ENDPOINT, {
          headers: { Authorization: `Bearer ${tokenSet.access_token}` }
        });
        if (uiResp.ok) {
          claims = await uiResp.json();
        }
      } catch (_) {
        // ignore userinfo failures; proceed with minimal info
      }
    }
    if (process.env.NODE_ENV === 'development') console.log('step 6 done');
    const sub = claims.sub;
    const name = claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || 'LinkedIn User';
    const email = typeof claims.email === 'string' && (claims.email_verified === true || typeof claims.email_verified === 'undefined') ? claims.email : null;
    const picture = claims.picture || null;
    if (process.env.NODE_ENV === 'development') console.log('step 7 done');
    let user = await User.findOne({ where: { linkedinId: sub } });
    if (process.env.NODE_ENV === 'development') console.log('step 8 done');
    if (!user) {
      if (process.env.NODE_ENV === 'development') console.log('step 9 done');
      // Try by openidSub if field exists later; for now reuse linkedinId field
      user = await User.create({
        linkedinId: sub,
        email: email || null,
        name,
        accessToken: tokenSet.access_token,
        refreshToken: tokenSet.refresh_token || null,
        profilePicture: picture
      });
    } else {
      if (process.env.NODE_ENV === 'development') console.log('step 10 done');
      user.accessToken = tokenSet.access_token;
      user.refreshToken = tokenSet.refresh_token || null;
      await user.save();
    }
    if (process.env.NODE_ENV === 'development') console.log('step 11 done');
    req.session.oidc = null;
    if (process.env.NODE_ENV === 'development') console.log('step 12 done');
    const appToken = generateToken(user);
    if (process.env.NODE_ENV === 'development') console.log('step 13 done');
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${appToken}`);
    if (process.env.NODE_ENV === 'development') console.log('step 14 done');
  } catch (e) {
    console.error('OIDC callback error:', e);
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/?error=auth_failed`);
  }
});

// Get current user
const { authenticateJWT } = require('../middleware/auth');

router.get('/me', authenticateJWT, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['accessToken', 'refreshToken', 'createdAt', 'updatedAt'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get current user error:', error);
    next(error);
  }
});

// Logout
router.post('/logout', (req, res) => {
  // Since we're using JWT, logout is handled client-side by removing the token
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
