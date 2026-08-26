#!/usr/bin/env node
/**
 * B2 Upload Forensic Diagnostic
 * ─────────────────────────────
 * Runs 4 test uploads against B2 S3-compatible API and captures the raw
 * HTTP response BEFORE the AWS SDK converts it into a generic error.
 *
 * Test matrix:
 *   A — 10 KB  via AWS SDK S3Client
 *   B — 8.8 MB via AWS SDK S3Client  (reproduces production path)
 *   C — 10 KB  via raw https.request + SigV4
 *   D — 8.8 MB via raw https.request + SigV4
 *
 * Usage:
 *   B2_ACCOUNT_ID=xxx B2_APPLICATION_KEY=xxx B2_BUCKET_NAME=xxx \
 *   B2_ENDPOINT=https://s3.ca-east-006.backblazeb2.com \
 *   node server/scripts/b2-diag.js
 */

import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/core/protocols';
import https from 'node:https';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const {
  B2_ACCOUNT_ID,
  B2_APPLICATION_KEY,
  B2_BUCKET_NAME,
  B2_ENDPOINT,
} = process.env;

const TINY_SIZE  = 10 * 1024;   // 10 KB
const LARGE_SIZE = 8_832_102;    // exact production file size
const TEST_PREFIX = '__diag-test__';

const results = { A: null, B: null, C: null, D: null };

// ═══════════════════════════════════════════════════════════════════
// Sha256 hasher compatible with @smithy/signature-v4
// ═══════════════════════════════════════════════════════════════════

class Sha256 {
  constructor(secret) {
    if (secret) { this.hmac = crypto.createHmac('sha256', secret); }
    else        { this.hash = crypto.createHash('sha256'); }
  }
  update(data) { (this.hmac || this.hash).update(data); return this; }
  async digest() { return new Uint8Array((this.hmac || this.hash).digest()); }
}

// ═══════════════════════════════════════════════════════════════════
// Component 1 — Diagnostic HTTP Handler
//   Wraps NodeHttpHandler. After the inner handler resolves, reads
//   the entire response body into a Buffer, logs it, then replaces
//   response.body with a new Readable so the SDK deserializer can
//   still drain it normally.
// ═══════════════════════════════════════════════════════════════════

class DiagnosticHandler extends NodeHttpHandler {
  constructor(config) {
    super(config);
    this._lastRaw = null;
  }

  async handle(request, options) {
    const t0 = Date.now();
    const result = await super.handle(request, options);
    const elapsed = Date.now() - t0;
    const response = result.response;

    if (response && response.body) {
      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      const bodyBuffer = Buffer.concat(chunks);
      const bodyText = bodyBuffer.toString('utf-8');

      this._lastRaw = {
        statusCode: response.statusCode,
        headers: { ...response.headers },
        bodyText,
        bodyLength: bodyBuffer.length,
        elapsed,
      };

      // Replace body so SDK deserializer can still read it
      response.body = Readable.from([bodyBuffer]);
    }

    return result;
  }

  getLastRaw() { return this._lastRaw; }
  clearLastRaw() { this._lastRaw = null; }
}

// ═══════════════════════════════════════════════════════════════════
// Component 2 — SigV4 Signer
// ═══════════════════════════════════════════════════════════════════

const signer = new SignatureV4({
  credentials: {
    accessKeyId:     B2_ACCOUNT_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
  region:    'auto',
  service:   's3',
  sha256:    Sha256,
});

// ═══════════════════════════════════════════════════════════════════
// Component 3 — Direct HTTP PUT (bypasses SDK entirely)
// ═══════════════════════════════════════════════════════════════════

function directHttpPut(key, body, contentType) {
  const endpointUrl = new URL(B2_ENDPOINT);
  const hostname    = endpointUrl.hostname;
  const port        = endpointUrl.port || 443;
  const path        = `/${B2_BUCKET_NAME}/${key}`;
  const bodyLength  = Buffer.byteLength(body);

  // Build headers for signing (UNSIGNED-PAYLOAD avoids hashing 8.8 MB)
  const headers = {
    'host':                  hostname,
    'content-type':          contentType,
    'content-length':        String(bodyLength),
    'x-amz-content-sha256':  'UNSIGNED-PAYLOAD',
  };

  const unsignedRequest = new HttpRequest({
    method:   'PUT',
    hostname,
    port,
    path,
    headers,
    body,
  });

  return signer.signRequest(unsignedRequest).then((signedRequest) => {
    const signedHeaders = { ...signedRequest.headers };

    // Log headers (redact Authorization)
    const logHeaders = {};
    for (const [k, v] of Object.entries(signedHeaders)) {
      logHeaders[k] = k === 'authorization' ? v.substring(0, 60) + '…' : v;
    }
    console.log(`  [DIRECT] path=${path} content_length=${bodyLength}`);
    console.log(`  [DIRECT] signed headers: ${Object.keys(signedHeaders).join(', ')}`);

    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        port,
        path,
        method: 'PUT',
        headers: signedHeaders,
      };

      const req = https.request(options, (res) => {
        const resChunks = [];
        res.on('data', (chunk) => resChunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(resChunks).toString('utf-8');
          resolve({
            statusCode: res.statusCode,
            headers: { ...res.headers },
            body: responseBody,
            bodyLength: resChunks.reduce((sum, c) => sum + c.length, 0),
          });
        });
      });

      req.on('error', reject);

      // Track body transmission
      let bytesScheduled = 0;
      req.on('drain', () => {
        console.log(`  [DIRECT] drain event fired`);
      });

      const writeResult = req.write(body);
      bytesScheduled = bodyLength;
      console.log(`  [DIRECT] req.write() returned: ${writeResult} (all ${bodyLength} bytes scheduled: ${writeResult})`);

      req.on('finish', () => {
        console.log(`  [DIRECT] finish event fired (request fully queued to kernel)`);
      });

      req.end();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// Component 4 — Test runners
// ═══════════════════════════════════════════════════════════════════

async function runSdkTest(label, key, body, contentType, diagnosticHandler) {
  diagnosticHandler.clearLastRaw();
  const t0 = Date.now();
  let outcome = 'PASS';
  let errorMsg = null;
  let errorCode = null;
  let errorMeta = null;

  try {
    const cmd = new PutObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await diagnosticHandler._sdkClient.send(cmd);
    console.log(`  [SDK] PUT succeeded`);
  } catch (err) {
    outcome = 'FAIL';
    errorMsg = err.message;
    errorCode = err.Code || err.name;
    errorMeta = err.$metadata || null;
    console.log(`  [SDK] PUT failed: code=${errorCode} msg=${errorMsg}`);
    if (errorMeta) {
      console.log(`  [SDK] $metadata: status=${errorMeta.httpStatusCode} requestId=${errorMeta.requestId} extRequestId=${errorMeta.extendedRequestId}`);
    }
  }

  const elapsed = Date.now() - t0;
  const raw = diagnosticHandler.getLastRaw();

  // Try HeadObject to see if partial upload landed
  let headResult = null;
  try {
    const head = await diagnosticHandler._sdkClient.send(new HeadObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
    headResult = { exists: true, contentLength: head.ContentLength };
  } catch (headErr) {
    headResult = { exists: false, error: headErr.message };
  }

  return {
    label,
    size: Buffer.byteLength(body),
    outcome,
    errorCode,
    errorMsg,
    errorMeta,
    rawResponse: raw,
    headResult,
    elapsed,
  };
}

async function runDirectTest(label, key, body, contentType) {
  const t0 = Date.now();
  let outcome = 'PASS';
  let response = null;

  try {
    response = await directHttpPut(key, body, contentType);
    if (response.statusCode >= 300) {
      outcome = 'FAIL';
    }
    console.log(`  [DIRECT] response: status=${response.statusCode} body_length=${response.bodyLength}`);
    if (response.statusCode >= 300) {
      console.log(`  [DIRECT] body: ${response.body.substring(0, 500)}`);
    }
  } catch (err) {
    outcome = 'ERROR';
    response = { error: err.message, code: err.code };
    console.log(`  [DIRECT] request error: ${err.message} code=${err.code}`);
  }

  const elapsed = Date.now() - t0;

  // Try HeadObject via SDK to see if partial upload landed
  let headResult = null;
  try {
    const head = await _sdkClient.send(new HeadObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
    headResult = { exists: true, contentLength: head.ContentLength };
  } catch (headErr) {
    headResult = { exists: false, error: headErr.message };
  }

  return {
    label,
    size: Buffer.byteLength(body),
    outcome,
    response,
    headResult,
    elapsed,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Component 5 — Cleanup
// ═══════════════════════════════════════════════════════════════════

async function cleanup(client, keys) {
  for (const key of keys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
      console.log(`  [CLEANUP] deleted ${key}`);
    } catch {
      console.log(`  [CLEANUP] could not delete ${key}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Component 6 — Forensic Report
// ═══════════════════════════════════════════════════════════════════

function printReport() {
  const hr = '═'.repeat(70);
  const sep = '─'.repeat(70);

  console.log('\n' + hr);
  console.log('B2 UPLOAD FORENSIC DIAGNOSTIC REPORT');
  console.log(hr);
  console.log(`Date:            ${new Date().toISOString()}`);
  console.log(`Node.js:         ${process.version}`);
  console.log(`B2 endpoint:     ${B2_ENDPOINT}`);
  console.log(`Bucket:          ${B2_BUCKET_NAME}`);
  console.log(`Body sizes:      tiny=${TINY_SIZE} bytes, large=${LARGE_SIZE} bytes`);
  console.log('');

  for (const test of ['A', 'B', 'C', 'D']) {
    const r = results[test];
    if (!r) continue;
    console.log(sep);
    console.log(`Test ${r.label}`);
    console.log(sep);
    console.log(`  Body size:       ${r.size.toLocaleString()} bytes`);
    console.log(`  Elapsed:         ${r.elapsed}ms`);
    console.log(`  Outcome:         ${r.outcome}`);

    if (r.outcome === 'PASS') {
      console.log(`  B2 status:       200 OK`);
    }

    if (r.errorCode) {
      console.log(`  Error code:      ${r.errorCode}`);
    }
    if (r.errorMsg) {
      console.log(`  Error message:   ${r.errorMsg}`);
    }
    if (r.errorMeta) {
      console.log(`  HTTP status:     ${r.errorMeta.httpStatusCode}`);
      console.log(`  Request ID:      ${r.errorMeta.requestId}`);
      console.log(`  Ext request ID:  ${r.errorMeta.extendedRequestId}`);
    }

    // Raw response from DiagnosticHandler (SDK tests) or direct HTTP
    if (r.rawResponse) {
      console.log(`  Raw B2 status:   ${r.rawResponse.statusCode}`);
      console.log(`  Raw B2 headers:  ${JSON.stringify(r.rawResponse.headers, null, 2).split('\n').join('\n                    ')}`);
      if (r.rawResponse.bodyLength > 0) {
        const preview = r.rawResponse.bodyText.substring(0, 1000);
        console.log(`  Raw B2 body:     ${preview}`);
      }
    } else if (r.response) {
      if (r.response.error) {
        console.log(`  Connection error: ${r.response.error} (code=${r.response.code})`);
      } else {
        console.log(`  Raw B2 status:   ${r.response.statusCode}`);
        console.log(`  Raw B2 headers:  ${JSON.stringify(r.response.headers, null, 2).split('\n').join('\n                    ')}`);
        if (r.response.bodyLength > 0) {
          console.log(`  Raw B2 body:     ${r.response.body.substring(0, 1000)}`);
        }
      }
    }

    // HeadObject verification
    if (r.headResult) {
      if (r.headResult.exists) {
        console.log(`  HeadObject:      EXISTS, Content-Length=${r.headResult.contentLength}`);
      } else {
        console.log(`  HeadObject:      NOT FOUND (${r.headResult.error})`);
      }
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════
  // Analysis
  // ═══════════════════════════════════════════════════════════════
  console.log(sep);
  console.log('ANALYSIS');
  console.log(sep);

  const a = results.A; // tiny SDK
  const b = results.B; // large SDK
  const c = results.C; // tiny direct
  const d = results.D; // large direct

  if (a && b && c && d) {
    const aOk = a.outcome === 'PASS';
    const bOk = b.outcome === 'PASS';
    const cOk = c.outcome === 'PASS';
    const dOk = d.outcome === 'PASS';

    if (aOk && bOk && cOk && dOk) {
      console.log('  All 4 tests PASSED. Issue is not reproducible in this environment.');
      console.log('  Possible causes: transient B2 issue, environment-specific (Render proxy),');
      console.log('  or timing-dependent (connection reuse, keep-alive).');
    } else if (aOk && !bOk && cOk && !dOk) {
      console.log('  Small uploads PASS, large uploads FAIL via both SDK and direct HTTP.');
      console.log('  → ROOT CAUSE IS NOT THE AWS SDK.');
      console.log('  → Issue is either: (a) B2 rejecting large PUTs from this IP/account,');
      console.log('  (b) network truncation (Render proxy, firewall, NAT), or');
      console.log('  (c) B2 endpoint/region configuration mismatch for large payloads.');
    } else if (aOk && !bOk && cOk && dOk) {
      console.log('  Small uploads PASS, large FAIL only via SDK, direct HTTP PASSES.');
      console.log('  → ROOT CAUSE IS IN THE AWS SDK OR ITS CONFIGURATION.');
      console.log('  → Likely: middleware modifying the body, or SDK setting incorrect headers.');
    } else if (aOk && !bOk && !cOk && !dOk) {
      console.log('  Tiny SDK PASSES but everything else FAILS.');
      console.log('  → Direct HTTP is broken for this endpoint/auth configuration.');
      console.log('  → Check SigV4 signing or B2 account permissions.');
    } else if (!aOk && !bOk && !cOk && !dOk) {
      console.log('  ALL tests FAILED.');
      console.log('  → Fundamental issue: credentials, endpoint, bucket, or network connectivity.');
    } else {
      console.log('  Mixed results — see individual test details above.');
    }

    // Compare raw responses between SDK and direct for same size
    if (!bOk && !dOk) {
      console.log('');
      console.log('  SDK vs Direct comparison (large):');
      console.log(`    SDK   status: ${b?.rawResponse?.statusCode ?? b?.errorMeta?.httpStatusCode ?? 'N/A'}`);
      console.log(`    Direct status: ${d?.response?.statusCode ?? 'N/A'}`);
      const sdkCode = b?.errorCode || b?.rawResponse?.bodyText?.match(/<Code>(.*?)<\/Code>/)?.[1];
      const directCode = d?.response?.body?.match(/<Code>(.*?)<\/Code>/)?.[1];
      if (sdkCode && directCode) {
        console.log(`    SDK   error code: ${sdkCode}`);
        console.log(`    Direct error code: ${directCode}`);
        if (sdkCode === directCode) {
          console.log('    → Same error from both methods: confirms B2-side or network issue.');
        } else {
          console.log('    → Different errors: SDK is modifying the request differently.');
        }
      }
    }
  }

  console.log(hr);
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

let _sdkClient;

async function main() {
  // Validate env
  const missing = ['B2_ACCOUNT_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME', 'B2_ENDPOINT']
    .filter((v) => !process.env[v]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('B2 Upload Forensic Diagnostic');
  console.log('─'.repeat(50));
  console.log(`Endpoint:  ${B2_ENDPOINT}`);
  console.log(`Bucket:    ${B2_BUCKET_NAME}`);
  console.log(`Account:   ${B2_ACCOUNT_ID.substring(0, 4)}…`);
  console.log(`Tiny size: ${TINY_SIZE} bytes`);
  console.log(`Large size: ${LARGE_SIZE} bytes`);
  console.log('');

  // Build test buffers
  console.log('Building test buffers…');
  const tinyBuf  = Buffer.alloc(TINY_SIZE, 0xAB);
  const largeBuf = Buffer.alloc(LARGE_SIZE, 0xCD);
  console.log(`  tiny:  ${tinyBuf.length} bytes, first 8 bytes: ${tinyBuf.subarray(0, 8).toString('hex')}`);
  console.log(`  large: ${largeBuf.length} bytes, first 8 bytes: ${largeBuf.subarray(0, 8).toString('hex')}`);
  console.log('');

  // Verify buffer integrity
  console.log('Buffer integrity check:');
  console.log(`  tinyBuf.length === ${TINY_SIZE}: ${tinyBuf.length === TINY_SIZE}`);
  console.log(`  tinyBuf byteCount (Buffer.byteLength): ${Buffer.byteLength(tinyBuf)}`);
  console.log(`  largeBuf.length === ${LARGE_SIZE}: ${largeBuf.length === LARGE_SIZE}`);
  console.log(`  largeBuf byteCount (Buffer.byteLength): ${Buffer.byteLength(largeBuf)}`);

  // Verify Content-Length would match
  console.log(`  String(largeBuf.length) = "${String(largeBuf.length)}" (what SDK sets as Content-Length)`);
  console.log('');

  // Set up S3 client with diagnostic handler
  const diagnosticHandler = new DiagnosticHandler({
    requestTimeout: 120_000,
    connectionTimeout: 10_000,
  });

  _sdkClient = new S3Client({
    endpoint: B2_ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    expectContinueHeader: false,
    requestHandler: diagnosticHandler,
    credentials: {
      accessKeyId:     B2_ACCOUNT_ID,
      secretAccessKey: B2_APPLICATION_KEY,
    },
  });
  diagnosticHandler._sdkClient = _sdkClient;

  const ts = Date.now();
  const keys = [];
  const contentType = 'audio/mpeg';

  // ── Test A: Tiny via SDK ──
  {
    const key = `${TEST_PREFIX}tiny-sdk-${ts}`;
    keys.push(key);
    console.log('━'.repeat(50));
    console.log('TEST A: 10 KB via AWS SDK S3Client');
    console.log('━'.repeat(50));
    results.A = await runSdkTest('A: 10 KB via SDK', key, tinyBuf, contentType, diagnosticHandler);
    console.log('');
  }

  // ── Test B: Large via SDK ──
  {
    const key = `${TEST_PREFIX}large-sdk-${ts}`;
    keys.push(key);
    console.log('━'.repeat(50));
    console.log('TEST B: 8.8 MB via AWS SDK S3Client (production path)');
    console.log('━'.repeat(50));
    results.B = await runSdkTest('B: 8.8 MB via SDK', key, largeBuf, contentType, diagnosticHandler);
    console.log('');
  }

  // ── Test C: Tiny via Direct HTTP ──
  {
    const key = `${TEST_PREFIX}tiny-direct-${ts}`;
    keys.push(key);
    console.log('━'.repeat(50));
    console.log('TEST C: 10 KB via raw https.request + SigV4');
    console.log('━'.repeat(50));
    results.C = await runDirectTest('C: 10 KB via direct HTTP', key, tinyBuf, contentType);
    console.log('');
  }

  // ── Test D: Large via Direct HTTP ──
  {
    const key = `${TEST_PREFIX}large-direct-${ts}`;
    keys.push(key);
    console.log('━'.repeat(50));
    console.log('TEST D: 8.8 MB via raw https.request + SigV4 (key comparison test)');
    console.log('━'.repeat(50));
    results.D = await runDirectTest('D: 8.8 MB via direct HTTP', key, largeBuf, contentType);
    console.log('');
  }

  // ── Print forensic report ──
  printReport();

  // ── Cleanup uploaded test objects ──
  console.log('\nCleaning up test objects…');
  await cleanup(_sdkClient, keys);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
