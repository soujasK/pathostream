# Voiceover script — demo_video.mp4

Timed against the actual final render (238.44s / 3:58.44, 1920×1080, silent).
Every timestamp below was verified by extracting and visually inspecting the
real frame at that point in `demo_video.mp4` — not estimated from the
recording script's internal log, which drifts from real playback time by a
variable amount (network/render overhead). Where a transition is brief or the
visual needs a moment to breathe, the line is intentionally left blank —
don't fill every second; the pacing works better with a couple of pauses.

Read at a measured, unhurried pace (~110 words/minute — slower than normal
conversation) since the viewer is also reading on-screen text at the same
time. If you drift a couple of seconds off in either direction that's fine;
nothing here is frame-critical, only in the right neighborhood.

---

**[0:00–0:15]**
"This is OAH River Watch — a hackathon prototype that turns river
contamination into a hospital alert, using open standards: FHIR and CDS
Hooks. Nine rivers, forty-one stations, fifteen EU countries."

**[0:15–0:18]** *(silent — dashboard loading)*

**[0:18–0:37]**
"Here's the live dashboard. Every river runs the same pipeline: a
statistical detector, a downstream transport model, and a clinical alert —
all built on real FHIR resources, not a mockup. Let's start on the
Mondego, in Coimbra."

**[0:37–0:46]** *(clicking "Confirm" on Ponte de Santa Clara)*
"I'll confirm contamination at the upstream station — Ponte de Santa
Clara — the way a water-authority operator would."

**[0:46–1:09]** — KEY SHOT: CRITICAL card + order-suggestion box
"And here's the doctor's side. A patient living near that station gets
this card automatically: a critical alert, flagged as an active exposure
window, with a concrete order suggestion — a stool GI pathogen panel,
tagged with its real LOINC code — so antibiotics aren't guessed blindly."

**[1:09–1:12]** *(back to Water Authority, resetting)*
"Now let's reset, and try the other detection path."

**[1:12–1:36]** *(anomaly injected, EWMA sparkline trending)*
"This time, no one reports anything. I'm injecting a synthetic turbidity
anomaly, and a real EWMA statistical control chart — the same kind used
in industrial quality control — is watching every station's live signal
for a sustained drift, not a single noisy blip."

**[1:36–1:51]** — CONTRAST SHOT: WARNING card
"After six consecutive out-of-control readings, it auto-escalates. And
the card the doctor sees is deliberately different — labeled a warning,
not confirmed, because a statistical signal isn't a lab result."

**[1:51–1:58]**
"That distinction is the whole safety design. Let's reset."

**[1:58–2:04]** *(scrolled to the Citizen Observations panel, empty form)*
"Now — the part that's new: a citizen water-quality report."

**[2:04–2:16]** *(filled in, submitted, AI triage result + explanation shown)*
"Cloudy water, a bad smell, dead fish, discoloration — submitted, and
scored instantly by a real, trained classifier: 100 percent concern,
review recommended, with the exact reasons listed out."

**[2:16–2:21]** *(clicking "Promote to confirmed")*
"But it's still just a recommendation — I have to promote it myself."

**[2:21–2:37]** — KEY SHOT: CRITICAL card discloses citizen origin
"And the doctor's card discloses exactly where this came from: reported
by a citizen observer, AI-triaged, and reviewed and confirmed by the
water authority. Full severity — but the source is never hidden."

**[2:37–2:48]** *(fast-forward +1h, +12h)*
"Back on the operations side, I can fast-forward the simulated clock —
one hour, then twelve more — to see how the picture evolves."

**[2:48–3:00]** *(Incident Timeline tab)*
"And the Incident Timeline narrates every real state change, across
every river, in plain language, exactly as it happened."

**[3:00–3:08]** *(reset, Emergency Department tab)*
"One more thing: any station, on any river, can be a patient's home
address."

**[3:08–3:14]** *(Lisbon selected on the Tagus)*
"Lisbon, on the Tagus — no active alert, correctly silent."

**[3:14–3:19]** *(provenance panel opening)*
"Every claim on this page is tagged verified or illustrative."

**[3:19–3:26]** *("Shared across every river" expanded and centered)*
"Shared citations: Fischer and Liu's dispersion formula, and the EWMA
chart from Roberts, 1959."

**[3:26–3:28]** *(silent — panel collapsing)*

**[3:28–3:39]** *(Elbe river)*
"On the Elbe, three of these four stations carry a genuinely live
reading — a real German government gauge API, not a simulation."

**[3:39–3:52]** *(Danube, Meuse, Sava in quick succession)*
"The same pipeline runs, completely unmodified, on the Danube, the
Meuse, and the Sava — nine rivers in total, spanning fifteen EU member
states."

**[3:52–3:58]** *(closing wide shot, Mondego)*
"That's OAH River Watch — one causal chain, from a river to a doctor's
screen."

---

*(~442 words total, ≈111 wpm average — deliberately slower than
conversational pace to leave room for reading the screen.)*
