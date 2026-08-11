import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPollyProps,
  POLLY_VOICE_SUGGESTIONS,
  pollySha256Hex,
  pollyHmacRaw,
  pollyDeriveSigningKey,
  buildCanonicalRequest,
  buildStringToSign,
  buildAuthorizationHeader,
  buildPollySignedRequest,
} from './polly-tts.js';

test('defaultPollyProps defaults to the free browser provider, not Polly', () => {
  const p = defaultPollyProps();
  assert.equal(p.ttsProvider, 'browser');
  assert.equal(p.pollyAccessKeyId, '');
  assert.equal(p.pollySecretAccessKey, '');
  assert.equal(p.pollyRegion, 'us-east-1');
  assert.equal(p.pollyVoiceId, 'Joanna');
  assert.equal(p.pollyEngine, 'neural');
});

test('POLLY_VOICE_SUGGESTIONS includes the voices from the StreamElements screenshots', () => {
  for (const name of ['Joanna', 'Matthew', 'Ivy', 'Kendra', 'Kimberly', 'Justin', 'Joey', 'Salli']) {
    assert.ok(POLLY_VOICE_SUGGESTIONS.includes(name), `expected ${name} in suggestions`);
  }
});

// SHA-256 known test vectors (NIST / widely published)
test('pollySha256Hex matches known SHA-256 vectors', async () => {
  assert.equal(await pollySha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await pollySha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

// HMAC-SHA256 RFC 4231 Test Case 1
test('pollyHmacRaw matches the RFC 4231 HMAC-SHA256 test vector', async () => {
  const key = new Uint8Array(20).fill(0x0b);
  const raw = await pollyHmacRaw(key, 'Hi There');
  const hex = Buffer.from(raw).toString('hex');
  assert.equal(hex, 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
});

test('pollyDeriveSigningKey is deterministic for the same inputs', async () => {
  const a = await pollyDeriveSigningKey('secret123', '20260810', 'us-east-1', 'polly');
  const b = await pollyDeriveSigningKey('secret123', '20260810', 'us-east-1', 'polly');
  assert.equal(Buffer.from(a).toString('hex'), Buffer.from(b).toString('hex'));
});

test('pollyDeriveSigningKey changes when any input changes', async () => {
  const base = await pollyDeriveSigningKey('secret123', '20260810', 'us-east-1', 'polly');
  const diffSecret = await pollyDeriveSigningKey('other-secret', '20260810', 'us-east-1', 'polly');
  const diffDate = await pollyDeriveSigningKey('secret123', '20260811', 'us-east-1', 'polly');
  const diffRegion = await pollyDeriveSigningKey('secret123', '20260810', 'us-west-2', 'polly');
  const baseHex = Buffer.from(base).toString('hex');
  assert.notEqual(Buffer.from(diffSecret).toString('hex'), baseHex);
  assert.notEqual(Buffer.from(diffDate).toString('hex'), baseHex);
  assert.notEqual(Buffer.from(diffRegion).toString('hex'), baseHex);
});

test('buildCanonicalRequest joins fields in the exact SigV4-specified order', () => {
  const result = buildCanonicalRequest({
    method: 'POST',
    canonicalUri: '/v1/speech',
    canonicalQueryString: '',
    canonicalHeaders: 'content-type:application/json\nhost:polly.us-east-1.amazonaws.com\nx-amz-date:20260810T000000Z\n',
    signedHeaders: 'content-type;host;x-amz-date',
    hashedPayload: 'deadbeef',
  });
  assert.equal(
    result,
    'POST\n/v1/speech\n\ncontent-type:application/json\nhost:polly.us-east-1.amazonaws.com\nx-amz-date:20260810T000000Z\n\ncontent-type;host;x-amz-date\ndeadbeef'
  );
});

test('buildStringToSign joins fields in the exact SigV4-specified order', () => {
  const result = buildStringToSign({
    amzDate: '20260810T000000Z',
    credentialScope: '20260810/us-east-1/polly/aws4_request',
    hashedCanonicalRequest: 'deadbeef',
  });
  assert.equal(result, 'AWS4-HMAC-SHA256\n20260810T000000Z\n20260810/us-east-1/polly/aws4_request\ndeadbeef');
});

test('buildAuthorizationHeader formats the standard SigV4 Authorization header', () => {
  const result = buildAuthorizationHeader({
    accessKeyId: 'AKIDEXAMPLE',
    credentialScope: '20260810/us-east-1/polly/aws4_request',
    signedHeaders: 'content-type;host;x-amz-date',
    signature: 'cafebabe',
  });
  assert.equal(
    result,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260810/us-east-1/polly/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=cafebabe'
  );
});

test('buildPollySignedRequest produces a structurally correct, deterministic signed request', async () => {
  const props = {
    pollyAccessKeyId: 'AKIDEXAMPLE',
    pollySecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    pollyRegion: 'us-east-1',
    pollyVoiceId: 'Joanna',
    pollyEngine: 'neural',
  };
  const now = new Date('2026-08-10T12:34:56Z');

  const req = await buildPollySignedRequest(props, 'hello chat', now);
  assert.equal(req.url, 'https://polly.us-east-1.amazonaws.com/v1/speech');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers['Content-Type'], 'application/json');
  assert.equal(req.headers['X-Amz-Date'], '20260810T123456Z');
  assert.match(req.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260810\/us-east-1\/polly\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);

  const parsedBody = JSON.parse(req.body);
  assert.equal(parsedBody.Text, 'hello chat');
  assert.equal(parsedBody.VoiceId, 'Joanna');
  assert.equal(parsedBody.Engine, 'neural');
  assert.equal(parsedBody.OutputFormat, 'mp3');

  // Same inputs, same instant -> identical signature (determinism)
  const req2 = await buildPollySignedRequest(props, 'hello chat', now);
  assert.equal(req.headers.Authorization, req2.headers.Authorization);

  // Different text -> different payload hash -> different signature
  const req3 = await buildPollySignedRequest(props, 'a different message', now);
  assert.notEqual(req.headers.Authorization, req3.headers.Authorization);

  // Different moment in time -> different date/signature
  const req4 = await buildPollySignedRequest(props, 'hello chat', new Date('2026-08-11T00:00:00Z'));
  assert.notEqual(req.headers['X-Amz-Date'], req4.headers['X-Amz-Date']);
  assert.notEqual(req.headers.Authorization, req4.headers.Authorization);
});

test('buildPollySignedRequest respects a non-default region in the host and credential scope', async () => {
  const props = {
    pollyAccessKeyId: 'AKID',
    pollySecretAccessKey: 'secret',
    pollyRegion: 'eu-west-1',
    pollyVoiceId: 'Amy',
    pollyEngine: 'standard',
  };
  const req = await buildPollySignedRequest(props, 'hi', new Date('2026-08-10T00:00:00Z'));
  assert.equal(req.url, 'https://polly.eu-west-1.amazonaws.com/v1/speech');
  assert.match(req.headers.Authorization, /eu-west-1\/polly\/aws4_request/);
});
