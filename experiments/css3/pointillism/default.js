var reader,
	canvas, 
	context,
	status;

function errorHandler(evt) {
	switch(evt.target.error.code) {
		case evt.target.error.NOT_FOUND_ERR:
			alert('File Not Found!');
			break;
		case evt.target.error.NOT_READABLE_ERR:
			alert('File is not readable');
			break;
		case evt.target.error.ABORT_ERR:
			break; // noop
		default:
			alert('An error occurred reading this file.');
	};
}

function handleFileSelect(evt) {
	reader = new FileReader();
	reader.onerror = errorHandler;
	reader.onloadend = function(e) {
		var i = new Image();
		i.onload = function(e) {
			drawImage(i);
			var css = generateCSS();
			document.getElementById("singlePreview").style.backgroundImage = css;
		}
		i.src = e.target.result;
	}
	reader.readAsDataURL(evt.target.files[0]);
}

function drawImage(i) {
	context.clearRect(0,0,200,200);
	// Scale the image based on orientation
	if(i.width > i.height) {
		context.drawImage(i, 0, 0, 200, 200/(i.width/i.height));
	} else {
		context.drawImage(i, 0, 0, 200/(i.height/i.width), 200);
	}
}

function generateCSS() {
	var pixelSpacing = 2;
	var color, r, g, b, a, rgba;
	var css = new Array();
	for(var y = 0; y < canvas.height; y+=pixelSpacing) {
		for(var x = 0; x < canvas.width; x+=pixelSpacing) {
			color = context.getImageData(x,y,1,1);
			r = color.data[0];
			g = color.data[1];
			b = color.data[2];
			a = color.data[3];
			if(r == 0 && g == 0 && b == 0 && a == 0) {
				// do nothing;
			} else {
				rgba = "rgba(" + [r,g,b,a].join(",") + ")";
				css.push("radial-gradient(circle at " + x + "px " + y + "px, "+ rgba + ", " + rgba + " 1px, transparent 1.1px)");
			}
		}
	}
	return css.join(",");
}

function load() {
	canvas = document.getElementById("imageCanvas");
	context = canvas.getContext("2d");
	document.getElementById('files').addEventListener('change', handleFileSelect, false);
	status = document.getElementById("status");
}

window.addEventListener("load", load, false);