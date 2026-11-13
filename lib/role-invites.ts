import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { INVITE_TOKEN } from "@/lib/community-input";
export function newInviteToken() { return randomBytes(32).toString("base64url"); }
export function inviteHash(token: string) { if (!INVITE_TOKEN.test(token)) return null; return createHash("sha256").update(token).digest("hex"); }
