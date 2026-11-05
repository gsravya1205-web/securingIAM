import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "secureid_session";
const SESSION_EXPIRATION_SECONDS = 60 * 60 * 8; // 8 hours

// Default HMAC-SHA256 signing secret
const SECRET_KEY =
  process.env.SESSION_SECRET || "secureid_super_secret_rbac_signing_key_32chars_long!";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface SessionPayload extends SessionUser {
  iat: number;
  exp: number;
}

/**
 * Base64URL encode a buffer or string
 */
function toBase64Url(input: string | Uint8Array): string {
  if (typeof input === "string") {
    return Buffer.from(input, "utf-8").toString("base64url");
  }
  return Buffer.from(input).toString("base64url");
}

/**
 * Base64URL decode to string
 */
function fromBase64Url(base64url: string): string {
  return Buffer.from(base64url, "base64url").toString("utf-8");
}

/**
 * Get the WebCrypto HMAC key
 */
async function getCryptoKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Signs a session payload with HMAC-SHA256
 */
export async function signSession(user: SessionUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...user,
    iat: now,
    exp: now + SESSION_EXPIRATION_SECONDS,
  };

  const payloadString = JSON.stringify(payload);
  const encodedPayload = toBase64Url(payloadString);

  const key = await getCryptoKey();
  const signatureBuffer = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  const encodedSignature = toBase64Url(new Uint8Array(signatureBuffer));
  return `${encodedPayload}.${encodedSignature}`;
}

/**
 * Cryptographically verifies a session token
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [encodedPayload, encodedSignature] = parts;

    const key = await getCryptoKey();
    const signatureBytes = Buffer.from(encodedSignature, "base64url");

    const isValid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      new TextEncoder().encode(encodedPayload)
    );

    if (!isValid) return null;

    const payload: SessionPayload = JSON.parse(fromBase64Url(encodedPayload));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Creates and sets the HTTP-Only cookie session
 */
export async function createSession(user: SessionUser): Promise<string> {
  const token = await signSession(user);

  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false, // Ensure cookies are always accepted over http://localhost without requiring HTTPS
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRATION_SECONDS,
  });

  return token;
}

/**
 * Reads and verifies the current session from incoming request cookies
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  return verifySessionToken(sessionCookie.value);
}

/**
 * Destroys current session cookie
 */
export async function destroySession(): Promise<void> {
  cookies().set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
