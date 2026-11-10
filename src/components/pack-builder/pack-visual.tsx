import type { PackResult } from "@/lib/pack-builder";

export function PackVisual({ result }: { result: PackResult }) {
  const cells = Array.from({ length: result.cellCount }, (_, index) => index);
  return (
    <div className="builder-visual" aria-label={`${result.config.series} series by ${result.config.parallel} parallel cell layout`}>
      <div className="builder-visual-head"><span>CELL LAYOUT</span><span>{result.cellCount} CELLS</span></div>
      <div className="builder-visual-stage">
        <span className="builder-terminal">−</span>
        <div className="builder-visual-grid" style={{ gridTemplateColumns: `repeat(${result.config.series}, minmax(0, 1fr))` }}>
          {cells.map((index) => <span key={index} className="builder-cell" data-chemistry={result.config.cellId} title={`Series ${(index % result.config.series) + 1}, parallel ${Math.floor(index / result.config.series) + 1}`}><i /></span>)}
        </div>
        <span className="builder-terminal builder-terminal-positive">+</span>
      </div>
      <div className="builder-visual-foot"><span>{result.config.series} groups in series</span><span>{result.config.parallel} cells in parallel</span></div>
    </div>
  );
}
