import { useState } from 'react';
import type { AiAnalysis } from '../../shared/types';

const MODE_LABEL: Record<AiAnalysis['mode'], string> = {
  overview: 'Området',
  ideas: 'Idéer',
  problem: 'Svar',
};

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="result-block">
      <h4>{title}</h4>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function AnalysisCard({ analysis, defaultOpen }: { analysis: AiAnalysis; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { payload } = analysis;
  const hasDetail =
    payload.observations.length + payload.recommendations.length + payload.cautions.length + payload.followUpQuestions.length > 0;

  return (
    <article className="result-card">
      <div className="result-meta">
        <span>{MODE_LABEL[analysis.mode]}</span>
        <time dateTime={analysis.createdAt}>
          {new Date(analysis.createdAt).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}
        </time>
      </div>
      <p className="result-summary">{payload.summary}</p>

      {hasDetail && !open && (
        <button type="button" className="link-button" onClick={() => setOpen(true)}>Læs mere</button>
      )}

      {hasDetail && open && (
        <>
          <Section title="Det jeg ser" items={payload.observations} />
          <Section title="Idéer" items={payload.recommendations} />
          <Section title="Vær opmærksom på" items={payload.cautions} />
          <Section title="Spørgsmål" items={payload.followUpQuestions} />
          {!defaultOpen && (
            <button type="button" className="link-button" onClick={() => setOpen(false)}>Skjul</button>
          )}
        </>
      )}
    </article>
  );
}

export function AnalysisSection({ analyses }: { analyses: AiAnalysis[] }) {
  if (analyses.length === 0) return null;
  return (
    <section className="results-section">
      <div className="section-heading"><h2>Svar fra haven</h2></div>
      <div className="analysis-results">
        {analyses.map((analysis, index) => (
          <AnalysisCard key={analysis.id} analysis={analysis} defaultOpen={index === 0} />
        ))}
      </div>
    </section>
  );
}
