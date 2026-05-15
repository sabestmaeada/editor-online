#!/usr/bin/env node
// Quick R2 connection test — run with: node --env-file=.env.local scripts/test-r2.mjs
//
// Tests:
// 1. Connect & list bucket
// 2. Upload a small test object
// 3. Download it back
// 4. Delete it
// 5. Verify gone

import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const required = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("❌ Missing env vars:", missing.join(", "));
  process.exit(1);
}

const Bucket = process.env.R2_BUCKET;
const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const TEST_KEY = `_connection-test/${Date.now()}.txt`;
const TEST_CONTENT = `R2 connection test from online-editor @ ${new Date().toISOString()}`;

function ok(msg) {
  console.log("  ✓", msg);
}
function fail(msg, err) {
  console.error("  ✗", msg);
  if (err) console.error("    →", err.name + ":", err.message);
  process.exit(1);
}

console.log(`\n🔌 R2 connection test`);
console.log(`   Endpoint: ${process.env.R2_ENDPOINT}`);
console.log(`   Bucket:   ${Bucket}`);
console.log(`   Test key: ${TEST_KEY}\n`);

// 1. List bucket (smoke test — also verifies access)
console.log("1. List bucket objects (smoke test)");
try {
  const res = await client.send(
    new ListObjectsV2Command({ Bucket, MaxKeys: 5 }),
  );
  ok(`Connected. Bucket has ${res.KeyCount ?? 0} object(s) (showing up to 5)`);
  if (res.Contents) {
    for (const obj of res.Contents) {
      console.log(`    - ${obj.Key} (${obj.Size} bytes)`);
    }
  }
} catch (err) {
  fail("List failed", err);
}

// 2. Upload
console.log("\n2. Upload test object");
try {
  await client.send(
    new PutObjectCommand({
      Bucket,
      Key: TEST_KEY,
      Body: TEST_CONTENT,
      ContentType: "text/plain",
    }),
  );
  ok(`Uploaded ${TEST_CONTENT.length} bytes`);
} catch (err) {
  fail("Upload failed", err);
}

// 3. HEAD (verify exists)
console.log("\n3. HEAD object (verify exists)");
try {
  const head = await client.send(
    new HeadObjectCommand({ Bucket, Key: TEST_KEY }),
  );
  ok(`Exists. Size=${head.ContentLength}, ContentType=${head.ContentType}`);
} catch (err) {
  fail("HEAD failed", err);
}

// 4. Download
console.log("\n4. Download object back");
try {
  const get = await client.send(
    new GetObjectCommand({ Bucket, Key: TEST_KEY }),
  );
  const body = await get.Body.transformToString();
  if (body === TEST_CONTENT) {
    ok(`Content matches (${body.length} bytes)`);
  } else {
    fail(`Content mismatch! Expected ${TEST_CONTENT.length}, got ${body.length}`);
  }
} catch (err) {
  fail("Download failed", err);
}

// 5. Delete
console.log("\n5. Delete test object (cleanup)");
try {
  await client.send(new DeleteObjectCommand({ Bucket, Key: TEST_KEY }));
  ok("Deleted");
} catch (err) {
  fail("Delete failed", err);
}

console.log("\n✅ All R2 operations succeeded — bucket is ready to use!\n");
