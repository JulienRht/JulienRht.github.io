// Initialisation de la carte avec niveaux de zoom //
var map = L.map('map', {
    minZoom: 11,
    maxZoom: 16
});

// Centrer la carte sur Paris
map.setView([48.8566, 2.3522], 12);
L.control.scale().addTo(map);

// Ajouter une couche de tuiles OSM
var osmUrl = 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
var osmAttrib = 'Map data © OpenStreetMap contributors';
var osm = new L.TileLayer(osmUrl, { attribution: osmAttrib }).addTo(map);


// Création des calques pour chaque donnée //
var stationsCluster = L.markerClusterGroup(); // Clusters pour les stations
stationsCluster.addTo(map);
var arr = L.layerGroup(); // Calque pour les arrondissements
arr.addTo(map);
var planVelo2026 = L.layerGroup(); // Calque pour le Plan Vélo 2026 (volontairement non visible à l'actualisation)


// Fonction de style pour colorier les points selon la capacité //
function styleStations(feature) {
    let capacity = feature.properties.capacity; // Récupère la capacité
    // Couleurs en fonction de la capacité
    let color;
    if (capacity <= 23) {
        color = 'red';
    } else if (capacity <= 37) {
        color = 'yellow';
    } else {
        color = 'green';
    }
    // Style des points
    return {
        radius: 8,  
        fillColor: color,  
        color: color,  
        weight: 1,  
        opacity: 1,  
        fillOpacity: 0.6
    };
}


// Fonction de style pour colorier les lignes selon leur statut //
function styleLignes(feature) {
    let statut = feature.properties.statut; // Récupère le statut
    // Couleur en fonction du statut
    let color;
    if (statut === "existant") {
        color = 'green';
    } else if (statut === "à réaliser") {
        color = 'darkgray';
    }
    // Style des lignes
    return {
        color: color,
        weight: 3,
        opacity: 1
    };
}


// Fonction pour colorier les arrondissements en fonction du nombre de stations / 1000 habs //
function getColor(stations_by_pop) {
    return stations_by_pop >= 10 ? '#062e0d' :
           stations_by_pop >= 7 ? '#138928' :
           stations_by_pop >= 4 ? '#4ce968' :
           stations_by_pop >= 3 ? '#bcf7c6' :
           '#FFFFFF';  // Couleur par défaut
}
// Style des polygones
function styleArrondissements(feature) {
    let stations_by_pop = feature.properties.stations_by_pop;
    return {
        fillColor: getColor(stations_by_pop), // Colorise avec la fonction créée ci-dessus
        weight: 2,
        opacity: 1,
        color: 'lightgrey',
        fillOpacity: 0.7
    };
}


// Fonction pour zoomer sur un arrondissement //
function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());  // Zoomer sur l'arrondissement en ajustant les limites
}


// Fonction pour afficher des infos au clic sur un arrondissement //
function displayArrondissementInfo(e) {
    var layer = e.target;
    // Vérifier si l'entité cliquée est un polygone
    if (layer instanceof L.Polygon) {
        // Récupérer les infos à afficher dans la div 'info' (sous le titre)
        var info_div = document.getElementById("info");
        var arrondissement = layer.feature.properties.l_ar;  // Nom de l'arrondissement
        var stationsByPop = layer.feature.properties.stations_by_pop;  // Nb de stations par 1.000 habs
        // Afficher l'information
        info_div.innerHTML = "Le '" + arrondissement + "' contient " + stationsByPop + " stations pour 1 000 habitants.";

        layer.bringToFront();  // Amener l'arrondissement au premier plan
    }
}


// Fonction pour ajouter des interactions de survol aux points (mise en valeur + zone tampon) //

// Listes regroupant les buffers et les points qui ont été survolés
let activeBuffers = [];
let highlightedPoints = [];

function ajouterInteractions(layer, feature) {
    let originalStyle = styleStations(feature);
    let bufferCircle;

    // Survol avec la souris
    layer.on('mousemove', function () {
        layer.setStyle({
            radius: 15,
            fillColor: 'orange',
            color: 'orange',
            weight: 3
        });
        layer.bringToFront();

        // Ajouter une zone tampon de 300m autour du point
        if (!bufferCircle) {
            bufferCircle = L.circle(layer.getLatLng(), {
                radius: 300,
                color: 'blue',
                weight: 1,
                fillOpacity: 0.2
            }).addTo(map);

            // Ajouter le buffer à la liste des buffers
            activeBuffers.push(bufferCircle);
        }
        // Ajouter le point à la liste des points
        if (!highlightedPoints.includes(layer)) {
            highlightedPoints.push({ layer, originalStyle });
        }
    });

    // Sortie de la souris
    layer.on('mouseout', function () {
        layer.setStyle(originalStyle);
        if (bufferCircle) {
            map.removeLayer(bufferCircle);
            // Retirer le buffer de la liste des buffers
            activeBuffers = activeBuffers.filter(buffer => buffer !== bufferCircle);
            bufferCircle = null;
        }
        // Retirer le point de la liste des points
        highlightedPoints = highlightedPoints.filter(item => item.layer !== layer);
    });
}


// Écoutez les clics sur la carte pour supprimer tous les buffers et réinitialiser les styles des points
map.on('click', function (e) {
    // Supprimer tous les buffers de la carte
    activeBuffers.forEach(buffer => map.removeLayer(buffer));
    activeBuffers = [];

    // Réinitialiser le style des points survolés
    highlightedPoints.forEach(item => {
        item.layer.setStyle(item.originalStyle);
    });
    highlightedPoints = [];
});


// Fonction pour charger les fichiers GeoJSON et les ajouter à la map //
async function charger_geojson(url, layer, styleFunction, pointToLayerFunction = null) {
    let response = await fetch(url);
    let geojsonData = await response.json();

    L.geoJSON(geojsonData, {
        style: styleFunction, // Appliquer le style pour les polygones et lignes
        pointToLayer: function (feature, latlng) {
            if (layer === stationsCluster) {
                let marker = L.circleMarker(latlng, styleStations(feature));
                layer.addLayer(marker);
                ajouterInteractions(marker, feature); // Ajout des interactions sur les points
                return marker;
            }
            return L.circleMarker(latlng, styleStations(feature));
        },
        onEachFeature: function (feature, layer) {
            if (!(layer instanceof L.Marker)) {
                layer.on({
                    click: displayArrondissementInfo, // Interaction avec les arrondissements
                });
            }
        }
    }).addTo(layer);
}

// Appel de la fonction pour charger les données de chaque GeoJSON
charger_geojson('./data/velib-emplacement-des-stations.geojson', stationsCluster, styleStations);
charger_geojson('./data/plan-velo-2026.geojson', planVelo2026, styleLignes);
charger_geojson('./data/arrondissements.geojson', arr, styleArrondissements);


// Définir les couches et les overlays pour le contrôle
var baseLayers = {
    "OpenStreetMap": osm
};
var overlays = {
    "Stations Vélib'": stationsCluster,
    "Arrondissements": arr,
    "Plan Vélo 2026": planVelo2026
};

L.control.layers(baseLayers, overlays).addTo(map);

// Légende pour les stations //
var legendStations = L.control.Legend({
    position: "bottomleft",
    title: "Stations Vélib'",
    collapsed: false,
    legends: [
        {
            label: "Faible capacité (<= 23)",
            type: "circle",
            radius: 8,
            color: "#FF0000",
            fillColor: "#FF0000",
            fillOpacity: 1,
            layers: [stationsCluster]  // Légende liée à la couche des stations
        },
        {
            label: "Capacité moyenne (24 <= 37)",
            type: "circle",
            radius: 8,
            color: "#FFA500",
            fillColor: "#FFA500",
            fillOpacity: 1,
            layers: [stationsCluster]
        },
        {
            label: "Forte capacité (> 37)",
            type: "circle",
            radius: 8,
            color: "#008000",
            fillColor: "#008000",
            fillOpacity: 1,
            layers: [stationsCluster]
        }
    ]
});

// Légende pour le plan vélo
var legendPlanVelo = L.control.Legend({
    position: "bottomleft",
    title: "Plan Vélo 2026",
    collapsed: false,
    legends: [
        {
            label: "Axes cyclables existants",
            type: "polyline",
            color: "#00FF00",
            weight: 4,
            layers: [planVelo2026]  // Légende liée à la couche plan vélo
        },
        {
            label: "Axes cyclables à réaliser",
            type: "polyline",
            color: "#808080",
            weight: 4,
            layers: [planVelo2026]
        }
    ]
});

// Crée la légende pour les arrondissements
var legendArrondissements = L.control.Legend({
    position: "bottomleft",
    title: "Stations Vélib' par Arrondissements",
    collapsed: false,
    legends: [
        {
            label: "Moins de 4 stations/1.000 habs",
            type: "rectangle",
            color: "#bcf7c6",
            fillColor: "#bcf7c6",
            fillOpacity: 1,
            layers: [arr]  // Légende liée à la couche des arrondissements
        },
        {
            label: "Entre 4 et 6 stations/1.000 habs",
            type: "rectangle",
            color: "#4ce968",
            fillColor: "#4ce968",
            fillOpacity: 1,
            layers: [arr]
        },
        {
            label: "Entre 7 et 9 stations/1.000 habs",
            type: "rectangle",
            color: "#138928",
            fillColor: "#138928",
            fillOpacity: 1,
            layers: [arr]
        },
        {
            label: "Plus de 9 stations/1.000 habs",
            type: "rectangle",
            color: "#062e0d",
            fillColor: "#062e0d",
            fillOpacity: 1,
            layers: [arr]
        }
    ]
});

// Ajout des légendes à la carte (sauf celle des lignes)
legendStations.addTo(map);
legendArrondissements.addTo(map);

// "Écoute" les événements pour mettre à jour la légende selon les couches visibles
map.on('layeradd', function(event) {
    if (event.layer === stationsCluster) {
        legendStations.addTo(map);
    }
    if (event.layer === planVelo2026) {
        legendPlanVelo.addTo(map);
    }
    if (event.layer === arr) {
        legendArrondissements.addTo(map);
    }
});

map.on('layerremove', function(event) {
    if (event.layer === stationsCluster) {
        map.removeControl(legendStations);
    }
    if (event.layer === planVelo2026) {
        map.removeControl(legendPlanVelo);
    }
    if (event.layer === arr) {
        map.removeControl(legendArrondissements);
    }
});