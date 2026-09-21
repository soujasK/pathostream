interface Row {
  claim: string
  status: 'verified' | 'illustrative'
  note: string
}

const MONDEGO_ROWS: Row[] = [
  { claim: 'All 6 network station NAMES (Santa Clara, Manuel Braga, Parque Verde, Choupalinho, Açude-Ponte, Choupal)', status: 'verified', note: 'Every station is a real, independently confirmed place on the Mondego in Coimbra.' },
  { claim: 'Coordinates: Santa Clara, Açude-Ponte, Mata Nacional do Choupal', status: 'verified', note: 'Sourced directly from public references (e.g. Wikipedia infoboxes), fetched independently.' },
  { claim: 'Coordinates: Parque Manuel Braga, Parque Choupalinho', status: 'illustrative', note: 'Names and existence verified; precise coordinates are estimated by interpolation (no public geocode found for these two specifically).' },
  { claim: 'Upstream-to-downstream station order', status: 'illustrative', note: 'Derived from sourced textual descriptions + the Mondego’s real flow direction through Coimbra, not a surveyed hydrological flow analysis.' },
  { claim: 'LOINC 82195-9 (GI pathogens NAA panel)', status: 'verified', note: 'Confirmed against loinc.org.' },
  { claim: 'SNOMED CT 77377001 (Leptospirosis)', status: 'verified', note: 'Confirmed against browser.ihtsdotools.org.' },
  { claim: 'Centro Hospitalar e Universitário de Coimbra (CHUC)', status: 'verified', note: 'Real hospital; used as narrative framing only, not a live integration.' },
  { claim: 'Per-segment distance / velocity (0.36 m/s network-wide)', status: 'illustrative', note: 'No public gauge reading to check against; a documented, tunable default applied uniformly.' },
  { claim: 'EU WFD 5-class EQR boundaries used here', status: 'illustrative', note: 'The 5-class system is real; these numeric boundaries are not Portugal’s official, intercalibrated ones.' },
  { claim: 'CDS Hooks 3.0.0', status: 'illustrative', note: 'A ballot draft, not yet a published HL7 standard.' },
  { claim: 'Leptospirosis/flooding clinical link', status: 'verified', note: 'Naing et al. 2019, PLoS One -- pooled OR 2.19 across 14 studies. See METHODS.md §6.' },
  { claim: 'Flooding doubles odds of harmful pathogen concentrations in EU water bodies', status: 'verified', note: 'European Environment Agency, fetched directly from eea.europa.eu. See METHODS.md §6.' },
  { claim: '~40x pharmaceutical contamination spike downstream of Coimbra’s WWTP on the Mondego', status: 'verified', note: 'Kötke et al. 2024, Heliyon 10(15):e34825. See METHODS.md §6a.' },
  { claim: 'This demo’s 6 stations are OneAquaHealth’s real Coimbra field sites', status: 'illustrative', note: 'No -- the real project monitors small tributary streams, not these Mondego-riverbank landmarks. See METHODS.md §6b.' },
  { claim: 'OneAquaHealth is a real, active EUR 4.9M Horizon Europe project (Univ. of Coimbra)', status: 'verified', note: 'Confirmed directly against its CORDIS project page, grant 101086521. See METHODS.md §6b.' },
]

const DOURO_ROWS: Row[] = [
  { claim: 'Douro (897 km) / Duero is the largest Iberian river basin, Spain to the Atlantic at Porto', status: 'verified', note: 'Confirmed against the river’s own Wikipedia infobox, fetched directly.' },
  { claim: 'All 4 cross-border station NAMES (Zamora, Barca d’Alva, Peso da Régua, Porto)', status: 'verified', note: 'Real places, each confirmed to sit directly on or essentially at the Douro/Duero.' },
  { claim: 'All 4 station coordinates', status: 'verified', note: 'Fetched directly from each place’s own Wikipedia infobox, not estimated.' },
  { claim: 'Upstream-to-downstream order (Zamora → Barca d’Alva → Peso da Régua → Porto)', status: 'verified', note: 'Follows the river’s real, confirmed west-flowing course; longitude decreases monotonically station to station.' },
  { claim: 'Albufeira Convention (1998, Spain–Portugal shared-basin treaty covering the Douro)', status: 'verified', note: 'Real bilateral treaty, in force since 2000; confirmed real-time hydrometeorological data-sharing + monthly monitoring provisions. A specific pollution-notification clause could NOT be independently confirmed and is not claimed. See METHODS.md §6b.' },
  { claim: 'Douro network has a linked hospital in this demo, like CHUC on the Mondego', status: 'illustrative', note: 'No -- no hospital is named for the Douro network; its "Emergency Department" consequence is intentionally not modeled. See "Two rivers, two consequences" in README.md.' },
]

const SHARED_ROWS: Row[] = [
  { claim: 'Fischer (1979) / Liu (1977) dispersion-coefficient formula', status: 'verified', note: 'Confirmed against two independent secondary sources; available for real channel geometry, not used for either network’s flat default.' },
  { claim: 'Closed-form model solves the governing transport PDE', status: 'verified', note: 'Checked against a direct finite-difference numerical solution, not just asserted -- see METHODS.md §4.' },
  { claim: 'EWMA control chart (Roberts 1959) for statistical early-warning detection', status: 'verified', note: 'Real citation and formula, exact time-varying control limits, independently tested; shared across both networks’ stations. See METHODS.md §8.' },
  { claim: 'Early-warning telemetry reflects real sensor readings', status: 'illustrative', note: 'No -- synthetic Gaussian noise around a documented baseline, for both networks. The algorithm is real; the data feeding it is not. See METHODS.md §8.' },
  { claim: 'Auto-escalation rule (5 consecutive out-of-control ticks → confirmed, severity 0.7)', status: 'illustrative', note: 'A documented, tested design choice -- uncalibrated, no formal false-alarm rate. Clinician-facing cards say the flag was inferred from a turbidity trend, never a direct biohazard measurement. See METHODS.md §8.' },
  { claim: 'GDPR Article 9 / EU Health Data Space (Reg. (EU) 2025/327) compliance', status: 'illustrative', note: 'Not implemented -- named and discussed honestly as a real, current, acknowledged gap. See METHODS.md §9.' },
]

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <>
      <div className="bg-surface-sunken px-5 py-1.5 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
        {title}
      </div>
      {rows.map((row) => (
        <div key={row.claim} className="flex items-start gap-3 px-5 py-3">
          <span
            className={
              'mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ' +
              (row.status === 'verified'
                ? 'border-healthy-border bg-healthy-bg text-healthy'
                : 'border-warning-border bg-warning-bg text-warning')
            }
          >
            {row.status}
          </span>
          <div>
            <div className="text-sm font-medium text-ink">{row.claim}</div>
            <div className="text-xs text-ink-muted">{row.note}</div>
          </div>
        </div>
      ))}
    </>
  )
}

export function ProvenanceNote() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border bg-surface-muted px-5 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">What&rsquo;s verified vs illustrative</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Full table with sources in README.md. Shown here so this disclosure isn&rsquo;t buried.
        </p>
      </div>
      <div className="divide-y divide-border">
        <Section title="Mondego network" rows={MONDEGO_ROWS} />
        <Section title="Douro cross-border network" rows={DOURO_ROWS} />
        <Section title="Shared across both networks" rows={SHARED_ROWS} />
      </div>
    </div>
  )
}
