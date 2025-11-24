<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Map as LeafletMap, TileLayer, LayerGroup } from 'leaflet';
  import type { Location } from '@au-archive/core';
  import Supercluster from 'supercluster';
  import { MAP_CONFIG, TILE_LAYERS, THEME, GPS_CONFIG } from '@/lib/constants';

  // Kanye3: US State CAPITALS for fallback positioning
  // Using capitals instead of centroids - more useful reference point
  const STATE_CAPITALS: Record<string, { lat: number; lng: number; city: string }> = {
    'AL': { lat: 32.377716, lng: -86.300568, city: 'Montgomery' },
    'AK': { lat: 58.301598, lng: -134.420212, city: 'Juneau' },
    'AZ': { lat: 33.448143, lng: -112.096962, city: 'Phoenix' },
    'AR': { lat: 34.746613, lng: -92.288986, city: 'Little Rock' },
    'CA': { lat: 38.576668, lng: -121.493629, city: 'Sacramento' },
    'CO': { lat: 39.739227, lng: -104.984856, city: 'Denver' },
    'CT': { lat: 41.764046, lng: -72.682198, city: 'Hartford' },
    'DE': { lat: 39.157307, lng: -75.519722, city: 'Dover' },
    'FL': { lat: 30.438118, lng: -84.281296, city: 'Tallahassee' },
    'GA': { lat: 33.749027, lng: -84.388229, city: 'Atlanta' },
    'HI': { lat: 21.307442, lng: -157.857376, city: 'Honolulu' },
    'ID': { lat: 43.617775, lng: -116.199722, city: 'Boise' },
    'IL': { lat: 39.798363, lng: -89.654961, city: 'Springfield' },
    'IN': { lat: 39.768623, lng: -86.162643, city: 'Indianapolis' },
    'IA': { lat: 41.591087, lng: -93.603729, city: 'Des Moines' },
    'KS': { lat: 39.048191, lng: -95.677956, city: 'Topeka' },
    'KY': { lat: 38.186722, lng: -84.875374, city: 'Frankfort' },
    'LA': { lat: 30.457069, lng: -91.187393, city: 'Baton Rouge' },
    'ME': { lat: 44.307167, lng: -69.781693, city: 'Augusta' },
    'MD': { lat: 38.978764, lng: -76.490936, city: 'Annapolis' },
    'MA': { lat: 42.358162, lng: -71.063698, city: 'Boston' },
    'MI': { lat: 42.733635, lng: -84.555328, city: 'Lansing' },
    'MN': { lat: 44.955097, lng: -93.102211, city: 'St. Paul' },
    'MS': { lat: 32.303848, lng: -90.182106, city: 'Jackson' },
    'MO': { lat: 38.579201, lng: -92.172935, city: 'Jefferson City' },
    'MT': { lat: 46.585709, lng: -112.018417, city: 'Helena' },
    'NE': { lat: 40.808075, lng: -96.699654, city: 'Lincoln' },
    'NV': { lat: 39.163914, lng: -119.766121, city: 'Carson City' },
    'NH': { lat: 43.206898, lng: -71.537994, city: 'Concord' },
    'NJ': { lat: 40.220596, lng: -74.769913, city: 'Trenton' },
    'NM': { lat: 35.682240, lng: -105.939728, city: 'Santa Fe' },
    'NY': { lat: 42.652843, lng: -73.757874, city: 'Albany' },
    'NC': { lat: 35.787743, lng: -78.644257, city: 'Raleigh' },
    'ND': { lat: 46.820850, lng: -100.783318, city: 'Bismarck' },
    'OH': { lat: 39.961346, lng: -82.999069, city: 'Columbus' },
    'OK': { lat: 35.492207, lng: -97.503342, city: 'Oklahoma City' },
    'OR': { lat: 44.938461, lng: -123.030403, city: 'Salem' },
    'PA': { lat: 40.264378, lng: -76.883598, city: 'Harrisburg' },
    'RI': { lat: 41.830914, lng: -71.414963, city: 'Providence' },
    'SC': { lat: 34.000343, lng: -81.033211, city: 'Columbia' },
    'SD': { lat: 44.367031, lng: -100.346405, city: 'Pierre' },
    'TN': { lat: 36.165810, lng: -86.784241, city: 'Nashville' },
    'TX': { lat: 30.27467, lng: -97.740349, city: 'Austin' },
    'UT': { lat: 40.777477, lng: -111.888237, city: 'Salt Lake City' },
    'VT': { lat: 44.262436, lng: -72.580536, city: 'Montpelier' },
    'VA': { lat: 37.538857, lng: -77.433640, city: 'Richmond' },
    'WA': { lat: 47.035805, lng: -122.905014, city: 'Olympia' },
    'WV': { lat: 38.336246, lng: -81.612328, city: 'Charleston' },
    'WI': { lat: 43.074684, lng: -89.384445, city: 'Madison' },
    'WY': { lat: 41.140259, lng: -104.820236, city: 'Cheyenne' },
    'DC': { lat: 38.897438, lng: -77.026817, city: 'Washington' },
  };

  // Backwards compatibility alias
  const STATE_CENTROIDS = STATE_CAPITALS;

  /**
   * Get coordinates for a location - uses GPS if available, otherwise state centroid
   */
  function getLocationCoordinates(location: Location): { lat: number; lng: number; isApproximate: boolean } | null {
    // Has precise GPS coordinates
    if (location.gps?.lat && location.gps?.lng) {
      return { lat: location.gps.lat, lng: location.gps.lng, isApproximate: false };
    }

    // Fallback to state centroid if we have a state
    const state = location.address?.state?.toUpperCase();
    if (state && STATE_CENTROIDS[state]) {
      return { ...STATE_CENTROIDS[state], isApproximate: true };
    }

    return null;
  }

  /**
   * Determine GPS confidence level based on location data
   * Per spec: verified > high > medium > low > none
   */
  function getGpsConfidence(location: Location, isApproximate: boolean = false): keyof typeof THEME.GPS_CONFIDENCE_COLORS {
    // State centroid fallback = none confidence (approximate)
    if (isApproximate) return 'none';

    if (!location.gps) return 'none';

    // Verified on map is highest confidence
    if (location.gps.verifiedOnMap) return 'verified';

    // High accuracy from device GPS
    if (location.gps.accuracy && location.gps.accuracy <= GPS_CONFIG.HIGH_ACCURACY_THRESHOLD_METERS) {
      return 'high';
    }

    // Medium accuracy
    if (location.gps.accuracy && location.gps.accuracy <= GPS_CONFIG.GPS_MISMATCH_THRESHOLD_METERS) {
      return 'medium';
    }

    // Low confidence if no accuracy data or high accuracy value
    return 'low';
  }

  /**
   * Create a colored circle marker icon using accent color
   * Per v010steps.md P3a: All pins use brand accent color #b9975c
   */
  function createConfidenceIcon(L: any, confidence: keyof typeof THEME.GPS_CONFIDENCE_COLORS): any {
    // P3a: Use accent color for all pins instead of confidence-based colors
    const accentColor = '#b9975c';
    return L.divIcon({
      html: `<div class="confidence-marker" style="background-color: ${accentColor};"></div>`,
      className: 'confidence-icon',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  interface Props {
    locations?: Location[];
    onLocationClick?: (location: Location) => void;
    onMapClick?: (lat: number, lng: number) => void;
    // BUG-2 FIX: Pass screen coordinates for context menu positioning
    onMapRightClick?: (lat: number, lng: number, screenX: number, screenY: number) => void;
    // FIX 6.8: Enable heat map visualization
    showHeatMap?: boolean;
    // Kanye9: Custom zoom level based on GPS confidence
    zoom?: number;
    // FEAT-P1: Verify Location callback - called with locid and new lat/lng
    onLocationVerify?: (locid: string, lat: number, lng: number) => void;
  }

  let { locations = [], onLocationClick, onMapClick, onMapRightClick, showHeatMap = false, zoom, onLocationVerify }: Props = $props();

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
  // FIX 6.8: Heat map layer
  let heatLayer: any = null;
  let cluster: Supercluster | null = null;
  // Kanye9 FIX: Track GPS hash, not just length - triggers re-zoom when GPS updates
  let lastLocationsHash = $state('');
  // Kanye11 FIX: Prevent infinite loop - track if initial view has been set
  let initialViewSet = $state(false);
  // BUG-V1 FIX: Location lookup for event delegation
  let locationLookup = new Map<string, Location>();
  // BUG-V1 FIX: Store cleanup function for event delegation
  let viewDetailsClickHandler: ((e: MouseEvent) => void) | null = null;

  /**
   * Kanye9: Generate hash from location IDs and GPS coordinates
   * This ensures the $effect triggers when GPS is updated via forward geocoding
   */
  function getLocationsHash(locs: Location[]): string {
    return locs.map(l => `${l.locid}:${l.gps?.lat || 0}:${l.gps?.lng || 0}`).join(',');
  }

  /**
   * FIX 6.8: Simple canvas-based heat map implementation
   * Uses a custom Leaflet layer to render density visualization
   */
  function createHeatLayer(L: any, locations: Location[]): any {
    // Extract coordinates with weights (media count if available, else 1)
    const points = locations
      .map(loc => {
        const coords = getLocationCoordinates(loc);
        if (!coords) return null;
        return {
          lat: coords.lat,
          lng: coords.lng,
          // Weight could be based on media count or other metrics
          weight: 1,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (points.length === 0) return null;

    // Create a custom canvas layer for heat visualization
    const HeatLayer = L.Layer.extend({
      onAdd: function(map: any) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-heat-layer');
        const pane = map.getPane('overlayPane');
        pane.appendChild(this._canvas);
        map.on('moveend', this._update, this);
        map.on('zoomend', this._update, this);
        this._update();
      },

      onRemove: function(map: any) {
        L.DomUtil.remove(this._canvas);
        map.off('moveend', this._update, this);
        map.off('zoomend', this._update, this);
      },

      _update: function() {
        if (!this._map) return;

        const size = this._map.getSize();
        const bounds = this._map.getBounds();
        const zoom = this._map.getZoom();
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);

        L.DomUtil.setPosition(this._canvas, topLeft);
        this._canvas.width = size.x;
        this._canvas.height = size.y;

        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, size.x, size.y);

        // Calculate radius based on zoom level
        const radius = Math.max(20, Math.min(80, zoom * 6));

        // Draw heat points
        points.forEach(point => {
          if (!bounds.contains([point.lat, point.lng])) return;

          const containerPoint = this._map.latLngToContainerPoint([point.lat, point.lng]);
          const x = containerPoint.x;
          const y = containerPoint.y;

          // Create radial gradient for each point
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          gradient.addColorStop(0, 'rgba(255, 100, 100, 0.6)');
          gradient.addColorStop(0.4, 'rgba(255, 200, 100, 0.4)');
          gradient.addColorStop(0.7, 'rgba(100, 200, 255, 0.2)');
          gradient.addColorStop(1, 'rgba(0, 100, 255, 0)');

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        });
      },
    });

    return new HeatLayer();
  }

  onMount(async () => {
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');

    if (!map && mapContainer) {
      map = L.map(mapContainer, {
        center: [MAP_CONFIG.DEFAULT_CENTER.lat, MAP_CONFIG.DEFAULT_CENTER.lng],
        zoom: MAP_CONFIG.DEFAULT_ZOOM,
      });

      // P3c: Additional map layers per v010steps.md
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
        'Light': L.tileLayer(TILE_LAYERS.CARTO_LIGHT, {
          attribution: '&copy; OpenStreetMap contributors, &copy; CartoDB',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
          subdomains: 'abcd',
        }),
        'Dark': L.tileLayer(TILE_LAYERS.CARTO_DARK, {
          attribution: '&copy; OpenStreetMap contributors, &copy; CartoDB',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
          subdomains: 'abcd',
        }),
      };

      const overlayLayers: { [key: string]: TileLayer } = {
        'Labels': L.tileLayer(TILE_LAYERS.LABELS, {
          attribution: '&copy; CartoDB',
          maxZoom: MAP_CONFIG.MAX_ZOOM,
          subdomains: 'abcd',
        }),
      };

      // FEAT-6: Default to Light view per user request
      baseLayers['Light'].addTo(map);

      L.control.layers(baseLayers, overlayLayers).addTo(map);

      markersLayer = L.layerGroup().addTo(map);

      map.on('click', (e) => {
        if (onMapClick) {
          onMapClick(e.latlng.lat, e.latlng.lng);
        }
      });

      map.on('contextmenu', (e) => {
        // BUG-V2 FIX: Prevent default browser context menu
        e.originalEvent.preventDefault();
        if (onMapRightClick) {
          // BUG-2 FIX: Pass screen coordinates for context menu positioning
          onMapRightClick(e.latlng.lat, e.latlng.lng, e.originalEvent.clientX, e.originalEvent.clientY);
        }
      });

      // BUG-V1 FIX: Event delegation for View Details and Verify button clicks
      // This is more reliable than DOM manipulation in Leaflet popups
      viewDetailsClickHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        // Handle View Details button
        if (target.classList.contains('view-details-btn')) {
          e.preventDefault();
          e.stopPropagation();
          const locid = target.getAttribute('data-location-id');
          if (locid && locationLookup.has(locid) && onLocationClick) {
            onLocationClick(locationLookup.get(locid)!);
          }
        }
        // FEAT-P1: Handle Verify Location button
        if (target.classList.contains('verify-location-btn')) {
          e.preventDefault();
          e.stopPropagation();
          const locid = target.getAttribute('data-verify-location-id');
          const loc = locid ? locationLookup.get(locid) : null;
          if (locid && loc && loc.gps && onLocationVerify) {
            // Verify at current position
            onLocationVerify(locid, loc.gps.lat, loc.gps.lng);
          }
        }
      };
      document.addEventListener('click', viewDetailsClickHandler);

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

    // Include all locations that have coordinates (GPS or state centroid fallback)
    const points = locations
      .map(loc => {
        const coords = getLocationCoordinates(loc);
        if (!coords) return null;
        return {
          type: 'Feature' as const,
          properties: { location: loc, isApproximate: coords.isApproximate },
          geometry: {
            type: 'Point' as const,
            coordinates: [coords.lng, coords.lat],
          },
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

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
    const currentZoom = map.getZoom();

    const clusters = cluster.getClusters(bbox, Math.floor(currentZoom));

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
        const isApproximate = feature.properties.isApproximate || false;
        const confidence = getGpsConfidence(location, isApproximate);
        const icon = createConfidenceIcon(L, confidence);
        const marker = L.marker([lat, lng], { icon });

        // Build confidence label - show "Approximate (State)" for state centroid fallback
        const confidenceLabel = isApproximate
          ? 'Approximate (State)'
          : String(confidence).charAt(0).toUpperCase() + String(confidence).slice(1) + ' GPS';

        // P3b: Mini location popup with "View Details" and "Verify" buttons
        // FEAT-P1: Verify button allows user to confirm/adjust pin location
        const isVerified = location.gps?.verifiedOnMap;
        const verifyButtonHtml = onLocationVerify && !isVerified
          ? `<button
              data-verify-location-id="${location.locid}"
              class="verify-location-btn"
              style="margin-top: 4px; padding: 6px 12px; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; width: 100%;"
            >
              Verify Location
            </button>`
          : isVerified
            ? `<div style="margin-top: 4px; padding: 6px 12px; background: #dcfce7; color: #166534; border-radius: 4px; font-size: 11px; text-align: center;">
                Location Verified
              </div>`
            : '';

        const popupContent = `
          <div class="location-popup" style="min-width: 180px;">
            <strong style="font-size: 14px;">${escapeHtml(location.locnam)}</strong><br/>
            <span style="color: #666; font-size: 12px;">${escapeHtml(location.type) || 'Unknown Type'}</span><br/>
            <span style="color: #888; font-size: 11px;">${location.address?.city ? `${escapeHtml(location.address.city)}, ` : ''}${escapeHtml(location.address?.state) || ''}</span>
            <br/>
            <button
              data-location-id="${location.locid}"
              class="view-details-btn"
              style="margin-top: 8px; padding: 6px 12px; background: #b9975c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; width: 100%;"
            >
              View Details
            </button>
            ${verifyButtonHtml}
          </div>
        `;

        marker.bindPopup(popupContent);

        // FEAT-P1: Make marker draggable if onLocationVerify is provided
        if (onLocationVerify && !isVerified) {
          marker.options.draggable = true;
          marker.on('dragend', () => {
            const newPos = marker.getLatLng();
            onLocationVerify(location.locid, newPos.lat, newPos.lng);
          });
        }

        // P3b: Click on marker opens popup (not direct navigation)
        marker.on('click', () => {
          marker.openPopup();
        });

        // BUG-V1 FIX: Store location reference for event delegation
        // Event delegation handles clicks at document level - more reliable than DOM manipulation
        locationLookup.set(location.locid, location);

        markersLayer.addLayer(marker);
      }
    });

    // Kanye6/Kanye8/Kanye9: For single location view, zoom based on GPS confidence
    // Kanye8 FIX: Removed DEFAULT_ZOOM check - always zoom for single location
    // This ensures re-zoom after forward geocoding updates GPS coordinates
    // Kanye9: Use passed zoom prop if available for tier-based zoom levels
    // Kanye11 FIX: Only set view once to prevent infinite loop (setView triggers moveend → updateClusters → setView)
    if (locations.length === 1 && !initialViewSet) {
      const coords = getLocationCoordinates(locations[0]);
      if (coords) {
        // Use prop zoom if provided, otherwise fall back to calculated zoom
        // Street level zoom (17) for exact GPS, city level (10) for approximate
        const zoomLevel = zoom ?? (coords.isApproximate ? 10 : 17);
        initialViewSet = true; // MUST set BEFORE setView to prevent recursion
        map.setView([coords.lat, coords.lng], zoomLevel);
      }
    }
  }

  $effect(() => {
    // Kanye9 FIX: Track GPS hash, not just length
    // This triggers re-zoom when forward geocoding updates location GPS
    const currentHash = getLocationsHash(locations);
    if (map && markersLayer && currentHash !== lastLocationsHash) {
      lastLocationsHash = currentHash;
      // Kanye11 FIX: Reset initialViewSet so map re-zooms when GPS changes
      initialViewSet = false;
      initCluster();
      import('leaflet').then((L) => updateClusters(L.default));
    }
  });

  // FIX 6.8: Toggle heat map layer based on showHeatMap prop
  $effect(() => {
    if (!map) return;

    import('leaflet').then((L) => {
      // Remove existing heat layer if any
      if (heatLayer) {
        map!.removeLayer(heatLayer);
        heatLayer = null;
      }

      // Add heat layer if enabled
      if (showHeatMap && locations.length > 0) {
        heatLayer = createHeatLayer(L.default, locations);
        if (heatLayer) {
          heatLayer.addTo(map);
        }
      }
    });
  });

  onDestroy(() => {
    // BUG-V1 FIX: Clean up event delegation listener
    if (viewDetailsClickHandler) {
      document.removeEventListener('click', viewDetailsClickHandler);
      viewDetailsClickHandler = null;
    }
    locationLookup.clear();
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

  :global(.confidence-icon) {
    background: transparent;
    border: none;
  }

  :global(.confidence-marker) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
</style>
