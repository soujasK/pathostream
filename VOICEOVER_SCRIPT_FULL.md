# Voiceover script: `demo_video_voiced.mp4`

**Video:** 3:56, 1920×1080. The agents run live on **Google Gemini
(`gemini-3.6-flash`)**. It includes a Track 7 scene showing OneAquaHealth FHIR
output and the official HL7 validator result.

**Voice:** Microsoft neural voice "Andrew" (en-US-AndrewNeural), one clip per
line. Every scene was recorded to its clip's exact length.

## Files

| File | What it is |
|---|---|
| `demo_video_voiced.mp4` | **The video to submit:** picture, narration, and a subtitle track you can switch on (CC). |
| `demo_video_full.mp4` | The same video with no audio, for recording your own voice. |
| `demo_video_full.srt` | Subtitles timed line by line to the narration. |

## How the sync was measured

- **Scene starts:** each scene's start is the exact frame where its caption
  appears in the final video, found by frame analysis.
- **Line timing:** each narration line starts 0.3 s after its caption and ends
  before the next one.
- **Check:** re-measured on the final file, every scene passes (24/24).
  Speech starts 0.44–0.45 s after each caption, never runs into the next
  scene, and the subtitles start within 0.15 s of the voice.

## If you record your own voice

Play `demo_video_voiced.mp4` once for the pacing, then record over
`demo_video_full.mp4` using the times below. Start each line at its time, and
pause if you finish early.

---

## Part A: Voiceover, timed to the video

### [0:00.2] PathoStream EHR · OAH River Watch
*On screen:* River contamination → an alert in the patient’s health record, using FHIR + CDS Hooks.

- `0:00.5 → 0:04.9`  Rivers carry contamination downstream faster than any lab result.
- `0:04.9 → 0:08.2`  PathoStream EHR spots it, forecasts where it goes,
- `0:08.2 → 0:11.4`  and warns the doctor before the patients arrive,
- `0:11.4 → 0:14.5`  using the health standards FHIR and CDS Hooks.

### [0:17.6] Water Authority view
*On screen:* 9 real European rivers · 41 stations · 15 EU countries — one pipeline for every river.

- `0:17.9 → 0:20.5`  This is the water authority dashboard:
- `0:20.5 → 0:23.7`  nine real European rivers, forty-one stations,
- `0:23.7 → 0:27.2`  fifteen countries, and one pipeline for every river.

### [0:28.0] Live data
*On screen:* LIVE water level from German government gauges (PEGELONLINE) — kept separate from simulated readings.

- `0:28.3 → 0:30.7`  On German rivers, this badge is live,
- `0:30.7 → 0:35.9`  real water-level data, kept separate from our simulated contamination readings.

### [0:36.7] Path 1 · A water official confirms it
*On screen:* Contamination confirmed at Ponte de Santa Clara, Coimbra.

- `0:37.0 → 0:41.5`  Path one: a water official confirms contamination at Ponte de Santa
- `0:41.5 → 0:42.7`  Clara, in Coimbra.

### [0:43.4] Downstream forecast
*On screen:* When it reaches each station downstream — with a 90% time range.

- `0:43.7 → 0:47.9`  A transport model forecasts when it reaches each station downstream,
- `0:47.9 → 0:50.9`  with a time range, not one falsely exact number.
- `0:50.9 → 0:53.4`  We move the clock forward twenty minutes.

### [0:54.1] The doctor’s screen
*On screen:* CRITICAL alert, a one-line plain summary, and a suggested stool test (LOINC 82195-9).

- `0:54.4 → 0:55.8`  Now the doctor's screen.
- `0:55.8 → 0:59.5`  A patient living nearby gets an alert inside their health record.
- `0:59.5 → 1:01.8`  It starts with one line in plain words,
- `1:01.8 → 1:04.7`  then a suggested stool test with its verified code.

### [1:05.4] Path 2 · Trend check
*On screen:* The water gets cloudier. 6 unusual readings in a row → the station is flagged automatically.

- `1:05.7 → 1:08.0`  Path two: nobody reports anything.
- `1:08.0 → 1:10.1`  The water slowly gets cloudier.
- `1:10.1 → 1:12.6`  A trend check watches every station,
- `1:12.6 → 1:15.3`  and after six unusual readings in a row,
- `1:15.3 → 1:17.4`  it flags the station by itself.

### [1:19.0] Same patient, weaker evidence
*On screen:* WARNING (amber), clearly marked not confirmed — no treatment advice.

- `1:19.3 → 1:22.9`  Same patient, weaker evidence, so a different alert:
- `1:22.9 → 1:27.2`  amber, clearly marked not confirmed, with no treatment advice.
- `1:27.2 → 1:30.5`  The alert is only ever as strong as the evidence.

### [1:31.2] Path 3 · A citizen reports it
*On screen:* Cloudy water, a bad smell, dead fish. An AI model scores the report and shows why.

- `1:31.5 → 1:35.3`  Path three: a member of the public reports cloudy water,
- `1:35.3 → 1:37.0`  a bad smell and dead fish,
- `1:37.0 → 1:39.1`  a warning sign for animals too.
- `1:39.1 → 1:42.1`  An AI model scores the report and shows why.

### [1:43.8] People decide
*On screen:* Only a water official can approve a report. Then the alert names the citizen as the source.

- `1:44.1 → 1:46.2`  But the AI never confirms anything.
- `1:46.2 → 1:49.0`  Only a water official can approve the report.
- `1:49.0 → 1:51.5`  Then the doctor's alert is full strength,
- `1:51.5 → 1:53.8`  and it names the citizen as the source.

### [1:54.8] Track 7 · OneAquaHealth FHIR

- `1:55.1 → 1:59.6`  That report is exported as FHIR in the OneAquaHealth guide's own
- `1:59.6 → 2:03.0`  format, and the official HL7 validator checks it:
- `2:03.0 → 2:03.8`  zero errors.

### [2:04.3] Incident timeline
*On screen:* The audit trail across all rivers.

- `2:04.6 → 2:07.1`  Every event lands on one timeline:
- `2:07.1 → 2:09.9`  the audit trail across all nine rivers.

### [2:10.8] AI agents · Google Gemini
*On screen:* Four agents. Gemini chooses what to check; a guard checks every call.

- `2:11.1 → 2:12.1`  Now the AI layer.
- `2:12.1 → 2:14.3`  Four agents look at the river data,
- `2:14.3 → 2:17.9`  the citizen reports, the patient, and the overall picture.
- `2:17.9 → 2:22.0`  Google Gemini chooses what to check, and a guard checks every call.

### [2:22.8] Confirmed by a person
*On screen:* The suggested action is a DRAFT. Patient data is not sent to a model by default.

- `2:23.1 → 2:25.4`  The evidence is confirmed by a person,
- `2:25.4 → 2:29.1`  so the commander suggests closing the river for recreation,
- `2:29.1 → 2:30.3`  but only as a draft.
- `2:30.3 → 2:33.0`  Patient data stays on our server by default.

### [2:33.7] Written by Gemini
*On screen:* Clearly labelled — it cannot change any number or decision.

- `2:34.0 → 2:36.9`  Gemini writes these summaries, clearly labelled.
- `2:36.9 → 2:39.6`  They can't change a single number or decision.

### [2:40.4] Drafts only
*On screen:* Marked NOT ISSUED. A person must approve.

- `2:40.7 → 2:43.4`  Every notice is a draft, marked not issued.
- `2:43.4 → 2:45.0`  A person must approve it.
- `2:45.0 → 2:46.9`  Nothing is sent automatically.

### [2:47.6] Every step traceable
*On screen:* Model-requested tool · deterministic tool · blocked call · model text.

- `2:47.9 → 2:51.1`  Every step is traceable: what Gemini asked for,
- `2:51.1 → 2:53.9`  what ran, and any call the guard blocked.

### [2:54.6] The contrast
*On screen:* Confirmed flag cleared — only an automatic, unconfirmed signal remains.

- `2:54.9 → 2:58.0`  Now the contrast: the confirmed flag is cleared,
- `2:58.0 → 3:01.1`  leaving only an automatic, unconfirmed signal.

### [3:02.0] Same agents, weaker evidence
*On screen:* A patient with bloody diarrhea. Gemini investigates through the same guard.

- `3:02.3 → 3:06.2`  We run the same agents again, for a patient with bloody diarrhea.

### [3:08.0] Not confirmed → take a water sample
*On screen:* Never a boil-water advisory from an unconfirmed signal.

- `3:08.3 → 3:12.1`  With only an unconfirmed signal, the one thing the system may
- `3:12.1 → 3:14.1`  suggest is taking a water sample.
- `3:14.1 → 3:15.8`  Never a boil-water advisory.

### [3:16.4] Clinical safety
*On screen:* Rough rankings, not probabilities · only verified test codes · review stays ROUTINE.

- `3:16.7 → 3:20.3`  Clinically, disease scores are labelled as rough rankings,
- `3:20.3 → 3:23.9`  not probabilities, and only verified test codes are shown.
- `3:23.9 → 3:26.0`  The review priority stays routine.

### [3:26.7] Nothing is guessed
*On screen:* Bad input is refused, not filled in.

- `3:27.0 → 3:30.1`  And nothing is guessed: bad input is refused.

### [3:30.9] Guarded AI
*On screen:* Fixed tool list · scope locked · patient data on our server · limits on calls and time.

- `3:31.2 → 3:34.7`  The Gemini safeguards: a fixed tool list for each agent,
- `3:34.7 → 3:38.6`  scope locked to the request, patient details kept on our server,
- `3:38.6 → 3:40.4`  and limits on calls and time.

### [3:41.2] PathoStream EHR
*On screen:* Research prototype · simulated data · not a medical device · 14-risk safety file, every safety control tested.

- `3:41.5 → 3:45.5`  PathoStream EHR: warn the doctor before the patients arrive.
- `3:45.5 → 3:48.0`  A research prototype on simulated data,
- `3:48.0 → 3:51.7`  not a medical device, with a fourteen-risk safety file,
- `3:51.7 → 3:53.8`  and every safety control tested.
- `3:53.8 → 3:54.4`  Thank you.

---

## Part B: Core messages for the presentation

Use these as slide titles and speaker notes. Each one points to the moment in
the video that backs it.

1. **The problem.** Contamination reaches people before doctors know about it.
   River monitoring and hospital records are separate systems. *(0:00)*
2. **The idea.** Connect river monitoring to the patient record: spot the
   problem, forecast where it goes, and alert the doctor. *(0:36–1:05)*
3. **Real standards, not a mock-up.** CDS Hooks alerts inside the patient
   record, and FHIR data. Citizen reports use the OneAquaHealth FHIR guide's own
   format and pass the official HL7 validator with 0 errors. *(0:54, 1:54)*
4. **Scale.** 9 real European rivers, 41 stations, 15 EU countries, one
   pipeline. Live government water-level data is kept separate from the
   simulated readings. *(0:17–0:36)*
5. **Three ways a problem gets flagged, and the alert matches the evidence.**
   - A water official confirms it: a red, critical alert.
   - The trend check flags it: an amber warning marked not confirmed.
   - A citizen reports it: it counts only after a water official approves it.

   *(0:36–1:54)*
6. **Plain language for busy people.** Every doctor's alert starts with one
   line in plain words, and the screens say "water cloudiness", not jargon.
   *(0:54)*
7. **People, animals and the river (One Health).** Citizens report dead fish
   and wildlife, and the forecasts track leptospirosis, which spreads from
   animals to people. *(1:31)*
8. **AI with people in charge.** Four Gemini agents. Gemini chooses what to
   check, a guard checks every call, and every suggestion is a draft.
   *(2:10–3:26)*
9. **Safety, stated honestly.** A 14-risk safety file in which every built
   safety control is linked to an automated test (442 pass). It is a research
   prototype, not a medical device. *(3:41)*
10. **What's next:** real sensor data, biodiversity indicators, a clinical
    review of the rules, a privacy review before any patient data reaches AI,
    and log-in with a real review workflow.

**If asked "Is it a medical device?"** "No. It's a research prototype on
simulated data. If it were ever put on the market, the doctor-facing alert
would count as medical-device software. That's why every alert matches its
evidence and a person approves every action."

**If asked "What does Gemini actually do?"** "It decides what to look at and
writes the summaries. It never decides a number, a severity or an action. A
guard checks every call, and if Gemini fails, the system falls back to plain
rules and says so on screen."
