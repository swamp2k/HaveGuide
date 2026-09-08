import type { PlantIdentification } from '../../shared/types';
import { PlantCard, type PlantCardHandlers } from './PlantCard';
import { LeafIcon, PlusIcon } from './icons';

export function PlantCardsSection({
  identifications,
  busyId,
  canIdentify,
  onAdd,
  handlers,
}: {
  identifications: PlantIdentification[];
  busyId: string;
  canIdentify: boolean;
  onAdd: () => void;
  handlers: PlantCardHandlers;
}) {
  const included = identifications.filter((item) => item.includeInAnalysis).length;

  return (
    <section className="panel plants-panel">
      <div className="section-heading">
        <h2>Planter i bedet</h2>
        <button className="secondary compact" onClick={onAdd} disabled={!canIdentify}>
          <PlusIcon size={16} /> Tilføj plante
        </button>
      </div>

      {identifications.length === 0 ? (
        <button className="empty-plants" onClick={onAdd} disabled={!canIdentify}>
          <span className="empty-plants-icon"><LeafIcon size={24} /></span>
          <strong>Ingen planter endnu</strong>
          <span>Tag et nærfoto af en plante.</span>
        </button>
      ) : (
        <>
          <div className="plant-card-list">
            {identifications.map((identification) => (
              <PlantCard
                key={identification.id}
                identification={identification}
                busy={busyId === identification.id}
                canRescan={canIdentify}
                handlers={handlers}
              />
            ))}
          </div>
          <p className="plants-footnote">
            {included} af {identifications.length} planter er med, når du beder om idéer.
          </p>
        </>
      )}
    </section>
  );
}
