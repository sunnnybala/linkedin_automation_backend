const passport = require('passport');
const { Strategy: LinkedInStrategy } = require('passport-linkedin-oauth2');
const { User } = require('../models');
// Serialize/deserialize user for OAuth flow
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(new LinkedInStrategy(
  {
    clientID: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackURL: process.env.LINKEDIN_CALLBACK_URL,
    scope: ['openid', 'profile', 'email', 'w_member_social'],
    state: true,
    // Important for some versions: request these fields
    profileFields: [
      'id',
      'first-name',
      'last-name',
      'displayName',
      'photos',
      'email-address'
    ]
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log(profile);
      const email =
        Array.isArray(profile.emails) && profile.emails[0]
          ? profile.emails[0].value
          : null;

      const given = profile.name?.givenName || '';
      const family = profile.name?.familyName || '';
      const name = `${given} ${family}`.trim() || profile.displayName || 'LinkedIn User';

      const photo =
        Array.isArray(profile.photos) && profile.photos[0]
          ? profile.photos[0].value
          : null;

      const [user, created] = await User.findOrCreate({
        where: { linkedinId: profile.id },
        defaults: { email, name, accessToken, refreshToken, profilePicture: photo }
      });

      if (!created) {
        user.accessToken = accessToken;
        user.refreshToken = refreshToken;
        await user.save();
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }

));


module.exports = passport;



