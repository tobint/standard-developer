var exp = "";


function write(data) {
  exp += (data);
}

function writeLine(data) {
  write(data + "<br/>");
}

function writeTechnologies(data) {
  var output = "";

  for(var s in data) {
    output += "<li><a href=\"#" + data[s] + "\">" + data[s] + "</a></li>\r\n";
  }

  document.getElementById("technologies").innerHTML = output;
}

function writeTopics(data) {
  var output = "";

  for(var s in data) {
    output += "<li><a href=\"#" + data[s] + "\">" + data[s] + "</a></li>\r\n";
  }

  document.getElementById("topics").innerHTML = output;
}

function bold(data) {
  return "<b>" + data + "</b>";
}
  
function arrayUnique(array) {
    var a = array.concat();
    for(var i=0; i<a.length; ++i) {
        for(var j=i+1; j<a.length; ++j) {
            if(a[i] === a[j])
                a.splice(j--, 1);
        }
    }

    return a;
};

function loop(dataArray, filter) {
  var count = 0;
  var output = "";
  var technologies = [];
  var topics = [];

  for(var d in dataArray) {
    output +="<article  class=\"col-lg-3 col-md-3 col-sm-3 col-xs-6\" tabindex=\"" + (count+1) + "\"><header>";
    output += "<h3><a href=\"" + dataArray[d].file + "\" tabindex='-1'>" + dataArray[d].name + "</a></h3>";
    output += "<h6>" + dataArray[d].area + "</h6>"
    output += "</header></article>";

    technologies  = technologies.concat(dataArray[d].technologies.split(','));
    topics        = topics.concat(dataArray[d].topics.split(","));

    count++;
  }


  write(output);
  writeTechnologies(arrayUnique(technologies).sort());
  writeTopics(arrayUnique(topics).sort());
}

var loadExperiments = function() {
  var content = document.querySelector('div[role="content"] div:first-child');
  if(content) {
    loop(experiments);
  }
  content.innerHTML = exp;
}

function load() {
  loadExperiments();
}

function navigate() {

}

window.addEventListener("load", load, false);
window.addEventListener("navigate", navigate, false);

