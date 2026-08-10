import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type StyleSpecification,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { GardenDetail } from '../../shared/types';

type BaseLayer = 'map' | 'aerial';

function buildMapStyle(aerialAvailable: boolean): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap-bidragsydere',
    },
  };
  if (aerialAvailable) {
    sources.orthophoto = {
      type: 'raster',
      tiles: ['/api/map/orthophoto/{z}/{x}/{y}.jpg'],
      tileSize: 256,
      maxzoom: 21,
      attribution: 'GeoDanmark Ortofoto · Datafordeleren',
    };
  }
  return {
    version: 8,
    sources,
    layers: [
      { id: 'osm', type: 'raster', source: 'osm' },
      ...(aerialAvailable
        ? [{ id: 'orthophoto', type: 'raster' as const, source: 'orthophoto', layout: { visibility: 'none' as const } }]
        : []),
    ],
  };
}

export function MappingAerialOverview({ garden, aerialAvailable }: {
  garden: GardenDetail;
  aerialAvailable: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>(aerialAvailable ? 'aerial' : 'map');

  const featureCollection = useMemo<FeatureCollection<Geometry>>(() => ({
    type: 'FeatureCollection',
    features: garden.features.map((item) => ({
      type: 'Feature',
      id: item.id,
      geometry: item.geometry,
      properties: { name: item.name, type: item.type },
    } satisfies Feature<Geometry>)),
  }), [garden.features]);
  const featureCollectionRef = useRef(featureCollection);
  const baseLayerRef = useRef(baseLayer);

  useEffect(() => { featureCollectionRef.current = featureCollection; }, [featureCollection]);
  useEffect(() => { baseLayerRef.current = baseLayer; }, [baseLayer]);
  useEffect(() => {
    if (aerialAvailable) setBaseLayer('aerial');
  }, [aerialAvailable]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(aerialAvailable),
      center: [garden.centerLng, garden.centerLat],
      zoom: 19,
      maxZoom: 22,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      if (aerialAvailable) {
        map.setLayoutProperty('osm', 'visibility', baseLayerRef.current === 'map' ? 'visible' : 'none');
        map.setLayoutProperty('orthophoto', 'visibility', baseLayerRef.current === 'aerial' ? 'visible' : 'none');
      }
      map.addSource('garden-mapping', { type: 'geojson', data: featureCollectionRef.current });
      map.addLayer({
        id: 'garden-mapping-fill',
        type: 'fill',
        source: 'garden-mapping',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#d69935', 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'garden-mapping-line',
        type: 'line',
        source: 'garden-mapping',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#fff7db', 'line-width': 4, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'garden-mapping-point',
        type: 'circle',
        source: 'garden-mapping',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#d69935',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [aerialAvailable, garden.centerLat, garden.centerLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('garden-mapping') as GeoJSONSource | undefined)?.setData(featureCollection);
  }, [featureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !aerialAvailable) return;
    map.setLayoutProperty('osm', 'visibility', baseLayer === 'map' ? 'visible' : 'none');
    map.setLayoutProperty('orthophoto', 'visibility', baseLayer === 'aerial' ? 'visible' : 'none');
  }, [aerialAvailable, baseLayer]);

  return (
    <section className="mapping-assistant-card aerial-card">
      <div className="mapping-card-heading">
        <div>
          <p className="eyebrow">Grundstruktur</p>
          <h2>Tegn oven på haven</h2>
          <p>Brug luftfotoet til grænser, bede, træer, terrasse og skråninger. Dine eksisterende objekter vises ovenpå.</p>
        </div>
        <div className="base-layer-toggle" aria-label="Vælg kortbaggrund">
          <button type="button" className={baseLayer === 'map' ? 'active' : ''} onClick={() => setBaseLayer('map')}>Kort</button>
          <button type="button" className={baseLayer === 'aerial' ? 'active' : ''} onClick={() => setBaseLayer('aerial')} disabled={!aerialAvailable}>Luftfoto</button>
        </div>
      </div>
      <div ref={containerRef} className="aerial-overview-map" aria-label="Kortlægning på kort eller luftfoto" />
      {!aerialAvailable && <p className="field-help">Luftfoto mangler Datafordeler-nøglen. Det almindelige kort virker imens.</p>}
    </section>
  );
}
