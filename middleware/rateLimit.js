const rateLimit = require('express-rate-limit');

// Strict limiter for login endpoints — 5 attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              5,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

// Moderate limiter for password change — 3 attempts per hour
const passwordLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,
  max:              3,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: { success: false, message: 'Too many password change attempts. Please try again in 1 hour.' },
});

// General API limiter — 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

module.exports = { loginLimiter, passwordLimiter, apiLimiter };