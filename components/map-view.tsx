"use client";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  website?: string | null;
}

function pin(active: boolean, done: boolean) {
  const bg = active ? "#4f46e5" : done ? "#10b981" : "#ea4335";
  const s = active ? 30 : 24;
  return L.divIcon({
    className: "",
    html: `<div style="width:${s}px;height:${s}px;position:relative;filter:drop-shadow(0 2px 3px rgba(15,23,42,.4));${active ? "z-index:999;" : ""}">`
      + `<div style="width:100%;height:100%;background:${bg};border-radius:50% 50% 50% 4px;transform:rotate(-45deg);border:2.5px solid #fff;"></div>`
      + `<div style="position:absolute;top:50%;left:50%;width:${active ? 9 : 7}px;height:${active ? 9 : 7}px;background:#fff;border-radius:9999px;transform:translate(-50%,-58%);"></div>`
      + `</div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s - 2],
    popupAnchor: [0, -s + 4],
  });
}

function Fit({ points, active }: { points: MapPoint[]; active: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (active) {
      map.setView([active.lat, active.lng], Math.max(map.getZoom(), 14));
      return;
    }
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40] });
  }, [points, active, map]);
  return null;
}

export default function MapView({
  points,
  center,
  activeId,
  scrapedIds,
  onSelect,
}: {
  points: MapPoint[];
  center: { lat: number; lng: number };
  activeId: string | null;
  scrapedIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const icons = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const p of points) m.set(p.id, pin(p.id === activeId, scrapedIds.has(p.id)));
    return m;
  }, [points, activeId, scrapedIds]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      scrollWheelZoom
      className="h-full w-full"
      style={{ minHeight: 320 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Fit points={points} active={points.find((p) => p.id === activeId) ?? null} />
      {points.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={icons.get(p.id) ?? pin(false, false)}
          eventHandlers={{ click: () => onSelect(p.id) }}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <strong>{p.name}</strong>
              {p.address ? <div style={{ fontSize: 12, color: "#64748b" }}>{p.address.slice(0, 90)}</div> : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
