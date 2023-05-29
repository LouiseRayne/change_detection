// By louiserayne@googlemail.com
 
// This is a script designed to automatically detect change to archaeological sites
// Try it out by importing your own assets and naming as 'sites'.   
  
// ENTER DATE HERE: Latest date to which to apply analysis.   
var year_later = 2022; 
var month_later = 5;
var day_later = 1;
 
var startDate_later = ee.Date.fromYMD(year_later, month_later, day_later);

// ENTER DATE HERE: Latest date of an earlier period you want to compare it to.
var year_earlier = 2020; 
var month_earlier = 5;
var day_earlier = 1;

var startDate_earlier = ee.Date.fromYMD(year_earlier, month_earlier, day_earlier); 

// parameters for date: the date advancing function generates a time range and filters data according to this range

var delta_later = -3; //-1 will count back, 1 will count forward
var unit_later = 'month';

var delta_earlier = -3;
var unit_earlier = 'month';

var date_advancing_later = function(startDate_later, delta_later, unit_later) {
  var dateRange = ee.DateRange(startDate_later.advance(delta_later, unit_later), startDate_later);
  return dateRange;
};  

var date_advancing_earlier = function(startDate_earlier, delta_earlier, unit_earlier) {
  var dateRange2 = ee.DateRange(startDate_earlier.advance(delta_earlier, unit_earlier), startDate_earlier);
  return dateRange2;
};  


// Dynamic World
var DynWorld_e = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1') 
.filterDate(date_advancing_earlier(startDate_earlier, delta_earlier, unit_earlier))
.filterBounds(geometry)
.median()
.clip(geometry)

var classification_e = DynWorld_e.select('label');
  
var DynWorld_l = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1') 
.filterDate(date_advancing_later(startDate_later, delta_later, unit_later))
.filterBounds(geometry)
.median()
.clip(geometry)  

var classification_l = DynWorld_l.select('label');


var dwVisParams = {
  min: 0,
  max: 8,
  palette: [
    '#419BDF', '#397D49', '#88B053', '#7A87C6', '#E49635', '#DFC35A',
    '#C4281B', '#A59B8F', '#B39FE1'
  ]
};

Map.addLayer(classification_e, dwVisParams, 'DW Image earlier', false);
Map.addLayer(classification_l, dwVisParams, 'DW Image later', false);

var diff_dw_abs = 
  classification_l.subtract(classification_e).abs();


var diff_dw_thr = diff_dw_abs.gte(1) // edit threshold value here

var diff_dw_thr_msk = diff_dw_thr.mask(diff_dw_thr)

var DW_change_stack = classification_e.addBands(classification_l.addBands(diff_dw_abs)).rename(['earlier', 'later', 'difference'])

Map.addLayer(DW_change_stack.select('difference'), {}, 'DW_change_stack', false)


var DW_change_stack_diff = DW_change_stack.select('difference')
var DW_change_stack_mask = DW_change_stack.mask(DW_change_stack_diff)
Map.addLayer(DW_change_stack_mask, {}, 'DW_change_stack_mask', false)


// Sentinel 2
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = ee.Number(2).pow(10).int();
  var cirrusBitMask = ee.Number(2).pow(11).int();
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
             qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000)
      .select("B.*")
      .copyProperties(image, ["system:time_start"]);
}

var vizParams_S2 = {
  bands: ['B8', 'B3', 'B2'], //edit S2 band choice here
  min: 0,
  max: 0.5,
  gamma: 1.602
};
  
var col_earlier = ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
  .filterDate(date_advancing_earlier(startDate_earlier, delta_earlier, unit_earlier))
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10)) //you can edit this value to filter cloudy images
  .filterBounds(geometry)
  .map(maskS2clouds)
  .median()
  .clip(geometry);
  
var col_later = ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
  .filterDate(date_advancing_later(startDate_later, delta_later, unit_later))
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10)) //you can edit this value to filter cloudy images
  .filterBounds(geometry)
  .map(maskS2clouds)
  .median()
  .clip(geometry);

Map.addLayer(col_earlier, vizParams_S2, 'S2 imagery (earlier)', false);  

Map.addLayer(col_later , vizParams_S2, 'S2 imagery (later)', false);



var magnitude = function(image) {
  return image.pow(2).reduce('sum').sqrt();
};

var difference = magnitude(
  col_later.subtract(col_earlier));

Map.addLayer(difference, {min: 0, max: 0.5}, 'S2 Imagery difference', false);

var differencethreshold = difference.gte(0.2); // edit threshold value here

var maskdifferencethreshold = differencethreshold.mask(differencethreshold);

Map.addLayer(maskdifferencethreshold, {palette: 'green'}, 'S2 Imagery change mask',false);



// add the sites

var ACD_sites = sites.filterBounds(geometry);


var buffered = ACD_sites.map(function(f) {
  return f.buffer(100);  // change size of buffers here
});

Map.addLayer(buffered, {color: 'green'}, 'All sites', false);

// 
 
var combine = DW_change_stack_mask.addBands(maskdifferencethreshold)
var sites_with_appended_data = combine.reduceRegions(buffered, ee.Reducer.mode(), 10)
//print(sites_with_appended_data, 'sites_with_appended_data')
//Map.addLayer(sites_with_appended_data, {color: '87CEEB'}, 'sites_with_appended_data', false)

var changed_sites = sites_with_appended_data.filter(ee.Filter.eq('sum', 1))
Map.addLayer(changed_sites, {color: '87CEEB'}, 'changed_sites', false)
print(changed_sites)

//

Map.centerObject(geometry);

Export.table.toDrive({
  collection: sites_with_appended_data,
  description: 'sites_with_appended_data',
  fileFormat: 'SHP'
  })
 