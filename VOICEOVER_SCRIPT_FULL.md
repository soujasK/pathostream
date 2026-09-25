# Voiceover script: `demo_video_full.mp4`

**Video:** 4:50, 1920×1080. The agents run live on **Google Gemini (`gemini-3.6-flash`)**.

## Files

| File | What it is |
|---|---|
| `demo_video_voiced.mp4` | **Video with the narration already mixed in**, plus a subtitle track you can switch on (CC). Synced by construction. |
| `demo_video_full.mp4` | The same video with no audio, for recording your own voice. |
| `demo_video_full.srt` | Subtitles timed line by line to the narration. |

## How the sync was measured

- **Scene starts:** each scene's start is the exact frame where its caption
  appears in the video. These were found by frame analysis of the caption
  area, not estimated.
- **Line timing:** each narration line is placed 0.3 s after its caption
  appears and always ends before the next caption.
- **Check:** speech onsets detected in the final audio match the planned
  starts to within 0.1 s for all 23 scenes.

## If you record your own voice

1. Play `demo_video_voiced.mp4` once to hear the pacing.
2. Record over `demo_video_full.mp4` with the SRT loaded as a teleprompter,
   or use the per-line times below.
3. Start each line at its time. If you read faster, just pause until the next
   time. Never start a block early.

---

## Part A: Voiceover, timed to the video

Format: **[caption appears] Scene title**, then each line with the second it
starts and ends.

### [0:00.2] PathoStream EHR · OAH River Watch
*On screen:* River contamination → a clinician-facing alert, on FHIR R4 + CDS Hooks.

- `0:00.5 → 0:05.3`  Rivers carry contamination downstream faster than any lab result comes back.
- `0:05.3 → 0:08.6`  PathoStream EHR detects it, forecasts where it goes,
- `0:08.6 → 0:11.7`  and warns the doctor before the patients arrive,
- `0:11.7 → 0:14.9`  using the open health standards FHIR and CDS Hooks.

### [0:18.6] Water Authority view
*On screen:* 9 real European rivers · 41 stations · 15 EU countries — one pipeline for every river.

*(The dashboard appears at 0:15.2, before this caption. Start speaking with the picture.)*

- `0:15.4 → 0:18.1`  This is the water-authority dashboard.
- `0:18.1 → 0:22.1`  Nine real European rivers, forty-one monitoring stations,
- `0:22.1 → 0:26.0`  fifteen EU countries, and one pipeline for every river:
- `0:26.0 → 0:27.7`  detect, forecast, alert.

### [0:28.4] Live external data
*On screen:* LIVE water level from PEGELONLINE — real data, kept separate from the simulated detector.

- `0:28.7 → 0:32.5`  On German reaches, this live badge is real water-level data from
- `0:32.5 → 0:36.3`  PEGELONLINE, kept visibly separate from our simulated detector.

### [0:36.5] Path 1 · Operator confirmation
*On screen:* An operator confirms contamination at Ponte de Santa Clara, Coimbra.

- `0:36.8 → 0:38.2`  Detection path one.
- `0:38.2 → 0:44.2`  A water-authority operator confirms contamination at Ponte de Santa Clara, in Coimbra.

### [0:46.2] Downstream forecast
*On screen:* 1D advection–dispersion model: arrival at each downstream station, with a 90% travel-time band.

- `0:46.5 → 0:51.0`  Instantly, a transport model forecasts when the plume reaches each downstream
- `0:51.0 → 0:55.2`  station, with a ninety percent travel-time band instead of one falsely
- `0:55.2 → 0:56.1`  precise number.
- `0:56.1 → 0:58.5`  We move the clock forward twenty minutes.

### [0:59.5] Emergency Department · CDS Hooks card
*On screen:* CRITICAL card + verified LOINC 82195-9 stool-PCR order suggestion.

- `0:59.8 → 1:01.3`  Now the doctor’s screen.
- `1:01.3 → 1:04.8`  A patient living on the affected reach gets a CDS Hooks
- `1:04.8 → 1:07.5`  card inside their health record: critical,
- `1:07.5 → 1:10.8`  an active exposure window, and a concrete next step,
- `1:10.8 → 1:14.4`  a stool pathogen PCR panel with its verified LOINC code.

### [1:15.3] Path 2 · Statistical early warning
*On screen:* EWMA control chart: 6 consecutive out-of-control readings → auto-escalation.

- `1:15.6 → 1:17.9`  Path two: nobody reports anything.
- `1:17.9 → 1:20.3`  We inject a rising turbidity trend.
- `1:20.3 → 1:25.0`  An EWMA control chart, the method used in industrial quality control,
- `1:25.0 → 1:30.5`  watches for sustained drift, and after six consecutive out-of-control readings it
- `1:30.5 → 1:31.9`  escalates on its own.

### [1:37.5] Same patient, weaker evidence
*On screen:* WARNING, labelled unconfirmed — no instruction to start treatment.

- `1:37.8 → 1:40.7`  Same patient, weaker evidence, different card.
- `1:40.7 → 1:43.4`  A statistical signal is not a lab result,
- `1:43.4 → 1:46.1`  so this is a warning, labelled unconfirmed,
- `1:46.1 → 1:48.6`  with no instruction to start treatment.
- `1:48.6 → 1:52.1`  The alert always matches the strength of the evidence.

### [1:52.3] Path 3 · Citizen report + AI triage
*On screen:* A trained classifier scores the report and shows exactly why.

- `1:52.6 → 1:56.4`  Path three: a member of the public reports cloudy water,
- `1:56.4 → 1:58.4`  a strange odour and dead fish.
- `1:58.4 → 2:03.2`  A trained classifier triages the report and shows exactly which answers
- `2:03.2 → 2:04.3`  drove its score.
- `2:04.3 → 2:05.2`  No black box.

### [2:14.9] Human in the loop
*On screen:* Only a water-authority reviewer can promote a report — then the card names its source honestly.

- `2:15.2 → 2:17.3`  But the AI never confirms anything.
- `2:17.3 → 2:20.6`  Only a water-authority reviewer can promote the report.
- `2:20.6 → 2:22.9`  Then the doctor’s card is full strength,
- `2:22.9 → 2:26.8`  and says honestly that the source was a reviewed citizen report.

### [2:28.3] Incident timeline
*On screen:* The audit trail across all rivers.

- `2:28.6 → 2:33.0`  Every confirmation, escalation and forecast lands on one incident timeline,
- `2:33.0 → 2:35.3`  the audit trail across all nine rivers.

### [2:35.5] Multi-agent AI · Google Gemini
*On screen:* Sentinel · Citizen Intel · Clinical Triage · Commander — Gemini chooses the tools, a guard checks every call.

- `2:35.8 → 2:36.9`  Now the AI layer.
- `2:36.9 → 2:39.4`  Four agents: a Sentinel for river data,
- `2:39.4 → 2:43.6`  Citizen Intel, Clinical Triage, and a Commander that combines them.
- `2:43.6 → 2:48.0`  Google Gemini drives the investigation, choosing which tools to call,
- `2:48.0 → 2:50.9`  while a safety guard checks every single call.

### [2:51.8] Agents · human-confirmed evidence
*On screen:* Proposed action is a DRAFT. Clinical triage stayed local: patient data is not sent to a model by default.

- `2:52.1 → 2:57.1`  The evidence is human-confirmed, so the Commander proposes a recreational closure,
- `2:57.1 → 2:58.3`  but only as a draft.
- `2:58.3 → 3:00.7`  The banner counts Gemini’s tool calls,
- `3:00.7 → 3:03.1`  and shows clinical triage stayed local,
- `3:03.1 → 3:06.4`  because patient data is not sent to a model by default.

### [3:07.4] Model-generated summaries
*On screen:* Written by Gemini, clearly labelled — they cannot change any value or proposal.

- `3:07.7 → 3:11.2`  These summaries are written by Gemini and clearly labelled.
- `3:11.2 → 3:14.9`  They describe the evidence, but cannot change a single number,
- `3:14.9 → 3:16.2`  severity or proposal.

### [3:16.8] Proposed notices — drafts only
*On screen:* FHIR Communication status “preparation”. A human authority must approve.

- `3:17.1 → 3:21.6`  The municipal and clinician notices are drafts, with FHIR status preparation.
- `3:21.6 → 3:23.7`  A human authority must approve them.
- `3:23.7 → 3:25.9`  Nothing is ever issued automatically.

### [3:26.1] Evidence trace
*On screen:* Every step labelled: model-requested tool (guarded), deterministic tool, rejected call, or model text.

- `3:26.4 → 3:30.1`  And every step is traceable: which tools Gemini requested,
- `3:30.1 → 3:33.9`  which ran deterministically, and any call the guard rejected,
- `3:33.9 → 3:34.9`  with the reason.

### [3:35.1] The contrast
*On screen:* Confirmed flags cleared — only an unconfirmed statistical anomaly remains.

- `3:35.4 → 3:36.5`  Now the contrast.
- `3:36.5 → 3:41.1`  We cleared the confirmed flags and left only this statistical anomaly,
- `3:41.1 → 3:42.9`  with no human confirmation.

### [3:43.3] Same agents, weaker evidence
*On screen:* Bloody-diarrhoea presentation · Gemini investigates through the same guard.

- `3:43.6 → 3:45.3`  We run the same agents again,
- `3:45.3 → 3:47.4`  for a patient with bloody diarrhoea,
- `3:47.4 → 3:50.2`  and Gemini investigates through the same guard.

### [3:52.4] Unconfirmed signal → sampling only
*On screen:* The only possible proposal: confirmatory water sampling. Never a boil-water advisory.

- `3:52.7 → 3:56.3`  With only an unconfirmed signal, the one thing the system may
- `3:56.3 → 3:58.6`  propose is confirmatory water sampling.
- `3:58.6 → 4:03.0`  Never a boil-water advisory, even though a reviewed citizen report agrees.

### [4:03.2] Clinical safety
*On screen:* Heuristic scores, not probabilities · unverified LOINC codes withheld · priority stays ROUTINE.

- `4:03.5 → 4:07.5`  Clinically, pathogen scores are labelled heuristics, not probabilities.
- `4:07.5 → 4:09.4`  The Shiga-toxin test shows no code,
- `4:09.4 → 4:12.0`  because only verified LOINC codes are emitted.
- `4:12.0 → 4:15.4`  And review priority stays routine for an unconfirmed signal.

### [4:15.6] Input validation
*On screen:* Nothing is defaulted or guessed.

- `4:15.9 → 4:19.4`  Nothing is guessed: bad coordinates are refused.

### [4:20.1] Guarded AI
*On screen:* Allowlist · pinned scope · server-bound patient data · budget + timeout.

- `4:20.4 → 4:23.6`  The Gemini safeguards: a tool allowlist per agent,
- `4:23.6 → 4:27.7`  scope locked to the request, patient details bound on the server,
- `4:27.7 → 4:29.7`  and a call budget and timeout.
- `4:29.7 → 4:33.3`  Whatever the model does, the assessment stays identical.

### [4:34.0] PathoStream EHR
*On screen:* Research prototype · synthetic data · not a medical device · 14-hazard safety case, every implemented control tested.

- `4:34.3 → 4:38.2`  PathoStream EHR: warn the doctor before the patients arrive.
- `4:38.2 → 4:40.8`  A research prototype on synthetic data,
- `4:40.8 → 4:45.2`  not a medical device, backed by a fourteen-hazard safety case where
- `4:45.2 → 4:48.4`  every implemented control has an automated test.
- `4:48.4 → 4:49.0`  Thank you.

---

## Part B: Core messages for the presentation

Use these as slide titles and speaker notes. Each one points to the moment in
the video that backs it.

1. **The problem.** Waterborne contamination reaches patients before
   diagnosis does. Clinicians get no signal that a patient's river is
   contaminated. *(0:00)*
2. **The idea.** Connect river monitoring to the health record: detect,
   forecast downstream, and alert the clinician at the point of care.
   *(0:36–1:14)*
3. **Real standards, not a mock-up.** FHIR R4 resources and CDS Hooks cards,
   the way real health records plug in decision support. The GI panel uses a
   LOINC code checked against loinc.org (82195-9). *(0:58)*
4. **Scale.** 9 real European rivers, 41 stations, 15 EU countries, one
   pipeline. Live PEGELONLINE gauge data is kept separate from the simulated
   detector. *(0:18–0:35)*
5. **Three detection paths, and the alert strength always matches the
   evidence.**
   - Operator-confirmed: a CRITICAL card with an order suggestion.
   - Statistical (EWMA, six consecutive readings): a WARNING, labelled
     unconfirmed, with no instruction to treat.
   - Citizen report plus an explainable ML classifier: counts only after a
     human reviewer promotes it.

   *(0:36–2:27)*
6. **Multi-agent AI on Google Gemini, with humans in control.** Gemini
   chooses which tools to call. Every proposal is a draft. An unconfirmed
   signal can only propose sampling. One patient never changes a population
   decision. *(2:35–4:03)*
7. **Trustworthy AI by design.** Every call goes through the guard: a
   per-agent allowlist, scope fixed to the request, patient data kept on the
   server and not sent to Gemini by default, a call budget and a timeout. The
   assessment comes out identical whatever the model does, and a test
   enforces that. *(2:52, 3:26, 4:20)*
8. **Safety and regulation, stated honestly.** A 14-hazard, ISO 14971-style
   safety case where every implemented control is tied to a named automated
   test (436 tests pass). The self-assessment reads the doctor-facing card as
   medical-device software under the EU MDR (class IIa at minimum; no class
   claimed) and the citizen classifier as likely an AI system under the EU AI
   Act. Neither has been through a formal assessment. *(4:34)*
9. **What's next** (SAFETY_CASE.md §6):
   - clinical review of the pathogen rules;
   - real sensor data and a labelled-event evaluation;
   - gauge-calibrated transport modelling;
   - an evaluation of Gemini's summaries (H14.10);
   - a DPIA before any patient data reaches a model;
   - authentication and a real operator workflow.

**If asked "Is it a medical device?"** "No. It's a research prototype on
synthetic data. Our own analysis says the doctor-facing card would be
medical-device software under the MDR, class IIa at minimum, if it were ever
put on the market. That's why every alert matches its evidence and every AI
output needs a human to approve it."

**If asked "What does Gemini actually do?"** "It investigates: it decides
which of its agent's tools to call and writes the summaries. It never
decides a number, a severity or an action. Our guard checks every call, and
if Gemini is slow or down, the system falls back to rule-based output and
says so on screen."
