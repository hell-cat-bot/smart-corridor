import React, { useMemo } from 'react';
import { Polyline } from 'react-leaflet';
import useWorldStore from '../../store/useWorldStore';
import useSettingsStore from '../../store/useSettingsStore';
import { roadWeight } from '../../data/network';

const roadColor = (roadClass) => {
  if (['motorway', 'trunk', 'motorway_link', 'trunk_link'].includes(roadClass)) return '#F59E0B';
  if (['primary', 'primary_link'].includes(roadClass)) return '#FBBF24';
  if (['secondary', 'secondary_link'].includes(roadClass)) return '#CBD5E1';
  return '#D8DEE7';
};

function RoadsLayer() {
  const edges = useWorldStore((s) => s.edges);
  const showRoads = useSettingsStore((s) => s.showGridEdges);

  const roads = useMemo(
    () =>
      showRoads
        ? edges.map((e) => ({
            id: `${e.from}|${e.to}`,
            positions: e.geometry ?? [],
            color: roadColor(e.roadClass),
            weight: roadWeight(e.roadClass),
          }))
        : [],
    [edges, showRoads],
  );

  if (!showRoads) return null;

  return (
    <>
      {roads.map((road) =>
        road.positions.length > 1 ? (
          <Polyline
            key={road.id}
            positions={road.positions}
            pathOptions={{
              color: road.color,
              weight: road.weight,
              opacity: 0.75,
              interactive: false,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ) : null,
      )}
    </>
  );
}

export default React.memo(RoadsLayer);
