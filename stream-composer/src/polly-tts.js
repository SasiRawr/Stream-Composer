// ============================================================================
// AMAZON POLLY TTS — bring-your-own-AWS-key connector for the Chat + TTS
// Overlay item. Opt-in alternative to the default free browser-native
// speechSynthesis voice (chat-tts-engine.js). Gives access to the exact
// Polly voices (Joanna, Matthew, Ivy, etc.) Harvey found in StreamElements'
// free TTS panel — those names match Amazon Polly's real catalog, so this
// gets the same voices directly from AWS instead of through a third party.
//
// SECURITY NOTE, read before wiring credentials into a project: because the
// baked scene.html runs inside OBS's Browser Source with no Tauri bridge and
// no backend proxy, the AWS access key/secret key have to be embedded
// directly in that baked, plain-JS file to sign requests at runtime. That
// file lives on disk in the project's output folder. Recommend an IAM user
// scoped to ONLY `polly:SynthesizeSpeech` (not root/admin keys), and never
// share/upload/commit a baked project folder that has Polly configured.
//
// This signs requests using AWS Signature Version 4 (SigV4), the standard
// AWS request-signing algorithm, built from scratch here (no AWS SDK, to
// stay import-free for the baked output). The crypto pieces below use the
// Web Crypto API (`crypto.subtle`) — the SAME API available in both Node
// (v19+) and every browser/WebView2 context, so what's tested here is the
// literal implementation the baked script also runs, not a Node-only stand-in
// like the JSON-parsing duplicates elsewhere in this app.
//
// VERIFICATION CAVEAT: the pure string-building and crypto-primitive pieces
// (SHA-256, HMAC-SHA256, key derivation) are tested against known-correct
// test vectors below. The full signed-request pipeline is tested for
// structural correctness and determinism, but — same as the Twitch/Kick
// connectors — has NOT been verified against a real AWS account. That needs
// Harvey's own AWS key.
// ============================================================================

export function defaultPollyProps() {
  return {
    ttsProvider: 'browser', // 'browser' (free, default) | 'polly'
    pollyAccessKeyId: '',
    pollySecretAccessKey: '',
    pollyRegion: 'us-east-1',
    pollyVoiceId: 'Joanna',
    pollyEngine: 'neural', // 'neural' | 'standard'
  };
}

// A few real, commonly-available Polly US English voice IDs, offered as
// suggestions (not a locked list — the properties panel lets any VoiceId be
// typed, since Amazon's catalog changes over time and this shouldn't go
// stale).
export const POLLY_VOICE_SUGGESTIONS = [
  'Joanna', 'Matthew', 'Ivy', 'Justin', 'Kendra', 'Kimberly', 'Joey',
  'Salli', 'Ruth', 'Stephen', 'Gregory', 'Danielle', 'Kevin',
];

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function pollySha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(digest);
}

export async function pollyHmacRaw(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

export async function pollyDeriveSigningKey(secretKey, dateStamp, region, service) {
  const kDate = await pollyHmacRaw(new TextEncoder().encode('AWS4' + secretKey), dateStamp);
  const kRegion = await pollyHmacRaw(new Uint8Array(kDate), region);
  const kService = await pollyHmacRaw(new Uint8Array(kRegion), service);
  return pollyHmacRaw(new Uint8Array(kService), 'aws4_request');
}

// ---- Pure string builders (no crypto — deterministic, directly testable) ----

export function buildCanonicalRequest({ method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, hashedPayload }) {
  return [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, hashedPayload].join('\n');
}

export function buildStringToSign({ amzDate, credentialScope, hashedCanonicalRequest }) {
  return ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashedCanonicalRequest].join('\n');
}

export function buildAuthorizationHeader({ accessKeyId, credentialScope, signedHeaders, signature }) {
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function amzDateParts(now) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // "YYYYMMDDTHHMMSSZ"
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

// ---- Full pipeline: builds a ready-to-fetch() signed Polly request ----

export async function buildPollySignedRequest(props, text, now) {
  const region = props.pollyRegion || 'us-east-1';
  const host = `polly.${region}.amazonaws.com`;
  const canonicalUri = '/v1/speech';
  const service = 'polly';
  const { amzDate, dateStamp } = amzDateParts(now);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const body = JSON.stringify({
    OutputFormat: 'mp3',
    Text: text,
    VoiceId: props.pollyVoiceId || 'Joanna',
    Engine: props.pollyEngine || 'neural',
    TextType: 'text',
  });
  const hashedPayload = await pollySha256Hex(body);

  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';

  const canonicalRequest = buildCanonicalRequest({
    method: 'POST',
    canonicalUri,
    canonicalQueryString: '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  });
  const hashedCanonicalRequest = await pollySha256Hex(canonicalRequest);
  const stringToSign = buildStringToSign({ amzDate, credentialScope, hashedCanonicalRequest });

  const signingKey = await pollyDeriveSigningKey(props.pollySecretAccessKey || '', dateStamp, region, service);
  const signatureBuf = await pollyHmacRaw(new Uint8Array(signingKey), stringToSign);
  const signature = toHex(signatureBuf);

  const authorization = buildAuthorizationHeader({
    accessKeyId: props.pollyAccessKeyId || '',
    credentialScope,
    signedHeaders,
    signature,
  });

  return {
    url: `https://${host}${canonicalUri}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      Authorization: authorization,
    },
    body,
  };
}
