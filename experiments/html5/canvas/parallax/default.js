if(!window.globals) { window.globals = {}; }

window.globals.canvas = document.getElementById('game-surface');
window.globals.context = canvas.getContext('2d');
window.globals.loopCount = 0;
window.globals.config = {
	assets          : 5,
	assetsLoaded    : 0,
	KEY_CODE_LEFT   : 37,
	KEY_CODE_RIGHT  : 39	
};
window.globals.gameState = {
	drawInterval    : null,
	moveInterval    : null,
	images : {
		backdrop    :  { ref :null, offset:   90, x :   90, y :    0, height : 200, width :  534, src : "imgs/background3.png" },
		background1 :  { ref :null, offset:   40, x :   40, y :  -50, height : 180, width :  432, src : "imgs/background2.png" },
		background2 :  { ref :null, offset:   50, x :   50, y : -150, height : 317, width :  749, src : "imgs/background1.png" },
		ground      :  { ref :null, offset: -300, x : -300, y :    0, height : 200, width : 1493, src : "imgs/ground.png"      },
		foreground  :  { ref :null, offset: -800, x : -800, y :  165, height :  44, width :  675, src : "imgs/foreground.png" , logic : "repeatX", length : 2000   }
	},
	lastDrawUpdate  : new Date(),
	lastMoveUpdate  : new Date(),
	offset          : 0,
	velocity        : 0
};

function updateFps()
{
	config.targetFps=$("numFps").val();
}

function setBackground()
{
	context.fillStyle = "rgb(18, 20, 35)"
	context.fillRect(0,0,canvas.width, canvas.height);
	context.fill();
}


function loadImages() 
{
	$.each(gameState.images, function (i, item) {
		item.ref = loadImage(item);
	});
}

function loadImage(item)
{
    var img = new Image();
		img.onload = function(){
			assetLoaded(item);
		};
		img.src = item.src;

	return img;
}

function bindEvents()
{
	document.onkeydown = function(e) 
	{
		e = e || window.event;
		switch (e.keyCode) 
		{ 
			case config.KEY_CODE_LEFT: 
				gameState.velocity = 1;
				break;
			case config.KEY_CODE_RIGHT: 
				gameState.velocity = -1;
				break;
		}
	}
	document.onkeyup = function(e) 
	{
		e = e || window.event;
		switch (e.keyCode) {
			case config.KEY_CODE_RIGHT:
			case config.KEY_CODE_LEFT:
				gameState.velocity = 0;
				break;
		}
	}
}


function scroll() {
	gameState.offset = (gameState.offset > 50 ? 50 : (gameState.offset < -50 ? -50 : gameState.offset));
	gameState.images.background2.x = (  gameState.images.background2.offset + gameState.offset/5);
	gameState.images.background1.x = (  gameState.images.background1.offset + gameState.offset/4);
	gameState.images.backdrop.x    = (  gameState.images.backdrop.offset + gameState.offset/2);
	gameState.images.ground.x      = (  gameState.images.ground.offset + gameState.offset  );
	gameState.images.foreground.x  = (  gameState.images.foreground.offset + gameState.offset/0.5  );
}

function startMoveEngine()
{
	gameState.moveInterval = setInterval("move()", 1000/config.targetFps);
}

function move()
{
	moveBackground();
}

function moveBackground()
{
	gameState.offset += gameState.velocity;
	scroll();
}

function redraw()
{
	setBackground();
	$.each(gameState.images, function (i, item) {
		draw(item);
	});
	updateDate(gameState.lastDrawUpdate);
}

function updateDate(dateToUpdate)
{
	++loopCount;
	if(loopCount % 10 == 0) {
		var thisUpdate = new Date();
		var fps = (10000 / (thisUpdate - dateToUpdate)).toFixed(0);
		gameState.lastDrawUpdate = thisUpdate;
		$("#fps").html("FPS:" + fps);
		loopCount = 0;
	}
}

function draw(img)
{
	// abstracted in case we want to do logging / metrics
	if(img.logic == null)
	{
		context.drawImage(img.ref, img.x, img.y);
	}
	else
	{
		switch(img.logic)
		{
			case "repeatX":
				var w = img.length;
				for(i = img.x; i < w; i += img.width)
				{
					context.drawImage(img.ref, i, img.y);
				}
				break
			default:
				break;
		}
	}
	
}

function assetLoaded(item) {
	config.assetsLoaded++;
	
	if(config.assetsLoaded === config.assets)
	{
		gameState.drawInterval = setInterval("redraw()", 1000/config.targetFps);
	}
}


function load() {
	setBackground();
	loadImages();
	startMoveEngine();
	bindEvents();
}


window.addEventListener("load", load, false);