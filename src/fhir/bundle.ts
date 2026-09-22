/**
 * FHIR R4 `collection` Bundle assembly. The official HL7 validator (see
 * conformance/README.md) rejected the first version of this Bundle because
 * every entry lacked `fullUrl` -- "Except for transactions and batches, each
 * entry in a Bundle must have a fullUrl which is the identity of the
 * resource in the entry" -- and, as a consequence, the relative references
 * inside the resources. Each entry now carries a deterministic
 * `urn:uuid:` fullUrl derived from the resource's type and id, so the same
 * forecast always has the same identity across requests.
 */

import { createHash } from "node:crypto";

/** Fixed namespace for this project's name-based (RFC 4122 v5) UUIDs. It is
 * just a constant; any fixed UUID works, it only needs to never change. */
const NAMESPACE_HEX = "6f1a7c2e3b545d7a9c110a4f6b2d8e35";

/** Name-based UUID (RFC 4122 version 5: SHA-1 over namespace + name).
 * `namespaceHex` is injectable so the algorithm can be checked against an
 * independent implementation's known answer (test/fhir.test.ts). */
export function nameBasedUuid(name: string, namespaceHex: string = NAMESPACE_HEX): string {
  const hash = createHash("sha1").update(Buffer.from(namespaceHex, "hex")).update(name, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface BundleEntryResource {
  resourceType: string;
  id: string;
}

export function collectionBundle<T extends BundleEntryResource>(resources: T[]) {
  return {
    resourceType: "Bundle" as const,
    type: "collection" as const,
    entry: resources.map((resource) => ({
      fullUrl: `urn:uuid:${nameBasedUuid(`${resource.resourceType}/${resource.id}`)}`,
      resource,
    })),
  };
}
