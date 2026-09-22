# IoT architecture: from a real sensor to this detector

> **What this document is.** A design for the deployment this project does not have: physical turbidity sensors in real rivers. **The radio, gateway and network-server layers below are a design, not a deployment** -- no such hardware exists for this project, and nothing here claims otherwise. **What is real and already working:** the ingestion endpoint this architecture ends at (`POST /iot/devices/:deviceId/telemetry`) is implemented, authenticated, and tested (`test/iotIngest.test.ts`, 22 tests) against the exact same detector and baseline-adequacy code the rest of this project uses. A physical device built to this spec could send it a reading today.

## Why this exists

`SAFETY_CASE.md` names "everything is synthetic" as the project's largest, least fixable gap. Most of that gap genuinely can't be closed for a hackathon prototype -- there is no real patient, no real hospital, and (checked directly, not assumed) **no public real-time turbidity API exists anywhere in Europe**. Real-time river *level* data does (see below); real-time contamination-relevant water quality does not. Closing that requires actual sensor hardware in the water, which this project cannot deploy. What it *can* do, and has done, is show the concrete engineering path from a real sensor to this detector, and prove the hardest part of that path -- feeding a real, externally-supplied reading into the same statistically-characterized detector the rest of the project uses -- already works.

## The path, end to end

```
 [1] Sensor node                [2] Gateway              [3] Network server        [4] This backend
 ┌─────────────────────┐        ┌──────────────┐         ┌──────────────────┐      ┌───────────────────────┐
 │ Turbidity sensor      │      │ LoRaWAN or   │         │ Decrypts/decodes  │      │ POST /iot/devices/    │
 │ (open-source, in-situ,│ radio│ NB-IoT       │ backhaul│ the payload,      │ HTTPS│   :deviceId/telemetry │
 │ ~US$100-class --      │─────▶│ gateway      │────────▶│ forwards via an   │─────▶│ (bearer device key)   │
 │ Droujko & Molnar 2022)│      │ (fixed site, │         │ HTTP webhook or   │      │        │              │
 │ + microcontroller +   │      │ mains/solar  │         │ MQTT bridge       │      │        ▼              │
 │ LoRaWAN/NB-IoT radio,  │      │ powered)     │         │ (e.g. The Things  │      │ Phase-I baseline gate │
 │ battery + solar        │      │              │         │ Network, AWS IoT  │      │ (analytics/baseline.ts)│
 │ powered                │      │              │         │ Core, or a        │      │        │              │
 └─────────────────────┘        └──────────────┘         │ carrier's NB-IoT  │      │        ▼              │
                                                            │ platform)         │      │ Real EWMA detector    │
                                                            └──────────────────┘      │ (analytics/ewma.ts)   │
                                                                                       │        │              │
                                                                                       │        ▼              │
                                                                                       │ k-consecutive          │
                                                                                       │ escalation rule        │
                                                                                       │ (same as the demo)     │
                                                                                       └───────────────────────┘
```

### [1] Sensor node -- real, published hardware

Droujko, J. & Molnar, P. (2022), "Open-source, low-cost, in-situ turbidity
sensor for river network monitoring", *Scientific Reports* 12, 10341,
[doi:10.1038/s41598-022-14228-4](https://doi.org/10.1038/s41598-022-14228-4)
(ETH Zürich). An LED and two light detectors in a waterproof housing,
measuring 0-4000 NTU, with an open hardware design and firmware (there is
also a maintained open-source repository,
[rivertechlabs/turbiditysensor](https://github.com/rivertechlabs/turbiditysensor)).
This is real, existing, citable hardware, chosen deliberately over
inventing a sensor spec: the point of this document is to show a real path,
not a plausible-sounding one.

### [2]-[3] Radio and backhaul -- two real, standard options

| | LoRaWAN | NB-IoT |
|---|---|---|
| Maintained by | LoRa Alliance (spec since Jan 2015) | 3GPP (frozen in Release 13, June 2016) |
| Range | Kilometers from a gateway; long-range field trials report double digits of km over open or water terrain | Cellular coverage (wherever the carrier's network reaches, including indoor/underground better than LoRaWAN) |
| Power | Built around multi-year battery life on a small cell; a device sending short payloads every 15 min can run for years on 2×AA | Higher power than LoRaWAN per byte, but no separate gateway to install -- rides on existing cellular infrastructure |
| Needs | A gateway within range, owned/operated by the deployer (or a public network like The Things Network) | A SIM and a carrier with NB-IoT coverage |
| Fits this use case because | A river reach is usually rural/exposed -- exactly LoRaWAN's target -- and a handful of gateways can cover a whole monitored network | Works where no gateway can practically be installed, at the cost of a recurring carrier fee |

Both are real, deployed-at-scale standards for exactly this class of
device (a small, battery-powered environmental sensor sending a few bytes
occasionally); the choice between them is a real deployment decision
(gateway ownership vs. carrier cost) that this project does not make, since
it has no physical site to make it for.

The network server (a LoRaWAN network server like The Things Network, or a
carrier's NB-IoT platform) decodes the radio payload and forwards it
onward over ordinary IP -- typically MQTT (a lightweight publish/subscribe
protocol built for exactly this: many small, intermittent IoT messages) or
a plain HTTP webhook. **This is a standard, off-the-shelf integration
point**, not a custom protocol this project would need to invent.

### [4] This backend -- real, implemented, tested

Whatever bridges MQTT/webhook to HTTP calls:

```
POST /iot/devices/{deviceId}/telemetry
Authorization: Bearer <per-device key>
Content-Type: application/json

{ "measuredAt": "2026-09-22T10:15:00Z", "ntu": 14.8 }
```

What happens next is the same code the rest of this project runs and has
already characterized:

1. **Device authentication** (`src/iot/deviceAuth.ts`): a per-device bearer
   key, constant-time compared. Unconfigured by default -- with no keys
   set, every write 503s rather than silently accepting anything (unlike
   the demo routes, this endpoint is designed to be reachable from outside
   the process). A real fleet deployment should move to mutual TLS or
   per-device certificates issued by the network server; a pre-shared key
   is the documented minimum, not a claim it is sufficient at scale.
2. **The Phase-I baseline gate** (`src/analytics/baseline.ts`, already
   built for exactly this moment): the first `MIN_PHASE_ONE_READINGS`
   readings from a new device are accumulated, not monitored, until they
   pass the same adequacy check `EVALUATION.md` §5 characterizes (n >= 200,
   bounded lag-1 autocorrelation). A device is never monitored on an
   unverified baseline -- the exact gap `SAFETY_CASE.md` hazard H1.2 flags
   as built-but-unwired in the synthetic demo path. Here, it is wired.
3. **The real EWMA detector** (`src/analytics/ewma.ts`), built from *that
   device's own* measured mean/sd, not the demo's fixed 15+-3 NTU constant.
4. **The same k-consecutive escalation rule** (`detectorConfig.ts`), whose
   false-alarm behaviour under exactly this kind of real-world deviation
   (misspecified variance, autocorrelation) is quantified in
   `EVALUATION.md` §4 -- so a real device's escalation threshold is not a
   leap of faith, it is the same rule whose failure modes are already on
   the record.

This is deliberately **isolated** from the demo: an ingested device's id
is never one of the 33 registered station ids, and nothing here reaches a
river's exposure engine or a CDS Hooks card (`test/iotIngest.test.ts`,
"ISOLATION" suite). Wiring a real device's escalation into a real
clinical alert is a real decision with real consequences -- see
`SAFETY_CASE.md` hazard H2 -- and is deliberately not made by default just
because a device exists.

## The precedent this already has: a second, working real-time integration

This project also ingests a genuinely live, external, real-time feed
today: Germany's PEGELONLINE federal gauge network
(`src/data/realGauges.ts`, `src/cdsHooks/realGauge.ts`), a real government
REST API providing live river-*level* data (not turbidity -- checked, no
equivalent public turbidity feed exists). It follows the identical shape
this architecture describes for a sensor -- an external real-time source,
a typed fetch with a timeout and graceful degradation, a clearly
disclosed and visually distinct presentation -- for a source that already
exists. The IoT ingestion endpoint is the same pattern for a source that
does not yet exist. Two different problems (an existing agency API vs. a
sensor network that would need to be built), the same proven ingestion
shape.

## What this does not claim

- No physical sensor has been built or deployed for this project.
- No LoRaWAN/NB-IoT gateway, network server, or MQTT bridge is implemented
  here -- those are standard, off-the-shelf products/services, not custom
  code this project would need to write, so building a fake one would add
  complexity without adding evidence.
- The ingestion endpoint has been exercised only by tests and by a curl
  request simulating a device, not by any real radio hardware.
- A real deployment would need, beyond this document: a hazard-log update
  (new failure modes -- a spoofed or compromised device, physical
  tampering, sensor drift/biofouling requiring periodic re-baselining),
  procurement and calibration of real sensor units, a gateway siting
  survey, and a device-provisioning process (today's pre-shared key model
  does not scale past a handful of manually-configured devices).
