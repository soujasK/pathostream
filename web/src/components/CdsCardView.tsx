import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import type { Card } from '../api/types'
import { Badge } from './ui/Badge'

interface CdsCardViewProps {
  card: Card | undefined
  isLoading: boolean
}

export function CdsCardView({ card, isLoading }: CdsCardViewProps) {
  if (isLoading && !card) {
    return <div className="h-32 animate-pulse rounded-xl bg-surface-sunken" />
  }

  if (!card) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-healthy-border bg-healthy-bg px-5 py-4 text-sm text-healthy">
        <span className="h-2 w-2 shrink-0 rounded-full bg-healthy" />
        No active alert
      </div>
    )
  }

  const isCritical = card.indicator === 'critical'
  // The backend mints a fresh random uuid on every response, even for an
  // unchanged ongoing card -- key on the meaningful content instead so
  // polling /demo/state every few seconds doesn't replay the enter/exit
  // animation on every tick.
  const stableKey = `${card.indicator}-${card.suggestions[0]?.label ?? card.summary}`

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stableKey}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={clsx(
          'rounded-xl border-l-[5px] px-6 py-5',
          isCritical
            ? 'border-l-critical bg-[linear-gradient(135deg,_#fef2f2_0%,_#fff_65%)] shadow-[0_8px_30px_-8px_rgba(220,38,38,0.35)]'
            : cardTone(card.indicator),
        )}
      >
        <div className="flex items-center gap-2">
          <Badge severity={card.indicator}>{card.indicator}</Badge>
          {isCritical && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-critical" />
            </span>
          )}
        </div>
        <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold text-ink">
          <span className="text-ink-muted">In plain words: </span>
          {plainSummary(card)}
        </p>
        <h3 className="mt-3 text-lg leading-snug font-bold text-ink">{card.summary}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{card.detail}</p>
        <p className="mt-3 text-xs text-ink-faint">Source: {card.source.label}</p>

        {card.suggestions.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-black/5 pt-4">
            {card.suggestions.map((suggestion) => (
              <div key={suggestion.uuid} className="rounded-lg bg-black/[0.03] px-3.5 py-2.5">
                <div className="text-sm font-semibold text-ink">{suggestion.label}</div>
                {suggestion.actions.map((action, index) => (
                  <div key={index} className="mt-0.5 text-xs text-ink-muted">
                    {action.description}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/** One plain sentence for a busy clinician, matched to what the card actually
 * claims: only a confirmed event is described as confirmed. */
function plainSummary(card: Card): string {
  if (card.indicator === 'critical') {
    return 'Contamination near this patient’s home has been confirmed. Consider a water-related cause.'
  }
  if (/unconfirmed/i.test(card.summary)) {
    return 'An automatic check suggests possible contamination near this patient’s home. It is not confirmed.'
  }
  if (/predicted/i.test(card.summary)) {
    return 'Contamination upstream is expected to reach this patient’s area soon. It is not confirmed here yet.'
  }
  return 'A possible water issue was flagged near this patient’s home. It is not confirmed.'
}

function cardTone(indicator: Card['indicator']): string {
  switch (indicator) {
    case 'warning':
      return 'border-l-warning bg-warning-bg'
    default:
      return 'border-l-info bg-info-bg'
  }
}
