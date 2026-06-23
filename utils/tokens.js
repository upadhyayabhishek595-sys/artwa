const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const issueRefreshToken = async (userId, userType) => {
  const token = jwt.sign(
    { id: userId, type: 'refresh', user_type: userType },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await pool.execute(
    `INSERT INTO refresh_tokens (token, user_id, user_type, expires_at)
     VALUES (?, ?, ?, ?)`,
    [token, userId, userType, expiresAt]
  );

  return token;
};

const sendAuthResponse = async (res, { accessPayload, user, userType, message = 'Login successful' }) => {
  const token = signAccessToken(accessPayload);
  let refresh_token = null;

  try {
    refresh_token = await issueRefreshToken(accessPayload.id, userType);
  } catch (err) {
    console.warn('⚠️ Refresh token not issued:', err.message);
  }

  res.json({
    success: true,
    message,
    token,
    refresh_token,
    user,
  });
};

module.exports = { signAccessToken, issueRefreshToken, sendAuthResponse };
