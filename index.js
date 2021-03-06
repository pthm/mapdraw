var request = require('superagent');
var fs = require('fs');
var gm = require('gm');
var geoViewport = require('geo-viewport');
var stats = require('stats-analysis');
var _ = require('lodash');

var mapboxToken;

var width;
var height;
var viewportCoords;
var viewport;
var center; // Lon, Lat
var zoomLevel;
var lineThickness;
var bbox; //Bottom left / Top Right (lon, lat)
var mapDegreeWidth;
var mapDegreeHeight;
var pixelPerDegreeWidth;
var pixelPerDegreeHeight;
var outPath;

function pointToPixel(point){
  var xStart = point[0] - bbox[0];
  var yStart = point[1] - bbox[1];

  var x = xStart * pixelPerDegreeWidth;
  var y = height - (yStart * pixelPerDegreeHeight);

  return {
    x: x,
    y: y
  }
}

function calculateViewport(line){
  var bottomLeft = [180, 90];
  var topRight = [-180, -90];
  for(var i = 0; i < line.length; i++){
    var lon = line[i][0];
    var lat = line[i][1];

    if(lon < bottomLeft[0]){
      bottomLeft[0] = lon;
    }
    if(lon > topRight[0]){
      topRight[0] = lon;
    }
    if(lat < bottomLeft[1]){
      bottomLeft[1] = lat;
    }
    if(lat > topRight[1]){
      topRight[1] = lat;
    }
  }
  var viewportCoords = bottomLeft.concat(topRight);
  return viewportCoords;
}

function downloadAndDrawMap(line, callback){
  request.get('https://api.mapbox.com/v4/'+mapboxStyle+'/'+
    [center.join(','), zoomLevel].join(',')+
    '/'+[width,height].join('x')+
    '.png?access_token='+
    mapboxToken).end(function(err, res){
      if(err) throw err;

      var map = gm(res.body);
      map.stroke('#2b3845', lineThickness);
      for(var i = 0; i < line.length - 1; i++){
        var point1 = pointToPixel(line[i]);
        var point2 = pointToPixel(line[i+1]);
        map.drawLine(point1.x, point1.y, point2.x, point2.y);
        map.stroke('#2b3845', lineThickness/2);
        map.drawEllipse(point1.x, point1.y, lineThickness / 3, lineThickness / 3, 0, 360)
        map.stroke('#2b3845', lineThickness);
      }

      map.stroke('#5ad4f9');
      var startPoint = pointToPixel(line[0]);
      map.drawEllipse(startPoint.x, startPoint.y, lineThickness / 1.5, lineThickness / 1.5, 0, 360);

      map.stroke('#6dd43c');
      var endPoint = pointToPixel(line[line.length - 1]);
      map.drawEllipse(endPoint.x, endPoint.y, lineThickness / 1.5, lineThickness / 1.5, 0, 360);

      map.write(outPath, function (err) {
        if (err) throw err;
        if(callback){
          callback();
        }
      });
    })
}

function processLine(line){
  var lons = _.pluck(line, 0);
  var lats = _.pluck(line, 1);
  var processedLine = [];
  for(var i = 0; i < lons.length; i++){
    var checkArray = lons.slice(i-2, i+2);
    if(!stats.isOutlier(lons[i], checkArray, 0.7)){
      checkArray = lats.slice(i-2, i+2);
      if(!stats.isOutlier(lats[i], checkArray, 0.6)){
        processedLine.push(line[i]);
      }
    }
  }
  return processedLine;
}

module.exports = function(line, options, callback){
  if(!options){
    options = {}
  }

  if(!options.mapboxToken){
    throw new Error('No mapbox token supplied');
  }

  mapboxToken = options.mapboxToken;
  mapboxStyle = options.mapboxStyle || 'mapbox.streets';

  line = processLine(line);

  width = options.width || 700;
  height = options.height || 500;
  lineThickness = options.lineThickness || 3;

  viewportCoords = calculateViewport(line);
  viewport = geoViewport.viewport(viewportCoords, [width, height]);
  center = viewport.center; // Lon, Lat
  zoomLevel = viewport.zoom;
  bbox = geoViewport.bounds(center, zoomLevel, [width, height]);

  mapDegreeWidth = bbox[2] - bbox[0];
  mapDegreeHeight = bbox[3] - bbox[1];

  pixelPerDegreeWidth = width / mapDegreeWidth;
  pixelPerDegreeHeight = height / mapDegreeHeight;

  outPath = options.outPath || 'out.png';

  downloadAndDrawMap(line, callback);
}
