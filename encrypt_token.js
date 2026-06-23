// encrypt_token.js — apne project root mein banao
require('dotenv').config();
const { encrypt } = require('./config/encryption');

const realToken = process.argv[2]; // command line se token lo

if (!realToken) {
  console.error('Usage: node encrypt_token.js "YOUR_ACTUAL_META_TOKEN"');
  process.exit(1);
}

const encrypted = encrypt(realToken);
console.log('Encrypted value:');
console.log(encrypted);