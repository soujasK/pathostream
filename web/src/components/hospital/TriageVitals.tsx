import { StatTile } from '../ui/StatTile'

interface TriageVitalsProps {
  flagged: boolean
}

/** Illustrative vitals for the demo patient -- shifts to a septic-picture
 * presentation when the patient's home station is currently flagged, same
 * as ui/dashboard.py's mock triage bay. Not derived from any real patient
 * data source; purely for demo narrative. */
export function TriageVitals({ flagged }: TriageVitalsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile label="Blood pressure" value={flagged ? '85/50 mmHg' : '118/76 mmHg'} alert={flagged} />
      <StatTile label="Temperature" value={flagged ? '39.2°C' : '37.0°C'} alert={flagged} />
      <StatTile label="Heart rate" value={flagged ? '122 bpm' : '78 bpm'} alert={flagged} />
    </div>
  )
}
