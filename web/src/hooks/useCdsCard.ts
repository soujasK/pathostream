import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { StationInfo } from '../api/types'

export interface UseCdsCardParams {
  station: StationInfo | undefined
  betaLactamAllergy: boolean
  renalImpairment: boolean
  /** Include the latest tick number so the card is refetched every time a
   * fresh reading lands, not just when the controls change. */
  tick: number | undefined
}

/** Calls the real `POST /cds-services/patient-view` CDS Hooks endpoint --
 * the same one an EHR would call -- whenever the selected station, the
 * allergy/renal toggles, or the latest tick changes. */
export function useCdsCard({ station, betaLactamAllergy, renalImpairment, tick }: UseCdsCardParams) {
  return useQuery({
    queryKey: ['cds-patient-view', station?.station_id, betaLactamAllergy, renalImpairment, tick],
    queryFn: () => api.patientView({ station: station!, betaLactamAllergy, renalImpairment }),
    enabled: station !== undefined && tick !== undefined,
    placeholderData: (previous) => previous,
  })
}
