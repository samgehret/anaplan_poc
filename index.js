const mapboxgl = require("mapbox-gl");
mapboxgl.accessToken = "pk.eyJ1IjoibWFwbWFuMjciLCJhIjoiY2p0N21rZTduMHRjbzQ0cDM4aWEzNnZoNCJ9.0W1yZ5oX3dChiUD6AFAUSw";
const segmentInsert = require("@mapbox/segmentio-insert");
const analytics = segmentInsert("fl0c8p240n");
analytics.track("Demo Viewed", {
  name: "anaplan"
});
// const data = require('./data/accountinfo.json')
// const zipData = require('./data/anaplanzip.json')
const MapboxDraw = require('@mapbox/mapbox-gl-draw')
const turf = require('turf')
const axios = require('axios')
const chroma = require("chroma-js");
const lookupTable = require('./data/enterprise-boundaries-p4-v2.json')
const _ = require("lodash");
const centroids = require('./data/uscentroids.json')
const d = document;

//global variables
let data
let zipcodeArray = []
let lookupTableArray = []
let zipRegionArray = []
let centroidsArray = []
let selector
let zipData = []
let allFeatProps = []
let point_domain = []


const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v9",
  center: [-99, 39],
  zoom: 5
});
map.on("load", () => {
  console.log("Map is ready");

  axios.get('https://api-beta.anaplan.com/mapbox/1/lists/zips')
    .then(function (response) {
      zipData = response.data
      // console.log(zipData)
    })
    .catch(function (error) {
      console.log(error);
    });

  axios.get('https://api-beta.anaplan.com/mapbox/1/lists/flat-list')
    .then(function (response) {
      data = response.data
      // console.log('data', data)
      initmap();
    })
    .catch(function (error) {
      console.log(error);
    });

  for (var key in lookupTable.p4.data.all) {
    lookupTableArray.push({
      [key]: lookupTable.p4.data.all[key].id_int
    })
  }

  map.addSource('postal-4-source', {
    type: 'vector',
    url: "mapbox://mapbox.enterprise-boundaries-p4-v2"
  })


  const LassoDraw = MapboxDraw.modes.draw_polygon
  MapboxDraw.modes.draw_polygon.toggleButton = function () {
    toggleIcon('mapbox-gl-draw_polygon', true);
  }
  LassoDraw.toggleButton = function () {
    toggleIcon('mapbox-gl-draw_lasso', true);
  }
  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
      polygon: true,
      trash: true
    }
  })

  LassoDraw.onSetup_original = function () {
    const polygon = this.newFeature({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          []
        ]
      }
    });

    this.addFeature(polygon);

    this.clearSelectedFeatures();
    this.updateUIClasses({
      mouse: 'add'
    });
    this.activateUIButton('Polygon');
    this.setActionableState({
      trash: true
    });

    return {
      polygon,
      currentVertexPosition: 0,
      dragMoving: false,
      toggled: false,
    };
  };

  LassoDraw.onClick = function (state, e) {
    state.toggled = !state.toggled;

    if (!state.toggled) {
      const factor = Math.min(Math.floor(this.map.getZoom()), 4);
      let tolerance = (3 / ((this.map.getZoom() - factor) * 150)) - 0.001 // https://www.desmos.com/calculator/b3zi8jqskw

      if (tolerance < 0 || !(isFinite(tolerance))) {
        // Tolerance cannot be negative
        tolerance = 0;
      }
      turf.simplify(state.polygon, {
        tolerance: tolerance
      });
      this.fireUpdate();
      this.changeMode('simple_select', {
        featureIds: [state.polygon.id]
      });
    }

  }

  LassoDraw.onMouseMove = LassoDraw.onTouchMove = function (state, e) {
    state.dragMoving = true;
    if (state.toggled) {
      this.updateUIClasses({
        mouse: 'add'
      });
      state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, e.lngLat.lng, e.lngLat.lat);
      state.currentVertexPosition++;
      state.polygon.updateCoordinate(`0.${state.currentVertexPosition}`, e.lngLat.lng, e.lngLat.lat);
    }
  }

  LassoDraw.fireUpdate = function () {
    this.map.fire('draw.update', {
      action: 'move',
      features: this.getSelected().map(f => f.toGeoJSON())
    });
  };

  map.addControl(draw)

  function initmap() {

    function updateArea(e) {
      var data = draw.getAll()
      if (data.features.length > 0) {
        // map.setLayoutProperty('postal-2-highlighted', 'visibility', 'visible')
        const polygon = data.features[0]
        const bbox = turf.bbox(polygon)
        const southWest = [bbox[0], bbox[1]]
        const northEast = [bbox[2], bbox[3]]
        const southWestPixel = map.project(southWest)
        const northEastPixel = map.project(northEast)
        const features = map.queryRenderedFeatures(
          [southWestPixel, northEastPixel], {
            layers: ['postal-4-layer']
          }
        )
        let filter = features.reduce(
          function (memo, feature) {
            var kinks = turf.kinks(polygon)
            if (!(undefined === turf.intersect(turf.buffer(feature, 0), turf.buffer(polygon, 0)))) {
              // only add the property, if the feature intersects with the polygon drawn by the user
              memo.push(feature.properties.id)
            }
            return memo
          }, []
        )


        // console.log(filter)
        filter.forEach(k => {
          region_lookup[k] = document.getElementById('selector').value
        })
        selector = document.getElementById('selector').value
        // console.log(selector)
        colorSelection(selector)
        draw.deleteAll()
        // if (matchArray.length > 0) {
        //   // var sumEmployees = matchArray.reduce(getSum);
        // }
        // document.getElementById('num-employees').innerHTML = `Number of Employees: ${sumEmployees}`
        // document.getElementById('num-accounts').innerHTML = `Number of Accounts: ${matchArray.length}`

      } else {
        // map.setLayoutProperty('postal-2-highlighted', 'visibility', 'none')
        // document.getElementById('num-employees').innerHTML = `Number of Employees: 0`
        // document.getElementById('num-accounts').innerHTML = `Number of Accounts: 0`

      }
    }

    //helper to change colors of zips from dropdown selection
    function colorSelection(region_id) {
      // console.log(region_lookup)
      let bounds0 = 0
      let bounds1 = 100
      let bounds2 = -100
      let bounds3 = 0
      for (var key in region_lookup) {
        if (region_lookup[key] == region_id) {
          // selectedIDs.push(id_lookup[region_lookup[key]])
          map.setFeatureState({
            source: "postal-4-source",
            sourceLayer: "boundaries_postal_4",
            id: id_lookup[key]
          }, {
            "clicked": 1
          });
          // console.log(key)
          // console.log(lookupTable.p4.data.all[key])
          // console.log(lookupTable.p4.data.all[key].bounds)


          if (lookupTable.p4.data.all[key].bounds[0] < bounds0) {
            bounds0 = lookupTable.p4.data.all[key].bounds[0]
          }
          if (lookupTable.p4.data.all[key].bounds[1] < bounds1) {
            bounds1 = lookupTable.p4.data.all[key].bounds[1]
          }
          if (lookupTable.p4.data.all[key].bounds[2] > bounds2) {
            bounds2 = lookupTable.p4.data.all[key].bounds[2]
          }
          if (lookupTable.p4.data.all[key].bounds[3] > bounds3) {
            bounds3 = lookupTable.p4.data.all[key].bounds[3]
          }
        } else {
          map.setFeatureState({
            source: "postal-4-source",
            sourceLayer: "boundaries_postal_4",
            id: id_lookup[key]
          }, {
            "clicked": 0
          });

        }

      }
      if (region_id === "NY2") {
        console.log('going to ny2')
        map.flyTo({center: [-74.2605533, 40.6971478], zoom: 9})

      }
      else {
      map.fitBounds([
        [
          bounds0, bounds1
        ],
        [
          bounds2,
          bounds3
        ]
      ], {
        padding: {
          top: 0,
          bottom: 150,
          left: 500,
          right: 0
        }
      });
    }
      aggregateData(region_id)
    }

    function undo() {
      zipRegionArray.forEach(k => {

        region_lookup[Object.keys(k)[0]] = Object.values(k)[0];
      })
      colorSelection(document.getElementById('selector').value)
    }
    // helper to aggregate data 
    function aggregateData(region_id) {
      let sales = 0
      let numAccounts = 0
      let salesAg = []
      let agSales = 0

      for (var key in region_lookup) {
        if (region_lookup[key] == region_id) {
          salesAg.push(key)
        }
      }
      if(salesAg.length > 0) {
      salesAg.forEach(zip => {
        sales = ((sales + postal4_lookup[zip]))
        agSales = (sales / 1000000).toFixed(2)
        numAccounts = parseInt(numAccounts + postal4_count[zip])
      })
    }
      document.getElementById('totalsales').innerHTML = `$${agSales} M`
      document.getElementById('totalaccounts').innerHTML = numAccounts.toLocaleString()
    }

    function clickevent(e) {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["postal-4-layer"]
      });

      // console.log(features)

      if (features.length) {
        region_lookup[features[0].properties.id] = document.getElementById('selector').value
        for (var key in region_lookup) {
          if (region_lookup[key] == document.getElementById('selector').value) {
            map.setFeatureState({
              source: "postal-4-source",
              sourceLayer: "boundaries_postal_4",
              id: id_lookup[key]
            }, {
              "clicked": 1
            });
          }
        }
      }
      aggregateData(document.getElementById('selector').value)

    }

    //Function to track whether or not regions where changed
    function getDiff() {
      let changedParent = []
      zipData.forEach(k => {
        if (k.Parent != region_lookup[k.Zips] && k.Zips != "USP4") {
          // console.log(k)
          k.Parent = region_lookup[k.Zips]
          changedParent.push(k)
        }
      })
      // console.log(changedParent)
      // document.querySelector('.api-post').style.visibility = 'visible'
      // document.querySelector('.spin-div').style.visibility = 'visible'
      console.log('finished')
      axios.post('https://api-beta.anaplan.com/mapbox/1/lists/zips', changedParent)
        // console.log('sending request')
        .then(function (response) {
          // console.log(response)
          // document.querySelector('.api-post').style.visibility = 'hidden'
          // document.querySelector('.spin-div').style.visibility = 'hidden'
        })
        .catch(function (error) {
          console.log(error);
        });
    }


    // console.log('data before loop', data)
    data.forEach(f => {
      let newData = {
        New_Zip: f.Zip_Code,
        Sales: parseInt(f.PYSales)
      }
      allFeatProps.push(newData)
      point_domain.push(parseInt(f["PYSales"]))
    })
    // console.log('allfeatprops', allFeatProps)
    // console.log('point domain', point_domain)
    // console.log('zipdata', zipData)

    //Create Lookup Tables
    zipData.forEach(f => {
      zipcodeArray.push(f)
      let newZip = {
        [f.Zips]: f.Parent
      }
      zipRegionArray.push(newZip)
    })
    // console.log('zip code array', zipcodeArray)

    centroids.features.forEach(k => {
      let centroid = {
        [k.properties.STUSPS]: [k.properties.LONG, k.properties.LAT]
      }
      centroidsArray.push(centroid)
    })
    //Use lodash to loop through all the accounts and group Sales by Zip code
    const postal4_groups = _(allFeatProps).groupBy("New_Zip").map((v, k) => ({
      [k]: _.sumBy(v, "Sales")
    })).value();

    //Use lodash to loop through all accounts and count the number of accounts per zipcode
    const postal4_count = _(allFeatProps).countBy("New_Zip").value();
    let postal4_count_array = []

    for (var key in postal4_count) {
      let object = {}
      object[key] = postal4_count[key]
      postal4_count_array.push(object)
    }

    const postal4poly_domain = [];
    // console.log
    // console.log('postal4groups', postal4_groups)
    postal4_groups.forEach(k => {
      postal4poly_domain.push(Object.values(k)[0]);
    });

    let postal4_colorStops = [];
    const postal4_filter = ["in", "id"];


    // console.log('poly 4 domain', postal4poly_domain)
    const postal4_domain = chroma.limits(postal4poly_domain, "k", 10).slice(0, 9);
    const postal4_scale = chroma.scale(chroma.brewer.YlGnBu).domain(postal4_domain).mode("lab");

    const postal4_lookup = new Map();
    const postal4_group_lookup = new Map();
    const id_lookup = new Map()
    const region_lookup = new Map()
    const centroid_lookup = new Map()


    lookupTableArray.forEach(k => {
      id_lookup[Object.keys(k)[0]] = Object.values(k)[0]
      // postal4_filter.push(Object.keys(k)[0]);
    })

    postal4_groups.forEach(k => {
      postal4_colorStops.push([Object.keys(k)[0], postal4_scale(Object.values(k)[0]).hex()]);
      postal4_filter.push(Object.keys(k)[0]);
      postal4_lookup[Object.keys(k)[0]] = Math.round(Object.values(k)[0]);
    })

    postal4_count_array.forEach(k => {
      postal4_group_lookup[Object.keys(k)[0]] = Object.values(k)[0];
    })

    zipRegionArray.forEach(k => {

      region_lookup[Object.keys(k)[0]] = Object.values(k)[0];
    })

    centroidsArray.forEach(k => {
      centroid_lookup[Object.keys(k)[0]] = Object.values(k)[0];
    })

    // console.log('color stops', postal4_colorStops)

    map.addLayer({
      id: 'postal-4-layer',
      type: 'fill',
      source: 'postal-4-source',
      "source-layer": 'boundaries_postal_4',
      "paint": {
        // "fill-outline-color": "black",
        "fill-color": {
          "property": "id",
          "type": "categorical",
          "stops": postal4_colorStops,
          "default": 'rgba(0,0,0,0)'
        },
        "fill-opacity": 0.7
      },
      "filter": postal4_filter
    })

    map.addLayer({
      id: 'postal-4-line',
      type: 'line',
      source: 'postal-4-source',
      "source-layer": 'boundaries_postal_4',
      "paint": {
        "line-color": "grey",
        "line-width": {
          "stops": [
            [4, 0.1],
            [12, 1]
          ],
          "base": 1.2
        }

      },
      "filter": postal4_filter
    })

    map.addLayer({
      id: 'postal-4-click',
      type: 'fill',
      source: 'postal-4-source',
      "source-layer": 'boundaries_postal_4',
      "paint": {

        "fill-opacity": 0.4,
        "fill-color": ["case", ["==", ["feature-state", "clicked"], 1], "#0c2c84", "rgba(0,0,0,0)"]
      }
    })
    map.addLayer({
      "id": "postal-4-highlight",
      "type": "line",
      "source": "postal-4-source",
      "source-layer": "boundaries_postal_4",
      "paint": {
        "line-color": ["case", ["==", ["feature-state", "hover"], 1], "red", "rgba(0,0,0,0)"],
        "line-width": 5
      }
    });

    let hoverIds = [];

    const inArray = function (array, element) {
      array.forEach(item => {
        if (item === element) {
          return true;
        } else {
          return false;
        }
      });
    };
    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false
    });

    const move = function (e) {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["postal-4-layer"]
      });

      if (features.length) {
        map.getCanvas().style.cursor = 'pointer';
        features.forEach(e => {
          if (!inArray(hoverIds, e.id)) {
            hoverIds.push(e.id);
          }
          map.setFeatureState({
            source: "postal-4-source",
            sourceLayer: "boundaries_postal_4",
            id: e.id
          }, {
            "hover": 1
          });
        });

        const outerDiv = d.createElement("div");
        outerDiv.setAttribute("class", "flex-parent-inline flex-parent flex-parent--column color-gray-dark");
        const innerLi3 = d.createElement("li");
        const innerLi = d.createElement("li");
        const innerLi2 = d.createElement("li");
        const innerLi4 = d.createElement("li");
        const innerLiText3 = d.createTextNode(`Zip Code: ${features[0].properties.id}`);
        const innerLiText = d.createTextNode(`Total Sales: $${postal4_lookup[features[0].properties.id]}`);
        const innerLiText2 = d.createTextNode(`Total Accounts: ${postal4_group_lookup[features[0].properties.id]}`);
        const innerLiText4 = d.createTextNode(`Sales Territory: ${region_lookup[features[0].properties.id]}`);
        innerLi3.appendChild(innerLiText3);
        innerLi.appendChild(innerLiText);
        innerLi2.appendChild(innerLiText2)
        innerLi4.appendChild(innerLiText4)
        outerDiv.appendChild(innerLi3);
        outerDiv.appendChild(innerLi);
        outerDiv.appendChild(innerLi2);
        outerDiv.appendChild(innerLi4);
        e.point.y = e.point.y - 10
        popup.setLngLat(map.unproject(e.point))
          .setDOMContent(outerDiv)
          .addTo(map);
      }


      if (!features.length) {
        map.getCanvas().style.cursor = '';
        hoverIds.forEach(id => {
          map.setFeatureState({
            source: "postal-4-source",
            sourceLayer: "boundaries_postal_4",
            id: id
          }, {
            "hover": 0
          });
        });
        popup.remove();
        hoverIds = [];
      } else if (hoverIds.length && hoverIds[0] !== features[0].id) {
        hoverIds.forEach(id => {
          map.setFeatureState({
            source: "postal-4-source",
            sourceLayer: "boundaries_postal_4",
            id: id
          }, {
            "hover": 0
          });
        });
        popup.remove();
        hoverIds = [];
      }
    }
    //Add event listener to the Update Map Button to update colors and recalculate data
    document.getElementById('button').addEventListener("click", function () {
      selector = document.getElementById('selector').value
      // console.log(selector)
      colorSelection(selector)
      // aggregateData(selector)
    })

    document.getElementById('save').addEventListener("click", getDiff)
    document.getElementById('undo').addEventListener("click", undo)
    map.on("mousemove", move);
    map.on("click", clickevent);
    map.on('draw.create', updateArea)
    map.on('draw.delete', updateArea)
    map.on('draw.update', updateArea)
  }
});
