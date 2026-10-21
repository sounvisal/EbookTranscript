const fs = require('fs');
const path = require('path');

async function testPost() {
  const filePath = path.join(__dirname, 'test_5mb.mp4');
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'video/mp4' });
  const formData = new FormData();
  formData.append('file', blob, 'test_5mb.mp4');

  console.log('Posting 5MB video directly to /api/transcribe with x-stream: 1...');
  const t0 = Date.now();
  
  // Note: /api/transcribe requires session. Let's inspect how auth is checked in /api/transcribe:
}
