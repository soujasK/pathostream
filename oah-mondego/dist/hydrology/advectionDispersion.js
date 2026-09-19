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
export const DEFAULT_DISPERSION_COEFFICIENT_M2_S = 8;
export const DEFAULT_BOUNDARY_Z_SCORE = 1.645;
export function computeTransportForecast(params) {
    const { distanceKm, meanVelocityMs } = params;
    const dispersionCoefficientM2S = params.dispersionCoefficientM2S ?? DEFAULT_DISPERSION_COEFFICIENT_M2_S;
    const boundaryZScore = params.boundaryZScore ?? DEFAULT_BOUNDARY_Z_SCORE;
    if (distanceKm <= 0)
        throw new Error("distanceKm must be positive");
    if (meanVelocityMs <= 0)
        throw new Error("meanVelocityMs must be positive");
    if (dispersionCoefficientM2S <= 0)
        throw new Error("dispersionCoefficientM2S must be positive");
    const distanceM = distanceKm * 1000;
    const peakTimeSeconds = distanceM / meanVelocityMs;
    const varianceSeconds2 = (2 * dispersionCoefficientM2S * distanceM) / meanVelocityMs ** 3;
    const sigmaSeconds = Math.sqrt(varianceSeconds2);
    const arrivalTimeSeconds = Math.max(0, peakTimeSeconds - boundaryZScore * sigmaSeconds);
    const clearanceTimeSeconds = peakTimeSeconds + boundaryZScore * sigmaSeconds;
    return {
        distanceKm,
        peakTimeMinutes: peakTimeSeconds / 60,
        arrivalTimeMinutes: arrivalTimeSeconds / 60,
        clearanceTimeMinutes: clearanceTimeSeconds / 60,
        temporalSpreadMinutes: sigmaSeconds / 60,
        dispersionCoefficientM2S,
    };
}
/**
 * Relative (peak-normalized, [0,1]) concentration intensity of the Gaussian
 * breakthrough curve at the given elapsed time. This is a RELATIVE index,
 * not an absolute concentration -- no real mass-loading/discharge data
 * exists for this illustrative case study, so an absolute mg/L prediction
 * would be fabricated. Multiply by an upstream severity index (e.g. a
 * CCI-style score) to get a scaled downstream severity estimate.
 */
export function relativeIntensityAt(elapsedMinutes, forecast) {
    const elapsedSeconds = elapsedMinutes * 60;
    const peakSeconds = forecast.peakTimeMinutes * 60;
    const sigmaSeconds = forecast.temporalSpreadMinutes * 60;
    if (sigmaSeconds <= 0)
        return elapsedSeconds === peakSeconds ? 1 : 0;
    const z = (elapsedSeconds - peakSeconds) / sigmaSeconds;
    return Math.exp(-0.5 * z * z);
}
