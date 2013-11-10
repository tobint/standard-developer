var storage;
var writeKey, writeValue, writeButton, outputData;

function handle_storage(e) {
	writeLine("stored key: " + e.key + " with value: " + e.newValue);
}

function handle_writeButtonClick() {
	store(writeKey.value, writeValue.value);
}


function load() {
	storage = window.localStorage;
	writeKey = document.getElementById("writeKey");
	writeValue = document.getElementById("writeValue");
	writeButton = document.getElementById("writeButton");
	outputData = document.getElementById("output-data");
	
	writeButton.addEventListener("click", handle_writeButtonClick, false);
}

function writeLine(data) {
	write(data + "<br/>");
}

function write(data) {
	outputData.innerHTML += data;
}

function writeError(data) {
	writeLine("<span class='error'>" + data + "</span>");
}

function store(key, value) {
	try {
		storage.setItem(key, value);
	} catch(e) {
		writeError(e);
	}
	
}

window.addEventListener("load", load, false);

window.addEventListener("storage", handle_storage, false);