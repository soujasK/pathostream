export type Severity = 'healthy' | 'info' | 'warning' | 'critical'

interface SeverityTokens {
  text: string
  bg: string
  border: string
  dot: string
}

export const SEVERITY_TOKENS: Record<Severity, SeverityTokens> = {
  healthy: { text: 'text-healthy', bg: 'bg-healthy-bg', border: 'border-healthy-border', dot: 'bg-healthy' },
  info: { text: 'text-info', bg: 'bg-info-bg', border: 'border-info-border', dot: 'bg-info' },
  warning: { text: 'text-warning', bg: 'bg-warning-bg', border: 'border-warning-border', dot: 'bg-warning' },
  critical: { text: 'text-critical', bg: 'bg-critical-bg', border: 'border-critical-border', dot: 'bg-critical' },
}

export const SEVERITY_HEX: Record<Severity, string> = {
  healthy: '#059669',
  info: '#2563eb',
  warning: '#d97706',
  critical: '#dc2626',
}
