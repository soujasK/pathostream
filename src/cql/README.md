# CQL rules — status note

`exposureRules.cql` is **authored, syntactically valid CQL** (HL7 Clinical
Quality Language) expressing the same spatial-temporal exposure and
antimicrobial-stewardship logic that `../cdsHooks/exposureEngine.ts` and
`../cdsHooks/orderSelect.ts` implement natively in TypeScript.

**It is not executed by a CQL engine in this demo.** No `cql-execution` /
`cql-engine` runtime is wired in. This was a deliberate scope decision, not
an oversight: standing up a full CQL execution pipeline (ELM translation,
a FHIR-backed data provider, engine integration) is a substantial project
on its own, and doing it partially/unreliably under time pressure would be
worse than being direct about the boundary.

What this file demonstrates instead: that the exposure/stewardship
decision logic is expressible in the actual standards-native computable
language a real CDS platform would want, evaluated directly against the
same `RiskAssessment` resources `/demo/forecast-bundle` emits — not just
described in prose. A real deployment would run this (or its ELM
translation) through an actual CQL engine against a FHIR server, rather
than the TypeScript service evaluating the equivalent logic natively as it
does here.
