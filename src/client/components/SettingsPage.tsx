import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker, type StyleSpecification } from 'maplibre-gl';
import type { GardenDetail, UserSummary } from '../../shared/types';
import { api, ApiError } from '../api';
import { StatusMessage } from './StatusMessage';

interface SettingsPageProps {
  user: UserSummary;
  garden: GardenDetail;
  onGardenChanged: (garden: GardenDetail) => void;
  onLogout: () => void;
}

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap-bidragsydere',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function LocationPicker({ latitude, longitude, onChange }: {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [longitude, latitude],
      zoom: 18,
      maxZoom: 22,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const marker = new maplibregl.Marker({ draggable: true, color: '#2f684c' })
      .setLngLat([longitude, latitude])
      .addTo(map);

    marker.on('dragend', () => {
      const position = marker.getLngLat();
      onChange(position.lat, position.lng);
    });

    map.on('click', (event) => {
      marker.setLngLat(event.lngLat);
      onChange(event.lngLat.lat, event.lngLat.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
    mapRef.current?.easeTo({ center: [longitude, latitude], duration: 300 });
  }, [latitude, longitude]);

  return <div ref={containerRef} className="settings-location-map" aria-label="Vælg havens placering på kortet" />;
}

export function SettingsPage({ user, garden, onGardenChanged, onLogout }: SettingsPageProps) {
  const [name, setName] = useState(garden.name);
  const [address, setAddress] = useState(garden.address);
  const [notes, setNotes] = useState(garden.notes);
  const [centerLat, setCenterLat] = useState(garden.centerLat);
  const [centerLng, setCenterLng] = useState(garden.centerLng);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(garden.name);
    setAddress(garden.address);
    setNotes(garden.notes);
    setCenterLat(garden.centerLat);
    setCenterLng(garden.centerLng);
  }, [garden.id, garden.name, garden.address, garden.notes, garden.centerLat, garden.centerLng]);

  function updateLocation(latitude: number, longitude: number) {
    setCenterLat(Number(latitude.toFixed(7)));
    setCenterLng(Number(longitude.toFixed(7)));
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage('Din browser understøtter ikke positionsbestemmelse. Flyt nålen manuelt på kortet.');
      return;
    }

    setLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateLocation(position.coords.latitude, position.coords.longitude);
        setMessage('Din aktuelle placering er valgt. Kontrollér nålen og gem ændringerne.');
        setLocating(false);
      },
      () => {
        setMessage('Placeringen kunne ikke hentes. Tryk på kortet eller træk nålen manuelt.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await api.updateGarden(garden.id, {
        name,
        address,
        notes,
        centerLat,
        centerLng,
      });
      onGardenChanged({ ...garden, ...response.garden });
      setMessage('Havens oplysninger og kortplacering er gemt.');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Oplysningerne kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api.logout();
      onLogout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow-page settings-page">
      <section>
        <p className="eyebrow">Have</p>
        <h1>Indstillinger</h1>
        {message && <StatusMessage>{message}</StatusMessage>}
        <form className="form-stack" onSubmit={save}>
          <label>Navn<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label>
          <label>Adresse<input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} /></label>

          <fieldset className="location-fieldset">
            <legend>Kortplacering</legend>
            <p className="field-help">Adressen er kun en beskrivelse. Tryk på kortet eller træk den grønne nål hen på selve haven.</p>
            <LocationPicker latitude={centerLat} longitude={centerLng} onChange={updateLocation} />
            <button className="secondary-button" type="button" onClick={useCurrentLocation} disabled={busy || locating}>
              {locating ? 'Finder placering…' : 'Brug min aktuelle placering'}
            </button>
            <details className="coordinate-details">
              <summary>Vis præcise koordinater</summary>
              <div className="coordinate-row">
                <label>Breddegrad<input type="number" min="-90" max="90" step="0.0000001" value={centerLat} onChange={(event) => setCenterLat(Number(event.target.value))} /></label>
                <label>Længdegrad<input type="number" min="-180" max="180" step="0.0000001" value={centerLng} onChange={(event) => setCenterLng(Number(event.target.value))} /></label>
              </div>
            </details>
          </fieldset>

          <label>Noter<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Gemmer…' : 'Gem ændringer'}</button>
        </form>
      </section>
      <section className="settings-section">
        <h2>Bruger</h2>
        <p>Logget ind som <strong>{user.username}</strong>.</p>
        <button className="secondary-button" type="button" onClick={logout} disabled={busy}>Log ud</button>
      </section>
      <section className="settings-section">
        <h2>Om denne udgave</h2>
        <p>Have Guide Milestone 3. Kort, billeder, kortlægning og planer gemmes privat i din egen installation.</p>
      </section>
    </main>
  );
}
