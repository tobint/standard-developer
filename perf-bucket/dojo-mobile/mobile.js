require({cache:{
'dojox/mobile/scrollable':function(){
define("dojox/mobile/scrollable", [
	"dojo/_base/kernel",
	"dojo/_base/connect",
	"dojo/_base/event",
	"dojo/_base/lang",
	"dojo/_base/window",
	"dojo/dom-class",
	"dojo/dom-construct",
	"dojo/dom-style",
	"dojo/touch",
	"./sniff",
	"./_css3",
	"./_maskUtils"
], function(dojo, connect, event, lang, win, domClass, domConstruct, domStyle, touch, has, css3, maskUtils){

	// module:
	//		dojox/mobile/scrollable

	// TODO: rename to Scrollable.js (capital S) for 2.0

	// TODO: shouldn't be referencing this dojox/mobile variable, would be better to require the mobile.js module
	var dm = lang.getObject("dojox.mobile", true);

	// feature detection
	has.add("translate3d", function(){
		if(has("css3-animations")){
			var elem = win.doc.createElement("div");
			elem.style[css3.name("transform")] = "translate3d(0px,1px,0px)";
			win.doc.documentElement.appendChild(elem);
			var v = win.doc.defaultView.getComputedStyle(elem, '')[css3.name("transform", true)];
			var hasTranslate3d = v && v.indexOf("matrix") === 0;
			win.doc.documentElement.removeChild(elem);
			return hasTranslate3d;
		}
	});

	var Scrollable = function(){
		// summary:
		//		Mixin for enabling touch scrolling capability.
		// description:
		//		Mixin for enabling touch scrolling capability.
		//		Mobile WebKit browsers do not allow scrolling inner DIVs. (For instance,
		//		on iOS you need the two-finger operation to scroll them.)
		//		That means you cannot have fixed-positioned header/footer bars.
		//		To solve this issue, this module disables the browsers default scrolling
		//		behavior, and rebuilds its own scrolling machinery by handling touch
		//		events. In this module, this.domNode has height "100%" and is fixed to
		//		the window, and this.containerNode scrolls. If you place a bar outside
		//		of this.containerNode, then it will be fixed-positioned while
		//		this.containerNode is scrollable.
		//
		//		This module has the following features:
		//
		//		- Scrolls inner DIVs vertically, horizontally, or both.
		//		- Vertical and horizontal scroll bars.
		//		- Flashes the scroll bars when a view is shown.
		//		- Simulates the flick operation using animation.
		//		- Respects header/footer bars if any.
	};

	lang.extend(Scrollable, {
		// fixedHeaderHeight: Number
		//		height of a fixed header
		fixedHeaderHeight: 0,

		// fixedFooterHeight: Number
		//		height of a fixed footer
		fixedFooterHeight: 0,

		// isLocalFooter: Boolean
		//		footer is view-local (as opposed to application-wide)
		isLocalFooter: false,

		// scrollBar: Boolean
		//		show scroll bar or not
		scrollBar: true,

		// scrollDir: String
		//		v: vertical, h: horizontal, vh: both, f: flip
		scrollDir: "v",

		// weight: Number
		//		frictional drag
		weight: 0.6,

		// fadeScrollBar: Boolean
		fadeScrollBar: true,

		// disableFlashScrollBar: Boolean
		disableFlashScrollBar: false,

		// threshold: Number
		//		drag threshold value in pixels
		threshold: 4,

		// constraint: Boolean
		//		bounce back to the content area
		constraint: true,

		// touchNode: DOMNode
		//		a node that will have touch event handlers
		touchNode: null,

		// propagatable: Boolean
		//		let touchstart event propagate up
		propagatable: true,

		// dirLock: Boolean
		//		disable the move handler if scroll starts in the unexpected direction
		dirLock: false,

		// height: String
		//		explicitly specified height of this widget (ex. "300px")
		height: "",

		// scrollType: Number
		//		- 1: use -webkit-transform:translate3d(x,y,z) style, use -webkit-animation for slide anim
		//		- 2: use top/left style,
		//		- 3: use -webkit-transform:translate3d(x,y,z) style, use -webkit-transition for slide anim
		//		- 0: use default value (2 in case of Android < 3, 3 if iOS6, otherwise 1)
		scrollType: 0,

		init: function(/*Object?*/params){
			// summary:
			//		Initialize according to the given params.
			// description:
			//		Mixes in the given params into this instance. At least domNode
			//		and containerNode have to be given.
			//		Starts listening to the touchstart events.
			//		Calls resize(), if this widget is a top level widget.
			if(params){
				for(var p in params){
					if(params.hasOwnProperty(p)){
						this[p] = ((p == "domNode" || p == "containerNode") && typeof params[p] == "string") ?
							win.doc.getElementById(params[p]) : params[p]; // mix-in params
					}
				}
			}
			// prevent browser scrolling on IE10 (evt.preventDefault() is not enough)
			if(typeof this.domNode.style.msTouchAction != "undefined"){
				this.domNode.style.msTouchAction = "none";
			}
			this.touchNode = this.touchNode || this.containerNode;
			this._v = (this.scrollDir.indexOf("v") != -1); // vertical scrolling
			this._h = (this.scrollDir.indexOf("h") != -1); // horizontal scrolling
			this._f = (this.scrollDir == "f"); // flipping views

			this._ch = []; // connect handlers
			this._ch.push(connect.connect(this.touchNode, touch.press, this, "onTouchStart"));
			if(has("css3-animations")){
				// flag for whether to use -webkit-transform:translate3d(x,y,z) or top/left style.
				// top/left style works fine as a workaround for input fields auto-scrolling issue,
				// so use top/left in case of Android by default.
				this._useTopLeft = this.scrollType ? this.scrollType === 2 : has('android') < 3;
				// Flag for using webkit transition on transform, instead of animation + keyframes.
				// (keyframes create a slight delay before the slide animation...)
				if(!this._useTopLeft){
					this._useTransformTransition = this.scrollType ? this.scrollType === 3 : has("ios") >= 6;
				}
				if(!this._useTopLeft){
					if(this._useTransformTransition){
						this._ch.push(connect.connect(this.domNode, css3.name("transitionEnd"), this, "onFlickAnimationEnd"));
						this._ch.push(connect.connect(this.domNode, css3.name("transitionStart"), this, "onFlickAnimationStart"));
					}else{
						this._ch.push(connect.connect(this.domNode, css3.name("animationEnd"), this, "onFlickAnimationEnd"));
						this._ch.push(connect.connect(this.domNode, css3.name("animationStart"), this, "onFlickAnimationStart"));
	
						// Creation of keyframes takes a little time. If they are created
						// in a lazy manner, a slight delay is noticeable when you start
						// scrolling for the first time. This is to create keyframes up front.
						for(var i = 0; i < 3; i++){
							this.setKeyframes(null, null, i);
						}
					}
					if(has("translate3d")){ // workaround for flicker issue on iPhone and Android 3.x/4.0
						domStyle.set(this.containerNode, css3.name("transform"), "translate3d(0,0,0)");
					}
				}else{
					this._ch.push(connect.connect(this.domNode, css3.name("transitionEnd"), this, "onFlickAnimationEnd"));
					this._ch.push(connect.connect(this.domNode, css3.name("transitionStart"), this, "onFlickAnimationStart"));
				}
			}

			this._speed = {x:0, y:0};
			this._appFooterHeight = 0;
			if(this.isTopLevel() && !this.noResize){
				this.resize();
			}
			var _this = this;
			setTimeout(function(){
				_this.flashScrollBar();
			}, 600);
		},

		isTopLevel: function(){
			// summary:
			//		Returns true if this is a top-level widget.
			// description:
			//		Subclass may want to override.
			return true;
		},

		cleanup: function(){
			// summary:
			//		Uninitialize the module.
			if(this._ch){
				for(var i = 0; i < this._ch.length; i++){
					connect.disconnect(this._ch[i]);
				}
				this._ch = null;
			}
		},

		findDisp: function(/*DomNode*/node){
			// summary:
			//		Finds the currently displayed view node from my sibling nodes.
			if(!node.parentNode){ return null; }

			// the given node is the first candidate
			if(node.nodeType === 1 && domClass.contains(node, "mblSwapView") && node.style.display !== "none"){
				return node;
			}

			var nodes = node.parentNode.childNodes;
			for(var i = 0; i < nodes.length; i++){
				var n = nodes[i];
				if(n.nodeType === 1 && domClass.contains(n, "mblView") && n.style.display !== "none"){
					return n;
				}
			}
			return node;
		},

		getScreenSize: function(){
			// summary:
			//		Returns the dimensions of the browser window.
			return {
				h: win.global.innerHeight||win.doc.documentElement.clientHeight||win.doc.documentElement.offsetHeight,
				w: win.global.innerWidth||win.doc.documentElement.clientWidth||win.doc.documentElement.offsetWidth
			};
		},

		resize: function(e){
			// summary:
			//		Adjusts the height of the widget.
			// description:
			//		If the height property is 'inherit', the height is inherited
			//		from its offset parent. If 'auto', the content height, which
			//		could be smaller than the entire screen height, is used. If an
			//		explicit height value (ex. "300px"), it is used as the new
			//		height. If nothing is specified as the height property, from the
			//		current top position of the widget to the bottom of the screen
			//		will be the new height.

			// moved from init() to support dynamically added fixed bars
			this._appFooterHeight = (this._fixedAppFooter) ? this._fixedAppFooter.offsetHeight : 0;
			if(this.isLocalHeader){
				this.containerNode.style.marginTop = this.fixedHeaderHeight + "px";
			}

			// Get the top position. Same as dojo.position(node, true).y
			var top = 0;
			for(var n = this.domNode; n && n.tagName != "BODY"; n = n.offsetParent){
				n = this.findDisp(n); // find the first displayed view node
				if(!n){ break; }
				top += n.offsetTop;
			}

			// adjust the height of this view
			var	h,
				screenHeight = this.getScreenSize().h,
				dh = screenHeight - top - this._appFooterHeight; // default height
			if(this.height === "inherit"){
				if(this.domNode.offsetParent){
					h = this.domNode.offsetParent.offsetHeight + "px";
				}
			}else if(this.height === "auto"){
				var parent = this.domNode.offsetParent;
				if(parent){
					this.domNode.style.height = "0px";
					var	parentRect = parent.getBoundingClientRect(),
						scrollableRect = this.domNode.getBoundingClientRect(),
						contentBottom = parentRect.bottom - this._appFooterHeight;
					if(scrollableRect.bottom >= contentBottom){ // use entire screen
						dh = screenHeight - (scrollableRect.top - parentRect.top) - this._appFooterHeight;
					}else{ // stretch to fill predefined area
						dh = contentBottom - scrollableRect.bottom;
					}
				}
				// content could be smaller than entire screen height
				var contentHeight = Math.max(this.domNode.scrollHeight, this.containerNode.scrollHeight);
				h = (contentHeight ? Math.min(contentHeight, dh) : dh) + "px";
			}else if(this.height){
				h = this.height;
			}
			if(!h){
				h = dh + "px";
			}
			if(h.charAt(0) !== "-" && // to ensure that h is not negative (e.g. "-10px")
				h !== "default"){
				this.domNode.style.height = h;
			}

			// to ensure that the view is within a scrolling area when resized.
			this.onTouchEnd();
		},

		onFlickAnimationStart: function(e){
			event.stop(e);
		},

		onFlickAnimationEnd: function(e){
			var an = e && e.animationName;
			if(an && an.indexOf("scrollableViewScroll2") === -1){
				if(an.indexOf("scrollableViewScroll0") !== -1){ // scrollBarV
					if(this._scrollBarNodeV){ domClass.remove(this._scrollBarNodeV, "mblScrollableScrollTo0"); }
				}else if(an.indexOf("scrollableViewScroll1") !== -1){ // scrollBarH
					if(this._scrollBarNodeH){ domClass.remove(this._scrollBarNodeH, "mblScrollableScrollTo1"); }
				}else{ // fade or others
					if(this._scrollBarNodeV){ this._scrollBarNodeV.className = ""; }
					if(this._scrollBarNodeH){ this._scrollBarNodeH.className = ""; }
				}
				return;
			}
			if(this._useTransformTransition || this._useTopLeft){
				var n = e.target;
				if(n === this._scrollBarV || n === this._scrollBarH){
					var cls = "mblScrollableScrollTo" + (n === this._scrollBarV ? "0" : "1");
					if(domClass.contains(n, cls)){
						domClass.remove(n, cls);
					}else{
						n.className = "";
					}
					return;
				}
			}
			if(e && e.srcElement){
				event.stop(e);
			}
			this.stopAnimation();
			if(this._bounce){
				var _this = this;
				var bounce = _this._bounce;
				setTimeout(function(){
					_this.slideTo(bounce, 0.3, "ease-out");
				}, 0);
				_this._bounce = undefined;
			}else{
				this.hideScrollBar();
				this.removeCover();
			}
		},

		isFormElement: function(/*DOMNode*/node){
			// summary:
			//		Returns true if the given node is a form control.
			if(node && node.nodeType !== 1){ node = node.parentNode; }
			if(!node || node.nodeType !== 1){ return false; }
			var t = node.tagName;
			return (t === "SELECT" || t === "INPUT" || t === "TEXTAREA" || t === "BUTTON");
		},

		onTouchStart: function(e){
			// summary:
			//		User-defined function to handle touchStart events.
			if(this.disableTouchScroll){ return; }
			if(this._conn && (new Date()).getTime() - this.startTime < 500){
				return; // ignore successive onTouchStart calls
			}
			if(!this._conn){
				this._conn = [];
				this._conn.push(connect.connect(win.doc, touch.move, this, "onTouchMove"));
				this._conn.push(connect.connect(win.doc, touch.release, this, "onTouchEnd"));
			}

			this._aborted = false;
			if(domClass.contains(this.containerNode, "mblScrollableScrollTo2")){
				this.abort();
			}else{ // reset scrollbar class especially for reseting fade-out animation
				if(this._scrollBarNodeV){ this._scrollBarNodeV.className = ""; }
				if(this._scrollBarNodeH){ this._scrollBarNodeH.className = ""; }
			}
			this.touchStartX = e.touches ? e.touches[0].pageX : e.clientX;
			this.touchStartY = e.touches ? e.touches[0].pageY : e.clientY;
			this.startTime = (new Date()).getTime();
			this.startPos = this.getPos();
			this._dim = this.getDim();
			this._time = [0];
			this._posX = [this.touchStartX];
			this._posY = [this.touchStartY];
			this._locked = false;

			if(!this.isFormElement(e.target)){
				this.propagatable ? e.preventDefault() : event.stop(e);
			}
		},

		onTouchMove: function(e){
			// summary:
			//		User-defined function to handle touchMove events.
			if(this._locked){ return; }
			var x = e.touches ? e.touches[0].pageX : e.clientX;
			var y = e.touches ? e.touches[0].pageY : e.clientY;
			var dx = x - this.touchStartX;
			var dy = y - this.touchStartY;
			var to = {x:this.startPos.x + dx, y:this.startPos.y + dy};
			var dim = this._dim;

			dx = Math.abs(dx);
			dy = Math.abs(dy);
			if(this._time.length == 1){ // the first TouchMove after TouchStart
				if(this.dirLock){
					if(this._v && !this._h && dx >= this.threshold && dx >= dy ||
						(this._h || this._f) && !this._v && dy >= this.threshold && dy >= dx){
						this._locked = true;
						return;
					}
				}
				if(this._v && this._h){ // scrollDir="hv"
					if(dy < this.threshold &&
					   dx < this.threshold){
						return;
					}
				}else{
					if(this._v && dy < this.threshold ||
					   (this._h || this._f) && dx < this.threshold){
						return;
					}
				}
				this.addCover();
				this.showScrollBar();
			}

			var weight = this.weight;
			if(this._v && this.constraint){
				if(to.y > 0){ // content is below the screen area
					to.y = Math.round(to.y * weight);
				}else if(to.y < -dim.o.h){ // content is above the screen area
					if(dim.c.h < dim.d.h){ // content is shorter than display
						to.y = Math.round(to.y * weight);
					}else{
						to.y = -dim.o.h - Math.round((-dim.o.h - to.y) * weight);
					}
				}
			}
			if((this._h || this._f) && this.constraint){
				if(to.x > 0){
					to.x = Math.round(to.x * weight);
				}else if(to.x < -dim.o.w){
					if(dim.c.w < dim.d.w){
						to.x = Math.round(to.x * weight);
					}else{
						to.x = -dim.o.w - Math.round((-dim.o.w - to.x) * weight);
					}
				}
			}
			this.scrollTo(to);

			var max = 10;
			var n = this._time.length; // # of samples
			if(n >= 2){
				// Check the direction of the finger move.
				// If the direction has been changed, discard the old data.
				var d0, d1;
				if(this._v && !this._h){
					d0 = this._posY[n - 1] - this._posY[n - 2];
					d1 = y - this._posY[n - 1];
				}else if(!this._v && this._h){
					d0 = this._posX[n - 1] - this._posX[n - 2];
					d1 = x - this._posX[n - 1];
				}
				if(d0 * d1 < 0){ // direction changed
					// leave only the latest data
					this._time = [this._time[n - 1]];
					this._posX = [this._posX[n - 1]];
					this._posY = [this._posY[n - 1]];
					n = 1;
				}
			}
			if(n == max){
				this._time.shift();
				this._posX.shift();
				this._posY.shift();
			}
			this._time.push((new Date()).getTime() - this.startTime);
			this._posX.push(x);
			this._posY.push(y);
		},

		onTouchEnd: function(/*Event*/e){
			// summary:
			//		User-defined function to handle touchEnd events.
			if(this._locked){ return; }
			var speed = this._speed = {x:0, y:0};
			var dim = this._dim;
			var pos = this.getPos();
			var to = {}; // destination
			if(e){
				if(!this._conn){ return; } // if we get onTouchEnd without onTouchStart, ignore it.
				for(var i = 0; i < this._conn.length; i++){
					connect.disconnect(this._conn[i]);
				}
				this._conn = null;

				var n = this._time.length; // # of samples
				var clicked = false;
				if(!this._aborted){
					if(n <= 1){
						clicked = true;
					}else if(n == 2 && Math.abs(this._posY[1] - this._posY[0]) < 4
						&& has('touch')){ // for desktop browsers, posY could be the same, since we're using clientY, see onTouchMove()
						clicked = true;
					}
				}
				if(clicked){ // clicked, not dragged or flicked
					this.hideScrollBar();
					this.removeCover();
					// #12697 Do not generate a click event programmatically when a
					// form element (input, select, etc.) is clicked.
					// Otherwise, in particular, when checkbox is clicked, its state
					// is reversed again by the generated event.
					// #15878 The reason we send this synthetic click event is that we assume that the OS
					// will not send the click because we prevented/stopped the touchstart.
					// However, this does not seem true any more in Android 4.1 where the click is
					// actually sent by the OS. So we must not send it a second time.
					if(has('touch') && !this.isFormElement(e.target) && !(has("android") >= 4.1 || has("ie") >= 10)){
						var elem = e.target;
						if(elem.nodeType != 1){
							elem = elem.parentNode;
						}
						var ev = win.doc.createEvent("MouseEvents");
						ev.initMouseEvent("click", true, true, win.global, 1, e.screenX, e.screenY, e.clientX, e.clientY);
						setTimeout(function(){
							elem.dispatchEvent(ev);
						}, 0);
					}
					return;
				}
				speed = this._speed = this.getSpeed();
			}else{
				if(pos.x == 0 && pos.y == 0){ return; } // initializing
				dim = this.getDim();
			}

			if(this._v){
				to.y = pos.y + speed.y;
			}
			if(this._h || this._f){
				to.x = pos.x + speed.x;
			}

			if(this.adjustDestination(to, pos, dim) === false){ return; }

			if(this.scrollDir == "v" && dim.c.h < dim.d.h){ // content is shorter than display
				this.slideTo({y:0}, 0.3, "ease-out"); // go back to the top
				return;
			}else if(this.scrollDir == "h" && dim.c.w < dim.d.w){ // content is narrower than display
				this.slideTo({x:0}, 0.3, "ease-out"); // go back to the left
				return;
			}else if(this._v && this._h && dim.c.h < dim.d.h && dim.c.w < dim.d.w){
				this.slideTo({x:0, y:0}, 0.3, "ease-out"); // go back to the top-left
				return;
			}

			var duration, easing = "ease-out";
			var bounce = {};
			if(this._v && this.constraint){
				if(to.y > 0){ // going down. bounce back to the top.
					if(pos.y > 0){ // started from below the screen area. return quickly.
						duration = 0.3;
						to.y = 0;
					}else{
						to.y = Math.min(to.y, 20);
						easing = "linear";
						bounce.y = 0;
					}
				}else if(-speed.y > dim.o.h - (-pos.y)){ // going up. bounce back to the bottom.
					if(pos.y < -dim.o.h){ // started from above the screen top. return quickly.
						duration = 0.3;
						to.y = dim.c.h <= dim.d.h ? 0 : -dim.o.h; // if shorter, move to 0
					}else{
						to.y = Math.max(to.y, -dim.o.h - 20);
						easing = "linear";
						bounce.y = -dim.o.h;
					}
				}
			}
			if((this._h || this._f) && this.constraint){
				if(to.x > 0){ // going right. bounce back to the left.
					if(pos.x > 0){ // started from right of the screen area. return quickly.
						duration = 0.3;
						to.x = 0;
					}else{
						to.x = Math.min(to.x, 20);
						easing = "linear";
						bounce.x = 0;
					}
				}else if(-speed.x > dim.o.w - (-pos.x)){ // going left. bounce back to the right.
					if(pos.x < -dim.o.w){ // started from left of the screen top. return quickly.
						duration = 0.3;
						to.x = dim.c.w <= dim.d.w ? 0 : -dim.o.w; // if narrower, move to 0
					}else{
						to.x = Math.max(to.x, -dim.o.w - 20);
						easing = "linear";
						bounce.x = -dim.o.w;
					}
				}
			}
			this._bounce = (bounce.x !== undefined || bounce.y !== undefined) ? bounce : undefined;

			if(duration === undefined){
				var distance, velocity;
				if(this._v && this._h){
					velocity = Math.sqrt(speed.x*speed.x + speed.y*speed.y);
					distance = Math.sqrt(Math.pow(to.y - pos.y, 2) + Math.pow(to.x - pos.x, 2));
				}else if(this._v){
					velocity = speed.y;
					distance = to.y - pos.y;
				}else if(this._h){
					velocity = speed.x;
					distance = to.x - pos.x;
				}
				if(distance === 0 && !e){ return; } // #13154
				duration = velocity !== 0 ? Math.abs(distance / velocity) : 0.01; // time = distance / velocity
			}
			this.slideTo(to, duration, easing);
		},

		adjustDestination: function(/*Object*/to, /*Object*/pos, /*Object*/dim){
			// summary:
			//		A stub function to be overridden by subclasses.
			// description:
			//		This function is called from onTouchEnd(). The purpose is to give its
			//		subclasses a chance to adjust the destination position. If this
			//		function returns false, onTouchEnd() returns immediately without
			//		performing scroll.
			// to:
			//		The destination position. An object with x and y.
			// pos:
			//		The current position. An object with x and y.
			// dim:
			//		Dimension information returned by getDim().			

			// subclass may want to implement
			return true; // Boolean
		},

		abort: function(){
			// summary:
			//		Aborts scrolling.
			// description:
			//		This function stops the scrolling animation that is currently
			//		running. It is called when the user touches the screen while
			//		scrolling.
			this.scrollTo(this.getPos());
			this.stopAnimation();
			this._aborted = true;
		},

		stopAnimation: function(){
			// summary:
			//		Stops the currently running animation.
			domClass.remove(this.containerNode, "mblScrollableScrollTo2");
			if(this._scrollBarV){
				this._scrollBarV.className = "";
			}
			if(this._scrollBarH){
				this._scrollBarH.className = "";
			}
			if(this._useTransformTransition || this._useTopLeft){
				this.containerNode.style[css3.name("transition")] = "";
				if(this._scrollBarV) { this._scrollBarV.style[css3.name("transition")] = ""; }
				if(this._scrollBarH) { this._scrollBarH.style[css3.name("transition")] = ""; }
			}
		},

		scrollIntoView: function(/*DOMNode*/node, /*Boolean?*/alignWithTop, /*Number?*/duration){
			// summary:
			//		Scrolls the pane until the searching node is in the view.
			// node:
			//		A DOM node to be searched for view.
			// alignWithTop:
			//		If true, aligns the node at the top of the pane.
			//		If false, aligns the node at the bottom of the pane.
			// duration:
			//		Duration of scrolling in seconds. (ex. 0.3)
			//		If not specified, scrolls without animation.
			// description:
			//		Just like the scrollIntoView method of DOM elements, this
			//		function causes the given node to scroll into view, aligning it
			//		either at the top or bottom of the pane.

			if(!this._v){ return; } // cannot scroll vertically

			var c = this.containerNode,
				h = this.getDim().d.h, // the height of ScrollableView's content display area
				top = 0;

			// Get the top position of node relative to containerNode
			for(var n = node; n !== c; n = n.offsetParent){
				if(!n || n.tagName === "BODY"){ return; } // exit if node is not a child of scrollableView
				top += n.offsetTop;
			}
			// Calculate scroll destination position
			var y = alignWithTop ? Math.max(h - c.offsetHeight, -top) : Math.min(0, h - top - node.offsetHeight);

			// Scroll to destination position
			(duration && typeof duration === "number") ? 
				this.slideTo({y: y}, duration, "ease-out") : this.scrollTo({y: y});
		},

		getSpeed: function(){
			// summary:
			//		Returns an object that indicates the scrolling speed.
			// description:
			//		From the position and elapsed time information, calculates the
			//		scrolling speed, and returns an object with x and y.
			var x = 0, y = 0, n = this._time.length;
			// if the user holds the mouse or finger more than 0.5 sec, do not move.
			if(n >= 2 && (new Date()).getTime() - this.startTime - this._time[n - 1] < 500){
				var dy = this._posY[n - (n > 3 ? 2 : 1)] - this._posY[(n - 6) >= 0 ? n - 6 : 0];
				var dx = this._posX[n - (n > 3 ? 2 : 1)] - this._posX[(n - 6) >= 0 ? n - 6 : 0];
				var dt = this._time[n - (n > 3 ? 2 : 1)] - this._time[(n - 6) >= 0 ? n - 6 : 0];
				y = this.calcSpeed(dy, dt);
				x = this.calcSpeed(dx, dt);
			}
			return {x:x, y:y};
		},

		calcSpeed: function(/*Number*/distance, /*Number*/time){
			// summary:
			//		Calculate the speed given the distance and time.
			return Math.round(distance / time * 100) * 4;
		},

		scrollTo: function(/*Object*/to, /*Boolean?*/doNotMoveScrollBar, /*DomNode?*/node){
			// summary:
			//		Scrolls to the given position immediately without animation.
			// to:
			//		The destination position. An object with x and y.
			//		ex. {x:0, y:-5}
			// doNotMoveScrollBar:
			//		If true, the scroll bar will not be updated. If not specified,
			//		it will be updated.
			// node:
			//		A DOM node to scroll. If not specified, defaults to
			//		this.containerNode.

			var s = (node || this.containerNode).style;
			if(has("css3-animations")){
				if(!this._useTopLeft){
					if(this._useTransformTransition){
						s[css3.name("transition")] = "";	
					}
					s[css3.name("transform")] = this.makeTranslateStr(to);
				}else{
					s[css3.name("transition")] = "";
					if(this._v){
						s.top = to.y + "px";
					}
					if(this._h || this._f){
						s.left = to.x + "px";
					}
				}
			}else{
				if(this._v){
					s.top = to.y + "px";
				}
				if(this._h || this._f){
					s.left = to.x + "px";
				}
			}
			if(!doNotMoveScrollBar){
				//this.scrollScrollBarTo(this.calcScrollBarPos(to));
			}
		},

		slideTo: function(/*Object*/to, /*Number*/duration, /*String*/easing){
			// summary:
			//		Scrolls to the given position with the slide animation.
			// to:
			//		The scroll destination position. An object with x and/or y.
			//		ex. {x:0, y:-5}, {y:-29}, etc.
			// duration:
			//		Duration of scrolling in seconds. (ex. 0.3)
			// easing:
			//		The name of easing effect which webkit supports.
			//		"ease", "linear", "ease-in", "ease-out", etc.

			this._runSlideAnimation(this.getPos(), to, duration, easing, this.containerNode, 2);
			this.slideScrollBarTo(to, duration, easing);
		},

		makeTranslateStr: function(/*Object*/to){
			// summary:
			//		Constructs a string value that is passed to the -webkit-transform property.
			// to:
			//		The destination position. An object with x and/or y.
			// description:
			//		Return value example: "translate3d(0px,-8px,0px)"

			var y = this._v && typeof to.y == "number" ? to.y+"px" : "0px";
			var x = (this._h||this._f) && typeof to.x == "number" ? to.x+"px" : "0px";
			return has("translate3d") ?
					"translate3d("+x+","+y+",0px)" : "translate("+x+","+y+")";
		},

		getPos: function(){
			// summary:
			//		Gets the top position in the midst of animation.
			if(has("css3-animations")){
				var s = win.doc.defaultView.getComputedStyle(this.containerNode, '');
				if(!this._useTopLeft){
					var m = s[css3.name("transform")];
					if(m && m.indexOf("matrix") === 0){
						var arr = m.split(/[,\s\)]+/);
						// IE10 returns a matrix3d
						var i = m.indexOf("matrix3d") === 0 ? 12 : 4;
						return {y:arr[i+1] - 0, x:arr[i] - 0};
					}
					return {x:0, y:0};
				}else{
					return {x:parseInt(s.left) || 0, y:parseInt(s.top) || 0};
				}
			}else{
				// this.containerNode.offsetTop does not work here,
				// because it adds the height of the top margin.
				var y = parseInt(this.containerNode.style.top) || 0;
				return {y:y, x:this.containerNode.offsetLeft};
			}
		},

		getDim: function(){
			// summary:
			//		Returns various internal dimensional information needed for calculation.

			var d = {};
			// content width/height
			d.c = {h:this.containerNode.offsetHeight, w:this.containerNode.offsetWidth};

			// view width/height
			d.v = {h:this.domNode.offsetHeight + this._appFooterHeight, w:this.domNode.offsetWidth};

			// display width/height
			d.d = {h:d.v.h - this.fixedHeaderHeight - this.fixedFooterHeight - this._appFooterHeight, w:d.v.w};

			// overflowed width/height
			d.o = {h:d.c.h - d.v.h + this.fixedHeaderHeight + this.fixedFooterHeight + this._appFooterHeight, w:d.c.w - d.v.w};
			return d;
		},

		showScrollBar: function(){
			// summary:
			//		Shows the scroll bar.
			// description:
			//		This function creates the scroll bar instance if it does not
			//		exist yet, and calls resetScrollBar() to reset its length and
			//		position.

			if(!this.scrollBar){ return; }

			var dim = this._dim;
			if(this.scrollDir == "v" && dim.c.h <= dim.d.h){ return; }
			if(this.scrollDir == "h" && dim.c.w <= dim.d.w){ return; }
			if(this._v && this._h && dim.c.h <= dim.d.h && dim.c.w <= dim.d.w){ return; }

			var createBar = function(self, dir){
				var bar = self["_scrollBarNode" + dir];
				if(!bar){
					var wrapper = domConstruct.create("div", null, self.domNode);
					var props = { position: "absolute", overflow: "hidden" };
					if(dir == "V"){
						props.right = "2px";
						props.width = "5px";
					}else{
						props.bottom = (self.isLocalFooter ? self.fixedFooterHeight : 0) + 2 + "px";
						props.height = "5px";
					}
					domStyle.set(wrapper, props);
					wrapper.className = "mblScrollBarWrapper";
					self["_scrollBarWrapper"+dir] = wrapper;

					bar = domConstruct.create("div", null, wrapper);
					domStyle.set(bar, css3.add({
						opacity: 0.6,
						position: "absolute",
						backgroundColor: "#606060",
						fontSize: "1px",
						MozBorderRadius: "2px",
						zIndex: 2147483647 // max of signed 32-bit integer
					}, {
						borderRadius: "2px",
						transformOrigin: "0 0"
					}));
					domStyle.set(bar, dir == "V" ? {width: "5px"} : {height: "5px"});
					self["_scrollBarNode" + dir] = bar;
				}
				return bar;
			};
			if(this._v && !this._scrollBarV){
				this._scrollBarV = createBar(this, "V");
			}
			if(this._h && !this._scrollBarH){
				this._scrollBarH = createBar(this, "H");
			}
			this.resetScrollBar();
		},

		hideScrollBar: function(){
			// summary:
			//		Hides the scroll bar.
			// description:
			//		If the fadeScrollBar property is true, hides the scroll bar with
			//		the fade animation.

			if(this.fadeScrollBar && has("css3-animations")){
				if(!dm._fadeRule){
					var node = domConstruct.create("style", null, win.doc.getElementsByTagName("head")[0]);
					node.textContent =
						".mblScrollableFadeScrollBar{"+
						"  " + css3.name("animation-duration", true) + ": 1s;"+
						"  " + css3.name("animation-name", true) + ": scrollableViewFadeScrollBar;}"+
						"@" + css3.name("keyframes", true) + " scrollableViewFadeScrollBar{"+
						"  from { opacity: 0.6; }"+
						"  to { opacity: 0; }}";
					dm._fadeRule = node.sheet.cssRules[1];
				}
			}
			if(!this.scrollBar){ return; }
			var f = function(bar, self){
				domStyle.set(bar, css3.add({
					opacity: 0
				}, {
					animationDuration: ""
				}));
				// do not use fade animation in case of using top/left on Android
				// since it causes screen flicker during adress bar's fading out
				if(!(self._useTopLeft && has('android'))){
					bar.className = "mblScrollableFadeScrollBar";
				}
			};
			if(this._scrollBarV){
				f(this._scrollBarV, this);
				this._scrollBarV = null;
			}
			if(this._scrollBarH){
				f(this._scrollBarH, this);
				this._scrollBarH = null;
			}
		},

		calcScrollBarPos: function(/*Object*/to){
			// summary:
			//		Calculates the scroll bar position.
			// description:
			//		Given the scroll destination position, calculates the top and/or
			//		the left of the scroll bar(s). Returns an object with x and y.
			// to:
			//		The scroll destination position. An object with x and y.
			//		ex. {x:0, y:-5}			

			var pos = {};
			var dim = this._dim;
			var f = function(wrapperH, barH, t, d, c){
				var y = Math.round((d - barH - 8) / (d - c) * t);
				if(y < -barH + 5){
					y = -barH + 5;
				}
				if(y > wrapperH - 5){
					y = wrapperH - 5;
				}
				return y;
			};
			if(typeof to.y == "number" && this._scrollBarV){
				pos.y = f(this._scrollBarWrapperV.offsetHeight, this._scrollBarV.offsetHeight, to.y, dim.d.h, dim.c.h);
			}
			if(typeof to.x == "number" && this._scrollBarH){
				pos.x = f(this._scrollBarWrapperH.offsetWidth, this._scrollBarH.offsetWidth, to.x, dim.d.w, dim.c.w);
			}
			return pos;
		},

		scrollScrollBarTo: function(/*Object*/to){
			// summary:
			//		Moves the scroll bar(s) to the given position without animation.
			// to:
			//		The destination position. An object with x and/or y.
			//		ex. {x:2, y:5}, {y:20}, etc.

			if(!this.scrollBar){ return; }
			if(this._v && this._scrollBarV && typeof to.y == "number"){
				if(has("css3-animations")){
					if(!this._useTopLeft){
						if(this._useTransformTransition){
							this._scrollBarV.style[css3.name("transition")] = "";
						}
						this._scrollBarV.style[css3.name("transform")] = this.makeTranslateStr({y:to.y});
					}else{
						domStyle.set(this._scrollBarV, css3.add({
							top: to.y + "px"
						}, {
							transition: ""
						}));
					}
				}else{
					this._scrollBarV.style.top = to.y + "px";
				}
			}
			if(this._h && this._scrollBarH && typeof to.x == "number"){
				if(has("css3-animations")){
					if(!this._useTopLeft){
						if(this._useTransformTransition){
							this._scrollBarH.style[css3.name("transition")] = "";
						}
						this._scrollBarH.style[css3.name("transform")] = this.makeTranslateStr({x:to.x});
					}else{
						domStyle.set(this._scrollBarH, css3.add({
							left: to.x + "px"
						}, {
							transition: ""
						}));
					}
				}else{
					this._scrollBarH.style.left = to.x + "px";
				}
			}
		},

		slideScrollBarTo: function(/*Object*/to, /*Number*/duration, /*String*/easing){
			// summary:
			//		Moves the scroll bar(s) to the given position with the slide animation.
			// to:
			//		The destination position. An object with x and y.
			//		ex. {x:0, y:-5}
			// duration:
			//		Duration of the animation in seconds. (ex. 0.3)
			// easing:
			//		The name of easing effect which webkit supports.
			//		"ease", "linear", "ease-in", "ease-out", etc.

			if(!this.scrollBar){ return; }
			var fromPos = this.calcScrollBarPos(this.getPos());
			var toPos = this.calcScrollBarPos(to);
			if(this._v && this._scrollBarV){
				this._runSlideAnimation({y:fromPos.y}, {y:toPos.y}, duration, easing, this._scrollBarV, 0);
			}
			if(this._h && this._scrollBarH){
				this._runSlideAnimation({x:fromPos.x}, {x:toPos.x}, duration, easing, this._scrollBarH, 1);
			}
		},

		_runSlideAnimation: function(/*Object*/from, /*Object*/to, /*Number*/duration, /*String*/easing, /*DomNode*/node, /*Number*/idx){
			// tags:
			//		private
			
			// idx: 0:scrollbarV, 1:scrollbarH, 2:content
			if(has("css3-animations")){
				if(!this._useTopLeft){
					if(this._useTransformTransition){
						// for iOS6 (maybe others?): use -webkit-transform + -webkit-transition
						if(to.x === undefined){ to.x = from.x; }
						if(to.y === undefined){ to.y = from.y; }
						 // make sure we actually change the transform, otherwise no webkitTransitionEnd is fired.
						if(to.x !== from.x || to.y !== from.y){
							domStyle.set(node, css3.add({}, {
								transitionProperty: css3.name("transform"),
								transitionDuration: duration + "s",
								transitionTimingFunction: easing
							}));
							var t = this.makeTranslateStr(to);
							setTimeout(function(){ // setTimeout is needed to prevent webkitTransitionEnd not fired
								domStyle.set(node, css3.add({}, {
									transform: t
								}));
							}, 0);
							domClass.add(node, "mblScrollableScrollTo"+idx);
						} else {
							// transform not changed, just hide the scrollbar
							this.hideScrollBar();
							this.removeCover();
						}
					}else{
						// use -webkit-transform + -webkit-animation
						this.setKeyframes(from, to, idx);
						domStyle.set(node, css3.add({}, {
							animationDuration: duration + "s",
							animationTimingFunction: easing
						}));
						domClass.add(node, "mblScrollableScrollTo"+idx);
						if(idx == 2){
							this.scrollTo(to, true, node);
						}else{
							this.scrollScrollBarTo(to);
						}
					}
				}else{
					domStyle.set(node, css3.add({}, {
						transitionProperty: "top, left",
						transitionDuration: duration + "s",
						transitionTimingFunction: easing
					}));
					setTimeout(function(){ // setTimeout is needed to prevent webkitTransitionEnd not fired
						domStyle.set(node, {
							top: (to.y || 0) + "px",
							left: (to.x || 0) + "px"
						});
					}, 0);
					domClass.add(node, "mblScrollableScrollTo"+idx);
				}
			}else if(dojo.fx && dojo.fx.easing && duration){
				// If you want to support non-webkit browsers,
				// your application needs to load necessary modules as follows:
				//
				// | dojo.require("dojo.fx");
				// | dojo.require("dojo.fx.easing");
				//
				// This module itself does not make dependency on them.
				// TODO: for 2.0 the dojo global is going away.   Use require("dojo/fx") and require("dojo/fx/easing") instead.
				var s = dojo.fx.slideTo({
					node: node,
					duration: duration*1000,
					left: to.x,
					top: to.y,
					easing: (easing == "ease-out") ? dojo.fx.easing.quadOut : dojo.fx.easing.linear
				}).play();
				if(idx == 2){
					connect.connect(s, "onEnd", this, "onFlickAnimationEnd");
				}
			}else{
				// directly jump to the destination without animation
				if(idx == 2){
					this.scrollTo(to, false, node);
					this.onFlickAnimationEnd();
				}else{
					this.scrollScrollBarTo(to);
				}
			}
		},

		resetScrollBar: function(){
			// summary:
			//		Resets the scroll bar length, position, etc.
			var f = function(wrapper, bar, d, c, hd, v){
				if(!bar){ return; }
				var props = {};
				props[v ? "top" : "left"] = hd + 4 + "px"; // +4 is for top or left margin
				var t = (d - 8) <= 0 ? 1 : d - 8;
				props[v ? "height" : "width"] = t + "px";
				domStyle.set(wrapper, props);
				var l = Math.round(d * d / c); // scroll bar length
				l = Math.min(Math.max(l - 8, 5), t); // -8 is for margin for both ends
				bar.style[v ? "height" : "width"] = l + "px";
				domStyle.set(bar, {"opacity": 0.6});
			};
			var dim = this.getDim();
			f(this._scrollBarWrapperV, this._scrollBarV, dim.d.h, dim.c.h, this.fixedHeaderHeight, true);
			f(this._scrollBarWrapperH, this._scrollBarH, dim.d.w, dim.c.w, 0);
			this.createMask();
		},

		createMask: function(){
			// summary:
			//		Creates a mask for a scroll bar edge.
			// description:
			//		This function creates a mask that hides corners of one scroll
			//		bar edge to make it round edge. The other side of the edge is
			//		always visible and round shaped with the border-radius style.
			if(!(has("webkit")||has("svg"))){ return; }
			//var ctx;
			if(this._scrollBarWrapperV){
				var h = this._scrollBarWrapperV.offsetHeight;
				maskUtils.createRoundMask(this._scrollBarWrapperV, 0, 0, 0, 0, 5, h, 2, 2, 0.5);
			}
			if(this._scrollBarWrapperH){
				var w = this._scrollBarWrapperH.offsetWidth;
				maskUtils.createRoundMask(this._scrollBarWrapperH, 0, 0, 0, 0, w, 5, 2, 2, 0.5);
			}
		},

		flashScrollBar: function(){
			// summary:
			//		Shows the scroll bar instantly.
			// description:
			//		This function shows the scroll bar, and then hides it 300ms
			//		later. This is used to show the scroll bar to the user for a
			//		short period of time when a hidden view is revealed.
			if(this.disableFlashScrollBar || !this.domNode){ return; }
			this._dim = this.getDim();
			if(this._dim.d.h <= 0){ return; } // dom is not ready
			this.showScrollBar();
			var _this = this;
			setTimeout(function(){
				_this.hideScrollBar();
			}, 300);
		},

		addCover: function(){
			// summary:
			//		Adds the transparent DIV cover.
			// description:
			//		The cover is to prevent DOM events from affecting the child
			//		widgets such as a list widget. Without the cover, for example,
			//		child widgets may receive a click event and respond to it
			//		unexpectedly when the user flicks the screen to scroll.
			//		Note that only the desktop browsers need the cover.

			if(!has('touch') && !this.noCover){
				if(!dm._cover){
					dm._cover = domConstruct.create("div", null, win.doc.body);
					dm._cover.className = "mblScrollableCover";
					domStyle.set(dm._cover, {
						backgroundColor: "#ffff00",
						opacity: 0,
						position: "absolute",
						top: "0px",
						left: "0px",
						width: "100%",
						height: "100%",
						zIndex: 2147483647 // max of signed 32-bit integer
					});
					this._ch.push(connect.connect(dm._cover, touch.press, this, "onTouchEnd"));
				}else{
					dm._cover.style.display = "";
				}
				this.setSelectable(dm._cover, false);
				this.setSelectable(this.domNode, false);
			}
		},

		removeCover: function(){
			// summary:
			//		Removes the transparent DIV cover.

			if(!has('touch') && dm._cover){
				dm._cover.style.display = "none";
				this.setSelectable(dm._cover, true);
				this.setSelectable(this.domNode, true);
			}
		},

		setKeyframes: function(/*Object*/from, /*Object*/to, /*Number*/idx){
			// summary:
			//		Programmatically sets key frames for the scroll animation.

			if(!dm._rule){
				dm._rule = [];
			}
			// idx: 0:scrollbarV, 1:scrollbarH, 2:content
			if(!dm._rule[idx]){
				var node = domConstruct.create("style", null, win.doc.getElementsByTagName("head")[0]);
				node.textContent =
					".mblScrollableScrollTo"+idx+"{" + css3.name("animation-name", true) + ": scrollableViewScroll"+idx+";}"+
					"@" + css3.name("keyframes", true) + " scrollableViewScroll"+idx+"{}";
				dm._rule[idx] = node.sheet.cssRules[1];
			}
			var rule = dm._rule[idx];
			if(rule){
				if(from){
					rule.deleteRule(has("webkit")?"from":0);
					(rule.insertRule||rule.appendRule).call(rule, "from { " + css3.name("transform", true) + ": "+this.makeTranslateStr(from)+"; }");
				}
				if(to){
					if(to.x === undefined){ to.x = from.x; }
					if(to.y === undefined){ to.y = from.y; }
					rule.deleteRule(has("webkit")?"to":1);
					(rule.insertRule||rule.appendRule).call(rule, "to { " + css3.name("transform", true) + ": "+this.makeTranslateStr(to)+"; }");
				}
			}
		},

		setSelectable: function(/*DomNode*/node, /*Boolean*/selectable){
			// summary:
			//		Sets the given node as selectable or unselectable.
			 
			// dojo.setSelectable has dependency on dojo.query. Redefine our own.
			node.style.KhtmlUserSelect = selectable ? "auto" : "none";
			node.style.MozUserSelect = selectable ? "" : "none";
			node.onselectstart = selectable ? null : function(){return false;};
			if(has("ie")){
				node.unselectable = selectable ? "" : "on";
				var nodes = node.getElementsByTagName("*");
				for(var i = 0; i < nodes.length; i++){
					nodes[i].unselectable = selectable ? "" : "on";
				}
			}
		}
	});

	lang.setObject("dojox.mobile.scrollable", Scrollable);

	return Scrollable;
});

},
'dojox/mobile/_maskUtils':function(){
define("dojox/mobile/_maskUtils", [
	"dojo/_base/window",
	"dojo/dom-style",
	"./sniff"
], function(win, domStyle, has){
	
	var cache = {};
	
	return {
		// summary:
		//		Utility methods to clip rounded corners of various elements (Switch, ScrollablePane, scrollbars in scrollable widgets).
		//		Uses -webkit-mask-image on webkit, or SVG on other browsers.
		
		createRoundMask: function(/*DomNode*/node, x, y, r, b, w, h, rx, ry, e){
			// summary:
			//		Creates and sets a mask for the specified node.
			
			var tw = x + w + r;
			var th = y + h + b;
			
			if(has("webkit")){			// use -webkit-mask-image
				var id = ("DojoMobileMask" + x + y + w + h + rx + ry).replace(/\./g, "_");
				if (!cache[id]) {
					cache[id] = 1;
					var ctx = win.doc.getCSSCanvasContext("2d", id, tw, th);
					ctx.beginPath();
					if (rx == ry) {
						// round arc
						if(rx == 2 && w == 5){
							// optimized case for vertical scrollbar
							ctx.fillStyle = "rgba(0,0,0,0.5)";
							ctx.fillRect(1, 0, 3, 2);
							ctx.fillRect(0, 1, 5, 1);
							ctx.fillRect(0, h - 2, 5, 1);
							ctx.fillRect(1, h - 1, 3, 2);
							ctx.fillStyle = "rgb(0,0,0)";
							ctx.fillRect(0, 2, 5, h - 4);
						}else if(rx == 2 && h == 5){
							// optimized case for horizontal scrollbar
							ctx.fillStyle = "rgba(0,0,0,0.5)";
							ctx.fillRect(0, 1, 2, 3);
							ctx.fillRect(1, 0, 1, 5);
							ctx.fillRect(w - 2, 0, 1, 5);
							ctx.fillRect(w - 1, 1, 2, 3);
							ctx.fillStyle = "rgb(0,0,0)";
							ctx.fillRect(2, 0, w - 4, 5);
						}else{
							// general case
							ctx.fillStyle = "#000000";
							ctx.moveTo(x+rx, y);
							ctx.arcTo(x, y, x, y+rx, rx);
							ctx.lineTo(x, y+h - rx);
							ctx.arcTo(x, y+h, x+rx, y+h, rx);
							ctx.lineTo(x+w - rx, y+h);
							ctx.arcTo(x+w, y+h, x+w, y+rx, rx);
							ctx.lineTo(x+w, y+rx);
							ctx.arcTo(x+w, y, x+w - rx, y, rx);
						}
					} else {
						// elliptical arc
						var pi = Math.PI;
						ctx.scale(1, ry / rx);
						ctx.moveTo(x+rx, y);
						ctx.arc(x+rx, y+rx, rx, 1.5 * pi, 0.5 * pi, true);
						ctx.lineTo(x+w - rx, y+2 * rx);
						ctx.arc(x+w - rx, y+rx, rx, 0.5 * pi, 1.5 * pi, true);
					}
					ctx.closePath();
					ctx.fill();
				}
				node.style.webkitMaskImage = "-webkit-canvas(" + id + ")";
			}else if(has("svg")){		// add an SVG image to clip the corners.
				if(node._svgMask){
					node.removeChild(node._svgMask);
				}
				var bg = null;
				for(var p = node.parentNode; p; p = p.parentNode){
					bg = domStyle.getComputedStyle(p).backgroundColor;
					if(bg && bg != "transparent" && !bg.match(/rgba\(.*,\s*0\s*\)/)){
						break;
					}
				}
				var svgNS = "http://www.w3.org/2000/svg";
				var svg = win.doc.createElementNS(svgNS, "svg");
				svg.setAttribute("width", tw);
				svg.setAttribute("height", th);
				svg.style.position = "absolute";
				svg.style.pointerEvents = "none";
				svg.style.opacity = "1";
				svg.style.zIndex = "2147483647"; // max int
				var path = win.doc.createElementNS(svgNS, "path");
				e = e || 0;
				rx += e;
				ry += e;
				// TODO: optimized cases for scrollbars as in webkit case?
				var d = " M" + (x + rx - e) + "," + (y - e) + " a" + rx + "," + ry + " 0 0,0 " + (-rx) + "," + ry + " v" + (-ry) + " h" + rx + " Z" +
						" M" + (x - e) + "," + (y + h - ry + e) + " a" + rx + "," + ry + " 0 0,0 " + rx + "," + ry + " h" + (-rx) + " v" + (-ry) + " z" +
						" M" + (x + w - rx + e) + "," + (y + h + e) + " a" + rx + "," + ry + " 0 0,0 " + rx + "," + (-ry) + " v" + ry + " h" + (-rx) + " z" +
						" M" + (x + w + e) + "," + (y + ry - e) + " a" + rx + "," + ry + " 0 0,0 " + (-rx) + "," + (-ry) + " h" + rx + " v" + ry + " z";
				if(y > 0){
					d += " M0,0 h" + tw + " v" + y + " h" + (-tw) + " z";
				}
				if(b > 0){
					d += " M0," + (y + h) + " h" + tw + " v" + b + " h" + (-tw) + " z";
				}
				path.setAttribute("d", d);
				path.setAttribute("fill", bg);
				path.setAttribute("stroke", bg);
				path.style.opacity = "1";
				svg.appendChild(path); 
				node._svgMask = svg;
				node.appendChild(svg);
			}
		}
	};
});

},
'dojo/_base/fx':function(){
define(["./kernel", "./config", /*===== "./declare", =====*/ "./lang", "../Evented", "./Color", "../aspect", "../sniff", "../dom", "../dom-style"],
	function(dojo, config, /*===== declare, =====*/ lang, Evented, Color, aspect, has, dom, style){
	// module:
	//		dojo/_base/fx
	// notes:
	//		Animation loosely package based on Dan Pupius' work, contributed under CLA; see
	//		http://pupius.co.uk/js/Toolkit.Drawing.js

	var _mixin = lang.mixin;

	// Module export
	var basefx = {
		// summary:
		//		This module defines the base dojo/_base/fx implementation.
	};

	var _Line = basefx._Line = function(/*int*/ start, /*int*/ end){
		// summary:
		//		Object used to generate values from a start value to an end value
		// start: int
		//		Beginning value for range
		// end: int
		//		Ending value for range
		this.start = start;
		this.end = end;
	};

	_Line.prototype.getValue = function(/*float*/ n){
		// summary:
		//		Returns the point on the line
		// n:
		//		a floating point number greater than 0 and less than 1
		return ((this.end - this.start) * n) + this.start; // Decimal
	};

	var Animation = basefx.Animation = function(args){
		// summary:
		//		A generic animation class that fires callbacks into its handlers
		//		object at various states.
		// description:
		//		A generic animation class that fires callbacks into its handlers
		//		object at various states. Nearly all dojo animation functions
		//		return an instance of this method, usually without calling the
		//		.play() method beforehand. Therefore, you will likely need to
		//		call .play() on instances of `Animation` when one is
		//		returned.
		// args: Object
		//		The 'magic argument', mixing all the properties into this
		//		animation instance.

		_mixin(this, args);
		if(lang.isArray(this.curve)){
			this.curve = new _Line(this.curve[0], this.curve[1]);
		}

	};
	Animation.prototype = new Evented();

	lang.extend(Animation, {
		// duration: Integer
		//		The time in milliseconds the animation will take to run
		duration: 350,

	/*=====
		// curve: _Line|Array
		//		A two element array of start and end values, or a `_Line` instance to be
		//		used in the Animation.
		curve: null,

		// easing: Function?
		//		A Function to adjust the acceleration (or deceleration) of the progress
		//		across a _Line
		easing: null,
	=====*/

		// repeat: Integer?
		//		The number of times to loop the animation
		repeat: 0,

		// rate: Integer?
		//		the time in milliseconds to wait before advancing to next frame
		//		(used as a fps timer: 1000/rate = fps)
		rate: 20 /* 50 fps */,

	/*=====
		// delay: Integer?
		//		The time in milliseconds to wait before starting animation after it
		//		has been .play()'ed
		delay: null,

		// beforeBegin: Event?
		//		Synthetic event fired before a Animation begins playing (synchronous)
		beforeBegin: null,

		// onBegin: Event?
		//		Synthetic event fired as a Animation begins playing (useful?)
		onBegin: null,

		// onAnimate: Event?
		//		Synthetic event fired at each interval of the Animation
		onAnimate: null,

		// onEnd: Event?
		//		Synthetic event fired after the final frame of the Animation
		onEnd: null,

		// onPlay: Event?
		//		Synthetic event fired any time the Animation is play()'ed
		onPlay: null,

		// onPause: Event?
		//		Synthetic event fired when the Animation is paused
		onPause: null,

		// onStop: Event
		//		Synthetic event fires when the Animation is stopped
		onStop: null,

	=====*/

		_percent: 0,
		_startRepeatCount: 0,

		_getStep: function(){
			var _p = this._percent,
				_e = this.easing
			;
			return _e ? _e(_p) : _p;
		},
		_fire: function(/*Event*/ evt, /*Array?*/ args){
			// summary:
			//		Convenience function.  Fire event "evt" and pass it the
			//		arguments specified in "args".
			// description:
			//		Convenience function.  Fire event "evt" and pass it the
			//		arguments specified in "args".
			//		Fires the callback in the scope of this Animation
			//		instance.
			// evt:
			//		The event to fire.
			// args:
			//		The arguments to pass to the event.
			var a = args||[];
			if(this[evt]){
				if(config.debugAtAllCosts){
					this[evt].apply(this, a);
				}else{
					try{
						this[evt].apply(this, a);
					}catch(e){
						// squelch and log because we shouldn't allow exceptions in
						// synthetic event handlers to cause the internal timer to run
						// amuck, potentially pegging the CPU. I'm not a fan of this
						// squelch, but hopefully logging will make it clear what's
						// going on
						console.error("exception in animation handler for:", evt);
						console.error(e);
					}
				}
			}
			return this; // Animation
		},

		play: function(/*int?*/ delay, /*Boolean?*/ gotoStart){
			// summary:
			//		Start the animation.
			// delay:
			//		How many milliseconds to delay before starting.
			// gotoStart:
			//		If true, starts the animation from the beginning; otherwise,
			//		starts it from its current position.
			// returns: Animation
			//		The instance to allow chaining.

			var _t = this;
			if(_t._delayTimer){ _t._clearTimer(); }
			if(gotoStart){
				_t._stopTimer();
				_t._active = _t._paused = false;
				_t._percent = 0;
			}else if(_t._active && !_t._paused){
				return _t;
			}

			_t._fire("beforeBegin", [_t.node]);

			var de = delay || _t.delay,
				_p = lang.hitch(_t, "_play", gotoStart);

			if(de > 0){
				_t._delayTimer = setTimeout(_p, de);
				return _t;
			}
			_p();
			return _t;	// Animation
		},

		_play: function(gotoStart){
			var _t = this;
			if(_t._delayTimer){ _t._clearTimer(); }
			_t._startTime = new Date().valueOf();
			if(_t._paused){
				_t._startTime -= _t.duration * _t._percent;
			}

			_t._active = true;
			_t._paused = false;
			var value = _t.curve.getValue(_t._getStep());
			if(!_t._percent){
				if(!_t._startRepeatCount){
					_t._startRepeatCount = _t.repeat;
				}
				_t._fire("onBegin", [value]);
			}

			_t._fire("onPlay", [value]);

			_t._cycle();
			return _t; // Animation
		},

		pause: function(){
			// summary:
			//		Pauses a running animation.
			var _t = this;
			if(_t._delayTimer){ _t._clearTimer(); }
			_t._stopTimer();
			if(!_t._active){ return _t; /*Animation*/ }
			_t._paused = true;
			_t._fire("onPause", [_t.curve.getValue(_t._getStep())]);
			return _t; // Animation
		},

		gotoPercent: function(/*Decimal*/ percent, /*Boolean?*/ andPlay){
			// summary:
			//		Sets the progress of the animation.
			// percent:
			//		A percentage in decimal notation (between and including 0.0 and 1.0).
			// andPlay:
			//		If true, play the animation after setting the progress.
			var _t = this;
			_t._stopTimer();
			_t._active = _t._paused = true;
			_t._percent = percent;
			if(andPlay){ _t.play(); }
			return _t; // Animation
		},

		stop: function(/*boolean?*/ gotoEnd){
			// summary:
			//		Stops a running animation.
			// gotoEnd:
			//		If true, the animation will end.
			var _t = this;
			if(_t._delayTimer){ _t._clearTimer(); }
			if(!_t._timer){ return _t; /* Animation */ }
			_t._stopTimer();
			if(gotoEnd){
				_t._percent = 1;
			}
			_t._fire("onStop", [_t.curve.getValue(_t._getStep())]);
			_t._active = _t._paused = false;
			return _t; // Animation
		},

		status: function(){
			// summary:
			//		Returns a string token representation of the status of
			//		the animation, one of: "paused", "playing", "stopped"
			if(this._active){
				return this._paused ? "paused" : "playing"; // String
			}
			return "stopped"; // String
		},

		_cycle: function(){
			var _t = this;
			if(_t._active){
				var curr = new Date().valueOf();
				// Allow durations of 0 (instant) by setting step to 1 - see #13798
				var step = _t.duration === 0 ? 1 : (curr - _t._startTime) / (_t.duration);

				if(step >= 1){
					step = 1;
				}
				_t._percent = step;

				// Perform easing
				if(_t.easing){
					step = _t.easing(step);
				}

				_t._fire("onAnimate", [_t.curve.getValue(step)]);

				if(_t._percent < 1){
					_t._startTimer();
				}else{
					_t._active = false;

					if(_t.repeat > 0){
						_t.repeat--;
						_t.play(null, true);
					}else if(_t.repeat == -1){
						_t.play(null, true);
					}else{
						if(_t._startRepeatCount){
							_t.repeat = _t._startRepeatCount;
							_t._startRepeatCount = 0;
						}
					}
					_t._percent = 0;
					_t._fire("onEnd", [_t.node]);
					!_t.repeat && _t._stopTimer();
				}
			}
			return _t; // Animation
		},

		_clearTimer: function(){
			// summary:
			//		Clear the play delay timer
			clearTimeout(this._delayTimer);
			delete this._delayTimer;
		}

	});

	// the local timer, stubbed into all Animation instances
	var ctr = 0,
		timer = null,
		runner = {
			run: function(){}
		};

	lang.extend(Animation, {

		_startTimer: function(){
			if(!this._timer){
				this._timer = aspect.after(runner, "run", lang.hitch(this, "_cycle"), true);
				ctr++;
			}
			if(!timer){
				timer = setInterval(lang.hitch(runner, "run"), this.rate);
			}
		},

		_stopTimer: function(){
			if(this._timer){
				this._timer.remove();
				this._timer = null;
				ctr--;
			}
			if(ctr <= 0){
				clearInterval(timer);
				timer = null;
				ctr = 0;
			}
		}

	});

	var _makeFadeable =
		has("ie") ? function(node){
			// only set the zoom if the "tickle" value would be the same as the
			// default
			var ns = node.style;
			// don't set the width to auto if it didn't already cascade that way.
			// We don't want to f anyones designs
			if(!ns.width.length && style.get(node, "width") == "auto"){
				ns.width = "auto";
			}
		} :
		function(){};

	basefx._fade = function(/*Object*/ args){
		// summary:
		//		Returns an animation that will fade the node defined by
		//		args.node from the start to end values passed (args.start
		//		args.end) (end is mandatory, start is optional)

		args.node = dom.byId(args.node);
		var fArgs = _mixin({ properties: {} }, args),
			props = (fArgs.properties.opacity = {});

		props.start = !("start" in fArgs) ?
			function(){
				return +style.get(fArgs.node, "opacity")||0;
			} : fArgs.start;
		props.end = fArgs.end;

		var anim = basefx.animateProperty(fArgs);
		aspect.after(anim, "beforeBegin", lang.partial(_makeFadeable, fArgs.node), true);

		return anim; // Animation
	};

	/*=====
	var __FadeArgs = declare(null, {
		// node: DOMNode|String
		//		The node referenced in the animation
		// duration: Integer?
		//		Duration of the animation in milliseconds.
		// easing: Function?
		//		An easing function.
	});
	=====*/

	basefx.fadeIn = function(/*__FadeArgs*/ args){
		// summary:
		//		Returns an animation that will fade node defined in 'args' from
		//		its current opacity to fully opaque.
		return basefx._fade(_mixin({ end: 1 }, args)); // Animation
	};

	basefx.fadeOut = function(/*__FadeArgs*/ args){
		// summary:
		//		Returns an animation that will fade node defined in 'args'
		//		from its current opacity to fully transparent.
		return basefx._fade(_mixin({ end: 0 }, args)); // Animation
	};

	basefx._defaultEasing = function(/*Decimal?*/ n){
		// summary:
		//		The default easing function for Animation(s)
		return 0.5 + ((Math.sin((n + 1.5) * Math.PI)) / 2);	// Decimal
	};

	var PropLine = function(properties){
		// PropLine is an internal class which is used to model the values of
		// an a group of CSS properties across an animation lifecycle. In
		// particular, the "getValue" function handles getting interpolated
		// values between start and end for a particular CSS value.
		this._properties = properties;
		for(var p in properties){
			var prop = properties[p];
			if(prop.start instanceof Color){
				// create a reusable temp color object to keep intermediate results
				prop.tempColor = new Color();
			}
		}
	};

	PropLine.prototype.getValue = function(r){
		var ret = {};
		for(var p in this._properties){
			var prop = this._properties[p],
				start = prop.start;
			if(start instanceof Color){
				ret[p] = Color.blendColors(start, prop.end, r, prop.tempColor).toCss();
			}else if(!lang.isArray(start)){
				ret[p] = ((prop.end - start) * r) + start + (p != "opacity" ? prop.units || "px" : 0);
			}
		}
		return ret;
	};

	/*=====
	var __AnimArgs = declare(__FadeArgs, {
		// properties: Object?
		//		A hash map of style properties to Objects describing the transition,
		//		such as the properties of _Line with an additional 'units' property
		properties: {}

		//TODOC: add event callbacks
	});
	=====*/

	basefx.animateProperty = function(/*__AnimArgs*/ args){
		// summary:
		//		Returns an animation that will transition the properties of
		//		node defined in `args` depending how they are defined in
		//		`args.properties`
		//
		// description:
		//		Foundation of most `dojo/_base/fx`
		//		animations. It takes an object of "properties" corresponding to
		//		style properties, and animates them in parallel over a set
		//		duration.
		//
		// example:
		//		A simple animation that changes the width of the specified node.
		//	|	basefx.animateProperty({
		//	|		node: "nodeId",
		//	|		properties: { width: 400 },
		//	|	}).play();
		//		Dojo figures out the start value for the width and converts the
		//		integer specified for the width to the more expressive but
		//		verbose form `{ width: { end: '400', units: 'px' } }` which you
		//		can also specify directly. Defaults to 'px' if omitted.
		//
		// example:
		//		Animate width, height, and padding over 2 seconds... the
		//		pedantic way:
		//	|	basefx.animateProperty({ node: node, duration:2000,
		//	|		properties: {
		//	|			width: { start: '200', end: '400', units:"px" },
		//	|			height: { start:'200', end: '400', units:"px" },
		//	|			paddingTop: { start:'5', end:'50', units:"px" }
		//	|		}
		//	|	}).play();
		//		Note 'paddingTop' is used over 'padding-top'. Multi-name CSS properties
		//		are written using "mixed case", as the hyphen is illegal as an object key.
		//
		// example:
		//		Plug in a different easing function and register a callback for
		//		when the animation ends. Easing functions accept values between
		//		zero and one and return a value on that basis. In this case, an
		//		exponential-in curve.
		//	|	basefx.animateProperty({
		//	|		node: "nodeId",
		//	|		// dojo figures out the start value
		//	|		properties: { width: { end: 400 } },
		//	|		easing: function(n){
		//	|			return (n==0) ? 0 : Math.pow(2, 10 * (n - 1));
		//	|		},
		//	|		onEnd: function(node){
		//	|			// called when the animation finishes. The animation
		//	|			// target is passed to this function
		//	|		}
		//	|	}).play(500); // delay playing half a second
		//
		// example:
		//		Like all `Animation`s, animateProperty returns a handle to the
		//		Animation instance, which fires the events common to Dojo FX. Use `aspect.after`
		//		to access these events outside of the Animation definition:
		//	|	var anim = basefx.animateProperty({
		//	|		node:"someId",
		//	|		properties:{
		//	|			width:400, height:500
		//	|		}
		//	|	});
		//	|	aspect.after(anim, "onEnd", function(){
		//	|		console.log("animation ended");
		//	|	}, true);
		//	|	// play the animation now:
		//	|	anim.play();
		//
		// example:
		//		Each property can be a function whose return value is substituted along.
		//		Additionally, each measurement (eg: start, end) can be a function. The node
		//		reference is passed directly to callbacks.
		//	|	basefx.animateProperty({
		//	|		node:"mine",
		//	|		properties:{
		//	|			height:function(node){
		//	|				// shrink this node by 50%
		//	|				return domGeom.position(node).h / 2
		//	|			},
		//	|			width:{
		//	|				start:function(node){ return 100; },
		//	|				end:function(node){ return 200; }
		//	|			}
		//	|		}
		//	|	}).play();
		//

		var n = args.node = dom.byId(args.node);
		if(!args.easing){ args.easing = dojo._defaultEasing; }

		var anim = new Animation(args);
		aspect.after(anim, "beforeBegin", lang.hitch(anim, function(){
			var pm = {};
			for(var p in this.properties){
				// Make shallow copy of properties into pm because we overwrite
				// some values below. In particular if start/end are functions
				// we don't want to overwrite them or the functions won't be
				// called if the animation is reused.
				if(p == "width" || p == "height"){
					this.node.display = "block";
				}
				var prop = this.properties[p];
				if(lang.isFunction(prop)){
					prop = prop(n);
				}
				prop = pm[p] = _mixin({}, (lang.isObject(prop) ? prop: { end: prop }));

				if(lang.isFunction(prop.start)){
					prop.start = prop.start(n);
				}
				if(lang.isFunction(prop.end)){
					prop.end = prop.end(n);
				}
				var isColor = (p.toLowerCase().indexOf("color") >= 0);
				function getStyle(node, p){
					// domStyle.get(node, "height") can return "auto" or "" on IE; this is more reliable:
					var v = { height: node.offsetHeight, width: node.offsetWidth }[p];
					if(v !== undefined){ return v; }
					v = style.get(node, p);
					return (p == "opacity") ? +v : (isColor ? v : parseFloat(v));
				}
				if(!("end" in prop)){
					prop.end = getStyle(n, p);
				}else if(!("start" in prop)){
					prop.start = getStyle(n, p);
				}

				if(isColor){
					prop.start = new Color(prop.start);
					prop.end = new Color(prop.end);
				}else{
					prop.start = (p == "opacity") ? +prop.start : parseFloat(prop.start);
				}
			}
			this.curve = new PropLine(pm);
		}), true);
		aspect.after(anim, "onAnimate", lang.hitch(style, "set", anim.node), true);
		return anim; // Animation
	};

	basefx.anim = function(	/*DOMNode|String*/	node,
							/*Object*/			properties,
							/*Integer?*/		duration,
							/*Function?*/		easing,
							/*Function?*/		onEnd,
							/*Integer?*/		delay){
		// summary:
		//		A simpler interface to `animateProperty()`, also returns
		//		an instance of `Animation` but begins the animation
		//		immediately, unlike nearly every other Dojo animation API.
		// description:
		//		Simpler (but somewhat less powerful) version
		//		of `animateProperty`.  It uses defaults for many basic properties
		//		and allows for positional parameters to be used in place of the
		//		packed "property bag" which is used for other Dojo animation
		//		methods.
		//
		//		The `Animation` object returned will be already playing, so
		//		calling play() on it again is (usually) a no-op.
		// node:
		//		a DOM node or the id of a node to animate CSS properties on
		// duration:
		//		The number of milliseconds over which the animation
		//		should run. Defaults to the global animation default duration
		//		(350ms).
		// easing:
		//		An easing function over which to calculate acceleration
		//		and deceleration of the animation through its duration.
		//		A default easing algorithm is provided, but you may
		//		plug in any you wish. A large selection of easing algorithms
		//		are available in `dojo/fx/easing`.
		// onEnd:
		//		A function to be called when the animation finishes
		//		running.
		// delay:
		//		The number of milliseconds to delay beginning the
		//		animation by. The default is 0.
		// example:
		//		Fade out a node
		//	|	basefx.anim("id", { opacity: 0 });
		// example:
		//		Fade out a node over a full second
		//	|	basefx.anim("id", { opacity: 0 }, 1000);
		return basefx.animateProperty({ // Animation
			node: node,
			duration: duration || Animation.prototype.duration,
			properties: properties,
			easing: easing,
			onEnd: onEnd
		}).play(delay || 0);
	};


	if( 1 ){
		_mixin(dojo, basefx);
		// Alias to drop come 2.0:
		dojo._Animation = Animation;
	}

	return basefx;
});

},
'dojox/fx':function(){
define("dojox/fx", ["./fx/_base"], function(DojoxFx){
	/*=====
	 return {
	 // summary:
	 //		Deprecated.  Should require dojox/fx modules directly rather than trying to access them through
	 //		this module.
	 };
	 =====*/
	return DojoxFx;
});

},
'dojo/fx':function(){
define([
	"./_base/lang",
	"./Evented",
	"./_base/kernel",
	"./_base/array",
	"./aspect",
	"./_base/fx",
	"./dom",
	"./dom-style",
	"./dom-geometry",
	"./ready",
	"require" // for context sensitive loading of Toggler
], function(lang, Evented, dojo, arrayUtil, aspect, baseFx, dom, domStyle, geom, ready, require){

	// module:
	//		dojo/fx
	
	// For back-compat, remove in 2.0.
	if(!dojo.isAsync){
		ready(0, function(){
			var requires = ["./fx/Toggler"];
			require(requires);	// use indirection so modules not rolled into a build
		});
	}

	var coreFx = dojo.fx = {
		// summary:
		//		Effects library on top of Base animations
	};

	var _baseObj = {
			_fire: function(evt, args){
				if(this[evt]){
					this[evt].apply(this, args||[]);
				}
				return this;
			}
		};

	var _chain = function(animations){
		this._index = -1;
		this._animations = animations||[];
		this._current = this._onAnimateCtx = this._onEndCtx = null;

		this.duration = 0;
		arrayUtil.forEach(this._animations, function(a){
			this.duration += a.duration;
			if(a.delay){ this.duration += a.delay; }
		}, this);
	};
	_chain.prototype = new Evented();
	lang.extend(_chain, {
		_onAnimate: function(){
			this._fire("onAnimate", arguments);
		},
		_onEnd: function(){
			this._onAnimateCtx.remove();
			this._onEndCtx.remove();
			this._onAnimateCtx = this._onEndCtx = null;
			if(this._index + 1 == this._animations.length){
				this._fire("onEnd");
			}else{
				// switch animations
				this._current = this._animations[++this._index];
				this._onAnimateCtx = aspect.after(this._current, "onAnimate", lang.hitch(this, "_onAnimate"), true);
				this._onEndCtx = aspect.after(this._current, "onEnd", lang.hitch(this, "_onEnd"), true);
				this._current.play(0, true);
			}
		},
		play: function(/*int?*/ delay, /*Boolean?*/ gotoStart){
			if(!this._current){ this._current = this._animations[this._index = 0]; }
			if(!gotoStart && this._current.status() == "playing"){ return this; }
			var beforeBegin = aspect.after(this._current, "beforeBegin", lang.hitch(this, function(){
					this._fire("beforeBegin");
				}), true),
				onBegin = aspect.after(this._current, "onBegin", lang.hitch(this, function(arg){
					this._fire("onBegin", arguments);
				}), true),
				onPlay = aspect.after(this._current, "onPlay", lang.hitch(this, function(arg){
					this._fire("onPlay", arguments);
					beforeBegin.remove();
					onBegin.remove();
					onPlay.remove();
				}));
			if(this._onAnimateCtx){
				this._onAnimateCtx.remove();
			}
			this._onAnimateCtx = aspect.after(this._current, "onAnimate", lang.hitch(this, "_onAnimate"), true);
			if(this._onEndCtx){
				this._onEndCtx.remove();
			}
			this._onEndCtx = aspect.after(this._current, "onEnd", lang.hitch(this, "_onEnd"), true);
			this._current.play.apply(this._current, arguments);
			return this;
		},
		pause: function(){
			if(this._current){
				var e = aspect.after(this._current, "onPause", lang.hitch(this, function(arg){
						this._fire("onPause", arguments);
						e.remove();
					}), true);
				this._current.pause();
			}
			return this;
		},
		gotoPercent: function(/*Decimal*/percent, /*Boolean?*/ andPlay){
			this.pause();
			var offset = this.duration * percent;
			this._current = null;
			arrayUtil.some(this._animations, function(a){
				if(a.duration <= offset){
					this._current = a;
					return true;
				}
				offset -= a.duration;
				return false;
			});
			if(this._current){
				this._current.gotoPercent(offset / this._current.duration, andPlay);
			}
			return this;
		},
		stop: function(/*boolean?*/ gotoEnd){
			if(this._current){
				if(gotoEnd){
					for(; this._index + 1 < this._animations.length; ++this._index){
						this._animations[this._index].stop(true);
					}
					this._current = this._animations[this._index];
				}
				var e = aspect.after(this._current, "onStop", lang.hitch(this, function(arg){
						this._fire("onStop", arguments);
						e.remove();
					}), true);
				this._current.stop();
			}
			return this;
		},
		status: function(){
			return this._current ? this._current.status() : "stopped";
		},
		destroy: function(){
			if(this._onAnimateCtx){ this._onAnimateCtx.remove(); }
			if(this._onEndCtx){ this._onEndCtx.remove(); }
		}
	});
	lang.extend(_chain, _baseObj);

	coreFx.chain = function(/*dojo/_base/fx.Animation[]*/ animations){
		// summary:
		//		Chain a list of `dojo.Animation`s to run in sequence
		//
		// description:
		//		Return a `dojo.Animation` which will play all passed
		//		`dojo.Animation` instances in sequence, firing its own
		//		synthesized events simulating a single animation. (eg:
		//		onEnd of this animation means the end of the chain,
		//		not the individual animations within)
		//
		// example:
		//	Once `node` is faded out, fade in `otherNode`
		//	|	fx.chain([
		//	|		dojo.fadeIn({ node:node }),
		//	|		dojo.fadeOut({ node:otherNode })
		//	|	]).play();
		//
		return new _chain(animations); // dojo/_base/fx.Animation
	};

	var _combine = function(animations){
		this._animations = animations||[];
		this._connects = [];
		this._finished = 0;

		this.duration = 0;
		arrayUtil.forEach(animations, function(a){
			var duration = a.duration;
			if(a.delay){ duration += a.delay; }
			if(this.duration < duration){ this.duration = duration; }
			this._connects.push(aspect.after(a, "onEnd", lang.hitch(this, "_onEnd"), true));
		}, this);

		this._pseudoAnimation = new baseFx.Animation({curve: [0, 1], duration: this.duration});
		var self = this;
		arrayUtil.forEach(["beforeBegin", "onBegin", "onPlay", "onAnimate", "onPause", "onStop", "onEnd"],
			function(evt){
				self._connects.push(aspect.after(self._pseudoAnimation, evt,
					function(){ self._fire(evt, arguments); },
				true));
			}
		);
	};
	lang.extend(_combine, {
		_doAction: function(action, args){
			arrayUtil.forEach(this._animations, function(a){
				a[action].apply(a, args);
			});
			return this;
		},
		_onEnd: function(){
			if(++this._finished > this._animations.length){
				this._fire("onEnd");
			}
		},
		_call: function(action, args){
			var t = this._pseudoAnimation;
			t[action].apply(t, args);
		},
		play: function(/*int?*/ delay, /*Boolean?*/ gotoStart){
			this._finished = 0;
			this._doAction("play", arguments);
			this._call("play", arguments);
			return this;
		},
		pause: function(){
			this._doAction("pause", arguments);
			this._call("pause", arguments);
			return this;
		},
		gotoPercent: function(/*Decimal*/percent, /*Boolean?*/ andPlay){
			var ms = this.duration * percent;
			arrayUtil.forEach(this._animations, function(a){
				a.gotoPercent(a.duration < ms ? 1 : (ms / a.duration), andPlay);
			});
			this._call("gotoPercent", arguments);
			return this;
		},
		stop: function(/*boolean?*/ gotoEnd){
			this._doAction("stop", arguments);
			this._call("stop", arguments);
			return this;
		},
		status: function(){
			return this._pseudoAnimation.status();
		},
		destroy: function(){
			arrayUtil.forEach(this._connects, function(handle){
				handle.remove();
			});
		}
	});
	lang.extend(_combine, _baseObj);

	coreFx.combine = function(/*dojo/_base/fx.Animation[]*/ animations){
		// summary:
		//		Combine a list of `dojo.Animation`s to run in parallel
		//
		// description:
		//		Combine an array of `dojo.Animation`s to run in parallel,
		//		providing a new `dojo.Animation` instance encompasing each
		//		animation, firing standard animation events.
		//
		// example:
		//	Fade out `node` while fading in `otherNode` simultaneously
		//	|	fx.combine([
		//	|		dojo.fadeIn({ node:node }),
		//	|		dojo.fadeOut({ node:otherNode })
		//	|	]).play();
		//
		// example:
		//	When the longest animation ends, execute a function:
		//	|	var anim = fx.combine([
		//	|		dojo.fadeIn({ node: n, duration:700 }),
		//	|		dojo.fadeOut({ node: otherNode, duration: 300 })
		//	|	]);
		//	|	aspect.after(anim, "onEnd", function(){
		//	|		// overall animation is done.
		//	|	}, true);
		//	|	anim.play(); // play the animation
		//
		return new _combine(animations); // dojo/_base/fx.Animation
	};

	coreFx.wipeIn = function(/*Object*/ args){
		// summary:
		//		Expand a node to it's natural height.
		//
		// description:
		//		Returns an animation that will expand the
		//		node defined in 'args' object from it's current height to
		//		it's natural height (with no scrollbar).
		//		Node must have no margin/border/padding.
		//
		// args: Object
		//		A hash-map of standard `dojo.Animation` constructor properties
		//		(such as easing: node: duration: and so on)
		//
		// example:
		//	|	fx.wipeIn({
		//	|		node:"someId"
		//	|	}).play()
		var node = args.node = dom.byId(args.node), s = node.style, o;

		var anim = baseFx.animateProperty(lang.mixin({
			properties: {
				height: {
					// wrapped in functions so we wait till the last second to query (in case value has changed)
					start: function(){
						// start at current [computed] height, but use 1px rather than 0
						// because 0 causes IE to display the whole panel
						o = s.overflow;
						s.overflow = "hidden";
						if(s.visibility == "hidden" || s.display == "none"){
							s.height = "1px";
							s.display = "";
							s.visibility = "";
							return 1;
						}else{
							var height = domStyle.get(node, "height");
							return Math.max(height, 1);
						}
					},
					end: function(){
						return node.scrollHeight;
					}
				}
			}
		}, args));

		var fini = function(){
			s.height = "auto";
			s.overflow = o;
		};
		aspect.after(anim, "onStop", fini, true);
		aspect.after(anim, "onEnd", fini, true);

		return anim; // dojo/_base/fx.Animation
	};

	coreFx.wipeOut = function(/*Object*/ args){
		// summary:
		//		Shrink a node to nothing and hide it.
		//
		// description:
		//		Returns an animation that will shrink node defined in "args"
		//		from it's current height to 1px, and then hide it.
		//
		// args: Object
		//		A hash-map of standard `dojo.Animation` constructor properties
		//		(such as easing: node: duration: and so on)
		//
		// example:
		//	|	fx.wipeOut({ node:"someId" }).play()

		var node = args.node = dom.byId(args.node), s = node.style, o;

		var anim = baseFx.animateProperty(lang.mixin({
			properties: {
				height: {
					end: 1 // 0 causes IE to display the whole panel
				}
			}
		}, args));

		aspect.after(anim, "beforeBegin", function(){
			o = s.overflow;
			s.overflow = "hidden";
			s.display = "";
		}, true);
		var fini = function(){
			s.overflow = o;
			s.height = "auto";
			s.display = "none";
		};
		aspect.after(anim, "onStop", fini, true);
		aspect.after(anim, "onEnd", fini, true);

		return anim; // dojo/_base/fx.Animation
	};

	coreFx.slideTo = function(/*Object*/ args){
		// summary:
		//		Slide a node to a new top/left position
		//
		// description:
		//		Returns an animation that will slide "node"
		//		defined in args Object from its current position to
		//		the position defined by (args.left, args.top).
		//
		// args: Object
		//		A hash-map of standard `dojo.Animation` constructor properties
		//		(such as easing: node: duration: and so on). Special args members
		//		are `top` and `left`, which indicate the new position to slide to.
		//
		// example:
		//	|	.slideTo({ node: node, left:"40", top:"50", units:"px" }).play()

		var node = args.node = dom.byId(args.node),
			top = null, left = null;

		var init = (function(n){
			return function(){
				var cs = domStyle.getComputedStyle(n);
				var pos = cs.position;
				top = (pos == 'absolute' ? n.offsetTop : parseInt(cs.top) || 0);
				left = (pos == 'absolute' ? n.offsetLeft : parseInt(cs.left) || 0);
				if(pos != 'absolute' && pos != 'relative'){
					var ret = geom.position(n, true);
					top = ret.y;
					left = ret.x;
					n.style.position="absolute";
					n.style.top=top+"px";
					n.style.left=left+"px";
				}
			};
		})(node);
		init();

		var anim = baseFx.animateProperty(lang.mixin({
			properties: {
				top: args.top || 0,
				left: args.left || 0
			}
		}, args));
		aspect.after(anim, "beforeBegin", init, true);

		return anim; // dojo/_base/fx.Animation
	};

	return coreFx;
});

},
'dojo/fx/easing':function(){
define(["../_base/lang"], function(lang){

// module:
//		dojo/fx/easing

var easingFuncs = {
	// summary:
	//		Collection of easing functions to use beyond the default
	//		`dojo._defaultEasing` function.
	// description:
	//		Easing functions are used to manipulate the iteration through
	//		an `dojo.Animation`s _Line. _Line being the properties of an Animation,
	//		and the easing function progresses through that Line determining
	//		how quickly (or slowly) it should go. Or more accurately: modify
	//		the value of the _Line based on the percentage of animation completed.
	//
	//		All functions follow a simple naming convention of "ease type" + "when".
	//		If the name of the function ends in Out, the easing described appears
	//		towards the end of the animation. "In" means during the beginning,
	//		and InOut means both ranges of the Animation will applied, both
	//		beginning and end.
	//
	//		One does not call the easing function directly, it must be passed to
	//		the `easing` property of an animation.
	// example:
	//	|	dojo.require("dojo.fx.easing");
	//	|	var anim = dojo.fadeOut({
	//	|		node: 'node',
	//	|		duration: 2000,
	//	|		//	note there is no ()
	//	|		easing: dojo.fx.easing.quadIn
	//	|	}).play();
	//

	linear: function(/* Decimal? */n){
		// summary:
		//		A linear easing function
		return n;
	},

	quadIn: function(/* Decimal? */n){
		return Math.pow(n, 2);
	},

	quadOut: function(/* Decimal? */n){
		return n * (n - 2) * -1;
	},

	quadInOut: function(/* Decimal? */n){
		n = n * 2;
		if(n < 1){ return Math.pow(n, 2) / 2; }
		return -1 * ((--n) * (n - 2) - 1) / 2;
	},

	cubicIn: function(/* Decimal? */n){
		return Math.pow(n, 3);
	},

	cubicOut: function(/* Decimal? */n){
		return Math.pow(n - 1, 3) + 1;
	},

	cubicInOut: function(/* Decimal? */n){
		n = n * 2;
		if(n < 1){ return Math.pow(n, 3) / 2; }
		n -= 2;
		return (Math.pow(n, 3) + 2) / 2;
	},

	quartIn: function(/* Decimal? */n){
		return Math.pow(n, 4);
	},

	quartOut: function(/* Decimal? */n){
		return -1 * (Math.pow(n - 1, 4) - 1);
	},

	quartInOut: function(/* Decimal? */n){
		n = n * 2;
		if(n < 1){ return Math.pow(n, 4) / 2; }
		n -= 2;
		return -1 / 2 * (Math.pow(n, 4) - 2);
	},

	quintIn: function(/* Decimal? */n){
		return Math.pow(n, 5);
	},

	quintOut: function(/* Decimal? */n){
		return Math.pow(n - 1, 5) + 1;
	},

	quintInOut: function(/* Decimal? */n){
		n = n * 2;
		if(n < 1){ return Math.pow(n, 5) / 2; }
		n -= 2;
		return (Math.pow(n, 5) + 2) / 2;
	},

	sineIn: function(/* Decimal? */n){
		return -1 * Math.cos(n * (Math.PI / 2)) + 1;
	},

	sineOut: function(/* Decimal? */n){
		return Math.sin(n * (Math.PI / 2));
	},

	sineInOut: function(/* Decimal? */n){
		return -1 * (Math.cos(Math.PI * n) - 1) / 2;
	},

	expoIn: function(/* Decimal? */n){
		return (n == 0) ? 0 : Math.pow(2, 10 * (n - 1));
	},

	expoOut: function(/* Decimal? */n){
		return (n == 1) ? 1 : (-1 * Math.pow(2, -10 * n) + 1);
	},

	expoInOut: function(/* Decimal? */n){
		if(n == 0){ return 0; }
		if(n == 1){ return 1; }
		n = n * 2;
		if(n < 1){ return Math.pow(2, 10 * (n - 1)) / 2; }
		--n;
		return (-1 * Math.pow(2, -10 * n) + 2) / 2;
	},

	circIn: function(/* Decimal? */n){
		return -1 * (Math.sqrt(1 - Math.pow(n, 2)) - 1);
	},

	circOut: function(/* Decimal? */n){
		n = n - 1;
		return Math.sqrt(1 - Math.pow(n, 2));
	},

	circInOut: function(/* Decimal? */n){
		n = n * 2;
		if(n < 1){ return -1 / 2 * (Math.sqrt(1 - Math.pow(n, 2)) - 1); }
		n -= 2;
		return 1 / 2 * (Math.sqrt(1 - Math.pow(n, 2)) + 1);
	},

	backIn: function(/* Decimal? */n){
		// summary:
		//		An easing function that starts away from the target,
		//		and quickly accelerates towards the end value.
		//
		//		Use caution when the easing will cause values to become
		//		negative as some properties cannot be set to negative values.
		var s = 1.70158;
		return Math.pow(n, 2) * ((s + 1) * n - s);
	},

	backOut: function(/* Decimal? */n){
		// summary:
		//		An easing function that pops past the range briefly, and slowly comes back.
		// description:
		//		An easing function that pops past the range briefly, and slowly comes back.
		//
		//		Use caution when the easing will cause values to become negative as some
		//		properties cannot be set to negative values.

		n = n - 1;
		var s = 1.70158;
		return Math.pow(n, 2) * ((s + 1) * n + s) + 1;
	},

	backInOut: function(/* Decimal? */n){
		// summary:
		//		An easing function combining the effects of `backIn` and `backOut`
		// description:
		//		An easing function combining the effects of `backIn` and `backOut`.
		//		Use caution when the easing will cause values to become negative
		//		as some properties cannot be set to negative values.
		var s = 1.70158 * 1.525;
		n = n * 2;
		if(n < 1){ return (Math.pow(n, 2) * ((s + 1) * n - s)) / 2; }
		n-=2;
		return (Math.pow(n, 2) * ((s + 1) * n + s) + 2) / 2;
	},

	elasticIn: function(/* Decimal? */n){
		// summary:
		//		An easing function the elastically snaps from the start value
		// description:
		//		An easing function the elastically snaps from the start value
		//
		//		Use caution when the elasticity will cause values to become negative
		//		as some properties cannot be set to negative values.
		if(n == 0 || n == 1){ return n; }
		var p = .3;
		var s = p / 4;
		n = n - 1;
		return -1 * Math.pow(2, 10 * n) * Math.sin((n - s) * (2 * Math.PI) / p);
	},

	elasticOut: function(/* Decimal? */n){
		// summary:
		//		An easing function that elasticly snaps around the target value,
		//		near the end of the Animation
		// description:
		//		An easing function that elasticly snaps around the target value,
		//		near the end of the Animation
		//
		//		Use caution when the elasticity will cause values to become
		//		negative as some properties cannot be set to negative values.
		if(n==0 || n == 1){ return n; }
		var p = .3;
		var s = p / 4;
		return Math.pow(2, -10 * n) * Math.sin((n - s) * (2 * Math.PI) / p) + 1;
	},

	elasticInOut: function(/* Decimal? */n){
		// summary:
		//		An easing function that elasticly snaps around the value, near
		//		the beginning and end of the Animation.
		// description:
		//		An easing function that elasticly snaps around the value, near
		//		the beginning and end of the Animation.
		//
		//		Use caution when the elasticity will cause values to become
		//		negative as some properties cannot be set to negative values.
		if(n == 0) return 0;
		n = n * 2;
		if(n == 2) return 1;
		var p = .3 * 1.5;
		var s = p / 4;
		if(n < 1){
			n -= 1;
			return -.5 * (Math.pow(2, 10 * n) * Math.sin((n - s) * (2 * Math.PI) / p));
		}
		n -= 1;
		return .5 * (Math.pow(2, -10 * n) * Math.sin((n - s) * (2 * Math.PI) / p)) + 1;
	},

	bounceIn: function(/* Decimal? */n){
		// summary:
		//		An easing function that 'bounces' near the beginning of an Animation
		return (1 - easingFuncs.bounceOut(1 - n)); // Decimal
	},

	bounceOut: function(/* Decimal? */n){
		// summary:
		//		An easing function that 'bounces' near the end of an Animation
		var s = 7.5625;
		var p = 2.75;
		var l;
		if(n < (1 / p)){
			l = s * Math.pow(n, 2);
		}else if(n < (2 / p)){
			n -= (1.5 / p);
			l = s * Math.pow(n, 2) + .75;
		}else if(n < (2.5 / p)){
			n -= (2.25 / p);
			l = s * Math.pow(n, 2) + .9375;
		}else{
			n -= (2.625 / p);
			l = s * Math.pow(n, 2) + .984375;
		}
		return l;
	},

	bounceInOut: function(/* Decimal? */n){
		// summary:
		//		An easing function that 'bounces' at the beginning and end of the Animation
		if(n < 0.5){ return easingFuncs.bounceIn(n * 2) / 2; }
		return (easingFuncs.bounceOut(n * 2 - 1) / 2) + 0.5; // Decimal
	}
};

lang.setObject("dojo.fx.easing", easingFuncs);

return easingFuncs;
});

},
'dojo/uacss':function(){
define(["./dom-geometry", "./_base/lang", "./domReady", "./sniff", "./_base/window"],
	function(geometry, lang, domReady, has, baseWindow){

	// module:
	//		dojo/uacss

	/*=====
	return {
		// summary:
		//		Applies pre-set CSS classes to the top-level HTML node, based on:
		//
		//		- browser (ex: dj_ie)
		//		- browser version (ex: dj_ie6)
		//		- box model (ex: dj_contentBox)
		//		- text direction (ex: dijitRtl)
		//
		//		In addition, browser, browser version, and box model are
		//		combined with an RTL flag when browser text is RTL. ex: dj_ie-rtl.
		//
		//		Returns the has() method.
	};
	=====*/

	var
		html = baseWindow.doc.documentElement,
		ie = has("ie"),
		opera = has("opera"),
		maj = Math.floor,
		ff = has("ff"),
		boxModel = geometry.boxModel.replace(/-/,''),

		classes = {
			"dj_quirks": has("quirks"),

			// NOTE: Opera not supported by dijit
			"dj_opera": opera,

			"dj_khtml": has("khtml"),

			"dj_webkit": has("webkit"),
			"dj_safari": has("safari"),
			"dj_chrome": has("chrome"),

			"dj_gecko": has("mozilla")
		}; // no dojo unsupported browsers

	if(ie){
		classes["dj_ie"] = true;
		classes["dj_ie" + maj(ie)] = true;
		classes["dj_iequirks"] = has("quirks");
	}
	if(ff){
		classes["dj_ff" + maj(ff)] = true;
	}

	classes["dj_" + boxModel] = true;

	// apply browser, browser version, and box model class names
	var classStr = "";
	for(var clz in classes){
		if(classes[clz]){
			classStr += clz + " ";
		}
	}
	html.className = lang.trim(html.className + " " + classStr);

	// If RTL mode, then add dj_rtl flag plus repeat existing classes with -rtl extension.
	// We can't run the code below until the <body> tag has loaded (so we can check for dir=rtl).
	domReady(function(){
		if(!geometry.isBodyLtr()){
			var rtlClassStr = "dj_rtl dijitRtl " + classStr.replace(/ /g, "-rtl ");
			html.className = lang.trim(html.className + " " + rtlClassStr + "dj_rtl dijitRtl " + classStr.replace(/ /g, "-rtl "));
		}
	});
	return has;
});

},
'dojox/mobile/_ScrollableMixin':function(){
define("dojox/mobile/_ScrollableMixin", [
	"dojo/_base/kernel",
	"dojo/_base/config",
	"dojo/_base/declare",
	"dojo/_base/lang",
	"dojo/_base/window",
	"dojo/dom",
	"dojo/dom-class",
	"dijit/registry",	// registry.byNode
	"./scrollable"
], function(dojo, config, declare, lang, win, dom, domClass, registry, Scrollable){
	// module:
	//		dojox/mobile/_ScrollableMixin

	var cls = declare("dojox.mobile._ScrollableMixin", Scrollable, {
		// summary:
		//		Mixin for widgets to have a touch scrolling capability.
	
		// fixedHeader: String
		//		Id of the fixed header.
		fixedHeader: "",

		// fixedFooter: String
		//		Id of the fixed footer.
		fixedFooter: "",

		_fixedAppFooter: "",

		// scrollableParams: Object
		//		Parameters for dojox/mobile/scrollable.init().
		scrollableParams: null,

		// allowNestedScrolls: Boolean
		//		Flag to allow scrolling in nested containers, e.g. to allow ScrollableView in a SwapView.
		allowNestedScrolls: true,

		// appBars: Boolean
		//		Enables the search for application-specific bars (header or footer).
		appBars: true, 

		constructor: function(){
			// summary:
			//		Creates a new instance of the class.
			// tags:
			//		private
			this.scrollableParams = {};
		},

		destroy: function(){
			this.cleanup();
			this.inherited(arguments);
		},

		startup: function(){
			if(this._started){ return; }
			this.findAppBars();
			var node, params = this.scrollableParams;
			if(this.fixedHeader){
				node = dom.byId(this.fixedHeader);
				if(node.parentNode == this.domNode){ // local footer
					this.isLocalHeader = true;
				}
				params.fixedHeaderHeight = node.offsetHeight;
			}
			if(this.fixedFooter){
				node = dom.byId(this.fixedFooter);
				if(node.parentNode == this.domNode){ // local footer
					this.isLocalFooter = true;
					node.style.bottom = "0px";
				}
				params.fixedFooterHeight = node.offsetHeight;
			}
			this.scrollType = this.scrollType || config["mblScrollableScrollType"] || 0;
			this.init(params);
			if(this.allowNestedScrolls){
				for(var p = this.getParent(); p; p = p.getParent()){
					if(p && p.scrollableParams){
						this.dirLock = true;
						p.dirLock = true;
						break;
					}
				}
			}
			// subscribe to afterResizeAll to scroll the focused input field into view
			// so as not to break layout on orientation changes while keyboard is shown (#14991)
			this._resizeHandle = this.subscribe("/dojox/mobile/afterResizeAll", function(){
				if(this.domNode.style.display === 'none'){ return; }
				var elem = win.doc.activeElement;
				if(this.isFormElement(elem) && dom.isDescendant(elem, this.containerNode)){
					this.scrollIntoView(elem);
				}
			});
			this.inherited(arguments);
		},

		findAppBars: function(){
			// summary:
			//		Search for application-specific header or footer.
			if(!this.appBars){ return; }
			var i, len, c;
			for(i = 0, len = win.body().childNodes.length; i < len; i++){
				c = win.body().childNodes[i];
				this.checkFixedBar(c, false);
			}
			if(this.domNode.parentNode){
				for(i = 0, len = this.domNode.parentNode.childNodes.length; i < len; i++){
					c = this.domNode.parentNode.childNodes[i];
					this.checkFixedBar(c, false);
				}
			}
			this.fixedFooterHeight = this.fixedFooter ? this.fixedFooter.offsetHeight : 0;
		},

		checkFixedBar: function(/*DomNode*/node, /*Boolean*/local){
			// summary:
			//		Checks if the given node is a fixed bar or not.
			if(node.nodeType === 1){
				var fixed = node.getAttribute("fixed")
					|| (registry.byNode(node) && registry.byNode(node).fixed);
				if(fixed === "top"){
					domClass.add(node, "mblFixedHeaderBar");
					if(local){
						node.style.top = "0px";
						this.fixedHeader = node;
					}
					return fixed;
				}else if(fixed === "bottom"){
					domClass.add(node, "mblFixedBottomBar");
					if(local){
						this.fixedFooter = node;
					}else{
						this._fixedAppFooter = node;
					}
					return fixed;
				}
			}
			return null;
		}
	});
	return cls;
});

},
'dojox/mobile/IconItem':function(){
define("dojox/mobile/IconItem", [
	"dojo/_base/declare",
	"dojo/_base/event",
	"dojo/_base/lang",
	"dojo/sniff",
	"dojo/_base/window",
	"dojo/dom-class",
	"dojo/dom-construct",
	"dojo/dom-geometry",
	"dojo/dom-style",
	"./_ItemBase",
	"./Badge",
	"./TransitionEvent",
	"./iconUtils",
	"./lazyLoadUtils",
	"./viewRegistry",
	"./_css3",
	"dojo/has!dojo-bidi?dojox/mobile/bidi/IconItem"
], function(declare, event, lang, has, win, domClass, domConstruct, domGeometry, domStyle, ItemBase, Badge, TransitionEvent, iconUtils, lazyLoadUtils, viewRegistry, css3, BidiIconItem){

	// module:
	//		dojox/mobile/IconItem

	var IconItem = declare(has("dojo-bidi") ? "dojox.mobile.NonBidiIconItem" : "dojox.mobile.IconItem", ItemBase, {
		// summary:
		//		An icon item widget.
		// description:
		//		IconItem represents an item that has an application component
		//		and its icon image. You can tap the icon to open the
		//		corresponding application component. You can also use the icon
		//		to move to a different view by specifying either of the moveTo,
		//		href or url parameters.

		// lazy: String
		//		If true, the content of the widget, which includes dojo markup,
		//		is instantiated lazily. That is, only when the widget is opened
		//		by the user, the required modules are loaded and the content
		//		widgets are instantiated.
		//		This option works both in the sync and async loader mode.
		lazy: false,

		// requires: String
		//		Comma-separated required module names to be lazily loaded. This
		//		property is effective only when lazy=true. All the modules
		//		specified with data-dojo-type and their depending modules are
		//		automatically loaded by the IconItem when it is opened.
		//		However, if you need other extra modules to be loaded, use this parameter.
		//		This option works both in the sync and async loader mode.
		requires: "",

		// timeout: String
		//		Duration of highlight in seconds.
		timeout: 10,

		// content: String
		//		An HTML fragment to embed as icon content.
		content: "",

		// badge: String
		//		A text to show in a badge (ex. "55").
		badge: "",

		// badgeClass: String
		//		A class name of a DOM button for a badge.
		badgeClass: "mblDomButtonRedBadge",

		// deletable: Boolean
		//		If true, you can delete this IconItem by clicking on the delete
		//		icon during edit mode.
		//		If false, the delete icon is not displayed during edit mode so
		//		that it cannot be deleted.
		deletable: true,

		// deleteIcon: String
		//		A delete icon to display at the top-left corner of the item
		//		during edit mode. The value can be either a path for an image
		//		file or a class name of a DOM button.
		deleteIcon: "",

		// tag: String
		//		A name of the HTML tag to create as domNode.
		tag: "li",

		/* internal properties */	
		// Note these are overrides for similar properties defined in _ItemBase.
		paramsToInherit: "transition,icon,deleteIcon,badgeClass,deleteIconTitle,deleteIconRole",
		baseClass: "mblIconItem",
		_selStartMethod: "touch",
		_selEndMethod: "none",

		destroy: function(){
			if(this.badgeObj){
				delete this.badgeObj;
			}
			this.inherited(arguments);
		},

		buildRendering: function(){
			this.domNode = this.srcNodeRef || domConstruct.create(this.tag);

			if(this.srcNodeRef){
				// reparent
				this._tmpNode = domConstruct.create("div");
				for(var i = 0, len = this.srcNodeRef.childNodes.length; i < len; i++){
					this._tmpNode.appendChild(this.srcNodeRef.firstChild);
				}
			}

			this.iconDivNode = domConstruct.create("div", {className:"mblIconArea"}, this.domNode);
			this.iconParentNode = domConstruct.create("div", {className:"mblIconAreaInner"}, this.iconDivNode);
			this.labelNode = domConstruct.create("span", {className:"mblIconAreaTitle"}, this.iconDivNode);

			this.inherited(arguments);
		},

		startup: function(){
			if(this._started){ return; }

			var p = this.getParent();
			require([p.iconItemPaneClass], lang.hitch(this, function(module){
				var w = this.paneWidget = new module(p.iconItemPaneProps);
				this.containerNode = w.containerNode;
				if(this._tmpNode){
					// reparent
					for(var i = 0, len = this._tmpNode.childNodes.length; i < len; i++){
						w.containerNode.appendChild(this._tmpNode.firstChild);
					}
					this._tmpNode = null;
				}
				p.paneContainerWidget.addChild(w, this.getIndexInParent());
				w.set("label", this.label);
				this._clickCloseHandle = this.connect(w.closeIconNode, "onclick", "_closeIconClicked");
				this._keydownCloseHandle = this.connect(w.closeIconNode, "onkeydown", "_closeIconClicked"); // for desktop browsers
			}));

			this.inherited(arguments);
			if(!this._isOnLine){
				this._isOnLine = true;
				// retry applying the attribute for which the custom setter delays the actual 
				// work until _isOnLine is true. 
				this.set("icon", this._pendingIcon !== undefined ? this._pendingIcon : this.icon);
				// Not needed anymore (this code executes only once per life cycle):
				delete this._pendingIcon; 
			}
			if(!this.icon && p.defaultIcon){
				this.set("icon", p.defaultIcon);
			}

			this._dragstartHandle = this.connect(this.domNode, "ondragstart", event.stop);
			this.connect(this.domNode, "onkeydown", "_onClick"); // for desktop browsers
		},

		highlight: function(/*Number?*/timeout){
			// summary:
			//		Shakes the icon 10 seconds.
			domClass.add(this.iconDivNode, "mblVibrate");
			timeout = (timeout !== undefined) ? timeout : this.timeout;
			if(timeout > 0){
				var _this = this;
				setTimeout(function(){
					_this.unhighlight();
				}, timeout*1000);
			}
		},

		unhighlight: function(){
			// summary:
			//		Stops shaking the icon.
			domClass.remove(this.iconDivNode, "mblVibrate");
		},

		isOpen: function(e){
			// summary:
			//		Returns true if the icon is open.
			return this.paneWidget.isOpen();
		},

		_onClick: function(e){
			// summary:
			//		Internal handler for click events.
			// tags:
			//		private
			if(this.getParent().isEditing || e && e.type === "keydown" && e.keyCode !== 13){ return; }
			if(this.onClick(e) === false){ return; } // user's click action
			this.defaultClickAction(e);
		},

		onClick: function(/*Event*/ /*===== e =====*/){
			// summary:
			//		User-defined function to handle clicks.
			// tags:
			//		callback
		},

		_onNewWindowOpened: function(e){
			// Override from _ItemBase
			this.set("selected", false);
		},

		_prepareForTransition: function(e, transOpts){
			// Override from _ItemBase
			if(transOpts){
				setTimeout(lang.hitch(this, function(d){
					this.set("selected", false);
				}), 1500);
				return true;
			}else{
				if(this.getParent().transition === "below" && this.isOpen()){
					this.close();
				}else{
					this.open(e);
				}
				return false;
			}
		},

		_closeIconClicked: function(e){
			// summary:
			//		Internal handler for click events.
			// tags:
			//		private
			if(e){
				if(e.type === "keydown" && e.keyCode !== 13){ return; }
				if(this.closeIconClicked(e) === false){ return; } // user's click action
				setTimeout(lang.hitch(this, function(d){ this._closeIconClicked(); }), 0);
				return;
			}
			this.close();
		},

		closeIconClicked: function(/*Event*/ /*===== e =====*/){
			// summary:
			//		User-defined function to handle clicks for the close icon.
			// tags:
			//		callback
		},

		open: function(e){
			// summary:
			//		Opens the icon content, or makes a transition.
			var parent = this.getParent(); // IconContainer
			if(this.transition === "below"){
				if(parent.single){
					parent.closeAll();
				}
				this._open_1();
			}else{
				parent._opening = this;
				if(parent.single){
					this.paneWidget.closeHeaderNode.style.display = "none";
					if(!this.isOpen()){
						parent.closeAll();
					}
					parent.appView._heading.set("label", this.label);
				}
				this.moveTo = parent.id + "_mblApplView";
				new TransitionEvent(this.domNode, this.getTransOpts(), e).dispatch();
			}
		},

		_open_1: function(){
			// summary:
			//		Opens the icon content for the 'below' transition.
			// tags:
			//		private
			this.paneWidget.show();
			this.unhighlight();
			if(this.lazy){
				lazyLoadUtils.instantiateLazyWidgets(this.containerNode, this.requires);
				this.lazy = false;
			}
			this.scrollIntoView(this.paneWidget.domNode);
			this.onOpen();
		},

		scrollIntoView: function(/*DomNode*/node){
			// summary:
			//		Scrolls until the given node is in the view.
			var s = viewRegistry.getEnclosingScrollable(node);
			if(s){ // this node is placed inside scrollable
				var dim = s.getDim();
				if(dim.c.h >= dim.d.h){ // #16306: only if the content is larger than the display area 
					s.scrollIntoView(node, true);
				}
			}else{
				win.global.scrollBy(0, domGeometry.position(node, false).y);
			}
		},

		close: function(/*Boolean?*/noAnimation){
			// summary:
			//		Closes the icon content.
			if(!this.isOpen()){ return; }
			this.set("selected", false);
			if(has("css3-animations") && !noAnimation){
				var contentNode = this.paneWidget.domNode;
				if(this.getParent().transition == "below"){
					domClass.add(contentNode, "mblCloseContent mblShrink");
					var nodePos = domGeometry.position(contentNode, true);
					var targetPos = domGeometry.position(this.domNode, true);
					var origin = (targetPos.x + targetPos.w/2 - nodePos.x) + "px " + (targetPos.y + targetPos.h/2 - nodePos.y) + "px";
					domStyle.set(contentNode, css3.add({}, { transformOrigin:origin }));
				}else{
					domClass.add(contentNode, "mblCloseContent mblShrink0");
				}
			}else{
				this.paneWidget.hide();
			}
			this.onClose();
		},

		onOpen: function(){
			// summary:
			//		Stub method to allow the application to connect.
		},

		onClose: function(){
			// summary:
			//		Stub method to allow the application to connect.
		},

		_setLabelAttr: function(/*String*/text){
			// tags:
			//		private
			this.label = text;
			var s = this._cv ? this._cv(text) : text;
			this.labelNode.innerHTML = s;
			if(this.paneWidget){
				this.paneWidget.set("label", text);
			}
		},

		_getBadgeAttr: function(){
			// tags:
			//		private
			return this.badgeObj ? this.badgeObj.getValue() : null;
		},

		_setBadgeAttr: function(/*String*/value){
			// tags:
			//		private
			if(!this.badgeObj){
				this.badgeObj = new Badge({fontSize:14, className:this.badgeClass});
				domStyle.set(this.badgeObj.domNode, {
					position: "absolute",
					top: "-2px",
					right: "2px"
				});
			}
			this.badgeObj.setValue(value);
			if(value){
				this.iconDivNode.appendChild(this.badgeObj.domNode);
			}else{
				this.iconDivNode.removeChild(this.badgeObj.domNode);
			}
		},

		_setDeleteIconAttr: function(icon){
			// tags:
			//		private
			if(!this.getParent()){ return; } // icon may be invalid because inheritParams is not called yet

			this._set("deleteIcon", icon);
			icon = this.deletable ? icon : "";
			this.deleteIconNode = iconUtils.setIcon(icon, this.deleteIconPos, this.deleteIconNode, 
					this.deleteIconTitle || this.alt, this.iconDivNode);
			if(this.deleteIconNode){
				domClass.add(this.deleteIconNode, "mblIconItemDeleteIcon");
				if(this.deleteIconRole){
					this.deleteIconNode.setAttribute("role", this.deleteIconRole);
				}
			}
		},

		_setContentAttr: function(/*String|DomNode*/data){
			// tags:
			//		private
			var root;
			if(!this.paneWidget){
				if(!this._tmpNode){
					this._tmpNode = domConstruct.create("div");
				}
				root = this._tmpNode;
			}else{
				root = this.paneWidget.containerNode;
			}

			if(typeof data === "object"){
				domConstruct.empty(root);
				root.appendChild(data);
			}else{
				root.innerHTML = data;
			}
		},

		_setSelectedAttr: function(/*Boolean*/selected){
			// summary:
			//		Makes this widget in the selected or unselected state.
			// tags:
			//		private
			this.inherited(arguments);
			domStyle.set(this.iconNode, "opacity",
						 selected ? this.getParent().pressedIconOpacity : 1);
		}
	});

	return has("dojo-bidi") ? declare("dojox.mobile.IconItem", [IconItem, BidiIconItem]) : IconItem;
});

},
'dojo/_base/html':function(){
define(["./kernel", "../dom", "../dom-style", "../dom-attr", "../dom-prop", "../dom-class", "../dom-construct", "../dom-geometry"], function(dojo, dom, style, attr, prop, cls, ctr, geom){
	// module:
	//		dojo/dom

	/*=====
	return {
		// summary:
		//		This module is a stub for the core dojo DOM API.
	};
	=====*/

	// mix-in dom
	dojo.byId = dom.byId;
	dojo.isDescendant = dom.isDescendant;
	dojo.setSelectable = dom.setSelectable;

	// mix-in dom-attr
	dojo.getAttr = attr.get;
	dojo.setAttr = attr.set;
	dojo.hasAttr = attr.has;
	dojo.removeAttr = attr.remove;
	dojo.getNodeProp = attr.getNodeProp;

	dojo.attr = function(node, name, value){
		// summary:
		//		Gets or sets an attribute on an HTML element.
		// description:
		//		Handles normalized getting and setting of attributes on DOM
		//		Nodes. If 2 arguments are passed, and a the second argument is a
		//		string, acts as a getter.
		//
		//		If a third argument is passed, or if the second argument is a
		//		map of attributes, acts as a setter.
		//
		//		When passing functions as values, note that they will not be
		//		directly assigned to slots on the node, but rather the default
		//		behavior will be removed and the new behavior will be added
		//		using `dojo.connect()`, meaning that event handler properties
		//		will be normalized and that some caveats with regards to
		//		non-standard behaviors for onsubmit apply. Namely that you
		//		should cancel form submission using `dojo.stopEvent()` on the
		//		passed event object instead of returning a boolean value from
		//		the handler itself.
		// node: DOMNode|String
		//		id or reference to the element to get or set the attribute on
		// name: String|Object
		//		the name of the attribute to get or set.
		// value: String?
		//		The value to set for the attribute
		// returns:
		//		when used as a getter, the value of the requested attribute
		//		or null if that attribute does not have a specified or
		//		default value;
		//
		//		when used as a setter, the DOM node
		//
		// example:
		//	|	// get the current value of the "foo" attribute on a node
		//	|	dojo.attr(dojo.byId("nodeId"), "foo");
		//	|	// or we can just pass the id:
		//	|	dojo.attr("nodeId", "foo");
		//
		// example:
		//	|	// use attr() to set the tab index
		//	|	dojo.attr("nodeId", "tabIndex", 3);
		//	|
		//
		// example:
		//	Set multiple values at once, including event handlers:
		//	|	dojo.attr("formId", {
		//	|		"foo": "bar",
		//	|		"tabIndex": -1,
		//	|		"method": "POST",
		//	|		"onsubmit": function(e){
		//	|			// stop submitting the form. Note that the IE behavior
		//	|			// of returning true or false will have no effect here
		//	|			// since our handler is connect()ed to the built-in
		//	|			// onsubmit behavior and so we need to use
		//	|			// dojo.stopEvent() to ensure that the submission
		//	|			// doesn't proceed.
		//	|			dojo.stopEvent(e);
		//	|
		//	|			// submit the form with Ajax
		//	|			dojo.xhrPost({ form: "formId" });
		//	|		}
		//	|	});
		//
		// example:
		//	Style is s special case: Only set with an object hash of styles
		//	|	dojo.attr("someNode",{
		//	|		id:"bar",
		//	|		style:{
		//	|			width:"200px", height:"100px", color:"#000"
		//	|		}
		//	|	});
		//
		// example:
		//	Again, only set style as an object hash of styles:
		//	|	var obj = { color:"#fff", backgroundColor:"#000" };
		//	|	dojo.attr("someNode", "style", obj);
		//	|
		//	|	// though shorter to use `dojo.style()` in this case:
		//	|	dojo.style("someNode", obj);

		if(arguments.length == 2){
			return attr[typeof name == "string" ? "get" : "set"](node, name);
		}
		return attr.set(node, name, value);
	};

	// mix-in dom-class
	dojo.hasClass = cls.contains;
	dojo.addClass = cls.add;
	dojo.removeClass = cls.remove;
	dojo.toggleClass = cls.toggle;
	dojo.replaceClass = cls.replace;

	// mix-in dom-construct
	dojo._toDom = dojo.toDom = ctr.toDom;
	dojo.place = ctr.place;
	dojo.create = ctr.create;
	dojo.empty = function(node){ ctr.empty(node); };
	dojo._destroyElement = dojo.destroy = function(node){ ctr.destroy(node); };

	// mix-in dom-geometry
	dojo._getPadExtents = dojo.getPadExtents = geom.getPadExtents;
	dojo._getBorderExtents = dojo.getBorderExtents = geom.getBorderExtents;
	dojo._getPadBorderExtents = dojo.getPadBorderExtents = geom.getPadBorderExtents;
	dojo._getMarginExtents = dojo.getMarginExtents = geom.getMarginExtents;
	dojo._getMarginSize = dojo.getMarginSize = geom.getMarginSize;
	dojo._getMarginBox = dojo.getMarginBox = geom.getMarginBox;
	dojo.setMarginBox = geom.setMarginBox;
	dojo._getContentBox = dojo.getContentBox = geom.getContentBox;
	dojo.setContentSize = geom.setContentSize;
	dojo._isBodyLtr = dojo.isBodyLtr = geom.isBodyLtr;
	dojo._docScroll = dojo.docScroll = geom.docScroll;
	dojo._getIeDocumentElementOffset = dojo.getIeDocumentElementOffset = geom.getIeDocumentElementOffset;
	dojo._fixIeBiDiScrollLeft = dojo.fixIeBiDiScrollLeft = geom.fixIeBiDiScrollLeft;
	dojo.position = geom.position;

	dojo.marginBox = function marginBox(/*DomNode|String*/node, /*Object?*/box){
		// summary:
		//		Getter/setter for the margin-box of node.
		// description:
		//		Getter/setter for the margin-box of node.
		//		Returns an object in the expected format of box (regardless
		//		if box is passed). The object might look like:
		//		`{ l: 50, t: 200, w: 300: h: 150 }`
		//		for a node offset from its parent 50px to the left, 200px from
		//		the top with a margin width of 300px and a margin-height of
		//		150px.
		// node:
		//		id or reference to DOM Node to get/set box for
		// box:
		//		If passed, denotes that dojo.marginBox() should
		//		update/set the margin box for node. Box is an object in the
		//		above format. All properties are optional if passed.
		// example:
		//		Retrieve the margin box of a passed node
		//	|	var box = dojo.marginBox("someNodeId");
		//	|	console.dir(box);
		//
		// example:
		//		Set a node's margin box to the size of another node
		//	|	var box = dojo.marginBox("someNodeId");
		//	|	dojo.marginBox("someOtherNode", box);
		return box ? geom.setMarginBox(node, box) : geom.getMarginBox(node); // Object
	};

	dojo.contentBox = function contentBox(/*DomNode|String*/node, /*Object?*/box){
		// summary:
		//		Getter/setter for the content-box of node.
		// description:
		//		Returns an object in the expected format of box (regardless if box is passed).
		//		The object might look like:
		//		`{ l: 50, t: 200, w: 300: h: 150 }`
		//		for a node offset from its parent 50px to the left, 200px from
		//		the top with a content width of 300px and a content-height of
		//		150px. Note that the content box may have a much larger border
		//		or margin box, depending on the box model currently in use and
		//		CSS values set/inherited for node.
		//		While the getter will return top and left values, the
		//		setter only accepts setting the width and height.
		// node:
		//		id or reference to DOM Node to get/set box for
		// box:
		//		If passed, denotes that dojo.contentBox() should
		//		update/set the content box for node. Box is an object in the
		//		above format, but only w (width) and h (height) are supported.
		//		All properties are optional if passed.
		return box ? geom.setContentSize(node, box) : geom.getContentBox(node); // Object
	};

	dojo.coords = function(/*DomNode|String*/node, /*Boolean?*/includeScroll){
		// summary:
		//		Deprecated: Use position() for border-box x/y/w/h
		//		or marginBox() for margin-box w/h/l/t.
		//
		//		Returns an object that measures margin-box (w)idth/(h)eight
		//		and absolute position x/y of the border-box. Also returned
		//		is computed (l)eft and (t)op values in pixels from the
		//		node's offsetParent as returned from marginBox().
		//		Return value will be in the form:
		//|			{ l: 50, t: 200, w: 300: h: 150, x: 100, y: 300 }
		//		Does not act as a setter. If includeScroll is passed, the x and
		//		y params are affected as one would expect in dojo.position().
		dojo.deprecated("dojo.coords()", "Use dojo.position() or dojo.marginBox().");
		node = dom.byId(node);
		var s = style.getComputedStyle(node), mb = geom.getMarginBox(node, s);
		var abs = geom.position(node, includeScroll);
		mb.x = abs.x;
		mb.y = abs.y;
		return mb;	// Object
	};

	// mix-in dom-prop
	dojo.getProp = prop.get;
	dojo.setProp = prop.set;

	dojo.prop = function(/*DomNode|String*/node, /*String|Object*/name, /*String?*/value){
		// summary:
		//		Gets or sets a property on an HTML element.
		// description:
		//		Handles normalized getting and setting of properties on DOM
		//		Nodes. If 2 arguments are passed, and a the second argument is a
		//		string, acts as a getter.
		//
		//		If a third argument is passed, or if the second argument is a
		//		map of attributes, acts as a setter.
		//
		//		When passing functions as values, note that they will not be
		//		directly assigned to slots on the node, but rather the default
		//		behavior will be removed and the new behavior will be added
		//		using `dojo.connect()`, meaning that event handler properties
		//		will be normalized and that some caveats with regards to
		//		non-standard behaviors for onsubmit apply. Namely that you
		//		should cancel form submission using `dojo.stopEvent()` on the
		//		passed event object instead of returning a boolean value from
		//		the handler itself.
		// node:
		//		id or reference to the element to get or set the property on
		// name:
		//		the name of the property to get or set.
		// value:
		//		The value to set for the property
		// returns:
		//		when used as a getter, the value of the requested property
		//		or null if that attribute does not have a specified or
		//		default value;
		//
		//		when used as a setter, the DOM node
		//
		// example:
		//	|	// get the current value of the "foo" property on a node
		//	|	dojo.prop(dojo.byId("nodeId"), "foo");
		//	|	// or we can just pass the id:
		//	|	dojo.prop("nodeId", "foo");
		//
		// example:
		//	|	// use prop() to set the tab index
		//	|	dojo.prop("nodeId", "tabIndex", 3);
		//	|
		//
		// example:
		//	Set multiple values at once, including event handlers:
		//	|	dojo.prop("formId", {
		//	|		"foo": "bar",
		//	|		"tabIndex": -1,
		//	|		"method": "POST",
		//	|		"onsubmit": function(e){
		//	|			// stop submitting the form. Note that the IE behavior
		//	|			// of returning true or false will have no effect here
		//	|			// since our handler is connect()ed to the built-in
		//	|			// onsubmit behavior and so we need to use
		//	|			// dojo.stopEvent() to ensure that the submission
		//	|			// doesn't proceed.
		//	|			dojo.stopEvent(e);
		//	|
		//	|			// submit the form with Ajax
		//	|			dojo.xhrPost({ form: "formId" });
		//	|		}
		//	|	});
		//
		// example:
		//		Style is s special case: Only set with an object hash of styles
		//	|	dojo.prop("someNode",{
		//	|		id:"bar",
		//	|		style:{
		//	|			width:"200px", height:"100px", color:"#000"
		//	|		}
		//	|	});
		//
		// example:
		//		Again, only set style as an object hash of styles:
		//	|	var obj = { color:"#fff", backgroundColor:"#000" };
		//	|	dojo.prop("someNode", "style", obj);
		//	|
		//	|	// though shorter to use `dojo.style()` in this case:
		//	|	dojo.style("someNode", obj);

		if(arguments.length == 2){
			return prop[typeof name == "string" ? "get" : "set"](node, name);
		}
		// setter
		return prop.set(node, name, value);
	};

	// mix-in dom-style
	dojo.getStyle = style.get;
	dojo.setStyle = style.set;
	dojo.getComputedStyle = style.getComputedStyle;
	dojo.__toPixelValue = dojo.toPixelValue = style.toPixelValue;

	dojo.style = function(node, name, value){
		// summary:
		//		Accesses styles on a node. If 2 arguments are
		//		passed, acts as a getter. If 3 arguments are passed, acts
		//		as a setter.
		// description:
		//		Getting the style value uses the computed style for the node, so the value
		//		will be a calculated value, not just the immediate node.style value.
		//		Also when getting values, use specific style names,
		//		like "borderBottomWidth" instead of "border" since compound values like
		//		"border" are not necessarily reflected as expected.
		//		If you want to get node dimensions, use `dojo.marginBox()`,
		//		`dojo.contentBox()` or `dojo.position()`.
		// node: DOMNode|String
		//		id or reference to node to get/set style for
		// name: String|Object?
		//		the style property to set in DOM-accessor format
		//		("borderWidth", not "border-width") or an object with key/value
		//		pairs suitable for setting each property.
		// value: String?
		//		If passed, sets value on the node for style, handling
		//		cross-browser concerns.  When setting a pixel value,
		//		be sure to include "px" in the value. For instance, top: "200px".
		//		Otherwise, in some cases, some browsers will not apply the style.
		// returns:
		//		when used as a getter, return the computed style of the node if passing in an ID or node,
		//		or return the normalized, computed value for the property when passing in a node and a style property
		// example:
		//		Passing only an ID or node returns the computed style object of
		//		the node:
		//	|	dojo.style("thinger");
		// example:
		//		Passing a node and a style property returns the current
		//		normalized, computed value for that property:
		//	|	dojo.style("thinger", "opacity"); // 1 by default
		//
		// example:
		//		Passing a node, a style property, and a value changes the
		//		current display of the node and returns the new computed value
		//	|	dojo.style("thinger", "opacity", 0.5); // == 0.5
		//
		// example:
		//		Passing a node, an object-style style property sets each of the values in turn and returns the computed style object of the node:
		//	|	dojo.style("thinger", {
		//	|		"opacity": 0.5,
		//	|		"border": "3px solid black",
		//	|		"height": "300px"
		//	|	});
		//
		// example:
		//		When the CSS style property is hyphenated, the JavaScript property is camelCased.
		//		font-size becomes fontSize, and so on.
		//	|	dojo.style("thinger",{
		//	|		fontSize:"14pt",
		//	|		letterSpacing:"1.2em"
		//	|	});
		//
		// example:
		//		dojo/NodeList implements .style() using the same syntax, omitting the "node" parameter, calling
		//		dojo.style() on every element of the list. See: `dojo/query` and `dojo/NodeList`
		//	|	dojo.query(".someClassName").style("visibility","hidden");
		//	|	// or
		//	|	dojo.query("#baz > div").style({
		//	|		opacity:0.75,
		//	|		fontSize:"13pt"
		//	|	});

		switch(arguments.length){
			case 1:
				return style.get(node);
			case 2:
				return style[typeof name == "string" ? "get" : "set"](node, name);
		}
		// setter
		return style.set(node, name, value);
	};

	return dojo;
});

},
'dojo/_base/Color':function(){
define(["./kernel", "./lang", "./array", "./config"], function(dojo, lang, ArrayUtil, config){

	var Color = dojo.Color = function(/*Array|String|Object*/ color){
		// summary:
		//		Takes a named string, hex string, array of rgb or rgba values,
		//		an object with r, g, b, and a properties, or another `Color` object
		//		and creates a new Color instance to work from.
		//
		// example:
		//		Work with a Color instance:
		//	 | var c = new Color();
		//	 | c.setColor([0,0,0]); // black
		//	 | var hex = c.toHex(); // #000000
		//
		// example:
		//		Work with a node's color:
		//	 | var color = dojo.style("someNode", "backgroundColor");
		//	 | var n = new Color(color);
		//	 | // adjust the color some
		//	 | n.r *= .5;
		//	 | console.log(n.toString()); // rgb(128, 255, 255);
		if(color){ this.setColor(color); }
	};

	// FIXME:
	// there's got to be a more space-efficient way to encode or discover
	// these!! Use hex?
	Color.named = {
		// summary:
		//		Dictionary list of all CSS named colors, by name. Values are 3-item arrays with corresponding RG and B values.
		"black":  [0,0,0],
		"silver": [192,192,192],
		"gray":	  [128,128,128],
		"white":  [255,255,255],
		"maroon": [128,0,0],
		"red":	  [255,0,0],
		"purple": [128,0,128],
		"fuchsia":[255,0,255],
		"green":  [0,128,0],
		"lime":	  [0,255,0],
		"olive":  [128,128,0],
		"yellow": [255,255,0],
		"navy":	  [0,0,128],
		"blue":	  [0,0,255],
		"teal":	  [0,128,128],
		"aqua":	  [0,255,255],
		"transparent": config.transparentColor || [0,0,0,0]
	};

	lang.extend(Color, {
		r: 255, g: 255, b: 255, a: 1,
		_set: function(r, g, b, a){
			var t = this; t.r = r; t.g = g; t.b = b; t.a = a;
		},
		setColor: function(/*Array|String|Object*/ color){
			// summary:
			//		Takes a named string, hex string, array of rgb or rgba values,
			//		an object with r, g, b, and a properties, or another `Color` object
			//		and sets this color instance to that value.
			//
			// example:
			//	|	var c = new Color(); // no color
			//	|	c.setColor("#ededed"); // greyish
			if(lang.isString(color)){
				Color.fromString(color, this);
			}else if(lang.isArray(color)){
				Color.fromArray(color, this);
			}else{
				this._set(color.r, color.g, color.b, color.a);
				if(!(color instanceof Color)){ this.sanitize(); }
			}
			return this;	// Color
		},
		sanitize: function(){
			// summary:
			//		Ensures the object has correct attributes
			// description:
			//		the default implementation does nothing, include dojo.colors to
			//		augment it with real checks
			return this;	// Color
		},
		toRgb: function(){
			// summary:
			//		Returns 3 component array of rgb values
			// example:
			//	|	var c = new Color("#000000");
			//	|	console.log(c.toRgb()); // [0,0,0]
			var t = this;
			return [t.r, t.g, t.b]; // Array
		},
		toRgba: function(){
			// summary:
			//		Returns a 4 component array of rgba values from the color
			//		represented by this object.
			var t = this;
			return [t.r, t.g, t.b, t.a];	// Array
		},
		toHex: function(){
			// summary:
			//		Returns a CSS color string in hexadecimal representation
			// example:
			//	|	console.log(new Color([0,0,0]).toHex()); // #000000
			var arr = ArrayUtil.map(["r", "g", "b"], function(x){
				var s = this[x].toString(16);
				return s.length < 2 ? "0" + s : s;
			}, this);
			return "#" + arr.join("");	// String
		},
		toCss: function(/*Boolean?*/ includeAlpha){
			// summary:
			//		Returns a css color string in rgb(a) representation
			// example:
			//	|	var c = new Color("#FFF").toCss();
			//	|	console.log(c); // rgb('255','255','255')
			var t = this, rgb = t.r + ", " + t.g + ", " + t.b;
			return (includeAlpha ? "rgba(" + rgb + ", " + t.a : "rgb(" + rgb) + ")";	// String
		},
		toString: function(){
			// summary:
			//		Returns a visual representation of the color
			return this.toCss(true); // String
		}
	});

	Color.blendColors = dojo.blendColors = function(
		/*Color*/ start,
		/*Color*/ end,
		/*Number*/ weight,
		/*Color?*/ obj
	){
		// summary:
		//		Blend colors end and start with weight from 0 to 1, 0.5 being a 50/50 blend,
		//		can reuse a previously allocated Color object for the result
		var t = obj || new Color();
		ArrayUtil.forEach(["r", "g", "b", "a"], function(x){
			t[x] = start[x] + (end[x] - start[x]) * weight;
			if(x != "a"){ t[x] = Math.round(t[x]); }
		});
		return t.sanitize();	// Color
	};

	Color.fromRgb = dojo.colorFromRgb = function(/*String*/ color, /*Color?*/ obj){
		// summary:
		//		Returns a `Color` instance from a string of the form
		//		"rgb(...)" or "rgba(...)". Optionally accepts a `Color`
		//		object to update with the parsed value and return instead of
		//		creating a new object.
		// returns:
		//		A Color object. If obj is passed, it will be the return value.
		var m = color.toLowerCase().match(/^rgba?\(([\s\.,0-9]+)\)/);
		return m && Color.fromArray(m[1].split(/\s*,\s*/), obj);	// Color
	};

	Color.fromHex = dojo.colorFromHex = function(/*String*/ color, /*Color?*/ obj){
		// summary:
		//		Converts a hex string with a '#' prefix to a color object.
		//		Supports 12-bit #rgb shorthand. Optionally accepts a
		//		`Color` object to update with the parsed value.
		//
		// returns:
		//		A Color object. If obj is passed, it will be the return value.
		//
		// example:
		//	 | var thing = dojo.colorFromHex("#ededed"); // grey, longhand
		//
		// example:
		//	| var thing = dojo.colorFromHex("#000"); // black, shorthand
		var t = obj || new Color(),
			bits = (color.length == 4) ? 4 : 8,
			mask = (1 << bits) - 1;
		color = Number("0x" + color.substr(1));
		if(isNaN(color)){
			return null; // Color
		}
		ArrayUtil.forEach(["b", "g", "r"], function(x){
			var c = color & mask;
			color >>= bits;
			t[x] = bits == 4 ? 17 * c : c;
		});
		t.a = 1;
		return t;	// Color
	};

	Color.fromArray = dojo.colorFromArray = function(/*Array*/ a, /*Color?*/ obj){
		// summary:
		//		Builds a `Color` from a 3 or 4 element array, mapping each
		//		element in sequence to the rgb(a) values of the color.
		// example:
		//		| var myColor = dojo.colorFromArray([237,237,237,0.5]); // grey, 50% alpha
		// returns:
		//		A Color object. If obj is passed, it will be the return value.
		var t = obj || new Color();
		t._set(Number(a[0]), Number(a[1]), Number(a[2]), Number(a[3]));
		if(isNaN(t.a)){ t.a = 1; }
		return t.sanitize();	// Color
	};

	Color.fromString = dojo.colorFromString = function(/*String*/ str, /*Color?*/ obj){
		// summary:
		//		Parses `str` for a color value. Accepts hex, rgb, and rgba
		//		style color values.
		// description:
		//		Acceptable input values for str may include arrays of any form
		//		accepted by dojo.colorFromArray, hex strings such as "#aaaaaa", or
		//		rgb or rgba strings such as "rgb(133, 200, 16)" or "rgba(10, 10,
		//		10, 50)"
		// returns:
		//		A Color object. If obj is passed, it will be the return value.
		var a = Color.named[str];
		return a && Color.fromArray(a, obj) || Color.fromRgb(str, obj) || Color.fromHex(str, obj);	// Color
	};

	return Color;
});

},
'dojox/mobile/ScrollableView':function(){
define([
	"dojo/_base/array",
	"dojo/_base/declare",
	"dojo/dom-class",
	"dojo/dom-construct",
	"dijit/registry",	// registry.byNode
	"./View",
	"./_ScrollableMixin"
], function(array, declare, domClass, domConstruct, registry, View, ScrollableMixin){

	// module:
	//		dojox/mobile/ScrollableView

	return declare("dojox.mobile.ScrollableView", [View, ScrollableMixin], {
		// summary:
		//		A container that has a touch scrolling capability.
		// description:
		//		ScrollableView is a subclass of View (dojox/mobile/View).
		//		Unlike the base View class, ScrollableView's domNode always stays
		//		at the top of the screen and its height is "100%" of the screen.
		//		Inside this fixed domNode, the containerNode scrolls. The browser's
		//		default scrolling behavior is disabled, and the scrolling mechanism is
		//		reimplemented in JavaScript. Thus the user does not need to use the
		//		two-finger operation to scroll the inner DIV (containerNode).
		//		The main purpose of this widget is to realize fixed-positioned header
		//		and/or footer bars.

		// scrollableParams: Object
		//		Parameters for dojox/mobile/scrollable.init().
		scrollableParams: null,

		// keepScrollPos: Boolean
		//		Overrides dojox/mobile/View/keepScrollPos.
		keepScrollPos: false,

		constructor: function(){
			// summary:
			//		Creates a new instance of the class.
			this.scrollableParams = {noResize: true};
		},

		buildRendering: function(){
			this.inherited(arguments);
			domClass.add(this.domNode, "mblScrollableView");
			this.domNode.style.overflow = "hidden";
			this.domNode.style.top = "0px";
			this.containerNode = domConstruct.create("div",
				{className:"mblScrollableViewContainer"}, this.domNode);
			this.containerNode.style.position = "absolute";
			this.containerNode.style.top = "0px"; // view bar is relative
			if(this.scrollDir === "v"){
				this.containerNode.style.width = "100%";
			}
		},

		startup: function(){
			if(this._started){ return; }
			this.reparent();
			this.inherited(arguments);
		},

		resize: function(){
			// summary:
			//		Calls resize() of each child widget.
			this.inherited(arguments); // scrollable#resize() will be called
			array.forEach(this.getChildren(), function(child){
				if(child.resize){ child.resize(); }
			});
		},

		isTopLevel: function(/*Event*/e){
			// summary:
			//		Returns true if this is a top-level widget.
			//		Overrides dojox/mobile/scrollable.isTopLevel.
			var parent = this.getParent && this.getParent();
			return (!parent || !parent.resize); // top level widget
		},

		addFixedBar: function(/*Widget*/widget){
			// summary:
			//		Adds a view local fixed bar to this widget.
			// description:
			//		This method can be used to programmatically add a view local
			//		fixed bar to ScrollableView. The bar is appended to this
			//		widget's domNode. The addChild API cannot be used for this
			//		purpose, because it adds the given widget to containerNode.
			var c = widget.domNode;
			var fixed = this.checkFixedBar(c, true);
			if(!fixed){ return; }
			// Fixed bar has to be added to domNode, not containerNode.
			this.domNode.appendChild(c);
			if(fixed === "top"){
				this.fixedHeaderHeight = c.offsetHeight;
				this.isLocalHeader = true;
			}else if(fixed === "bottom"){
				this.fixedFooterHeight = c.offsetHeight;
				this.isLocalFooter = true;
				c.style.bottom = "0px";
			}
			this.resize();
		},

		reparent: function(){
			// summary:
			//		Moves all the children, except header and footer, to
			//		containerNode.
			var i, idx, len, c;
			for(i = 0, idx = 0, len = this.domNode.childNodes.length; i < len; i++){
				c = this.domNode.childNodes[idx];
				// search for view-specific header or footer
				if(c === this.containerNode || this.checkFixedBar(c, true)){
					idx++;
					continue;
				}
				this.containerNode.appendChild(this.domNode.removeChild(c));
			}
		},

		onAfterTransitionIn: function(moveTo, dir, transition, context, method){
			// summary:
			//		Overrides View.onAfterTransitionIn to flash the scroll bar
			//		after performing a view transition.
			this.flashScrollBar();
		},

		getChildren: function(){
			// summary:
			//		Overrides _WidgetBase.getChildren to add local fixed bars,
			//		which are not under containerNode, to the children array.
			var children = this.inherited(arguments);
			var fixedWidget;
			if(this.fixedHeader && this.fixedHeader.parentNode === this.domNode){
				fixedWidget = registry.byNode(this.fixedHeader);
				if(fixedWidget){
					children.push(fixedWidget);
				}
			}
			if(this.fixedFooter && this.fixedFooter.parentNode === this.domNode){
				fixedWidget = registry.byNode(this.fixedFooter);
				if(fixedWidget){
					children.push(fixedWidget);
				}
			}
			return children;
		},

		_addTransitionPaddingTop: function(/*String|Integer*/ value){
			// add padding top to the view in order to get alignment during the transition
			this.domNode.style.paddingTop = value + "px";
			this.containerNode.style.paddingTop = value + "px";
		},

		_removeTransitionPaddingTop: function(){
			// remove padding top from the view after the transition
			this.domNode.style.paddingTop = "";
			this.containerNode.style.paddingTop = "";
		}

	});
});

},
'dojox/fx/flip':function(){
define("dojox/fx/flip", [
	"dojo/_base/kernel",
	"dojo/_base/html",
	"dojo/dom",
	"dojo/dom-construct",
	"dojo/dom-geometry",
	"dojo/_base/connect",
	"dojo/_base/Color",
	"dojo/_base/sniff",
	"dojo/_base/lang",
	"dojo/_base/window",
	"dojo/_base/fx",
	"dojo/fx",
	"./_base"
], function(kernel, htmlUtil, dom, domConstruct, domGeom, connectUtil, Color, has, lang, winUtil, baseFx, coreFx, fxExt) {
//kernel,lang->(sniff,array,has),sniff,unload,window

	kernel.experimental("dojox.fx.flip");
	// because ShrinkSafe will eat this up:
	var borderConst = "border",
		widthConst = "Width",
		heightConst = "Height",
		topConst = "Top",
		rightConst = "Right",
		leftConst = "Left",
		bottomConst = "Bottom"
	;

	fxExt.flip = function(/*Object*/ args){
		// summary:
		//		Animate a node flipping following a specific direction
		// description:
		//		Returns an animation that will flip the
		//		node around a central axis:
		//
		//		if args.dir is "left" or "right" --> y axis
		//
		//		if args.dir is "top" or "bottom" --> x axis
		//
		//		This effect is obtained using a border distortion applied to a helper node.
		//
		//		The user can specify three background colors for the helper node:
		//
		//		- darkColor: the darkest color reached during the animation
		//		- lightColor: the brightest color
		//		- endColor: the final backgroundColor for the node
		//
		//		Other arguments:
		//
		//		- depth: Float
		//			 - 0 <= depth <= 1 overrides the computed "depth"
		//			- (0: min distortion, 1: max distortion)
		//
		//		- whichAnim: String
		//			- "first"			 : the first half animation
		//			- "last"			 : the second one
		//			- "both" (default) : both
		//
		//		- axis: String
		//			- "center" (default)	  : the node is flipped around his center
		//			- "shortside"			  : the node is flipped around his "short" (in perspective) side
		//			- "longside"			  : the node is flipped around his "long" (in perspective) side
		//			- "cube"				  : the node flips around the central axis of the cube
		//
		//		- shift: Integer:
		//			node translation, perpendicular to the rotation axis
		//
		// example:
		//	|	var anim = dojox.fx.flip({
		//	|		node: dojo.byId("nodeId"),
		//	|		dir: "top",
		//	|		darkColor: "#555555",
		//	|		lightColor: "#dddddd",
		//	|		endColor: "#666666",
		//	|		depth: .5,
		//	|		shift: 50,
		//	|		duration:300
		//	|	  });

		var helperNode = domConstruct.create("div"),
			node = args.node = dom.byId(args.node),
			s = node.style,
			dims = null,
			hs = null,
			pn = null,
			lightColor = args.lightColor || "#dddddd",
			darkColor = args.darkColor || "#555555",
			bgColor = htmlUtil.style(node, "backgroundColor"),
			endColor = args.endColor || bgColor,
			staticProps = {},
			anims = [],
			duration = args.duration ? args.duration / 2 : 250,
			dir = args.dir || "left",
			pConst = .9,
			transparentColor = "transparent",
			whichAnim = args.whichAnim,
			axis = args.axis || "center",
			depth = args.depth
		;
		// IE6 workaround: IE6 doesn't support transparent borders
		var convertColor = function(color){
			return ((new Color(color)).toHex() === "#000000") ? "#000001" : color;
		};

		if(has("ie") < 7){
			endColor = convertColor(endColor);
			lightColor = convertColor(lightColor);
			darkColor = convertColor(darkColor);
			bgColor = convertColor(bgColor);
			transparentColor = "black";
			helperNode.style.filter = "chroma(color='#000000')";
		}

		var init = (function(n){
			return function(){
				var ret = htmlUtil.coords(n, true);
				dims = {
					top: ret.y,
					left: ret.x,
					width: ret.w,
					height: ret.h
				};
			}
		})(node);
		init();
		// helperNode initialization
		hs = {
			position: "absolute",
			top: dims["top"] + "px",
			left: dims["left"] + "px",
			height: "0",
			width: "0",
			zIndex: args.zIndex || (s.zIndex || 0),
			border: "0 solid " + transparentColor,
			fontSize: "0",
			visibility: "hidden"
		};
		var props = [ {},
			{
				top: dims["top"],
				left: dims["left"]
			}
		];
		var dynProperties = {
			left: [leftConst, rightConst, topConst, bottomConst, widthConst, heightConst, "end" + heightConst + "Min", leftConst, "end" + heightConst + "Max"],
			right: [rightConst, leftConst, topConst, bottomConst, widthConst, heightConst, "end" + heightConst + "Min", leftConst, "end" + heightConst + "Max"],
			top: [topConst, bottomConst, leftConst, rightConst, heightConst, widthConst, "end" + widthConst + "Min", topConst, "end" + widthConst + "Max"],
			bottom: [bottomConst, topConst, leftConst, rightConst, heightConst, widthConst, "end" + widthConst + "Min", topConst, "end" + widthConst + "Max"]
		};
		// property names
		pn = dynProperties[dir];

		// .4 <= pConst <= .9
		if(typeof depth != "undefined"){
			depth = Math.max(0, Math.min(1, depth)) / 2;
			pConst = .4 + (.5 - depth);
		}else{
			pConst = Math.min(.9, Math.max(.4, dims[pn[5].toLowerCase()] / dims[pn[4].toLowerCase()]));
		}
		var p0 = props[0];
		for(var i = 4; i < 6; i++){
			if(axis == "center" || axis == "cube"){ // find a better name for "cube"
				dims["end" + pn[i] + "Min"] = dims[pn[i].toLowerCase()] * pConst;
				dims["end" + pn[i] + "Max"] = dims[pn[i].toLowerCase()] / pConst;
			}else if(axis == "shortside"){
				dims["end" + pn[i] + "Min"] = dims[pn[i].toLowerCase()];
				dims["end" + pn[i] + "Max"] = dims[pn[i].toLowerCase()] / pConst;
			}else if(axis == "longside"){
				dims["end" + pn[i] + "Min"] = dims[pn[i].toLowerCase()] * pConst;
				dims["end" + pn[i] + "Max"] = dims[pn[i].toLowerCase()];
			}
		}
		if(axis == "center"){
			p0[pn[2].toLowerCase()] = dims[pn[2].toLowerCase()] - (dims[pn[8]] - dims[pn[6]]) / 4;
		}else if(axis == "shortside"){
			p0[pn[2].toLowerCase()] = dims[pn[2].toLowerCase()] - (dims[pn[8]] - dims[pn[6]]) / 2;
		}

		staticProps[pn[5].toLowerCase()] = dims[pn[5].toLowerCase()] + "px";
		staticProps[pn[4].toLowerCase()] = "0";
		staticProps[borderConst + pn[1] + widthConst] = dims[pn[4].toLowerCase()] + "px";
		staticProps[borderConst + pn[1] + "Color"] = bgColor;

		p0[borderConst + pn[1] + widthConst] = 0;
		p0[borderConst + pn[1] + "Color"] = darkColor;
		p0[borderConst + pn[2] + widthConst] = p0[borderConst + pn[3] + widthConst] = axis != "cube"
			? (dims["end" + pn[5] +	 "Max"] - dims["end" + pn[5] + "Min"]) / 2
			: dims[pn[6]] / 2
		;
		p0[pn[7].toLowerCase()] = dims[pn[7].toLowerCase()] + dims[pn[4].toLowerCase()] / 2 + (args.shift || 0);
		p0[pn[5].toLowerCase()] = dims[pn[6]];

		var p1 = props[1];
		p1[borderConst + pn[0] + "Color"] = { start: lightColor, end: endColor };
		p1[borderConst + pn[0] + widthConst] = dims[pn[4].toLowerCase()];
		p1[borderConst + pn[2] + widthConst] = 0;
		p1[borderConst + pn[3] + widthConst] = 0;
		p1[pn[5].toLowerCase()] = { start: dims[pn[6]], end: dims[pn[5].toLowerCase()] };

		lang.mixin(hs, staticProps);
		htmlUtil.style(helperNode, hs);
		winUtil.body().appendChild(helperNode);

		var finalize = function(){
//			helperNode.parentNode.removeChild(helperNode);
			domConstruct.destroy(helperNode);
			// fixes a flicker when the animation ends
			s.backgroundColor = endColor;
			s.visibility = "visible";
		};
		if(whichAnim == "last"){
			for(i in p0){
				p0[i] = { start: p0[i] };
			}
			p0[borderConst + pn[1] + "Color"] = { start: darkColor, end: endColor };
			p1 = p0;
		}
		if(!whichAnim || whichAnim == "first"){
			anims.push(baseFx.animateProperty({
				node: helperNode,
				duration: duration,
				properties: p0
			}));
		}
		if(!whichAnim || whichAnim == "last"){
			anims.push(baseFx.animateProperty({
				node: helperNode,
				duration: duration,
				properties: p1,
				onEnd: finalize
			}));
		}

		// hide the original node
		connectUtil.connect(anims[0], "play", function(){
			helperNode.style.visibility = "visible";
			s.visibility = "hidden";
		});

		return coreFx.chain(anims); // dojo.Animation

	}

	fxExt.flipCube = function(/*Object*/ args){
		// summary:
		//		An extension to `dojox.fx.flip` providing a more 3d-like rotation
		// description:
		//		An extension to `dojox.fx.flip` providing a more 3d-like rotation.
		//		Behaves the same as `dojox.fx.flip`, using the same attributes and
		//		other standard `dojo.Animation` properties.
		// example:
		//		See `dojox.fx.flip`
		var anims = [],
			mb = domGeom.getMarginBox(args.node),
			shiftX = mb.w / 2,
			shiftY = mb.h / 2,
			dims = {
				top: {
					pName: "height",
					args:[
						{
							whichAnim: "first",
							dir: "top",
							shift: -shiftY
						},
						{
							whichAnim: "last",
							dir: "bottom",
							shift: shiftY
						}
					]
				},
				right: {
					pName: "width",
					args:[
						{
							whichAnim: "first",
							dir: "right",
							shift: shiftX
						},
						{
							whichAnim: "last",
							dir: "left",
							shift: -shiftX
						}
					]
				},
				bottom: {
					pName: "height",
					args:[
						{
							whichAnim: "first",
							dir: "bottom",
							shift: shiftY
						},
						{
							whichAnim: "last",
							dir: "top",
							shift: -shiftY
						}
					]
				},
				left: {
					pName: "width",
					args:[
						{
							whichAnim: "first",
							dir: "left",
							shift: -shiftX
						},
						{
							whichAnim: "last",
							dir: "right",
							shift: shiftX
						}
					]
				}
			}
		;
		var d = dims[args.dir || "left"],
			p = d.args
		;
		args.duration = args.duration ? args.duration * 2 : 500;
		args.depth = .8;
		args.axis = "cube";
		for(var i = p.length - 1; i >= 0; i--){
			lang.mixin(args, p[i]);
			anims.push(fxExt.flip(args));
		}
		return coreFx.combine(anims);
	};
	
	fxExt.flipPage = function(/*Object*/ args){
		// summary:
		//		An extension to `dojox.fx.flip` providing a page flip like animation.
		// description:
		//		An extension to `dojox.fx.flip` providing a page flip effect.
		//		Behaves the same as `dojox.fx.flip`, using the same attributes and
		//		other standard `dojo.Animation` properties.
		// example:
		//		See `dojox.fx.flip`
		var n = args.node,
			coords = htmlUtil.coords(n, true),
			x = coords.x,
			y = coords.y,
			w = coords.w,
			h = coords.h,
			bgColor = htmlUtil.style(n, "backgroundColor"),
			lightColor = args.lightColor || "#dddddd",
			darkColor = args.darkColor,
			helperNode = domConstruct.create("div"),
			anims = [],
			hn = [],
			dir = args.dir || "right",
			pn = {
				left: ["left", "right", "x", "w"],
				top: ["top", "bottom", "y", "h"],
				right: ["left", "left", "x", "w"],
				bottom: ["top", "top", "y", "h"]
			},
			shiftMultiplier = {
				right: [1, -1],
				left: [-1, 1],
				top: [-1, 1],
				bottom: [1, -1]
			}
		;
		htmlUtil.style(helperNode, {
			position: "absolute",
			width  : w + "px",
			height : h + "px",
			top	   : y + "px",
			left   : x + "px",
			visibility: "hidden"
		});
		var hs = [];
		for(var i = 0; i < 2; i++){
			var r = i % 2,
				d = r ? pn[dir][1] : dir,
				wa = r ? "last" : "first",
				endColor = r ? bgColor : lightColor,
				startColor = r ? endColor : args.startColor || n.style.backgroundColor
			;
			hn[i] = lang.clone(helperNode);
			var finalize = function(x){
					return function(){
						domConstruct.destroy(hn[x]);
					}
				}(i)
			;
			winUtil.body().appendChild(hn[i]);
			hs[i] = {
				backgroundColor: r ? startColor : bgColor
			};
			
			hs[i][pn[dir][0]] = coords[pn[dir][2]] + shiftMultiplier[dir][0] * i * coords[pn[dir][3]] + "px";
			htmlUtil.style(hn[i], hs[i]);
			anims.push(dojox.fx.flip({
				node: hn[i],
				dir: d,
				axis: "shortside",
				depth: args.depth,
				duration: args.duration / 2,
				shift: shiftMultiplier[dir][i] * coords[pn[dir][3]] / 2,
				darkColor: darkColor,
				lightColor: lightColor,
				whichAnim: wa,
				endColor: endColor
			}));
			connectUtil.connect(anims[i], "onEnd", finalize);
		}
		return coreFx.chain(anims);
	};
	
	
	fxExt.flipGrid = function(/*Object*/ args){
		// summary:
		//		An extension to `dojox.fx.flip` providing a decomposition in rows * cols flipping elements
		// description:
		//		An extension to `dojox.fx.flip` providing a page flip effect.
		//		Behaves the same as `dojox.fx.flip`, using the same attributes and
		//		other standard `dojo.Animation` properties and
		//
		//		- cols: Integer columns
		//		- rows: Integer rows
		//		- duration: the single flip duration
		// example:
		//		See `dojox.fx.flip`
		var rows = args.rows || 4,
			cols = args.cols || 4,
			anims = [],
			helperNode = domConstruct.create("div"),
			n = args.node,
			coords = htmlUtil.coords(n, true),
			x = coords.x,
			y = coords.y,
			nw = coords.w,
			nh = coords.h,
			w = coords.w / cols,
			h = coords.h / rows,
			cAnims = []
		;
		htmlUtil.style(helperNode, {
			position: "absolute",
			width: w + "px",
			height: h + "px",
			backgroundColor: htmlUtil.style(n, "backgroundColor")
		});
		for(var i = 0; i < rows; i++){
			var r = i % 2,
				d = r ? "right" : "left",
				signum = r ? 1 : -1
			;
			// cloning
			var cn = lang.clone(n);
			htmlUtil.style(cn, {
				position: "absolute",
				width: nw + "px",
				height: nh + "px",
				top: y + "px",
				left: x + "px",
				clip: "rect(" + i * h + "px," + nw + "px," + nh + "px,0)"
			});
			winUtil.body().appendChild(cn);
			anims[i] = [];
			for(var j = 0; j < cols; j++){
				var hn = lang.clone(helperNode),
					l = r ? j : cols - (j + 1)
				;
				var adjustClip = function(xn, yCounter, xCounter){
					return function(){
						if(!(yCounter % 2)){
							htmlUtil.style(xn, {
								clip: "rect(" + yCounter * h + "px," + (nw - (xCounter + 1) * w ) + "px," + ((yCounter + 1) * h) + "px,0px)"
							});
						}else{
							htmlUtil.style(xn, {
								clip: "rect(" + yCounter * h + "px," + nw + "px," + ((yCounter + 1) * h) + "px," + ((xCounter + 1) * w) + "px)"
							});
						}
					}
				}(cn, i, j);
				winUtil.body().appendChild(hn);
				htmlUtil.style(hn, {
					left: x + l * w + "px",
					top: y + i * h + "px",
					visibility: "hidden"
				});
				var a = dojox.fx.flipPage({
				   node: hn,
				   dir: d,
				   duration: args.duration || 900,
				   shift: signum * w/2,
				   depth: .2,
				   darkColor: args.darkColor,
				   lightColor: args.lightColor,
				   startColor: args.startColor || args.node.style.backgroundColor
				}),
				removeHelper = function(xn){
					return function(){
						domConstruct.destroy(xn);
					}
				}(hn)
				;
				connectUtil.connect(a, "play", this, adjustClip);
				connectUtil.connect(a, "play", this, removeHelper);
				anims[i].push(a);
			}
			cAnims.push(coreFx.chain(anims[i]));
			
		}
		connectUtil.connect(cAnims[0], "play", function(){
			htmlUtil.style(n, {visibility: "hidden"});
		});
		return coreFx.combine(cAnims);
	};
	return fxExt;
});

},
'dojox/mobile/Badge':function(){
define([
	"dojo/_base/declare",
	"dojo/_base/lang",
	"dojo/dom-class",
	"dojo/dom-construct",
	"./iconUtils",
	"dojo/has",
	"dojo/has!dojo-bidi?dojox/mobile/bidi/Badge"
], function(declare, lang, domClass, domConstruct, iconUtils, has, BidiBadge){
	// module:
	//		dojox/mobile/Badge

	var Badge = declare(has("dojo-bidi") ? "dojox.mobile.NonBidiBadge" : "dojox.mobile.Badge", null, {
		// summary:
		//		A utility to create/update a badge node.
		// description:
		//		Badge is not a widget, but just a convenience class. A badge
		//		consists of a simple DOM button.

		// value: String
		//		A text to show in a badge.
		value: "0",

		// className: String
		//		A CSS class name of a DOM button.
		className: "mblDomButtonRedBadge",

		// fontSize: Number
		//		Font size in pixel. The other style attributes are determined by the DOM
		//		button itself.
		fontSize: 16, // [px]

		constructor: function(/*Object?*/params, /*DomNode?*/node){
			// summary:
			//		Creates a new instance of the class.
			// params:
			//		Contains properties to be set.
			// node:
			//		The DOM node. If none is specified, it is automatically created. 
			if (params){
				lang.mixin(this, params);
			}
			this.domNode = node ? node : domConstruct.create("div");
			domClass.add(this.domNode, "mblBadge");
			if(this.domNode.className.indexOf("mblDomButton") === -1){
				domClass.add(this.domNode, this.className);
			}
			if(this.fontSize !== 16){
				this.domNode.style.fontSize = this.fontSize + "px";
			}
			iconUtils.createDomButton(this.domNode);
			this.setValue(this.value);
		},

		getValue: function(){
			// summary:
			//		Returns the text shown in the badge.
			return this.domNode.firstChild.innerHTML || "";
		},

		setValue: function(/*String*/value){
			// summary:
			//		Set a label text to the badge.
			this.domNode.firstChild.innerHTML = value;
		}
	});

	return has("dojo-bidi") ? declare("dojox.mobile.Badge", [Badge, BidiBadge]) : Badge;
});

},
'dojox/mobile/IconContainer':function(){
define("dojox/mobile/IconContainer", [
	"dojo/_base/array",
	"dojo/_base/declare",
	"dojo/_base/lang",
	"dojo/_base/window",
	"dojo/dom-construct",
	"dijit/_Contained",
	"dijit/_Container",
	"dijit/_WidgetBase",
	"./IconItem", // to load IconItem for you (no direct references)
	"./Heading",
	"./View"
], function(array, declare, lang, win, domConstruct, Contained, Container, WidgetBase, IconItem, Heading, View){

	// module:
	//		dojox/mobile/IconContainer

	return declare("dojox.mobile.IconContainer", [WidgetBase, Container, Contained],{
		// summary:
		//		A container widget which can hold multiple icons.
		// description:
		//		IconContainer is a container widget which can hold multiple
		//		icons. Each icon represents an application component.

		// defaultIcon: String
		//		The default fallback icon, which is displayed only when the
		//		specified icon has failed to load.
		defaultIcon: "",

		// transition: String
		//		A type of animated transition effect. You can choose from the
		//		standard transition types, "slide", "fade", "flip", or from the
		//		extended transition types, "cover", "coverv", "dissolve",
		//		"reveal", "revealv", "scaleIn", "scaleOut", "slidev",
		//		"swirl", "zoomIn", "zoomOut", "cube", and "swap". If "none" is
		//		specified, transition occurs immediately without animation. If
		//		"below" is specified, the application contents are displayed
		//		below the icons.
		transition: "below",

		// pressedIconOpacity: Number
		//		The opacity of the pressed icon image.
		pressedIconOpacity: 0.4,

		// iconBase: String
		//		The default icon path for child items.
		iconBase: "",

		// iconPos: String
		//		The default icon position for child items.
		iconPos: "",

		// back: String
		//		A label for the navigational control.
		back: "Home",

		// label: String
		//		A title text of the heading.
		label: "My Application",

		// single: Boolean
		//		If true, only one icon content can be opened at a time.
		single: false,

		// editable: Boolean
		//		If true, the icons can be removed or re-ordered. You can enter
		//		into edit mode by pressing on a child IconItem until it starts shaking.
		editable: false,

		// tag: String
		//		A name of html tag to create as domNode.
		tag: "ul",

		/* internal properties */	
		baseClass: "mblIconContainer",
		editableMixinClass: "dojox/mobile/_EditableIconMixin",
		iconItemPaneContainerClass: "dojox/mobile/Container",
		iconItemPaneContainerProps: null,
		iconItemPaneClass: "dojox/mobile/_IconItemPane",
		iconItemPaneProps: null,

		buildRendering: function(){
			this.domNode = this.containerNode = this.srcNodeRef || domConstruct.create(this.tag);
			// _terminator is used to apply the clear:both style to terminate floating icons.
			this._terminator = domConstruct.create(this.tag === "ul" ? "li" : "div",
				{className:"mblIconItemTerminator"}, this.domNode);
			this.inherited(arguments);
		},

		postCreate: function(){
			if(this.editable && !this.startEdit){ // if editable is true but editableMixinClass is not inherited
				require([this.editableMixinClass], lang.hitch(this, function(module){
					declare.safeMixin(this, new module());
					this.set("editable", this.editable);
				}));
			}
		},

		startup: function(){
			if(this._started){ return; }

			require([this.iconItemPaneContainerClass], lang.hitch(this, function(module){
				this.paneContainerWidget = new module(this.iconItemPaneContainerProps);
				if(this.transition === "below"){
					domConstruct.place(this.paneContainerWidget.domNode, this.domNode, "after");
				}else{
					var view = this.appView = new View({id:this.id+"_mblApplView"});
					var _this = this;
					view.onAfterTransitionIn = function(moveTo, dir, transition, context, method){
						_this._opening._open_1();
					};
					view.domNode.style.visibility = "hidden";
					var heading = view._heading
						= new Heading({back: this._cv ? this._cv(this.back) : this.back,
										label: this._cv ? this._cv(this.label) : this.label,
										moveTo: this.domNode.parentNode.id,
										transition: this.transition == "zoomIn" ? "zoomOut" : this.transition});
					view.addChild(heading);
					view.addChild(this.paneContainerWidget);

					var target;
					for(var w = this.getParent(); w; w = w.getParent()){
						if(w instanceof View){
							target = w.domNode.parentNode;
							break;
						}
					}
					if(!target){ target = win.body(); }
					target.appendChild(view.domNode);

					view.startup();
				}
			}));

			this.inherited(arguments);
		},

		closeAll: function(){
			// summary:
			//		Closes all the icon items.
			array.forEach(this.getChildren(), function(w){
				w.close(true); // disables closing animation
			}, this);
		},

		addChild: function(widget, /*Number?*/insertIndex){
			this.inherited(arguments);
			// #16597: if removeChild(item) was called to remove the item, it also removes the paneWidget from its container,
			// But then calling addChild(item) again does not re-add it as it should: it was added the first time through startup
			// called by addChild, but startup is not called any more the subsequent times.
			// So we add the pane explicitly if it is orphan.
			if(this._started && widget.paneWidget && !widget.paneWidget.getParent()){
				this.paneContainerWidget.addChild(widget.paneWidget, insertIndex);
			}
			this.domNode.appendChild(this._terminator); // to ensure that _terminator is always the last node
		},

		removeChild: function(/*Widget|Number*/widget){
			var index = (typeof widget == "number") ? widget : widget.getIndexInParent();
			this.paneContainerWidget.removeChild(index);
			this.inherited(arguments);
		},	

		_setLabelAttr: function(/*String*/text){
			// tags:
			//		private
			if(!this.appView){ return; }
			this.label = text;
			var s = this._cv ? this._cv(text) : text;
			this.appView._heading.set("label", s);
		}
	});
});

},
'dojox/fx/_base':function(){
define(["dojo/_base/array","dojo/_base/lang", "dojo/_base/fx", "dojo/fx", "dojo/dom", "dojo/dom-style",
	    "dojo/dom-geometry", "dojo/_base/connect", "dojo/_base/html"],
	function(arrayUtil, lang, baseFx, coreFx, dom, domStyle, domGeom, connectUtil, htmlUtil){

/*=====
return {
	// summary:
	//		Experimental and extended Animations beyond Dojo Core / Base functionality.
	//		Provides advanced Lines, Animations, and convenience aliases.
};
=====*/

var dojoxFx = lang.getObject("dojox.fx", true);

lang.mixin(dojoxFx, {

	// anim: Function
	//		Alias of `dojo.anim` - the shorthand `dojo.animateProperty` with auto-play
	anim: baseFx.anim,

	// animateProperty: Function
	//		Alias of `dojo.animateProperty` - animate any CSS property
	animateProperty: baseFx.animateProperty,

	// fadeTo: Function
	//		Fade an element from an opacity to an opacity.
	//		Omit `start:` property to detect. `end:` property is required.
	//		Ultimately an alias to `dojo._fade`
	fadeTo: baseFx._fade,

	// fadeIn: Function
	//		Alias of `dojo.fadeIn` - Fade a node in.
	fadeIn: baseFx.fadeIn,
	
	// fadeOut: Function
	//		Alias of `dojo.fadeOut` - Fades a node out.
	fadeOut: baseFx.fadeOut,

	// combine: Function
	//		Alias of `dojo.fx.combine` - Run an array of animations in parallel
	combine: coreFx.combine,

	// chain: Function
	//		Alias of `dojo.fx.chain` - Run an array of animations in sequence
	chain: coreFx.chain,

	// slideTo: Function
	//		Alias of `dojo.fx.slideTo` - Slide a node to a defined top/left coordinate
	slideTo: coreFx.slideTo,

	// wipeIn: Function
	//		Alias of `dojo.fx.wipeIn` - Wipe a node to visible
	wipeIn: coreFx.wipeIn,

	// wipeOut: Function
	//		Alias of `dojo.fx.wipeOut` - Wipe a node to non-visible
	wipeOut: coreFx.wipeOut
});


dojoxFx.sizeTo = function(/* Object */args){
	// summary:
	//		Creates an animation that will size a node
	//
	// description:
	//		Returns an animation that will size the target node
	//		defined in args Object about it's center to
	//		a width and height defined by (args.width, args.height),
	//		supporting an optional method: chain||combine mixin
	//		(defaults to chain).
	//
	//	- works best on absolutely or relatively positioned elements
	//
	// example:
	//	|	// size #myNode to 400px x 200px over 1 second
	//	|	dojo.fx.sizeTo({
	//	|		node:'myNode',
	//	|		duration: 1000,
	//	|		width: 400,
	//	|		height: 200,
	//	|		method: "combine"
	//	|	}).play();
	//

	var node = args.node = dom.byId(args.node),
		abs = "absolute";

	var method = args.method || "chain";
	if(!args.duration){ args.duration = 500; } // default duration needed
	if(method == "chain"){ args.duration = Math.floor(args.duration / 2); }
	
	var top, newTop, left, newLeft, width, height = null;

	var init = (function(n){
		return function(){
			var cs = domStyle.getComputedStyle(n),
				pos = cs.position,
				w = cs.width,
				h = cs.height
			;
			
			top = (pos == abs ? n.offsetTop : parseInt(cs.top) || 0);
			left = (pos == abs ? n.offsetLeft : parseInt(cs.left) || 0);
			width = (w == "auto" ? 0 : parseInt(w));
			height = (h == "auto" ? 0 : parseInt(h));
			
			newLeft = left - Math.floor((args.width - width) / 2);
			newTop = top - Math.floor((args.height - height) / 2);

			if(pos != abs && pos != 'relative'){
				var ret = domStyle.coords(n, true);
				top = ret.y;
				left = ret.x;
				n.style.position = abs;
				n.style.top = top + "px";
				n.style.left = left + "px";
			}
		}
	})(node);

	var anim1 = baseFx.animateProperty(lang.mixin({
		properties: {
			height: function(){
				init();
				return { end: args.height || 0, start: height };
			},
			top: function(){
				return { start: top, end: newTop };
			}
		}
	}, args));
	var anim2 = baseFx.animateProperty(lang.mixin({
		properties: {
			width: function(){
				return { start: width, end: args.width || 0 }
			},
			left: function(){
				return { start: left, end: newLeft }
			}
		}
	}, args));

	var anim = coreFx[(args.method == "combine" ? "combine" : "chain")]([anim1, anim2]);
	return anim; // dojo.Animation

};

dojoxFx.slideBy = function(/* Object */args){
	// summary:
	//		Returns an animation to slide a node by a defined offset.
	//
	// description:
	//		Returns an animation that will slide a node (args.node) from it's
	//		current position to it's current posision plus the numbers defined
	//		in args.top and args.left. standard dojo.fx mixin's apply.
	//
	// example:
	//	|	// slide domNode 50px down, and 22px left
	//	|	dojox.fx.slideBy({
	//	|		node: domNode, duration:400,
	//	|		top: 50, left: -22
	//	|	}).play();

	var node = args.node = dom.byId(args.node),
		top, left;

	var init = (function(n){
		return function(){
			var cs = domStyle.getComputedStyle(n);
			var pos = cs.position;
			top = (pos == 'absolute' ? n.offsetTop : parseInt(cs.top) || 0);
			left = (pos == 'absolute' ? n.offsetLeft : parseInt(cs.left) || 0);
			if(pos != 'absolute' && pos != 'relative'){
				var ret = domGeom.coords(n, true);
				top = ret.y;
				left = ret.x;
				n.style.position = "absolute";
				n.style.top = top + "px";
				n.style.left = left + "px";
			}
		}
	})(node);
	init();
	
	var _anim = baseFx.animateProperty(lang.mixin({
		properties: {
			// FIXME: is there a way to update the _Line after creation?
			// null start values allow chaining to work, animateProperty will
			// determine them for us (except in ie6? -- ugh)
			top: top + (args.top || 0),
			left: left + (args.left || 0)
		}
	}, args));
	connectUtil.connect(_anim, "beforeBegin", _anim, init);
	return _anim; // dojo.Animation
};

dojoxFx.crossFade = function(/* Object */args){
	// summary:
	//		Returns an animation cross fading two element simultaneously
	// args:
	//		- args.nodes: Array - two element array of domNodes, or id's
	//
	//		all other standard animation args mixins apply. args.node ignored.

	// simple check for which node is visible, maybe too simple?
	var node1 = args.nodes[0] = dom.byId(args.nodes[0]),
		op1 = htmlUtil.style(node1,"opacity"),
		node2 = args.nodes[1] = dom.byId(args.nodes[1]),
		op2 = htmlUtil.style(node2, "opacity")
	;
	
	var _anim = coreFx.combine([
		baseFx[(op1 == 0 ? "fadeIn" : "fadeOut")](lang.mixin({
			node: node1
		},args)),
		baseFx[(op1 == 0 ? "fadeOut" : "fadeIn")](lang.mixin({
			node: node2
		},args))
	]);
	return _anim; // dojo.Animation
};

dojoxFx.highlight = function(/*Object*/ args){
	// summary:
	//		Highlight a node
	//
	// description:
	//		Returns an animation that sets the node background to args.color
	//		then gradually fades back the original node background color
	//
	// example:
	//	|	dojox.fx.highlight({ node:"foo" }).play();

	var node = args.node = dom.byId(args.node);

	args.duration = args.duration || 400;
	
	// Assign default color light yellow
	var startColor = args.color || '#ffff99',
		endColor = htmlUtil.style(node, "backgroundColor")
	;

	// safari "fix"
	// safari reports rgba(0, 0, 0, 0) (black) as transparent color, while
	// other browsers return "transparent", rendered as white by default by
	// dojo.Color; now dojo.Color maps "transparent" to
	// djConfig.transparentColor ([r, g, b]), if present; so we can use
	// the color behind the effect node
	if(endColor == "rgba(0, 0, 0, 0)"){
		endColor = "transparent";
	}

	var anim = baseFx.animateProperty(lang.mixin({
		properties: {
			backgroundColor: { start: startColor, end: endColor }
		}
	}, args));

	if(endColor == "transparent"){
		connectUtil.connect(anim, "onEnd", anim, function(){
			node.style.backgroundColor = endColor;
		});
	}

	return anim; // dojo.Animation
};

 
dojoxFx.wipeTo = function(/*Object*/ args){
	// summary:
	//		Animate a node wiping to a specific width or height
	//
	// description:
	//		Returns an animation that will expand the
	//		node defined in 'args' object from it's current to
	//		the height or width value given by the args object.
	//
	//		default to height:, so leave height null and specify width:
	//		to wipeTo a width. note: this may be deprecated by a
	//
	//		Note that the final value should not include
	//		units and should be an integer.  Thus a valid args object
	//		would look something like this:
	//
	//		|	dojox.fx.wipeTo({ node: "nodeId", height: 200 }).play();
	//
	//		Node must have no margin/border/padding, so put another
	//		node inside your target node for additional styling.

	args.node = dom.byId(args.node);
	var node = args.node, s = node.style;

	var dir = (args.width ? "width" : "height"),
		endVal = args[dir],
		props = {}
	;

	props[dir] = {
		// wrapped in functions so we wait till the last second to query (in case value has changed)
		start: function(){
			// start at current [computed] height, but use 1px rather than 0
			// because 0 causes IE to display the whole panel
			s.overflow = "hidden";
			if(s.visibility == "hidden" || s.display == "none"){
				s[dir] = "1px";
				s.display = "";
				s.visibility = "";
				return 1;
			}else{
				var now = htmlUtil.style(node,dir);
				return Math.max(now, 1);
			}
		},
		end: endVal
	};

	var anim = baseFx.animateProperty(lang.mixin({ properties: props }, args));
	return anim; // dojo.Animation
};

return dojoxFx;
});

},
'dojox/mobile/lazyLoadUtils':function(){
define([
	"dojo/_base/kernel",
	"dojo/_base/array",
	"dojo/_base/config",
	"dojo/_base/window",
	"dojo/_base/Deferred",
	"dojo/ready"
], function(dojo, array, config, win, Deferred, ready){

	// module:
	//		dojox/mobile/lazyLoadUtils

	var LazyLoadUtils = function(){
		// summary:
		//		Utilities to lazy-loading of Dojo widgets.

		this._lazyNodes = [];
		var _this = this;
		if(config.parseOnLoad){
			ready(90, function(){
				var lazyNodes = array.filter(win.body().getElementsByTagName("*"), // avoid use of dojo.query
					function(n){ return n.getAttribute("lazy") === "true" || (n.getAttribute("data-dojo-props")||"").match(/lazy\s*:\s*true/); });
				var i, j, nodes, s, n;
				for(i = 0; i < lazyNodes.length; i++){
					array.forEach(["dojoType", "data-dojo-type"], function(a){
						nodes = array.filter(lazyNodes[i].getElementsByTagName("*"),
											function(n){ return n.getAttribute(a); });
						for(j = 0; j < nodes.length; j++){
							n = nodes[j];
							n.setAttribute("__" + a, n.getAttribute(a));
							n.removeAttribute(a);
							_this._lazyNodes.push(n);
						}
					});
				}
			});
		}

		ready(function(){
			for(var i = 0; i < _this._lazyNodes.length; i++){ /* 1.8 */
				var n = _this._lazyNodes[i];
				array.forEach(["dojoType", "data-dojo-type"], function(a){
					if(n.getAttribute("__" + a)){
						n.setAttribute(a, n.getAttribute("__" + a));
						n.removeAttribute("__" + a);
					}
				});
			}
			delete _this._lazyNodes;

		});

		this.instantiateLazyWidgets = function(root, requires, callback){
			// summary:
			//		Instantiates dojo widgets under the root node.
			// description:
			//		Finds DOM nodes that have the dojoType or data-dojo-type attributes,
			//		requires the found Dojo modules, and runs the parser.
			var d = new Deferred();
			var req = requires ? requires.split(/,/) : [];
			var nodes = root.getElementsByTagName("*"); // avoid use of dojo.query
			var len = nodes.length;
			for(var i = 0; i < len; i++){
				var s = nodes[i].getAttribute("dojoType") || nodes[i].getAttribute("data-dojo-type");
				if(s){
					req.push(s);
					var m = nodes[i].getAttribute("data-dojo-mixins"),
						mixins = m ? m.split(/, */) : [];
					req = req.concat(mixins);
				}
			}
			if(req.length === 0){ return true; }

			if(dojo.require){
				array.forEach(req, function(c){
					dojo["require"](c);
				});
				dojo.parser.parse(root);
				if(callback){ callback(root); }
				return true;
			}else{
				req = array.map(req, function(s){ return s.replace(/\./g, "/"); });
				require(req, function(){
					dojo.parser.parse(root);
					if(callback){ callback(root); }
					d.resolve(true);
				});
			}
			return d;
		}	
	};

	// Return singleton.  (TODO: can we replace LazyLoadUtils class and singleton w/a simple hash of functions?)
	return new LazyLoadUtils();
});


}}});
define("dojox/mobile/_compat", [
	"dojo/_base/array",	// array.forEach
	"dojo/_base/config",
	"dojo/_base/connect",	// connect.connect
	"dojo/_base/fx",	// fx.fadeOut, fx.fadeIn
	"dojo/_base/lang",	// lang.extend, lang.isArray
	"dojo/sniff",		// has("webkit"), has("ie")
	"dojo/_base/window",	// win.doc, win.body
	"dojo/dom-class",
	"dojo/dom-construct",
	"dojo/dom-geometry",
	"dojo/dom-style",
	"dojo/fx",
	"dojo/fx/easing",
	"dojo/ready",
	"dojo/uacss",
	"dijit/registry",	// registry.byNode
	"dojox/fx",
	"dojox/fx/flip",
	"./EdgeToEdgeList",
	"./IconContainer",
	"./ProgressIndicator",
	"./RoundRect",
	"./RoundRectList",
	"./ScrollableView",
	"./Switch",
	"./View",
	"require"
], function(array, config, connect, bfx, lang, has, win, domClass, domConstruct, domGeometry, domStyle, fx, easing, ready, uacss, registry, xfx, flip, EdgeToEdgeList, IconContainer, ProgressIndicator, RoundRect, RoundRectList, ScrollableView, Switch, View, require){

	// module:
	//		dojox/mobile/compat

/*=====
return {
	// summary:
	//		CSS3 compatibility module.
	// description:
	//		This module provides to dojox/mobile support for some of the CSS3 features 
	//		in non-CSS3 browsers, such as IE or Firefox.
	//		If you require this module, when running in a non-CSS3 browser it directly 
	//		replaces some of the methods of	dojox/mobile classes, without any subclassing. 
	//		This way, HTML pages remain the same regardless of whether this compatibility 
	//		module is used or not.
	//
	//		Example of usage: 
	//		|	require([
	//		|		"dojox/mobile",
	//		|		"dojox/mobile/compat",
	//		|		...
	//		|	], function(...){
	//		|		...
	//		|	});
	//
	//		This module also loads compatibility CSS files, which have a -compat.css
	//		suffix. You can use either the `<link>` tag or `@import` to load theme
	//		CSS files. Then, this module searches for the loaded CSS files and loads
	//		compatibility CSS files. For example, if you load dojox/mobile/themes/iphone/iphone.css
	//		in a page, this module automatically loads dojox/mobile/themes/iphone/iphone-compat.css.
	//		If you explicitly load iphone-compat.css with `<link>` or `@import`,
	//		this module will not load again the already loaded file.
	//
	//		Note that, by default, compatibility CSS files are only loaded for CSS files located
	//		in a directory containing a "mobile/themes" path. For that, a matching is done using 
	//		the default pattern	"/\/mobile\/themes\/.*\.css$/". If a custom theme is not located 
	//		in a directory containing this path, the data-dojo-config needs to specify a custom 
	//		pattern using the "mblLoadCompatPattern" configuration parameter, for instance:
	//		|	data-dojo-config="mblLoadCompatPattern: /\/mycustomtheme\/.*\.css$/"
};
=====*/

	var dm = lang.getObject("dojox.mobile", true);

	if(!has("webkit")){
		lang.extend(View, {
			_doTransition: function(fromNode, toNode, transition, dir){
				var anim;
				this.wakeUp(toNode);
				var s1, s2;
				if(!transition || transition == "none"){
					toNode.style.display = "";
					fromNode.style.display = "none";
					toNode.style.left = "0px";
					this.invokeCallback();
				}else if(transition == "slide" || transition == "cover" || transition == "reveal"){
					var w = fromNode.offsetWidth;
					s1 = fx.slideTo({
						node: fromNode,
						duration: 400,
						left: -w*dir,
						top: domStyle.get(fromNode, "top")
					});
					s2 = fx.slideTo({
						node: toNode,
						duration: 400,
						left: 0,
						top: domStyle.get(toNode, "top")
					});
					toNode.style.position = "absolute";
					toNode.style.left = w*dir + "px";
					toNode.style.display = "";
					anim = fx.combine([s1,s2]);
					connect.connect(anim, "onEnd", this, function(){
						if(!this._inProgress){ return; } // transition has been aborted
						fromNode.style.display = "none";
						fromNode.style.left = "0px";
						toNode.style.position = "relative";
						var toWidget = registry.byNode(toNode);
						if(toWidget && !domClass.contains(toWidget.domNode, "out")){
							// Reset the temporary padding
							toWidget.containerNode.style.paddingTop = "";
						}
						this.invokeCallback();
					});
					anim.play();
				}else if(transition == "slidev" || transition == "coverv" || transition == "reavealv"){
					var h = fromNode.offsetHeight;
					s1 = fx.slideTo({
						node: fromNode,
						duration: 400,
						left: 0,
						top: -h*dir
					});
					s2 = fx.slideTo({
						node: toNode,
						duration: 400,
						left: 0,
						top: 0
					});
					toNode.style.position = "absolute";
					toNode.style.top = h*dir + "px";
					toNode.style.left = "0px";
					toNode.style.display = "";
					anim = fx.combine([s1,s2]);
					connect.connect(anim, "onEnd", this, function(){
						if(!this._inProgress){ return; } // transition has been aborted
						fromNode.style.display = "none";
						toNode.style.position = "relative";
						this.invokeCallback();
					});
					anim.play();
				}else if(transition == "flip"){
					anim = xfx.flip({
						node: fromNode,
						dir: "right",
						depth: 0.5,
						duration: 400
					});
					toNode.style.position = "absolute";
					toNode.style.left = "0px";
					connect.connect(anim, "onEnd", this, function(){
						if(!this._inProgress){ return; } // transition has been aborted
						fromNode.style.display = "none";
						toNode.style.position = "relative";
						toNode.style.display = "";
						this.invokeCallback();
					});
					anim.play();
				}else {
					// other transitions - "fade", "dissolve", "swirl"
					anim = fx.chain([
						bfx.fadeOut({
							node: fromNode,
							duration: 600
						}),
						bfx.fadeIn({
							node: toNode,
							duration: 600
						})
					]);
					toNode.style.position = "absolute";
					toNode.style.left = "0px";
					toNode.style.display = "";
					domStyle.set(toNode, "opacity", 0);
					connect.connect(anim, "onEnd", this, function(){
						if(!this._inProgress){ return; } // transition has been aborted
						fromNode.style.display = "none";
						toNode.style.position = "relative";
						domStyle.set(fromNode, "opacity", 1);
						this.invokeCallback();
					});
					anim.play();
				}
			},

			wakeUp: function(/*DomNode*/node){
				// summary:
				//		Function to force IE to redraw a node since its layout
				//		code tends to misrender in partial draws.
				// node: DomNode
				//		The node to forcibly redraw.
				// tags:
				//		public
				if(has("ie") && !node._wokeup){
					node._wokeup = true;
					var disp = node.style.display;
					node.style.display = "";
					var nodes = node.getElementsByTagName("*");
					for(var i = 0, len = nodes.length; i < len; i++){
						var val = nodes[i].style.display;
						nodes[i].style.display = "none";
						nodes[i].style.display = "";
						nodes[i].style.display = val;
					}
					node.style.display = disp;
				}
			}
		});	


		lang.extend(Switch, {
			_changeState: function(/*String*/state, /*Boolean*/anim){
				// summary:
				//		Function to toggle the switch state on the switch
				// state:
				//		The state to toggle, switch 'on' or 'off'
				// anim:
				//		Whether to use animation or not
				// tags:
				//		private
				var on = (state === "on");

				var pos;
				if(!on){
					pos = -this.inner.firstChild.firstChild.offsetWidth;
				}else{
					pos = 0;
				}

				this.left.style.display = "";
				this.right.style.display = "";

				var _this = this;
				var f = function(){
					domClass.remove(_this.domNode, on ? "mblSwitchOff" : "mblSwitchOn");
					domClass.add(_this.domNode, on ? "mblSwitchOn" : "mblSwitchOff");
					_this.left.style.display = on ? "" : "none";
					_this.right.style.display = !on ? "" : "none";
				};

				if(anim){
					var a = fx.slideTo({
						node: this.inner,
						duration: 300,
						left: pos,
						onEnd: f
					});
					a.play();
				}else{
					if(on || pos){
						this.inner.style.left = pos + "px";
					}
					f();
				}
			}
		});	


		lang.extend(ProgressIndicator, {
			scale: function(/*Number*/size){
				if(has("ie")){
					var dim = {w:size, h:size};
					domGeometry.setMarginBox(this.domNode, dim);
					domGeometry.setMarginBox(this.containerNode, dim);
				}else if(has("ff")){
					var scale = size / 40;
					domStyle.set(this.containerNode, {
						MozTransform: "scale(" + scale + ")",
						MozTransformOrigin: "0 0"
					});

					domGeometry.setMarginBox(this.domNode, {w:size, h:size});
					domGeometry.setMarginBox(this.containerNode, {w:size / scale, h:size / scale});
				}
			}
		});	


		if(has("ie")){
			lang.extend(RoundRect, {
				buildRendering: function(){
					// summary:
					//		Function to simulate the borderRadius appearance on
					//		IE, since IE does not support this CSS style.
					// tags:
					//		protected
					dm.createRoundRect(this);
					this.domNode.className = "mblRoundRect";
				}
			});


			RoundRectList._addChild = RoundRectList.prototype.addChild;
			RoundRectList._postCreate = RoundRectList.prototype.postCreate;
			lang.extend(RoundRectList, {
				buildRendering: function(){
					// summary:
					//		Function to simulate the borderRadius appearance on
					//		IE, since IE does not support this CSS style.
					// tags:
					//		protected
					dm.createRoundRect(this, true);
					this.domNode.className = "mblRoundRectList";
				},

				postCreate: function(){
					RoundRectList._postCreate.apply(this, arguments);
					this.redrawBorders();
				},

				addChild: function(widget, /*Number?*/insertIndex){
					RoundRectList._addChild.apply(this, arguments);
					this.redrawBorders();
					if(dm.applyPngFilter){
						dm.applyPngFilter(widget.domNode);
					}
				},

				redrawBorders: function(){
					// summary:
					//		Function to adjust the creation of RoundRectLists on IE.
					//		Removed undesired styles.
					// tags:
					//		public

					// Remove a border of the last ListItem.
					// This is for browsers that do not support the last-child CSS pseudo-class.

					if(this instanceof EdgeToEdgeList){ return; }
					var lastChildFound = false;
					for(var i = this.containerNode.childNodes.length - 1; i >= 0; i--){
						var c = this.containerNode.childNodes[i];
						if(c.tagName == "LI"){
							c.style.borderBottomStyle = lastChildFound ? "solid" : "none";
							lastChildFound = true;
						}
					}
				}
			});	


			lang.extend(EdgeToEdgeList, {
				buildRendering: function(){
				this.domNode = this.containerNode = this.srcNodeRef || win.doc.createElement("ul");
					this.domNode.className = "mblEdgeToEdgeList";
				}
			});


			IconContainer._addChild = IconContainer.prototype.addChild;
			lang.extend(IconContainer, {
				addChild: function(widget, /*Number?*/insertIndex){
					IconContainer._addChild.apply(this, arguments);
					if(dm.applyPngFilter){
						dm.applyPngFilter(widget.domNode);
					}
				}
			});


			lang.mixin(dm, {
				createRoundRect: function(_this, isList){
					// summary:
					//		Function to adjust the creation of rounded rectangles on IE.
					//		Deals with IE's lack of borderRadius support
					// tags:
					//		public
					var i, len;
					_this.domNode = win.doc.createElement("div");
					_this.domNode.style.padding = "0px";
					_this.domNode.style.backgroundColor = "transparent";
					_this.domNode.style.border = "none"; // borderStyle = "none"; doesn't work on IE9
					_this.containerNode = win.doc.createElement(isList?"ul":"div");
					_this.containerNode.className = "mblRoundRectContainer";
					if(_this.srcNodeRef){
						_this.srcNodeRef.parentNode.replaceChild(_this.domNode, _this.srcNodeRef);
						for(i = 0, len = _this.srcNodeRef.childNodes.length; i < len; i++){
							_this.containerNode.appendChild(_this.srcNodeRef.removeChild(_this.srcNodeRef.firstChild));
						}
						_this.srcNodeRef = null;
					}
					_this.domNode.appendChild(_this.containerNode);

					for(i = 0; i <= 5; i++){
						var top = domConstruct.create("div");
						top.className = "mblRoundCorner mblRoundCorner"+i+"T";
						_this.domNode.insertBefore(top, _this.containerNode);

						var bottom = domConstruct.create("div");
						bottom.className = "mblRoundCorner mblRoundCorner"+i+"B";
						_this.domNode.appendChild(bottom);
					}
				}
			});


			lang.extend(ScrollableView, {
				postCreate: function(){
					// On IE, margin-top of the first child does not seem to be effective,
					// probably because padding-top is specified for containerNode
					// to make room for a fixed header. This dummy node is a workaround for that.
					var dummy = domConstruct.create("div", {className:"mblDummyForIE", innerHTML:"&nbsp;"}, this.containerNode, "first");
					domStyle.set(dummy, {
						position: "relative",
						marginBottom: "-2px",
						fontSize: "1px"
					});
				}
			});
		} // if	(has("ie"))


		if(has("ie") <= 6){
			dm.applyPngFilter = function(root){
				root = root || win.body();
				var nodes = root.getElementsByTagName("IMG");
				var blank = require.toUrl("dojo/resources/blank.gif");
				for(var i = 0, len = nodes.length; i < len; i++){
					var img = nodes[i];
					var w = img.offsetWidth;
					var h = img.offsetHeight;
					if(w === 0 || h === 0){
						// The reason why the image has no width/height may be because
						// display is "none". If that is the case, let's change the
						// display to "" temporarily and see if the image returns them.
						if(domStyle.get(img, "display") != "none"){ continue; }
						img.style.display = "";
						w = img.offsetWidth;
						h = img.offsetHeight;
						img.style.display = "none";
						if(w === 0 || h === 0){ continue; }
					}
					var src = img.src;
					if(src.indexOf("resources/blank.gif") != -1){ continue; }
					img.src = blank;
					img.runtimeStyle.filter = "progid:DXImageTransform.Microsoft.AlphaImageLoader(src='" + src+"')";
					img.style.width = w + "px";
					img.style.height = h + "px";
				}
			};

			if(!dm._disableBgFilter && dm.createDomButton){
				dm._createDomButton_orig = dm.createDomButton;
				dm.createDomButton = function(/*DomNode*/refNode, /*Object?*/style, /*DomNode?*/toNode){
					var node = dm._createDomButton_orig.apply(this, arguments);
					if(node && node.className && node.className.indexOf("mblDomButton") !== -1){
						var f = function(){
							if(node.currentStyle && node.currentStyle.backgroundImage.match(/url.*(mblDomButton.*\.png)/)){
								var img = RegExp.$1;
								var src = require.toUrl("dojox/mobile/themes/common/domButtons/compat/") + img;
								node.runtimeStyle.filter = "progid:DXImageTransform.Microsoft.AlphaImageLoader(src='" + src+"',sizingMethod='crop')";
								node.style.background = "none";
							}
						};
						setTimeout(f, 1000);
						setTimeout(f, 5000);
					}
					return node;
				};
			}
		} // if(has("ie") <= 6)

		dm.loadCssFile = function(/*String*/file){
			// summary:
			//		Overrides dojox/mobile.loadCssFile() defined in
			//		deviceTheme.js.
			if(!dm.loadedCssFiles){ dm.loadedCssFiles = []; }
			if(win.doc.createStyleSheet){
				// for some reason, IE hangs when you try to load
				// multiple css files almost at once.
				setTimeout(function(file){
					return function(){
						var ss = win.doc.createStyleSheet(file);
						ss && dm.loadedCssFiles.push(ss.owningElement);
					};
				}(file), 0);
			}else{
				dm.loadedCssFiles.push(domConstruct.create("link", {
					href: file,
					type: "text/css",
					rel: "stylesheet"
				}, win.doc.getElementsByTagName('head')[0]));
			}
		};

		dm.loadCss = function(/*String|Array*/files){
			// summary:
			//		Function to load and register CSS files with the page
			// files: String|Array
			//		The CSS files to load and register with the page.
			// tags:
			//		private
			if(!dm._loadedCss){
				var obj = {};
				array.forEach(dm.getCssPaths(), function(path){
					obj[path] = true;
				});
				dm._loadedCss = obj;
			}
			if(!lang.isArray(files)){ files = [files]; }
			for(var i = 0; i < files.length; i++){
				var file = files[i];
				if(!dm._loadedCss[file]){
					dm._loadedCss[file] = true;
					dm.loadCssFile(file);
				}
			}
		};

		dm.getCssPaths = function(){
			var paths = [];
			var i, j, len;

			// find @import
			var s = win.doc.styleSheets;
			for(i = 0; i < s.length; i++){
				if(s[i].href){ continue; }
				var r = s[i].cssRules || s[i].imports;
				if(!r){ continue; }
				for(j = 0; j < r.length; j++){
					if(r[j].href){
						paths.push(r[j].href);
					}
				}
			}

			// find <link>
			var elems = win.doc.getElementsByTagName("link");
			for(i = 0, len = elems.length; i < len; i++){
				if(elems[i].href){
					paths.push(elems[i].href);
				}
			}
			return paths;
		};

		dm.loadCompatPattern = /\/mobile\/themes\/.*\.css$/;

		dm.loadCompatCssFiles = function(/*Boolean?*/force){
			// summary:
			//		Function to perform page-level adjustments on browsers such as
			//		IE and firefox.  It loads compat specific css files into the
			//		page header.
			if(has("ie") && !force){
				setTimeout(function(){ // IE needs setTimeout
					dm.loadCompatCssFiles(true);
				}, 0);
				return;
			}
			dm._loadedCss = undefined;
			var paths = dm.getCssPaths();
			for(var i = 0; i < paths.length; i++){
				var href = paths[i];
				// Load the -compat.css only for css files that belong to a theme. For that, by default
				// we match on directories containing "mobile/themes". If a custom theme is located
				// outside a "mobile/themes" directory, the dojoConfig needs to specify a custom 
				// pattern using the "mblLoadCompatPattern" configuration parameter, for instance:
				// data-dojo-config="mblLoadCompatPattern: /\/mycustom\/.*\.css$/"
				// Additionally, compat css files are loaded for css in the mobile/tests directory.
				if((href.match(config.mblLoadCompatPattern || dm.loadCompatPattern) || 
					location.href.indexOf("mobile/tests/") !== -1) && href.indexOf("-compat.css") === -1){
					var compatCss = href.substring(0, href.length-4)+"-compat.css";
					dm.loadCss(compatCss);
				}
			}
		};

		dm.hideAddressBar = function(/*Event?*/evt, /*Boolean?*/doResize){
			if(doResize !== false){ dm.resizeAll(); }
		};

		ready(function(){
			if(config["mblLoadCompatCssFiles"] !== false){
				dm.loadCompatCssFiles();
			}
			if(dm.applyPngFilter){
				dm.applyPngFilter();
			}
		});

	} // end of if(!has("webkit")){

	return dm;
});
