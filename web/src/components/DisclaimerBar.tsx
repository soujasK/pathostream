export function DisclaimerBar() {
  return (
    <div className="border-b border-warning-border bg-warning-bg">
      <div className="mx-auto max-w-7xl px-6 py-2 text-xs text-warning">
        <span className="font-semibold">Notice:</span> prototype demo only -- not a certified medical device, not
        validated Mondego hydrology, not a conformant Portuguese WFD assessment. Synthetic data throughout. See
        README.md ("What's verified vs illustrative") before treating any figure here as fact.
      </div>
    </div>
  )
}
