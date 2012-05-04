/****************
 *  A tolerant, minimal icalendar parser
 *  (http://tools.ietf.org/html/rfc5545)
 *
 *  <peterbraden@peterbraden.co.uk>
 * **************/


// Unescape Text re RFC 4.3.11 
var text = function(t){
  return (t
    .replace(/\\\,/g, ',')
    .replace(/\\\;/g, ';')
    .replace(/\\[nN]/g, '\n')
    .replace(/\\\\/g, '\\')
  )
}  

var pad = function(v, len, chr){
  var out = v + ''
  
  for (var i = 0, ii = len - out.length; i<ii; i++){
    out = chr + out
  }  
  return out
}  

var parseParams = function(p){
  var out = {}
  for (var i = 0; i<p.length; i++){
    if (p[i].indexOf('=') > -1){
      var segs = p[i].split('=')
        , out = {}
      if (segs.length == 2){ 
        out[segs[0]] = segs[1]
      }  
    }  
  }  
  return out || sp
}  

var storeParam = function(name){
  return function(val, params, curr){
    if (params && params.length && !(params.length==1 && params[0]==='CHARSET=utf-8')){
      curr[name] = {params:params, val:text(val)}
    }
    else
      curr[name] = text(val)

    return curr
  }
}

var addTZ = function(dt, name, params){
  var p = parseParams(params);
  
  if (params && p){
    dt[name].tz = p.TZID
  }  
  
  return dt 
}  


var dateParam = function(name){
  return function(val, params, curr){
    
    // Store as string - worst case scenario
    storeParam(name)(val, undefined, curr)
        
    if (params && params[0] === "VALUE=DATE") { 
      // Just Date
      
      var comps = /^(\d{4})(\d{2})(\d{2})$/.exec(val);
      if (comps !== null) {
        // No TZ info - assume same timezone as this computer
        curr[name] = new Date(
          comps[1],
          parseInt(comps[2], 10)-1,
          comps[3]
        );
        
        return addTZ(curr, name, params);
      } 
    }   
      

    //typical RFC date-time format
    var comps = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(val);
    if (comps !== null) {
      if (comps[7] == 'Z'){ // GMT
        curr[name] = new Date(Date.UTC(
          parseInt(comps[1], 10),
          parseInt(comps[2], 10)-1,
          parseInt(comps[3], 10),
          parseInt(comps[4], 10),
          parseInt(comps[5], 10),
          parseInt(comps[6], 10 )
        ));
        // TODO add tz
      } else {
        curr[name] = new Date(
          parseInt(comps[1], 10),
          parseInt(comps[2], 10)-1,
          parseInt(comps[3], 10),
          parseInt(comps[4], 10),
          parseInt(comps[5], 10),
          parseInt(comps[6], 10)
        );
      }    
    }

    return addTZ(curr, name, params)
  }
}


var geoParam = function(name){
  return function(val, params, curr){
    storeParam(name)(val, params, curr)
    var parts = val.split(';');
    curr[name] = {lat:Number(parts[0]), lon:Number(parts[1])};
    return curr
  }  
}  

var generateTextParam = function(icsName){
  return function(val){
    return icsName + ";CHARSET=utf-8:" + val; //TODO - handle non strings
  }  
}

var generateRawParam = function(icsName){
  return function(val){
    if (Object.prototype.toString.call(val) == '[object String]'){
      return icsName + ":" + val;
    } else{
      var params = (val.params.length ? ';' : '') + val.params.join(';') 
      return icsName  + params +':' + (val.val || '') 
    }
  }  
}

var generateDateParam = function(icsName){
  return function(val){
    if (val instanceof Date){
      var tzout = ';VALUE=DATE:'
      if (val.tz){
        tzout = ';TZID=' + val.tz + ':'
      }
      
      var d = icsName + tzout + val.getFullYear() +
         pad(val.getMonth()+1, 2, '0') +
         pad(val.getDate(), 2, '0');
         
      if (true){// TODO Only if time 
         d += ('T' 
             + pad(val.getHours(), 2, '0')
             + pad(val.getMinutes(), 2, '0')
             + pad(val.getSeconds(), 2, '0')
           )
      }   
      return d
         
    } else {
      return icsName + ";VALUE=DATE:" + val
    }       
  }  
}







var params = {
  // <ICS PARAM NAME> : [<json key>, <store generator>, <generate generator>]
    'SUMMARY' : ['summary', storeParam, generateTextParam]
  , 'DESCRIPTION' : ['description', storeParam, generateTextParam]
  , 'URL' : ['url', storeParam, generateRawParam]
  , 'UID' : ['uid', storeParam, generateRawParam]
  , 'LOCATION' : ['location', storeParam, generateTextParam]
  , 'DTSTART' : ['start', dateParam, generateDateParam]
  , 'DTEND' : ['end', dateParam, generateDateParam]
  ,' CLASS' : ['class', storeParam, generateRawParam]
  , 'TRANSP' : ['transparency', storeParam, generateRawParam]
  , 'GEO' : ['geo', geoParam]
}  





exports.objectHandlers = {
  'BEGIN' : function(component, params, curr){
      if (component === 'VCALENDAR'){
        return curr;
      }
      return {type:component, params:params}
    }

  , 'END' : function(component, params, curr, par){
    if (component == 'VCALENDAR')
      return;
    if (curr.uid)
      par[curr.uid] = curr
    else{
      par[Math.random()*100000] = curr  // Randomly assign ID : TODO - use true GUID
    }  
  }
}

// Append params handlers to objectHandlers
for (var ic in params){
  exports.objectHandlers[ic] = params[ic][1](params[ic][0])

}
  



exports.handleObject = function(name, val, params, stack, par, line){
  if(exports.objectHandlers[name])
    return exports.objectHandlers[name](val, params, stack, par, line)
  return stack
}



exports.parseICS = function(str){
  var lines = str.split(/\r?\n/)
  var out = {}
  var ctx = {}

  for (var i = 0, ii = lines.length, l = lines[0]; i<ii; i++, l=lines[i]){
    //Unfold : RFC#3.1
    while (lines[i+1] && /[ \t]/.test(lines[i+1][0])) {
      l += lines[i+1].slice(1)
      i += 1
    }

    var kv = l.split(":")

    if (kv.length < 2){
      // Invalid line - must have k&v
      continue;
    }

    // Although the spec says that vals with colons should be quote wrapped
    // in practise nobody does, so we assume further colons are part of the
    // val
    var value = kv.slice(1).join(":")
      , kp = kv[0].split(";")
      , name = kp[0]
      , params = kp.slice(1)

    ctx = exports.handleObject(name, value, params, ctx, out, l) || {}
  }

  return out
}

 
exports.objectGenerators = {}

// Append params handlers to objectGenerators
for (var ic in params){
  if (params[ic][2])
    exports.objectGenerators[params[ic][0]] = params[ic][2](ic)
}

  

exports.generateComponent = function(ob, type){
  
  if (exports.objectGenerators[type]){
    return exports.objectGenerators[type](ob) + '\n'
  }  
  return ""
}  

// Does the opposite of parseICS - generate ICS data from json
exports.generateICS = function(data){
  var out = ""
  
  for (var i in data){
    var component = data[i]
      , t = component.type ? component.type : 'VEVENT'
      
    out += "BEGIN:" + t + '\n'
    for (var k in component){
      out += exports.generateComponent(component[k], k); // TODO Wrap
    } 
    out += "END:" + t + '\n'
    
  }  
  return out
}  
