<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Map as LeafletMap, TileLayer, LayerGroup } from 'leaflet';
  import type { Location } from '@au-archive/core';
  import Supercluster from 'supercluster';
  import { MAP_CONFIG, TILE_LAYERS, THEME } from '@/lib/constants';

  interface Props {
    locations?: Location[];
    onLocationClick?: (location: Location) => void;
    onMapClick?: (lat: number, lng: number) => void;
  }

  let { locations = [], onLocationClick, onMapClick }: Props = $props();

  /**
   * Escape HTML to prevent XSS attacks
   */
  function escapeHtml(unsafe: string | null | undefined): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let mapContainer: HTMLDivElement;
  let map: LeafletMap | null = null;
  let markersLayer: LayerGroup | null = null;
  let cluster: Supercluster | null = null;
  let lastLocationsLength = $state(0);

  onMount(async () => {
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');

    if (!map && mapContainer) {
      map = L.map(mapContainer, {
        center: [MAP_CONFIG.DEFAULT_CENTER.lat, MAP_CONFIG.DEFAULT_CENTER.lng],
        zoom: MAP_CONFIG.DEFAULT_ZOOM,
      });

      const baseLayers: { [key: string]: TileLayer } = {
        'Satellite': L.tileLayer(TILE_LAYERS.SATELLITE, {
          attribution: 'Tiles &copy; Esri',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
        }),
        'Street': L.tileLayer(TILE_LAYERS.STREET, {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
        }),
        'Topo': L.tileLayer(TILE_LAYERS.TOPO, {
          attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
          maxZoom: 17,
        }),
      };

      const overlayLayers: { [key: string]: TileLayer } = {
        'Labels': L.tileLayer(TILE_LAYERS.LABELS, {
          attribution: '&copy; CartoDB',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
          subdomains: 'abcd',
        }),
      };

      baseLayers['Satellite'].addTo(map);

      L.control.layers(baseLayers, overlayLayers).addTo(map);

      markersLayer = L.layerGroup().addTo(map);

      map.on('click', (e) => {
        if (onMapClick) {
          onMapClick(e.latlng.lat, e.latlng.lng);
        }
      });

      map.on('zoomend moveend', () => {
        updateClusters(L);
      });

      initCluster();
      updateClusters(L);
    }
  });

  function initCluster() {
    cluster = new Supercluster({
      radius: MAP_CONFIG.CLUSTER_RADIUS,
      maxZoom: MAP_CONFIG.CLUSTER_MAX_ZOOM,
      minPoints: MAP_CONFIG.CLUSTER_MIN_POINTS,
    });

    const points = locations
      .filter(loc => loc.gps)
      .map(loc => ({
        type: 'Feature' as const,
        properties: { location: loc },
        geometry: {
          type: 'Point' as const,
          coordinates: [loc.gps!.lng, loc.gps!.lat],
        },
      }));

    cluster.load(points);
  }

  function updateClusters(L: any) {
    if (!map || !markersLayer || !cluster) return;

    markersLayer.clearLayers();

    const bounds = map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const zoom = map.getZoom();

    const clusters = cluster.getClusters(bbox, Math.floor(zoom));

    clusters.forEach((feature: any) => {
      const [lng, lat] = feature.geometry.coordinates;

      if (feature.properties.cluster) {
        const count = feature.properties.point_count;
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            html: `<div class="cluster-marker">${count}</div>`,
            className: 'cluster-icon',
            iconSize: [40, 40],
          }),
        });

        marker.on('click', () => {
          const expansionZoom = Math.min(
            cluster!.getClusterExpansionZoom(feature.properties.cluster_id),
            MAP_CONFIG.CLUSTER_EXPANSION_MAX_ZOOM
          );
          map!.setView([lat, lng], expansionZoom);
        });

        markersLayer.addLayer(marker);
      } else {
        const location = feature.properties.location;
        const marker = L.marker([lat, lng]);

        marker.bindPopup(`
          <div>
            <strong>${escapeHtml(location.locnam)}</strong><br/>
            ${escapeHtml(location.type) || 'Unknown Type'}<br/>
            ${location.address?.city ? `${escapeHtml(location.address.city)}, ` : ''}${escapeHtml(location.address?.state) || ''}
          </div>
        `);

        marker.on('click', () => {
          if (onLocationClick) {
            onLocationClick(location);
          }
        });

        markersLayer.addLayer(marker);
      }
    });

    if (locations.length > 0 && locations[0].gps && zoom === MAP_CONFIG.DEFAULT_ZOOM) {
      map.setView([locations[0].gps.lat, locations[0].gps.lng], MAP_CONFIG.DETAIL_ZOOM);
    }
  }

  $effect(() => {
    // Only reinitialize cluster if locations array length changed
    if (map && markersLayer && locations.length !== lastLocationsLength) {
      lastLocationsLength = locations.length;
      initCluster();
      import('leaflet').then((L) => updateClusters(L.default));
    }
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });
</script>

<div bind:this={mapContainer} class="w-full h-full"></div>

<style>
  :global(.leaflet-container) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  }

  :global(.cluster-icon) {
    background: transparent;
    border: none;
  }

  :global(.cluster-marker) {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--color-accent, #b9975c);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
    border: 3px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
</style>
