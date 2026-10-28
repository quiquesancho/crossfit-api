import { timingSafeEqual } from "node:crypto";

export function validServiceKey(received: unknown, expected: string): boolean {
  if (typeof received !== "string") return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
