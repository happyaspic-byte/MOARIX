let fallbackCounter = 0;

function bytesToUuid(bytes: Uint8Array) {
  const version = bytes.at(6);
  const variant = bytes.at(8);
  if (version === undefined || variant === undefined) throw new Error("UUID entropy too short");
  bytes[6] = (version & 0x0f) | 0x40;
  bytes[8] = (variant & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createClientKey() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues === "function") {
    return bytesToUuid(webCrypto.getRandomValues(new Uint8Array(16)));
  }
  fallbackCounter += 1;
  const stamp = `${Date.now().toString(16).padStart(12, "0")}${fallbackCounter.toString(16).padStart(8, "0")}000000000000`;
  return bytesToUuid(Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(stamp.slice(index * 2, index * 2 + 2), 16)));
}
