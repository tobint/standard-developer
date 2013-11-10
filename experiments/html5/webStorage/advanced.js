// log types
var ERROR = "error";
var INFO = "info";
var WARN = "warn";

// storage
var storage;

// controls
var writeKey, writeValue, readKey, writeButton, readButton, lRadio, sRadio, clearButton, enumButton;

// element references
var outputData;

// used to help formatting messages to the screen
String.prototype.format = function() {
	var args = arguments;
	return this.replace(/{(\d+)}/g, function(match, number) { 
		return typeof args[number] != 'undefined' ? args[number] : match;
	});
};

// logs data to the screen
function log(data, logType) {
	if(!logType) {
		logType = INFO;
	}
	var msg = "<span class='{0}'>{1}</span>";
	outputData.innerHTML += msg.format(logType, data);
}

// handle clearButton.onclick event
function handle_clearButtonClick() {
	var msg = "Clearing all.";
	log( msg, INFO );
	storage.clear();
}

// handle readButton.onclick event
function handle_readButtonClick() {
	var msg = "Reading {0}: {1}";
	log( msg.format(readKey.value.bold(), read(readKey.value).italics()), INFO );
	readKey.value = "";
	readKey.focus();
}

// handle enumButton.onclick event
function handle_enumButtonClick() {
	var msg = "Enumerating: ";
	log(msg, INFO);
	msg = " + {0}: {1}";
	for(var n in storage) {
		log( (new String(msg)).format(n.bold(), storage[n].italics()), INFO );
	}
}

// handle writeButton.onclick event
function handle_writeButtonClick() {
	var msg = "Writing {0}: {1}";
	log( msg.format(writeKey.value.bold(), writeValue.value.italics()), INFO );
	write(writeKey.value, writeValue.value);
	writeKey.value = "";
	writeValue.value = "";
	writeKey.focus();
}

// reads data for the given key from storage
function read(key) {
	var ret;
	try {
		ret = storage.getItem(key);
	} catch(e) {
		ret = "undefined";
	}
	return ret;
}

// writes a data value to storage in the given key
function write(key, value) {
	try {
		storage.setItem(key, value);
	} catch(e) {
		ret = "undefined";
	}
}

// handle window.onload event
function handle_load() {
	// set storage
	storage = window.localStorage;

	// element references
	outputData = document.getElementById("outputData");
	
	// storage device fields
	lRadio = document.getElementById("lRadio");
	sRadio = document.getElementById("sRadio");
	
	// write form fields
	writeKey = document.getElementById("writeKey");
	writeValue = document.getElementById("writeValue");
	writeButton = document.getElementById("writeButton");
	
	// read form fields
	readKey = document.getElementById("readKey");
	readButton = document.getElementById("readButton");
	
	// bulk operation form fields
	clearButton = document.getElementById("clearButton");
	enumButton = document.getElementById("enumButton");
	
	// handle button clicks
	lRadio.addEventListener("change", handle_change, false);
	sRadio.addEventListener("change", handle_change, false);
	writeButton.addEventListener("click", handle_writeButtonClick, false);
	readButton.addEventListener("click", handle_readButtonClick, false);
	clearButton.addEventListener("click", handle_clearButtonClick, false);
	enumButton.addEventListener("click", handle_enumButtonClick, false);
	
}

// handle window.onstorage event
function handle_storage(e) {
	var msg = "Data stored with {0}: {1}";
	log(msg.format(e.key.bold(), e.newValue.italics()));
}

// handle sButton/lButton.onhange event
function handle_change(e) {
	if(e.target.id == "lRadio") {
		log("<b>switching to localStorage</b>", WARN);
		storage = window.localStorage;
		writeKey.placeholder = "localStorage key";
		writeValue.placeholder = "localStorage value";
		readKey.placeholder = "localStorage key";
	} else {
		log("<b>switching to sessionStorage</b>", WARN);
		storage =window.sessionStorage;
		writeKey.placeholder = "sessionStorage key";
		writeValue.placeholder = "sessionStorage value";
		readKey.placeholder = "sessionStorage key";
	}
}

// wire up event handlers
window.addEventListener("load", handle_load, false);
window.addEventListener("storage", handle_storage, false);