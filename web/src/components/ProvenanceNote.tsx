interface Row {
  claim: string
  status: 'verified' | 'illustrative'
  note: string
}

const ROWS: Row[] = [
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
  { claim: 'Fischer (1979) / Liu (1977) dispersion-coefficient formula', status: 'verified', note: 'Confirmed against two independent secondary sources; available for real channel geometry, not used for the flat Mondego default.' },
  { claim: 'Closed-form model solves the governing transport PDE', status: 'verified', note: 'Checked against a direct finite-difference numerical solution, not just asserted -- see METHODS.md §4.' },
  { claim: 'Leptospirosis/flooding clinical link', status: 'verified', note: 'Naing et al. 2019, PLoS One -- pooled OR 2.19 across 14 studies. See METHODS.md §6.' },
  { claim: 'Flooding doubles odds of harmful pathogen concentrations in EU water bodies', status: 'verified', note: 'European Environment Agency, fetched directly from eea.europa.eu. See METHODS.md §6.' },
  { claim: '~40x pharmaceutical contamination spike downstream of Coimbra’s WWTP on the Mondego', status: 'verified', note: 'Kötke et al. 2024, Heliyon 10(15):e34825. See METHODS.md §6a.' },
  { claim: 'This demo’s 6 stations are OneAquaHealth’s real Coimbra field sites', status: 'illustrative', note: 'No -- the real project monitors small tributary streams, not these Mondego-riverbank landmarks. See METHODS.md §6b.' },
  { claim: 'OneAquaHealth is a real, active EUR 4.9M Horizon Europe project (Univ. of Coimbra)', status: 'verified', note: 'Confirmed directly against its CORDIS project page, grant 101086521. See METHODS.md §6b.' },
  { claim: 'EWMA control chart (Roberts 1959) for statistical early-warning detection', status: 'verified', note: 'Real citation and formula, exact time-varying control limits, independently tested. See METHODS.md §8.' },
  { claim: 'Early-warning telemetry reflects real Mondego sensor readings', status: 'illustrative', note: 'No -- synthetic Gaussian noise around a documented baseline. The algorithm is real; the data feeding it is not. See METHODS.md §8.' },
  { claim: 'GDPR Article 9 / EU Health Data Space (Reg. (EU) 2025/327) compliance', status: 'illustrative', note: 'Not implemented -- named and discussed honestly as a real, current, acknowledged gap. See METHODS.md §9.' },
]

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
        {ROWS.map((row) => (
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
      </div>
    </div>
  )
}
