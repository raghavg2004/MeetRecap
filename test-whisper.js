const https = require('https');
const fs = require('fs');

// Use existing temp webm files
const files = fs.readdirSync('.').filter(f => f.endsWith('.webm'));
if (!files.length) { console.log('No .webm test files found'); process.exit(1); }
const filePath = files[0];
const buffer = fs.readFileSync(filePath);
console.log('Testing with:', filePath, 'size:', buffer.length, 'bytes');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || require('dotenv').config() && process.env.OPENAI_API_KEY;
require('dotenv').config();
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) { console.error('No OPENAI_API_KEY in .env'); process.exit(1); }

const boundary = '----WhisperTest' + Date.now().toString(16);
const CRLF = '\r\n';

const headerPart = Buffer.from(
  '--' + boundary + CRLF +
  'Content-Disposition: form-data; name="file"; filename="audio.webm"' + CRLF +
  'Content-Type: audio/webm' + CRLF +
  CRLF
);

const modelPart = Buffer.from(
  CRLF + '--' + boundary + CRLF +
  'Content-Disposition: form-data; name="model"' + CRLF +
  CRLF +
  'whisper-1' + CRLF +
  '--' + boundary + CRLF +
  'Content-Disposition: form-data; name="response_format"' + CRLF +
  CRLF +
  'json' + CRLF +
  '--' + boundary + '--' + CRLF
);

const body = Buffer.concat([headerPart, buffer, modelPart]);
console.log('Sending', body.length, 'bytes to Whisper API...');

const opts = {
  hostname: 'api.openai.com',
  port: 443,
  path: '/v1/audio/transcriptions',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': body.length,
  },
};

const req = https.request(opts, (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    try {
      const j = JSON.parse(raw);
      if (j.error) console.error('Whisper Error:', j.error.message);
      else console.log('Transcript:', j.text || '(empty - no speech in file)');
    } catch {
      console.log('Raw response:', raw);
    }
  });
});
req.on('error', e => console.error('Network error:', e.message));
req.write(body);
req.end();
