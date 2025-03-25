const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const config = require('../config/config');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: `${config.clientUrl}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0]?.value;
        if (!email) {
          return done(new Error('Không thể lấy email từ Google'));
        }
        const user = {
          googleId: profile.id,
          email: email,
          displayName: profile.displayName,
        };
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Facebook Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: config.facebook.clientId,
      clientSecret: config.facebook.clientSecret,
      callbackURL: `${config.clientUrl}/api/auth/facebook/callback`,
      profileFields: ['id', 'displayName', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0]?.value;
        if (!email) {
          return done(new Error('Không thể lấy email từ Facebook'));
        }
        const user = {
          facebookId: profile.id,
          email: email,
          displayName: profile.displayName,
        };
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);