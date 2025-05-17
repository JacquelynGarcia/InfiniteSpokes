import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

// Access Token
mapboxgl.accessToken = 'pk.eyJ1IjoiampzYXR1cm4yMiIsImEiOiJjbWFyZnNxbHIwYXNhMnNvZmd5cHc1dnoxIn0.GVR9KGv9QVHEQJxjcHs8Bg';


// Initializing map
const map = new mapboxgl.Map({
  container: 'map', 
  style: 'mapbox://styles/mapbox/dark-v11', 
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Loading Bike Data
map.on('load', async () => {
    // Boston Bike Data
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
      });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
          'line-color': '#E69F00',
          'line-width': 3,
          'line-opacity': 0.4,
        },
      });

    // Cambridge Bike Data
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
    });

    map.addLayer({
        id: 'bike-lanes-c',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': '#56B4E9',
            'line-width': 3,
            'line-opacity': 0.4,
        },
    });

    let jsonData;
    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
        const jsonData = await d3.json(jsonurl);
        
        console.log('Loaded JSON Data:', jsonData);
        } catch (error) {
            console.error('Error loading JSON:', error);
            }

    let stations = jsonData.data.stations;
    console.log('Stations Array:', stations);
  });

const svg = d3.select('#map').select('svg');

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
  }