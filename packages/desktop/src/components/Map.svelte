<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Map as LeafletMap, TileLayer, LayerGroup } from 'leaflet';
  import type { Location } from '@au-archive/core';

  interface Props {
    locations?: Location[];
    onLocationClick?: (location: Location) => void;
    onMapClick?: (lat: number, lng: number) => void;
  }

  let { locations = [], onLocationClick, onMapClick }: Props = $props();

  let mapContainer: HTMLDivElement;
  let map: LeafletMap | null = null;
  let markersLayer: LayerGroup | null = null;

  onMount(async () => {
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');

    if (!map && mapContainer) {
      map = L.map(mapContainer, {
        center: [40.7128, -74.0060],
        zoom: 6,
      });

      const baseLayers: { [key: string]: TileLayer } = {
        'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: 'Tiles &copy; Esri',
          maxZoom: 19,
        }),
        'Street': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }),
        'Topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
          attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
          maxZoom: 17,
        }),
      };

      baseLayers['Satellite'].addTo(map);

      L.control.layers(baseLayers, {}).addTo(map);

      markersLayer = L.layerGroup().addTo(map);

      map.on('click', (e) => {
        if (onMapClick) {
          onMapClick(e.latlng.lat, e.latlng.lng);
        }
      });

      updateMarkers(L);
    }
  });

  function updateMarkers(L: any) {
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    locations.forEach((location) => {
      if (location.gps && markersLayer) {
        const marker = L.marker([location.gps.lat, location.gps.lng]);

        marker.bindPopup(`
          <div>
            <strong>${location.locnam}</strong><br/>
            ${location.type || 'Unknown Type'}<br/>
            ${location.address?.city ? `${location.address.city}, ` : ''}${location.address?.state || ''}
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

    if (locations.length > 0 && locations[0].gps) {
      map.setView([locations[0].gps.lat, locations[0].gps.lng], 10);
    }
  }

  $effect(() => {
    if (map && markersLayer && locations) {
      import('leaflet').then((L) => updateMarkers(L.default));
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
</style>
