import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Testing LocalTune Music Uploader (Port 5050) ---');

try {
  // Test GET upload page
  const pageRes = await fetch('http://localhost:5050/');
  console.log('[Test] GET http://localhost:5050/ status:', pageRes.status);
  const text = await pageRes.text();
  if (pageRes.status === 200 && text.includes('LocalTune Uploader')) {
    console.log('✓ Upload web page rendered successfully!');
  } else {
    throw new Error('Upload page failed to render expected HTML content');
  }

  console.log('✅ Uploader test completed successfully!');
  process.exit(0);
} catch (err) {
  console.error('❌ Uploader test failed:', err);
  process.exit(1);
}
