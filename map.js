import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

// Access Token
mapboxgl.accessToken = 'pk.eyJ1IjoiampzYXR1cm4yMiIsImEiOiJjbWFyZnNxbHIwYXNhMnNvZmd5cHc1dnoxIn0.GVR9KGv9QVHEQJxjcHs8Bg';

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
    return timeFilter === -1
        ? trips // If no filter is applied (-1), return all trips
        : trips.filter((trip) => {
            // Convert trip start and end times to minutes since midnight
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
    
            // Include trips that started or ended within 60 minutes of the selected time
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
    });
}

function filterByMinute(tripsByMinute, minute) {
    if (minute === -1) {
        return tripsByMinute.flat(); // No filtering, return all trips
    }
  
    // Normalize both min and max minutes to the valid range [0, 1439]
    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;
  
    // Handle time filtering across midnight
    if (minMinute > maxMinute) {
        let beforeMidnight = tripsByMinute.slice(minMinute);
        let afterMidnight = tripsByMinute.slice(0, maxMinute);
        return beforeMidnight.concat(afterMidnight).flat();
    } else {
        return tripsByMinute.slice(minMinute, maxMinute).flat();
    }
}

// Initializing map
const map = new mapboxgl.Map({
  container: 'map', 
  style: 'mapbox://styles/mapbox/streets-v12', 
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

map.on('load', async () => {
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': '#1D2951',
            'line-width': 4,
            'line-opacity': 0.3
        },
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
    });

    map.addLayer({
        id: 'bike-lanes-c',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': '#1D2951',
            'line-width': 4,
            'line-opacity': 0.3
        },
    });

    let jsonData;
    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
        const jsonData = await d3.json(jsonurl);
        let departuresByMinute = Array.from({ length: 1440 }, () => []);
        let arrivalsByMinute = Array.from({ length: 1440 }, () => []);
        let trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                let startedMinutes = minutesSinceMidnight(trip.started_at);
                departuresByMinute[startedMinutes].push(trip);
                let endMinutes = minutesSinceMidnight(trip.ended_at);
                arrivalsByMinute[endMinutes].push(trip);
                return trip;
            },
        );

        function computeStationTraffic(stations, timeFilter = -1) {
            const departures = d3.rollup(
                filterByMinute(departuresByMinute, timeFilter),
                (v) => v.length,
                (d) => d.start_station_id
            );
            
            const arrivals = d3.rollup(
                filterByMinute(arrivalsByMinute, timeFilter),
                (v) => v.length,
                (d) => d.end_station_id
            );
          
            // Update each station..
            return stations.map((station) => {
                let id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });
        }
        const stations = computeStationTraffic(jsonData.data.stations);
        const radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);
        const svg = d3.select('#map').select('svg');
        let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

        function getCoords(station) {
            const point = new mapboxgl.LngLat(+station.lon, +station.lat);
            const { x, y } = map.project(point);
            return { cx: x, cy: y };
        }

        // Append circles to the SVG for each station
        const circles = svg
            .selectAll('circle')
            .data(stations, (d) => d.short_name)
            .enter()
            .append('circle')
            .attr('r', (d) => radiusScale(d.totalTraffic))
            .attr('fill', 'steelblue')
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .attr('opacity', 0.6)
            .each(function (d) {
                d3.select(this)
                    .append('title')
                    .text(
                        `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
                    );
            })
            .style('--departure-ratio', (d) =>
                stationFlow(d.departures / d.totalTraffic),
            );
        console.log();
        
        // Function to update circle positions when the map moves/zooms
        function updatePositions() {
            circles
                .attr('cx', (d) => getCoords(d).cx)
                .attr('cy', (d) => getCoords(d).cy);
        }
        
        // Initial position update when map loads
        updatePositions();

        // Reposition markers on map interactions
        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);

        const timeSlider = document.getElementById('time-slider');
        const selectedTime = document.getElementById('selected-time');
        const anyTimeLabel = document.getElementById('any-time');

        function updateScatterPlot(timeFilter) {
            // Recompute station traffic based on the filtered trips
            const filteredStations = computeStationTraffic(stations, timeFilter).filter(d => d.totalTraffic > 0);
        
            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
            // Update the scatterplot by adjusting the radius of circles
            circles
                .data(filteredStations, (d) => d.short_name)
                .join('circle') // Ensure the data is bound correctly
                .attr('r', (d) => radiusScale(d.totalTraffic))
                .each(function (d) {
                    // Add <title> for browser tooltips
                    d3.select(this)
                        .select('title')
                        .text(
                            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
                        );
                })
                .style('--departure-ratio', (d) =>
                    stationFlow(d.departures / d.totalTraffic),
                );
        }

        function updateTimeDisplay() {
            let timeFilter = Number(timeSlider.value);
                
            if (timeFilter === -1) {
                selectedTime.textContent = '';
                anyTimeLabel.style.display = 'block';
            } else {
                selectedTime.textContent = formatTime(timeFilter);
                anyTimeLabel.style.display = 'none';
            }
                
            // Trigger filtering logic which will be implemented in the next step
            updateScatterPlot(timeFilter);
        }

        timeSlider.addEventListener('input', updateTimeDisplay);
        updateTimeDisplay();
    } catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
    }
});