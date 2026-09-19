/**
 * 1D advection-dispersion transport model for a pulse contaminant release
 * in an open channel.
 *
 * Uses the standard Taylor-dispersion (Fischer, List, Koh, Imberger &
 * Brooks, "Mixing in Inland and Coastal Waters", 1979) approximation: the
 * temporal concentration profile observed at a fixed downstream distance x
 * from an instantaneous release is approximately Gaussian in time, with
 *
 *   peak (centroid) time:      t_peak = x / u
 *   temporal variance:         sigma_t^2 = 2 * D * x / u^3
 *
 * where u is the mean flow velocity and D is the longitudinal dispersion
 * coefficient. This is real, standard river-transport theory -- what is
 * NOT real/verified is the specific `dispersionCoefficientM2S` value for
 * the actual Mondego River (no calibration data was available for this
 * case study); it is a documented, tunable illustrative default within the
 * literature's typical range for small-to-medium urban channels (Fischer
 * et al. cite roughly 1-100 m^2/s depending on channel geometry).
 */
export interface AdvectionDispersionParams {
    distanceKm: number;
    meanVelocityMs: number;
    /** Longitudinal dispersion coefficient (m^2/s). NOT calibrated to the
     * real Mondego -- see module docstring. */
    dispersionCoefficientM2S?: number;
    /** z-score defining the arrival/clearance bounds around the peak.
     * 1.645 corresponds to the 5th/95th percentiles of a Gaussian. */
    boundaryZScore?: number;
}
export interface TransportForecast {
    distanceKm: number;
    peakTimeMinutes: number;
    arrivalTimeMinutes: number;
    clearanceTimeMinutes: number;
    temporalSpreadMinutes: number;
    dispersionCoefficientM2S: number;
}
export declare const DEFAULT_DISPERSION_COEFFICIENT_M2_S = 8;
export declare const DEFAULT_BOUNDARY_Z_SCORE = 1.645;
export declare function computeTransportForecast(params: AdvectionDispersionParams): TransportForecast;
/**
 * Relative (peak-normalized, [0,1]) concentration intensity of the Gaussian
 * breakthrough curve at the given elapsed time. This is a RELATIVE index,
 * not an absolute concentration -- no real mass-loading/discharge data
 * exists for this illustrative case study, so an absolute mg/L prediction
 * would be fabricated. Multiply by an upstream severity index (e.g. a
 * CCI-style score) to get a scaled downstream severity estimate.
 */
export declare function relativeIntensityAt(elapsedMinutes: number, forecast: TransportForecast): number;
