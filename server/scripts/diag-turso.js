#!/usr/bin/env node
/**
 * Diagnostic: tests Turso cursor vs pipeline endpoints independently.
 *
 * Usage:  node scripts/diag-turso.js
 * Requires: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars.
 */

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!url || !token) {
    console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
    process.exit(1);
  }

  const httpUrl = url.replace(/^(libsql|turso):\/\//, 'https://');
  console.log(`URL: ${httpUrl}`);
  console.log('');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // ── Test 1: Pipeline endpoint (/v3/pipeline) ──
  console.log('=== Test 1: /v3/pipeline ===');
  try {
    const pipelineReq = {
      requests: [
        { type: 'sequence', sql: 'SELECT 1 AS ok' },
        { type: 'get_autocommit' }
      ]
    };
    const pipelineRes = await fetch(`${httpUrl}/v3/pipeline`, {
      method: 'POST',
      headers,
      body: JSON.stringify(pipelineReq)
    });
    console.log(`  Status: ${pipelineRes.status}`);
    if (pipelineRes.ok) {
      const data = await pipelineRes.json();
      console.log(`  Results: ${JSON.stringify(data.results?.map(r => r.type))}`);
      console.log(`  baton present: ${!!data.baton}`);
      console.log(`  base_url: ${data.base_url || '(none)'}`);
    } else {
      console.log(`  Body: ${await pipelineRes.text()}`);
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }

  console.log('');

  // ── Test 2: Cursor endpoint (/v3/cursor) ──
  console.log('=== Test 2: /v3/cursor ===');
  try {
    const cursorReq = {
      batch: {
        steps: [
          { stmt: { sql: 'SELECT 1 AS ok', args: [], named_args: [], want_rows: true } }
        ]
      }
    };
    const cursorRes = await fetch(`${httpUrl}/v3/cursor`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cursorReq)
    });
    console.log(`  Status: ${cursorRes.status}`);
    if (cursorRes.ok) {
      const text = await cursorRes.text();
      const firstLine = text.split('\n')[0];
      console.log(`  First response line: ${firstLine.substring(0, 200)}`);
    } else {
      console.log(`  Body: ${await cursorRes.text()}`);
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }

  console.log('');

  // ── Test 3: Pipeline with SELECT query + bind params ──
  console.log('=== Test 3: /v3/pipeline with SELECT + params ===');
  try {
    const pipelineReq = {
      requests: [
        {
          type: 'sequence',
          sql: 'SELECT id, title FROM tracks LIMIT 1'
        },
        { type: 'get_autocommit' }
      ]
    };
    const pipelineRes = await fetch(`${httpUrl}/v3/pipeline`, {
      method: 'POST',
      headers,
      body: JSON.stringify(pipelineReq)
    });
    console.log(`  Status: ${pipelineRes.status}`);
    if (pipelineRes.ok) {
      const data = await pipelineRes.json();
      const seqResult = data.results?.[0];
      console.log(`  Result type: ${seqResult?.type}`);
      if (seqResult?.response?.result) {
        const r = seqResult.response.result;
        console.log(`  Columns: ${r.cols?.map(c => c.name).join(', ') || '(none)'}`);
        console.log(`  Rows: ${r.rows?.length || 0}`);
      } else {
        console.log(`  Full result: ${JSON.stringify(seqResult).substring(0, 300)}`);
      }
    } else {
      console.log(`  Body: ${await pipelineRes.text()}`);
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
