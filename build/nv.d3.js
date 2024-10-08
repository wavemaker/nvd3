/* nvd3 version 1.8.6 (https://github.com/wavemaker/nvd3) 2020-03-14 */
(function(){

// set up main nv object
    var nv = {};

// the major global objects under the nv namespace
    nv.dev = false; //set false when in production
    nv.tooltip = nv.tooltip || {}; // For the tooltip system
    nv.utils = nv.utils || {}; // Utility subsystem
    nv.models = nv.models || {}; //stores all the possible models/components
    nv.charts = {}; //stores all the ready to use charts
    nv.logs = {}; //stores some statistics and potential error messages
    nv.dom = {}; //DOM manipulation functions

// Node/CommonJS - require D3
    if (typeof(module) !== 'undefined' && typeof(exports) !== 'undefined' && typeof(d3) == 'undefined') {
        d3 = require('d3');
    }

    nv.dispatch = d3.dispatch('start', 'end');

    d3.functor = function functor(v) {
        return typeof v === "function" ? v : function() {
            return v;
        };
    };

    d3.rebind = function rebind(target, source, method) {
        return function() {
            var value = method.apply(source, arguments);
            return value === source ? target : value;
        };
    }

// Function bind polyfill
// Needed ONLY for phantomJS as it's missing until version 2.0 which is unreleased as of this comment
// https://github.com/ariya/phantomjs/issues/10522
// http://kangax.github.io/compat-table/es5/#Function.prototype.bind
// phantomJS is used for running the test suite
    if (!Function.prototype.bind) {
        Function.prototype.bind = function (oThis) {
            if (typeof this !== "function") {
                // closest thing possible to the ECMAScript 5 internal IsCallable function
                throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
            }

            var aArgs = Array.prototype.slice.call(arguments, 1),
                fToBind = this,
                fNOP = function () {},
                fBound = function () {
                    return fToBind.apply(this instanceof fNOP && oThis
                            ? this
                            : oThis,
                        aArgs.concat(Array.prototype.slice.call(arguments)));
                };

            fNOP.prototype = this.prototype;
            fBound.prototype = new fNOP();
            return fBound;
        };
    }

//  Development render timers - disabled if dev = false
    if (nv.dev) {
        nv.dispatch.on('start', function(e) {
            nv.logs.startTime = +new Date();
        });

        nv.dispatch.on('end', function(e) {
            nv.logs.endTime = +new Date();
            nv.logs.totalTime = nv.logs.endTime - nv.logs.startTime;
            nv.log('total', nv.logs.totalTime); // used for development, to keep track of graph generation times
        });
    }

// Logs all arguments, and returns the last so you can test things in place
// Note: in IE8 console.log is an object not a function, and if modernizr is used
// then calling Function.prototype.bind with with anything other than a function
// causes a TypeError to be thrown.
    nv.log = function() {
        if (nv.dev && window.console && console.log && console.log.apply)
            console.log.apply(console, arguments);
        else if (nv.dev && window.console && typeof console.log == "function" && Function.prototype.bind) {
            var log = Function.prototype.bind.call(console.log, console);
            log.apply(console, arguments);
        }
        return arguments[arguments.length - 1];
    };

// print console warning, should be used by deprecated functions
    nv.deprecated = function(name, info) {
        if (console && console.warn) {
            console.warn('nvd3 warning: `' + name + '` has been deprecated. ', info || '');
        }
    };

// The nv.render function is used to queue up chart rendering
// in non-blocking async functions.
// When all queued charts are done rendering, nv.dispatch.end is invoked.
    nv.render = function render(step) {
        // number of graphs to generate in each timeout loop
        step = step || 1;

        nv.render.active = true;
        nv.dispatch.call("start");

        var renderLoop = function() {
            var chart, graph;

            for (var i = 0; i < step && (graph = nv.render.queue[i]); i++) {
                chart = graph.generate();
                if (typeof graph.callback == typeof(Function)) graph.callback(chart);
            }

            nv.render.queue.splice(0, i);

            if (nv.render.queue.length) {
                setTimeout(renderLoop);
            }
            else {
                nv.dispatch.call("end");
                nv.render.active = false;
            }
        };

        setTimeout(renderLoop);
    };

    nv.render.active = false;
    nv.render.queue = [];

    /*
Adds a chart to the async rendering queue. This method can take arguments in two forms:
nv.addGraph({
    generate: <Function>
    callback: <Function>
})

or

nv.addGraph(<generate Function>, <callback Function>)

The generate function should contain code that creates the NVD3 model, sets options
on it, adds data to an SVG element, and invokes the chart model. The generate function
should return the chart model.  See examples/lineChart.html for a usage example.

The callback function is optional, and it is called when the generate function completes.
*/
    nv.addGraph = function(obj) {
        if (typeof arguments[0] === typeof(Function)) {
            obj = {generate: arguments[0], callback: arguments[1]};
        }

        nv.render.queue.push(obj);

        if (!nv.render.active) {
            nv.render();
        }
    };

// Node/CommonJS exports
    if (typeof(module) !== 'undefined' && typeof(exports) !== 'undefined') {
        module.exports = nv;
    }

    if (typeof(window) !== 'undefined') {
        window.nv = nv;
    }
    /* Facade for queueing DOM write operations
 * with Fastdom (https://github.com/wilsonpage/fastdom)
 * if available.
 * This could easily be extended to support alternate
 * implementations in the future.
 */
    nv.dom.write = function(callback) {
        if (window.fastdom !== undefined) {
            return fastdom.mutate(callback);
        }
        return callback();
    };

    /* Facade for queueing DOM read operations
 * with Fastdom (https://github.com/wilsonpage/fastdom)
 * if available.
 * This could easily be extended to support alternate
 * implementations in the future.
 */
    nv.dom.read = function(callback) {
        if (window.fastdom !== undefined) {
            return fastdom.measure(callback);
        }
        return callback();
    };
    /* Utility class to handle creation of an interactive layer.
 This places a rectangle on top of the chart. When you mouse move over it, it sends a dispatch
 containing the X-coordinate. It can also render a vertical line where the mouse is located.

 dispatch.elementMousemove is the important event to latch onto.  It is fired whenever the mouse moves over
 the rectangle. The dispatch is given one object which contains the mouseX/Y location.
 It also has 'pointXValue', which is the conversion of mouseX to the x-axis scale.
 */
    var nvGlobal = {};
    setCoordinates = function(x, y) {
        nvGlobal.mouseX = x;
        nvGlobal.mouseY = y;
    }
    getCoordinates = function(x, y) {
        return nvGlobal;
    }

    getInterpolationType = function(type) {
        if(!type) {
            return d3.curveLinear;
        }
        switch(type){
            case "linear":
                return d3.curveLinear;
            case "cardinal":
                return d3.curveCatmullRom;
            case "step":
                return d3.curveStep;
        }

    }

    nv.interactiveGuideline = function() {
        "use strict";

        var margin = { left: 0, top: 0 } //Pass the chart's top and left magins. Used to calculate the mouseX/Y.
            ,   width = null
            ,   height = null
            ,   xScale = d3.scaleLinear()
            ,   dispatch = d3.dispatch('elementMousemove', 'elementMouseout', 'elementClick', 'elementDblclick', 'elementMouseDown', 'elementMouseUp')
            ,   showGuideLine = true
            ,   svgContainer = null // Must pass the chart's svg, we'll use its mousemove event.
            ,   tooltip = nv.models.tooltip()
            ,   isMSIE =  window.ActiveXObject// Checkt if IE by looking for activeX. (excludes IE11)
        ;

        tooltip
            .duration(0)
            .hideDelay(0)
            .hidden(false);

        function layer(selection) {
            selection.each(function(data) {
                var container = d3.select(this);
                var availableWidth = (width || 960), availableHeight = (height || 400);
                var wrap = d3.select(this).selectAll("g.nv-wrap.nv-interactiveLineLayer")
                    .data([data]);
                var wrapEnter = wrap.enter()
                    .append("g").attr("class", " nv-wrap nv-interactiveLineLayer");
                wrapEnter.append("g").attr("class","nv-interactiveGuideLine");

                if (!svgContainer) {
                    return;
                }

                function mouseHandler(event) {
                    var mouseX = event.pageX - this.getBoundingClientRect().left - window.pageXOffset;
                    var mouseY = event.pageY - this.getBoundingClientRect().top - window.pageYOffset;

                    var subtractMargin = true;
                    var mouseOutAnyReason = false;
                    if (isMSIE) {
                        /*
                     D3.js (or maybe SVG.getScreenCTM) has a nasty bug in Internet Explorer 10.
                     d3.mouse() returns incorrect X,Y mouse coordinates when mouse moving
                     over a rect in IE 10.
                     However, d3.event.offsetX/Y also returns the mouse coordinates
                     relative to the triggering <rect>. So we use offsetX/Y on IE.
                     */
                        mouseX = event.offsetX;
                        mouseY = event.offsetY;
                        /*
                     On IE, if you attach a mouse event listener to the <svg> container,
                     it will actually trigger it for all the child elements (like <path>, <circle>, etc).
                     When this happens on IE, the offsetX/Y is set to where ever the child element
                     is located.
                     As a result, we do NOT need to subtract margins to figure out the mouse X/Y
                     position under this scenario. Removing the line below *will* cause
                     the interactive layer to not work right on IE.
                     */
                        if(event.target.tagName !== "svg") {
                            subtractMargin = false;
                        }

                        if (event.target.className.baseVal.match("nv-legend")) {
                            mouseOutAnyReason = true;
                        }

                    }
                    setCoordinates(event.pageX, event.pageY);

                    if(subtractMargin) {
                        mouseX -= margin.left;
                        mouseY -= margin.top;
                    }



                    /* If mouseX/Y is outside of the chart's bounds,
                 trigger a mouseOut event.
                 */
                    if (event.type === 'mouseout'
                        || mouseX < 0 || mouseY < 0
                        || mouseX > availableWidth || mouseY > availableHeight
                        || event.target === undefined
                        || mouseOutAnyReason
                    ) {

                        if (isMSIE) {
                            if (event.target
                                && (event.target.className === undefined
                                    || event.target.className.match(tooltip.nvPointerEventsClass))) {

                                return;
                            }
                        }
                        dispatch.call('elementMouseout', this, {
                            mouseX: mouseX,
                            mouseY: mouseY
                        });
                        layer.renderGuideLine(null); //hide the guideline
                        tooltip.hidden(true);
                        return;
                    } else {
                        tooltip.hidden(false);
                    }


                    var scaleIsOrdinal = typeof xScale.rangeBands === 'function';
                    var pointXValue = undefined;

                    // Ordinal scale has no invert method
                    if (scaleIsOrdinal) {
                        var elementIndex = d3.bisect(xScale.range(), mouseX) - 1;
                        // Check if mouseX is in the range band
                        if (xScale.range()[elementIndex] + xScale.rangeBand() >= mouseX) {
                            pointXValue = xScale.domain()[d3.bisect(xScale.range(), mouseX) - 1];
                        }
                        else {
                            dispatch.call('elementMouseout', this, {
                                mouseX: mouseX,
                                mouseY: mouseY
                            });
                            layer.renderGuideLine(null); //hide the guideline
                            tooltip.hidden(true);
                            return;
                        }
                    }
                    else {
                        pointXValue = xScale.invert(mouseX);
                    }
                    if (event.type === "mousemove") {
                        dispatch.call('elementMousemove', this, {
                            mouseX: mouseX,
                            mouseY: mouseY,
                            pointXValue: pointXValue
                        });
                    }

                    //If user double clicks the layer, fire a elementDblclick
                    if (event.type === "dblclick") {
                        dispatch.call('elementDblclick', this, {
                            mouseX: mouseX,
                            mouseY: mouseY,
                            pointXValue: pointXValue
                        });
                    }

                    // if user single clicks the layer, fire elementClick
                    if (event.type === 'click') {
                        dispatch.call('elementClick', this, {
                            mouseX: mouseX,
                            mouseY: mouseY,
                            pointXValue: pointXValue
                        });
                    }

                    // if user presses mouse down the layer, fire elementMouseDown
                    if (event.type === 'mousedown') {
                        dispatch.call('elementMouseDown', this, {
                            mouseX: mouseX,
                            mouseY: mouseY,
                            pointXValue: pointXValue
                        });
                    }

                    // if user presses mouse down the layer, fire elementMouseUp
                    if (event.type === 'mouseup') {
                        dispatch.call('elementMouseUp', this, {
                            mouseX: mouseX,
                            mouseY: mouseY,
                            pointXValue: pointXValue
                        });
                    }

                    if (event.type === 'touchmove') {
                        tooltip.hidden(true);
                        return;
                    }
                }

                svgContainer
                    .on("touchmove",mouseHandler)
                    .on("mousemove",mouseHandler, true)
                    .on("mouseout" ,mouseHandler,true)
                    .on("mousedown" ,mouseHandler,true)
                    .on("mouseup" ,mouseHandler,true)
                    .on("dblclick" ,mouseHandler)
                    .on("click", mouseHandler)
                ;

                layer.guideLine = null;
                //Draws a vertical guideline at the given X postion.
                layer.renderGuideLine = function(x) {
                    if (!showGuideLine) return;
                    container.select(".nv-interactiveGuideLine")
                        .selectAll("line")
                        .data((x != null) ? [nv.utils.NaNtoZero(x)] : [], String)
                        .join(
                            enter => enter.append("line").attr("class", "nv-guideline"),
                            update => update,
                            exit => exit.remove()
                        )
                        .attr("x1", function(d) { return d; })
                        .attr("x2", function(d) { return d; })
                        .attr("y1", availableHeight)
                        .attr("y2", 0);
                }
            });
        }

        layer.dispatch = dispatch;
        layer.tooltip = tooltip;

        layer.margin = function(_) {
            if (!arguments.length) return margin;
            margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
            margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
            return layer;
        };

        layer.width = function(_) {
            if (!arguments.length) return width;
            width = _;
            return layer;
        };

        layer.height = function(_) {
            if (!arguments.length) return height;
            height = _;
            return layer;
        };

        layer.xScale = function(_) {
            if (!arguments.length) return xScale;
            xScale = _;
            return layer;
        };

        layer.showGuideLine = function(_) {
            if (!arguments.length) return showGuideLine;
            showGuideLine = _;
            return layer;
        };

        layer.svgContainer = function(_) {
            if (!arguments.length) return svgContainer;
            svgContainer = _;
            return layer;
        };

        return layer;
    };

    /* Utility class that uses d3.bisect to find the index in a given array, where a search value can be inserted.
 This is different from normal bisectLeft; this function finds the nearest index to insert the search value.

 For instance, lets say your array is [1,2,3,5,10,30], and you search for 28.
 Normal d3.bisectLeft will return 4, because 28 is inserted after the number 10.  But interactiveBisect will return 5
 because 28 is closer to 30 than 10.

 Unit tests can be found in: interactiveBisectTest.html

 Has the following known issues:
 * Will not work if the data points move backwards (ie, 10,9,8,7, etc) or if the data points are in random order.
 * Won't work if there are duplicate x coordinate values.
 */
    nv.interactiveBisect = function (values, searchVal, xAccessor) {
        "use strict";
        if (! (values instanceof Array)) {
            return null;
        }
        var _xAccessor;
        if (typeof xAccessor !== 'function') {
            _xAccessor = function(d) {
                return d.x;
            }
        } else {
            _xAccessor = xAccessor;
        }
        var _cmp = function(d, v) {
            // Accessors are no longer passed the index of the element along with
            // the element itself when invoked by d3.bisector.
            //
            // Starting at D3 v3.4.4, d3.bisector() started inspecting the
            // function passed to determine if it should consider it an accessor
            // or a comparator. This meant that accessors that take two arguments
            // (expecting an index as the second parameter) are treated as
            // comparators where the second argument is the search value against
            // which the first argument is compared.
            return _xAccessor(d) - v;
        };

        var bisect = d3.bisector(_cmp).left;
        var index = d3.max([0, bisect(values,searchVal) - 1]);
        var currentValue = _xAccessor(values[index]);

        if (typeof currentValue === 'undefined') {
            currentValue = index;
        }

        if (currentValue === searchVal) {
            return index; //found exact match
        }

        var nextIndex = d3.min([index+1, values.length - 1]);
        var nextValue = _xAccessor(values[nextIndex]);

        if (typeof nextValue === 'undefined') {
            nextValue = nextIndex;
        }

        if (Math.abs(nextValue - searchVal) >= Math.abs(currentValue - searchVal)) {
            return index;
        } else {
            return nextIndex
        }
    };

    /*
 Returns the index in the array "values" that is closest to searchVal.
 Only returns an index if searchVal is within some "threshold".
 Otherwise, returns null.
 */
    nv.nearestValueIndex = function (values, searchVal, threshold) {
        "use strict";
        var yDistMax = Infinity, indexToHighlight = null;
        values.forEach(function(d,i) {
            var delta = Math.abs(searchVal - d);
            if ( d != null && delta <= yDistMax && delta < threshold) {
                yDistMax = delta;
                indexToHighlight = i;
            }
        });
        return indexToHighlight;
    };

    /* Model which can be instantiated to handle tooltip rendering.
 Example usage:
 var tip = nv.models.tooltip().gravity('w').distance(23)
 .data(myDataObject);

 tip();    //just invoke the returned function to render tooltip.
 */
    nv.models.tooltip = function() {
        "use strict";

        /*
    Tooltip data. If data is given in the proper format, a consistent tooltip is generated.
    Example Format of data:
    {
        key: "Date",
        value: "August 2009",
        series: [
            {key: "Series 1", value: "Value 1", color: "#000"},
            {key: "Series 2", value: "Value 2", color: "#00f"}
        ]
    }
    */
        var id = "nvtooltip-" + Math.floor(Math.random() * 100000) // Generates a unique id when you create a new tooltip() object.
            ,   data = null
            ,   gravity = 'w'   // Can be 'n','s','e','w'. Determines how tooltip is positioned.
            ,   distance = 25 // Distance to offset tooltip from the mouse location.
            ,   snapDistance = 0   // Tolerance allowed before tooltip is moved from its current position (creates 'snapping' effect)
            ,   classes = null  // Attaches additional CSS classes to the tooltip DIV that is created.
            ,   hidden = true  // Start off hidden, toggle with hide/show functions below.
            ,   hideDelay = 200  // Delay (in ms) before the tooltip hides after calling hide().
            ,   tooltip = null // d3 select of the tooltip div.
            ,   lastPosition = { left: null, top: null } // Last position the tooltip was in.
            ,   enabled = true  // True -> tooltips are rendered. False -> don't render tooltips.
            ,   duration = 100 // Tooltip movement duration, in ms.
            , tDelay = d3.transition()
            .delay(hideDelay)
            .duration(0)
            ,   headerEnabled = true // If is to show the tooltip header.
            ,   nvPointerEventsClass = "nv-pointer-events-none" // CSS class to specify whether element should not have mouse events.
        ;

        // Format function for the tooltip values column.
        // d is value,
        // i is series index
        // p is point containing the value
        var valueFormatter = function(d, i, p) {
            return d;
        };

        // Format function for the tooltip header value.
        var headerFormatter = function(d) {
            return d;
        };

        var keyFormatter = function(d, i) {
            return d;
        };

        // By default, the tooltip model renders a beautiful table inside a DIV, returned as HTML
        // You can override this function if a custom tooltip is desired. For instance, you could directly manipulate
        // the DOM by accessing elem and returning false.
        var contentGenerator = function(d, elem) {
            if (d === null) {
                return '';
            }

            var table = d3.select(document.createElement("table"));
            if (headerEnabled) {
                var theadEnter = table.selectAll("thead")
                    .data([d])
                    .enter().append("thead");

                theadEnter.append("tr")
                    .append("td")
                    .attr("colspan", 3)
                    .append("strong")
                    .classed("x-value", true)
                    .html(headerFormatter(d.value));
            }

            var tbodyEnter = table.selectAll("tbody")
                .data([d])
                .enter().append("tbody");

            var trowEnter = tbodyEnter.selectAll("tr")
                .data(function(p) { return p.series})
                .enter()
                .append("tr")
                .classed("highlight", function(p) { return p.highlight});

            trowEnter.append("td")
                .classed("legend-color-guide",true)
                .append("div")
                .style("background-color", function(p) { return p.color});

            trowEnter.append("td")
                .classed("key",true)
                .classed("total",function(p) { return !!p.total})
                .html(function(p, i) { return keyFormatter(p.key, i)});

            trowEnter.append("td")
                .classed("value",true)
                .html(function(p, i) { return valueFormatter(p.value, i, p) });

            trowEnter.filter(function (p,i) { return p.percent !== undefined }).append("td")
                .classed("percent", true)
                .html(function(p, i) { return "(" + d3.format('.0%')(p.percent) + ")" });

            trowEnter.selectAll("td").each(function(p) {
                if (p.highlight) {
                    var opacityScale = d3.scaleLinear().domain([0,1]).range(["#fff",p.color]);
                    var opacity = 0.6;
                    d3.select(this)
                        .style("border-bottom-color", opacityScale(opacity))
                        .style("border-top-color", opacityScale(opacity))
                    ;
                }
            });

            var html = table.node().outerHTML;
            if (d.footer !== undefined)
                html += "<div class='footer'>" + d.footer + "</div>";
            return html;

        };

        /*
     Function that returns the position (relative to the viewport/document.body)
     the tooltip should be placed in.
     Should return: {
        left: <leftPos>,
        top: <topPos>
     }
     */
        var position = function() {
            var coordinates = getCoordinates();
            var pos = {
                left:  coordinates.mouseX,
                top:  coordinates.mouseY
            };

            if(getComputedStyle(document.body).transform != 'none') {
                // Take the offset into account, as now the tooltip is relative
                // to document.body.
                var client = document.body.getBoundingClientRect();
                pos.left -= client.left;
                pos.top -= client.top;
            }

            return pos;
        };

        var dataSeriesExists = function(d) {
            if (d && d.series) {
                if (nv.utils.isArray(d.series)) {
                    return true;
                }
                // if object, it's okay just convert to array of the object
                if (nv.utils.isObject(d.series)) {
                    d.series = [d.series];
                    return true;
                }
            }
            return false;
        };

        // Calculates the gravity offset of the tooltip. Parameter is position of tooltip
        // relative to the viewport.
        var calcGravityOffset = function(pos) {
            var height = tooltip.node() ? tooltip.node().offsetHeight : 0,
                width = tooltip.node() ? tooltip.node().offsetWidth : 0,
                clientWidth = document.documentElement.clientWidth, // Don't want scrollbars.
                // clientHeight = document.documentElement.clientHeight, // Don't want scrollbars.
                left, top, tmp;

            // calculate position based on gravity
            switch (gravity) {
                case 'e':
                    left = - width - distance;
                    top = - (height / 2);
                    if(pos.left + left < 0) left = distance;
                    if((tmp = pos.top + top) < 0) top -= tmp;
                    //   if((tmp = pos.top + top + height) > clientHeight) top -= tmp - clientHeight;
                    break;
                case 'w':
                    left = distance;
                    top = - (height / 2);
                    if (pos.left + left + width > clientWidth) left = - width - distance;
                    if ((tmp = pos.top + top) < 0) top -= tmp;
                    //    if ((tmp = pos.top + top + height) > clientHeight) top -= tmp - clientHeight;
                    break;
                case 'n':
                    left = - (width / 2) - 5; // - 5 is an approximation of the mouse's height.
                    top = distance;
                    //  if (pos.top + top + height > clientHeight) top = - height - distance;
                    if ((tmp = pos.left + left) < 0) left -= tmp;
                    if ((tmp = pos.left + left + width) > clientWidth) left -= tmp - clientWidth;
                    break;
                case 's':
                    left = - (width / 2);
                    top = - height - distance;
                    if (pos.top + top < 0) top = distance;
                    if ((tmp = pos.left + left) < 0) left -= tmp;
                    if ((tmp = pos.left + left + width) > clientWidth) left -= tmp - clientWidth;
                    break;
                case 'center':
                    left = - (width / 2);
                    top = - (height / 2);
                    break;
                default:
                    left = 0;
                    top = 0;
                    break;
            }

            return { 'left': left, 'top': top };
        };

        /*
     Positions the tooltip in the correct place, as given by the position() function.
     */
        var positionTooltip = function () {
            nv.dom.read(function() {
                const pos = position(),
                    gravityOffset = calcGravityOffset(pos),
                    left = pos.left + gravityOffset.left,
                    top = pos.top + gravityOffset.top;

                // delay hiding a bit to avoid flickering
                if (hidden) {
                    tooltip
                        .interrupt()
                        .transition()
                        .delay(hideDelay)
                        .duration(0)
                        .style('opacity', 0);
                } else {
                    if (tooltip) {
                        // using tooltip.style('transform') returns values un-usable for tween
                        const old_translate = 'translate(' + lastPosition.left + 'px, ' + lastPosition.top + 'px)';
                        const new_translate = 'translate(' + Math.round(left) + 'px, ' + Math.round(top) + 'px)';
                        const translateInterpolator = d3.interpolateString(old_translate, new_translate);
                        const is_hidden = parseFloat(tooltip.style.opacity) < 0.1;

                        const t = d3.transition()
                            .duration(is_hidden ? 0 : duration)
                            .ease(d3.easeLinear);

                        tooltip
                            .interrupt() // cancel running transitions
                            .transition(t)
                            // using tween since some versions of d3 can't auto-tween a translate on a div
                            .styleTween('transform', function () {
                                return translateInterpolator;
                            }, 'important')
                            // Safari has its own `-webkit-transform` and does not support `transform`
                            .styleTween('-webkit-transform', function () {
                                return translateInterpolator;
                            })
                            .style('-ms-transform', new_translate)
                            .style('opacity', 1);
                    }
                }

                lastPosition.left = left;
                lastPosition.top = top;
            });
        };


        // Creates new tooltip container, or uses existing one on DOM.
        function initTooltip() {
            if (!tooltip || !tooltip.node()) {
                // Create new tooltip div if it doesn't exist on DOM.

                var data = [1];
                tooltip = d3.select(document.body).selectAll('#'+id).data(data);

                tooltip.enter().append('div')
                    .attr("class", "nvtooltip " + (classes ? classes : "xy-tooltip"))
                    .attr("id", id)
                    .style("top", 0).style("left", 0)
                    .style('opacity', 0)
                    .style('position', 'absolute')
                    .selectAll("div, table, td, tr").classed(nvPointerEventsClass, true)
                    .classed(nvPointerEventsClass, true);

                tooltip.exit().remove()
            }
        }

        // Draw the tooltip onto the DOM.
        function nvtooltip() {
            if (!enabled) return;
            if (!dataSeriesExists(data)) return;

            nv.dom.write(function () {
                initTooltip();
                // Generate data and set it into tooltip.
                // Bonus - If you override contentGenerator and return false, you can use something like
                //         Angular, React or Knockout to bind the data for your tooltip directly to the DOM.
                var newContent = contentGenerator(data, tooltip.node());
                if (newContent && tooltip.node()) {
                    tooltip.node().innerHTML = newContent;
                }

                positionTooltip();
            });

            return nvtooltip;
        }

        nvtooltip.nvPointerEventsClass = nvPointerEventsClass;
        nvtooltip.options = nv.utils.optionsFunc.bind(nvtooltip);

        nvtooltip._options = Object.create({}, {
            // simple read/write options
            duration: {get: function(){return duration;}, set: function(_){duration=_;}},
            gravity: {get: function(){return gravity;}, set: function(_){gravity=_;}},
            distance: {get: function(){return distance;}, set: function(_){distance=_;}},
            snapDistance: {get: function(){return snapDistance;}, set: function(_){snapDistance=_;}},
            classes: {get: function(){return classes;}, set: function(_){classes=_;}},
            enabled: {get: function(){return enabled;}, set: function(_){enabled=_;}},
            hideDelay: {get: function(){return hideDelay;}, set: function(_){hideDelay=_;
                    tDelay = d3.transition()
                        .delay(hideDelay)
                        .duration(0);
                }},
            contentGenerator: {get: function(){return contentGenerator;}, set: function(_){contentGenerator=_;}},
            valueFormatter: {get: function(){return valueFormatter;}, set: function(_){valueFormatter=_;}},
            headerFormatter: {get: function(){return headerFormatter;}, set: function(_){headerFormatter=_;}},
            keyFormatter: {get: function(){return keyFormatter;}, set: function(_){keyFormatter=_;}},
            headerEnabled: {get: function(){return headerEnabled;}, set: function(_){headerEnabled=_;}},
            position: {get: function(){return position;}, set: function(_){position=_;}},

            // Deprecated options
            chartContainer: {get: function(){return document.body;}, set: function(_){
                    // deprecated after 1.8.3
                    nv.deprecated('chartContainer', 'feature removed after 1.8.3');
                }},
            fixedTop: {get: function(){return null;}, set: function(_){
                    // deprecated after 1.8.1
                    nv.deprecated('fixedTop', 'feature removed after 1.8.1');
                }},
            offset: {get: function(){return {left: 0, top: 0};}, set: function(_){
                    // deprecated after 1.8.1
                    nv.deprecated('offset', 'use chart.tooltip.distance() instead');
                }},

            // options with extra logic
            hidden: {get: function(){return hidden;}, set: function(_){
                    if (hidden != _) {
                        hidden = !!_;
                        nvtooltip();
                    }
                }},
            data: {get: function(){return data;}, set: function(_){
                    // if showing a single data point, adjust data format with that
                    if (_.point) {
                        _.value = _.point.x;
                        _.series = _.series || {};
                        _.series.value = _.point.y;
                        _.series.color = _.point.color || _.series.color;
                    }
                    data = _;
                }},

            // read only properties
            node: {get: function(){return tooltip.node();}, set: function(_){}},
            id: {get: function(){return id;}, set: function(_){}}
        });

        nv.utils.initOptions(nvtooltip);
        return nvtooltip;
    };


    /*
Gets the browser window size

Returns object with height and width properties
 */
    nv.utils.windowSize = function() {
        // Sane defaults
        var size = {width: 640, height: 480};

        // Most recent browsers use
        if (window.innerWidth && window.innerHeight) {
            size.width = window.innerWidth;
            size.height = window.innerHeight;
            return (size);
        }

        // IE can use depending on mode it is in
        if (document.compatMode=='CSS1Compat' &&
            document.documentElement &&
            document.documentElement.offsetWidth ) {

            size.width = document.documentElement.offsetWidth;
            size.height = document.documentElement.offsetHeight;
            return (size);
        }

        // Earlier IE uses Doc.body
        if (document.body && document.body.offsetWidth) {
            size.width = document.body.offsetWidth;
            size.height = document.body.offsetHeight;
            return (size);
        }

        return (size);
    };


    /* handle dumb browser quirks...  isinstance breaks if you use frames
typeof returns 'object' for null, NaN is a number, etc.
 */
    nv.utils.isArray = Array.isArray;
    nv.utils.isObject = function(a) {
        return a !== null && typeof a === 'object';
    };
    nv.utils.isFunction = function(a) {
        return typeof a === 'function';
    };
    nv.utils.isDate = function(a) {
        return toString.call(a) === '[object Date]';
    };
    nv.utils.isNumber = function(a) {
        return !isNaN(a) && typeof a === 'number';
    };


    /*
Binds callback function to run when window is resized
 */
    nv.utils.windowResize = function(handler) {
        if (window.addEventListener) {
            window.addEventListener('resize', handler);
        } else {
            nv.log("ERROR: Failed to bind to window.resize with: ", handler);
        }
        // return object with clear function to remove the single added callback.
        return {
            callback: handler,
            clear: function() {
                window.removeEventListener('resize', handler);
            }
        }
    };


    /*
Backwards compatible way to implement more d3-like coloring of graphs.
Can take in nothing, an array, or a function/scale
To use a normal scale, get the range and pass that because we must be able
to take two arguments and use the index to keep backward compatibility
*/
    nv.utils.getColor = function(color) {
        //if you pass in nothing, get default colors back
        if (color === undefined || (nv.utils.isArray(color) && color.length===0)) {
            return nv.utils.defaultColor();

            //if passed an array, turn it into a color scale
        } else if(nv.utils.isArray(color)) {
            var domainArray = new Array();
            //console.log("min:"+d3.min(color)+" "+color[0]);
            if(d3.min(color)===color[0]){
                domainArray.push(0);
                for(var i=1;i<color.length-1;i++){
                    domainArray.push(i);
                }
                domainArray.push(color.length-1);
            }
            else{
                domainArray.push(color.length-1);
                for(var i=color.length-2;i>0;i--){
                    domainArray.push(i);
                }
                domainArray.push(0);

            }
//        var color_scale = d3.scaleQuantile().domain(domainArray).range(color);
            var color_scale = d3.scaleOrdinal().range(color);
            return function(d, i) {
                var key = i === undefined ? d : i;
                return d.color || color_scale(key);
            };

            //if passed a function or scale, return it, or whatever it may be
            //external libs, such as angularjs-nvd3-directives use this
        } else {
            //can't really help it if someone passes rubbish as color
            //   console.log("rubbish color ");
            return color;
        }
    };


    /*
Default color chooser uses a color scale of 20 colors from D3
 https://github.com/mbostock/d3/wiki/Ordinal-Scales#categorical-colors
 */
    nv.utils.defaultColor = function() {
        // get range of the scale so we'll turn it into our own function.
        return nv.utils.getColor(d3.scaleOrdinal(d3.schemeSet3).range());
    };


    /*
Returns a color function that takes the result of 'getKey' for each series and
looks for a corresponding color from the dictionary
*/
    nv.utils.customTheme = function(dictionary, getKey, defaultColors) {
        // use default series.key if getKey is undefined
        getKey = getKey || function(series) { return series.key };
        defaultColors = defaultColors || d3.scaleOrdinal(d3.schemeAccent).range();

        // start at end of default color list and walk back to index 0
        var defIndex = defaultColors.length;

        return function(series, index) {
            var key = getKey(series);
            if (nv.utils.isFunction(dictionary[key])) {
                return dictionary[key]();
            } else if (dictionary[key] !== undefined) {
                return dictionary[key];
            } else {
                // no match in dictionary, use a default color
                if (!defIndex) {
                    // used all the default colors, start over
                    defIndex = defaultColors.length;
                }
                defIndex = defIndex - 1;
                return defaultColors[defIndex];
            }
        };
    };


    /*
From the PJAX example on d3js.org, while this is not really directly needed
it's a very cool method for doing pjax, I may expand upon it a little bit,
open to suggestions on anything that may be useful
*/
    nv.utils.pjax = function(links, content) {

        var load = function(href) {
            d3.html(href, function(fragment) {
                var target = d3.select(content).node();
                target.parentNode.replaceChild(
                    d3.select(fragment).select(content).node(),
                    target);
                nv.utils.pjax(links, content);
            });
        };

        d3.selectAll(links).on("click", function(event) {
            history.pushState(this.href, this.textContent, this.href);
            load(this.href);
            event.preventDefault();
        });

        d3.select(window).on("popstate", function(event) {
            if (event.state) {
                load(event.state);
            }
        });
    };


    /*
For when we want to approximate the width in pixels for an SVG:text element.
Most common instance is when the element is in a display:none; container.
Forumla is : text.length * font-size * constant_factor
*/
    nv.utils.calcApproxTextWidth = function (svgTextElem) {
        if (nv.utils.isFunction(svgTextElem.style) && nv.utils.isFunction(svgTextElem.text)) {
            var fontSize = parseInt(svgTextElem.style("font-size").replace("px",""), 10);
            var textLength = svgTextElem.text().length;
            return nv.utils.NaNtoZero(textLength * fontSize * 0.5);
        }
        return 0;
    };


    /*
Numbers that are undefined, null or NaN, convert them to zeros.
*/
    nv.utils.NaNtoZero = function(n) {
        if (!nv.utils.isNumber(n)
            || isNaN(n)
            || n === null
            || n === Infinity
            || n === -Infinity) {

            return 0;
        }
        return n;
    };

    /*
Add a way to watch for d3 transition ends to d3
*/
    d3.selection.prototype.watchTransition = function(renderWatch){
        var args = [this].concat([].slice.call(arguments, 1));
        return renderWatch.transition.apply(renderWatch, args);
    };


    /*
Helper object to watch when d3 has rendered something
*/
    nv.utils.renderWatch = function(dispatch, duration) {
        if (!(this instanceof nv.utils.renderWatch)) {
            return new nv.utils.renderWatch(dispatch, duration);
        }

        var _duration = duration !== undefined ? duration : 250;
        var renderStack = [];
        var self = this;

        this.models = function(models) {
            models = [].slice.call(arguments, 0);
            models.forEach(function(model){
                model.__rendered = false;
                (function(m){
                    m.dispatch.on('renderEnd', function(arg){
                        m.__rendered = true;
                        self.renderEnd('model');
                    });
                })(model);

                if (renderStack.indexOf(model) < 0) {
                    renderStack.push(model);
                }
            });
            return this;
        };

        this.reset = function(duration) {
            if (duration !== undefined) {
                _duration = duration;
            }
            renderStack = [];
        };

        this.transition = function(selection, args, duration) {
            args = arguments.length > 1 ? [].slice.call(arguments, 1) : [];

            if (args.length > 1) {
                duration = args.pop();
            } else {
                duration = _duration !== undefined ? _duration : 250;
            }
            this.t = d3.transition()
                .duration(duration)
                .ease(d3.easeLinear);
            selection.__rendered = false;

            if (renderStack.indexOf(selection) < 0) {
                renderStack.push(selection);
            }

            if (duration === 0) {
                selection.__rendered = true;
                selection.delay = function() { return this; };
                selection.duration = function() { return this; };
                return selection;
            } else {
                if (selection.length === 0) {
                    selection.__rendered = true;
                } else if (selection.filter( function(d, i){ return (d === undefined) ? false : !d.length; } )) {//@todo
                    selection.__rendered = true;
                } else {
                    selection.__rendered = false;
                }

                var n = 0;
                return selection
                    .transition(this.t)
                    .each(function(){ ++n; })
                    .on('end', function(d, i) {
                        if (--n === 0) {
                            selection.__rendered = true;
                            self.renderEnd.apply(this, args);
                        }
                    });
            }
        };

        this.renderEnd = function() {
            if (renderStack.every( function(d){ return d.__rendered; } )) {
                renderStack.forEach( function(d){ d.__rendered = false; });
                dispatch.apply("renderEnd", this, arguments);
            }
        }

    };


    /*
Takes multiple objects and combines them into the first one (dst)
example:  nv.utils.deepExtend({a: 1}, {a: 2, b: 3}, {c: 4});
gives:  {a: 2, b: 3, c: 4}
*/
    nv.utils.deepExtend = function(dst){
        var sources = arguments.length > 1 ? [].slice.call(arguments, 1) : [];
        sources.forEach(function(source) {
            for (var key in source) {
                var isArray = nv.utils.isArray(dst[key]);
                var isObject = nv.utils.isObject(dst[key]);
                var srcObj = nv.utils.isObject(source[key]);

                if (isObject && !isArray && srcObj) {
                    nv.utils.deepExtend(dst[key], source[key]);
                } else {
                    dst[key] = source[key];
                }
            }
        });
    };


    /*
state utility object, used to track d3 states in the models
*/
    nv.utils.state = function(){
        if (!(this instanceof nv.utils.state)) {
            return new nv.utils.state();
        }
        var state = {};
        var _self = this;
        var _setState = function(){};
        var _getState = function(){ return {}; };
        var init = null;
        var changed = null;

        this.dispatch = d3.dispatch('change', 'set');

        this.dispatch.on('set', function(state){
            _setState(state, true);
        });

        this.getter = function(fn){
            _getState = fn;
            return this;
        };

        this.setter = function(fn, callback) {
            if (!callback) {
                callback = function(){};
            }
            _setState = function(state, update){
                fn(state);
                if (update) {
                    callback();
                }
            };
            return this;
        };

        this.init = function(state){
            init = init || {};
            nv.utils.deepExtend(init, state);
        };

        var _set = function(){
            var settings = _getState();

            if (JSON.stringify(settings) === JSON.stringify(state)) {
                return false;
            }

            for (var key in settings) {
                if (state[key] === undefined) {
                    state[key] = {};
                }
                state[key] = settings[key];
                changed = true;
            }
            return true;
        };

        this.update = function(){
            if (init) {
                _setState(init, false);
                init = null;
            }
            if (_set.call(this)) {
                this.dispatch.call('change', this, state);
            }
        };

    };


    /*
Snippet of code you can insert into each nv.models.* to give you the ability to
do things like:
chart.options({
  showXAxis: true,
  tooltips: true
});

To enable in the chart:
chart.options = nv.utils.optionsFunc.bind(chart);
*/
    nv.utils.optionsFunc = function(args) {
        if (args) {
            new Map(args).each(((key,value) => {
                if (nv.utils.isFunction(this[key])) {
                    this[key](value);
                }
            }).bind(this));
        }
        return this;
    };


    /*
numTicks:  requested number of ticks
data:  the chart data

returns the number of ticks to actually use on X axis, based on chart data
to avoid duplicate ticks with the same value
*/
    nv.utils.calcTicksX = function(numTicks, data) {
        // find max number of values from all data streams
        var numValues = 1;
        var i = 0;
        for (i; i < data.length; i += 1) {
            var stream_len = data[i] && data[i].values ? data[i].values.length : 0;
            numValues = stream_len > numValues ? stream_len : numValues;
        }
        nv.log("Requested number of ticks: ", numTicks);
        nv.log("Calculated max values to be: ", numValues);
        // make sure we don't have more ticks than values to avoid duplicates
        numTicks = numTicks > numValues ? numTicks = numValues - 1 : numTicks;
        // make sure we have at least one tick
        numTicks = numTicks < 1 ? 1 : numTicks;
        // make sure it's an integer
        numTicks = Math.floor(numTicks);
        nv.log("Calculating tick count as: ", numTicks);
        return numTicks;
    };


    /*
 returns number of ticks to actually use on Y axis, based on chart data
 */
    nv.utils.calcTicksY = function(numTicks, data, getY) {
        if (getY) {
            var numValues = 1;
            for (var i=0; i < data.length; i += 1) {
                var values = data[i] && data[i].values ? data[i].values : [];
                var maxValue;
                for (var j=0; j < values.length; j += 1) {
                    maxValue = values[j] && getY(values[j]) ? getY(values[j]): 0;
                    numValues = maxValue > numValues ? maxValue : numValues;
                }
            }
            nv.log("Requested number of ticks: ", numTicks);
            nv.log("Calculated max values to be: ", numValues);
            // make sure we don't have more ticks than values to avoid duplicates
            numTicks = numTicks > numValues ? numValues - 1 : numTicks;
            // make sure we have at least one tick
            numTicks = numTicks < 1 ? 1 : numTicks;
            // make sure it's an integer
            numTicks = Math.floor(numTicks);
            nv.log("Calculating tick count as: ", numTicks);
            return numTicks;
        } else {
            return nv.utils.calcTicksX(numTicks, data);
        }
    };


    /*
Add a particular option from an options object onto chart
Options exposed on a chart are a getter/setter function that returns chart
on set to mimic typical d3 option chaining, e.g. svg.option1('a').option2('b');

option objects should be generated via Object.create() to provide
the option of manipulating data via get/set functions.
*/
    nv.utils.initOption = function(chart, name) {
        // if it's a call option, just call it directly, otherwise do get/set
        if (chart._calls && chart._calls[name]) {
            chart[name] = chart._calls[name];
        } else {
            chart[name] = function (_) {
                if (!arguments.length) return chart._options[name];
                chart._overrides[name] = true;
                chart._options[name] = _;
                return chart;
            };
            // calling the option as _option will ignore if set by option already
            // so nvd3 can set options internally but the stop if set manually
            chart['_' + name] = function(_) {
                if (!arguments.length) return chart._options[name];
                if (!chart._overrides[name]) {
                    chart._options[name] = _;
                }
                return chart;
            }
        }
    };


    /*
Add all options in an options object to the chart
*/
    nv.utils.initOptions = function(chart) {
        chart._overrides = chart._overrides || {};
        var ops = Object.getOwnPropertyNames(chart._options || {});
        var calls = Object.getOwnPropertyNames(chart._calls || {});
        ops = ops.concat(calls);
        for (var i in ops) {
            nv.utils.initOption(chart, ops[i]);
        }
    };


    /*
Inherit options from a D3 object
d3_rebind makes calling the function on target actually call it on source
Also use _d3options so we can track what we inherit for documentation and chained inheritance
*/
    nv.utils.inheritOptionsD3 = function(target, d3_source, oplist) {
        target._d3options = oplist.concat(target._d3options || []);
        // Find unique d3 options (string) and update d3options
        target._d3options = (target._d3options || []).filter(function(item, i, ar){ return ar.indexOf(item) === i; });
        oplist.unshift(d3_source);
        oplist.unshift(target);
        nv.utils.rebind.apply(this, oplist);
    };


    /*
Remove duplicates from an array
*/
    nv.utils.arrayUnique = function(a) {
        return a.sort().filter(function(item, pos) {
            return !pos || item != a[pos - 1];
        });
    };


    /*
Keeps a list of custom symbols to draw from in addition to d3.symbol
Necessary since d3 doesn't let you extend its list -_-
Add new symbols by doing nv.utils.symbols.set('name', function(size){...});
*/
    nv.utils.symbolMap = new Map();

    nv.utils.typeMap =  new Map()
        .set('circle', d3.symbolCircle)
        .set("cross", d3.symbolCross)
        .set("diamond", d3.symbolDiamond)
        .set("square", d3.symbolSquare)
        .set("star", d3.symbolStar)
        .set("triangle-up", d3.symbolTriangle)
        .set("wye", d3.symbolWye);


    /*
Replaces d3.symbol so that we can look both there and our own map
 */
    nv.utils.symbol = function() {
        var type,
            size = 64;
        function symbol(d,i) {
            var t = type.call(this,d,i);
            var s = size.call(this,d,i);
            // TODO: Not sure if symbol('circle') would return a d3.symbolCircle. In v4 symbols are enums and not strings

            if (nv.utils.symbolMap.get(t) === undefined) {
                return d3.symbol().type(nv.utils.typeMap.get(t)).size(s)();
            } else {
                return nv.utils.symbolMap.get(t)(s);
            }
        }
        symbol.type = function(_) {
            if (!arguments.length) return type;
            type = typeof _ === "function" ? _ : function(){return _;};
            return symbol;
        };
        symbol.size = function(_) {
            if (!arguments.length) return size;
            size = typeof _ === "function" ? _ : function(){return _;};
            return symbol;
        };
        return symbol;
    };


    /*
Inherit option getter/setter functions from source to target
d3_rebind makes calling the function on target actually call it on source
Also track via _inherited and _d3options so we can track what we inherit
for documentation generation purposes and chained inheritance
*/
    nv.utils.inheritOptions = function(target, source) {
        // inherit all the things
        var ops = Object.getOwnPropertyNames(source._options || {});
        var calls = Object.getOwnPropertyNames(source._calls || {});
        var inherited = source._inherited || [];
        var d3ops = source._d3options || [];
        var args = ops.concat(calls).concat(inherited).concat(d3ops);
        args.unshift(source);
        args.unshift(target);
        nv.utils.rebind.apply(this, args);
        // pass along the lists to keep track of them, don't allow duplicates
        target._inherited = nv.utils.arrayUnique(ops.concat(calls).concat(inherited).concat(ops).concat(target._inherited || []));
        target._d3options = nv.utils.arrayUnique(d3ops.concat(target._d3options || []));
    };

    nv.utils.rebind = function(target, source) {
        var i = 1,
            n = arguments.length,
            method;
        while (++i < n) target[method = arguments[i]] = nv.utils.d3_rebind(target, source, source[method]);
        return target;
    };

    nv.utils.d3_rebind = function(target, source, method) {
        return function() {
            var value = method.apply(source, arguments);
            return value === source ? target : value;
        };
    }
    /*
Runs common initialize code on the svg before the chart builds
*/
    nv.utils.initSVG = function(svg) {
        svg.classed('nvd3-svg', true);
    };


    /*
Sanitize and provide default for the container height.
*/
    nv.utils.sanitizeHeight = function(height, container) {
        return (height || parseInt(container.style('height'), 10) || 400);
    };


    /*
Sanitize and provide default for the container width.
*/
    nv.utils.sanitizeWidth = function(width, container) {
        return (width || parseInt(container.style('width'), 10) || 960);
    };


    /*
Calculate the available height for a chart.
*/
    nv.utils.availableHeight = function(height, container, margin) {
        return Math.max(0,nv.utils.sanitizeHeight(height, container) - margin.top - margin.bottom);
    };

    /*
Calculate the available width for a chart.
*/
    nv.utils.availableWidth = function(width, container, margin) {
        return Math.max(0,nv.utils.sanitizeWidth(width, container) - margin.left - margin.right);
    };

    /*
Clear any rendered chart components and display a chart's 'noData' message
*/
    nv.utils.noData = function(chart, container) {
        var opt = chart.options(),
            margin = opt.margin(),
            noData = opt.noData(),
            data = (noData == null) ? ["No Data Available."] : [noData],
            height = nv.utils.availableHeight(null, container, margin),
            width = nv.utils.availableWidth(null, container, margin),
            x = margin.left + width/2,
            y = margin.top + height/2;

        //Remove any previously created chart components
        container.selectAll('g').remove();

        var noDataText = container.selectAll('.nv-noData').data(data);

        noDataText.enter().append('text')
            .attr('class', 'nvd3 nv-noData')
            .attr('dy', '-.7em')
            .style('text-anchor', 'middle');

        noDataText
            .attr('x', x)
            .attr('y', y)
            .text(function(t){ return t; });
    };

    /*
 Wrap long labels.
 */
    nv.utils.wrapTicks = function (text, width) {
        text.each(function() {
            var text = d3.select(this),
                words = text.text().split(/\s+/).reverse(),
                word,
                line = [],
                lineNumber = 0,
                lineHeight = 1.1,
                y = text.attr("y"),
                dy = parseFloat(text.attr("dy")),
                tspan = text.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");
            while (word = words.pop()) {
                line.push(word);
                tspan.text(line.join(" "));
                if (tspan.node().getComputedTextLength() > width) {
                    line.pop();
                    tspan.text(line.join(" "));
                    line = [word];
                    tspan = text.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
                }
            }
        });
    };

    /*
Check equality of 2 array
*/
    nv.utils.arrayEquals = function (array1, array2) {
        if (array1 === array2)
            return true;

        if (!array1 || !array2)
            return false;

        // compare lengths - can save a lot of time
        if (array1.length != array2.length)
            return false;

        for (var i = 0,
                 l = array1.length; i < l; i++) {
            // Check if we have nested arrays
            if (array1[i] instanceof Array && array2[i] instanceof Array) {
                // recurse into the nested arrays
                if (!nv.arrayEquals(array1[i], array2[i]))
                    return false;
            } else if (array1[i] != array2[i]) {
                // Warning - two different object instances will never be equal: {x:20} != {x:20}
                return false;
            }
        }
        return true;
    };

    /*
 Check if a point within an arc
 */
    nv.utils.pointIsInArc = function(pt, ptData, d3Arc) {
        // Center of the arc is assumed to be 0,0
        // (pt.x, pt.y) are assumed to be relative to the center
        var r1 = d3Arc.innerRadius()(ptData), // Note: Using the innerRadius
            r2 = d3Arc.outerRadius()(ptData),
            theta1 = d3Arc.startAngle()(ptData),
            theta2 = d3Arc.endAngle()(ptData);

        var dist = pt.x * pt.x + pt.y * pt.y,
            angle = Math.atan2(pt.x, -pt.y); // Note: different coordinate system.

        angle = (angle < 0) ? (angle + Math.PI * 2) : angle;

        return (r1 * r1 <= dist) && (dist <= r2 * r2) &&
            (theta1 <= angle) && (angle <= theta2);
    };

    nv.models.axis = function(axis, orientation) {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var scale = d3.scaleOrdinal();

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 75 //only used for tickLabel currently
            , height = 60 //only used for tickLabel currently
            , axisLabelText = null
            , showMaxMin = true //TODO: showMaxMin should be disabled on all ordinal scaled axes
            , rotateLabels = 0
            , rotateYLabel = true
            , staggerLabels = false
            , isOrdinal = false
            , ticks = null
            , axisLabelDistance = 0
            , fontSize = undefined
            , duration = 250
            , dispatch = d3.dispatch('renderEnd')
            , tickFormatMaxMin
        ;
        axis
            .tickFormat((d) => { return d })
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var scale0;
        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var container = d3.select(this);
                nv.utils.initSVG(container);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-axis').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-axis');
                wrapEnter = wrapEnter.merge(wrap);
                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g')
                gEnter = wrapEnter.select('g');
                if (ticks !== null)
                    axis.ticks(ticks);
                else if (orientation === 'top' || orientation === 'bottom')
                    axis.ticks(Math.abs(scale.range()[1] - scale.range()[0]) / 100);

                //TODO: consider calculating width/height based on whether or not label is added, for reference in charts using this component
                gEnter.watchTransition(renderWatch, 'axis').call(axis);

                scale0 = scale0 || axis.scale();

                var fmt = axis.tickFormat();
                if (fmt == null) {
                    fmt = scale0.tickFormat();
                }
                gEnter.attr('fill', '');
                gEnter.attr('font-size', fontSize);
                gEnter.attr('font-family', '');
                var axisLabel = gEnter.selectAll('text.nv-axislabel')
                    .data([axisLabelText || null]);
                axisLabel.exit().remove();

                //only skip when fontSize is undefined so it can be cleared with a null or blank string
                if (fontSize !== undefined) {
                    gEnter.selectAll('g').select("text").style('font-size', fontSize);
                }

                var axislabelAppend;
                var xLabelMargin;
                var axisMaxMin;
                var axisMax;
                var w;
                switch (orientation) {
                    case 'top':
                        xLabelMargin = axisLabelDistance + 36;
                        var axislabelAppend=axisLabel.enter().append('text').attr('class', 'nv-axislabel');
                        axislabelAppend = container.selectAll('g.nv-wrap.nv-axis').selectAll('text.nv-axislabel');
                        w = 0;
                        if (scale.range().length === 1) {
                            w = isOrdinal ? scale.range()[0] * 2 + scale.bandwidth() : 0;
                        } else if (scale.range().length === 2) {
                            w = isOrdinal ? scale.range()[0] + scale.range()[1] + scale.bandwidth() : scale.range()[1];
                        } else if ( scale.range().length > 2){
                            w = scale.range()[scale.range().length-1]+(scale.range()[1]-scale.range()[0]);
                        };
                        axislabelAppend
                            .attr('text-anchor', 'middle')
                            .attr('y', -xLabelMargin)
                            .attr('x', w/2);
                        if (showMaxMin) {
                            axisMaxMin = gEnter
                                .enter()
                                .append("g")
                                .attr("class", (d, i) =>
                                    ["nv-axisMaxMin", "nv-axisMaxMin-x", i === 0 ? "nv-axisMin-x" : "nv-axisMax-x"].join(" ")
                                )
                                .merge(gEnter);

                            axisMaxMin = container.selectAll("g.nv-wrap.nv-axis").selectAll("g.nv-axisMaxMin")
                                .data(scale.domain())
                                .join("g")
                                .attr("class", (d, i) =>
                                    ["nv-axisMaxMin", "nv-axisMaxMin-x", i === 0 ? "nv-axisMin-x" : "nv-axisMax-x"].join(" ")
                                );
                            var textElem = axisMaxMin.select('text');
                            if(textElem.empty()) {
                                axisMaxMin.append('text');
                            }
                            axisMaxMin.exit().remove();
                            axisMaxMin
                                .attr('transform', function(d,i) {
                                    return 'translate(' + nv.utils.NaNtoZero(scale(d)) + ',0)'
                                })
                                .select('text')
                                .attr('dy', '-0.5em')
                                .attr('y', -axis.tickPadding())
                                .attr('text-anchor', 'middle')
                                .text(function(d,i) {
                                    var formatter = tickFormatMaxMin || fmt;
                                    var v = formatter(d);
                                    return ('' + v).match('NaN') ? '' : v;
                                });
                            axisMaxMin.watchTransition(renderWatch, 'min-max top')
                                .attr('transform', function(d,i) {
                                    return 'translate(' + nv.utils.NaNtoZero(scale.range()[i]) + ',0)'
                                });
                        }
                        break;
                    case 'bottom':
                        xLabelMargin = axisLabelDistance + 36;
                        var maxTextWidth = 30;
                        var textHeight = 0;
                        var xTicks = gEnter.selectAll('g').select("text");
                        var rotateLabelsRule = '';
                        if (rotateLabels%360) {
                            //Reset transform on ticks so textHeight can be calculated correctly
                            xTicks.attr('transform', '');
                            //Calculate the longest xTick width
                            xTicks.each(function(d,i){
                                var box = this.getBoundingClientRect();
                                var width = box.width;
                                textHeight = box.height;
                                if(width > maxTextWidth) maxTextWidth = width;
                            });
                            rotateLabelsRule = 'rotate(' + rotateLabels + ' 0,' + (textHeight/2 + axis.tickPadding()) + ')';
                            //Convert to radians before calculating sin. Add 30 to margin for healthy padding.
                            var sin = Math.abs(Math.sin(rotateLabels*Math.PI/180));
                            xLabelMargin = (sin ? sin*maxTextWidth : maxTextWidth)+30;
                            //Rotate all xTicks
                            xTicks
                                .attr('transform', rotateLabelsRule)
                                .style('text-anchor', rotateLabels%360 > 0 ? 'start' : 'end');
                        } else {
                            if (staggerLabels) {
                                xTicks
                                    .attr('transform', function(d,i) {
                                        return 'translate(0,' + (i % 2 == 0 ? '0' : '12') + ')'
                                    });
                            } else {
                                xTicks.attr('transform', "translate(0,0)");
                            }
                        }
                        axislabelAppend=axisLabel.enter().append('text').attr('class', 'nv-axislabel');
                        axislabelAppend = container.selectAll('g.nv-wrap.nv-axis').selectAll('text.nv-axislabel');
                        w = 0;
                        if (scale.range().length === 1) {
                            w = isOrdinal ? scale.range()[0] * 2 + scale.bandwidth() : 0;
                        } else if (scale.range().length === 2) {
                            w = isOrdinal ? scale.range()[0] + scale.range()[1] + scale.bandwidth() : scale.range()[1];
                        } else if ( scale.range().length > 2){
                            w = scale.range()[scale.range().length-1]+(scale.range()[1]-scale.range()[0]);
                        };
                        axislabelAppend
                            .attr('text-anchor', 'middle')
                            .attr('y', xLabelMargin)
                            .attr('x', w/2);
                        if (showMaxMin) {
                            //if (showMaxMin && !isOrdinal) {
                            axisMaxMin = gEnter
                                .enter()
                                .append("g")
                                .attr("class", (d, i) =>
                                    ["nv-axisMaxMin", "nv-axisMaxMin-x", i === 0 ? "nv-axisMin-x" : "nv-axisMax-x"].join(" ")
                                )
                                .merge(gEnter);

                            axisMaxMin = container.selectAll("g.nv-wrap.nv-axis").selectAll("g.nv-axisMaxMin")
                                .data([scale.domain()[0], scale.domain()[scale.domain().length - 1]])
                                .join("g")
                                .attr("class", (d, i) =>
                                    ["nv-axisMaxMin", "nv-axisMaxMin-x", i === 0 ? "nv-axisMin-x" : "nv-axisMax-x"].join(" ")
                                );
                            var textElem = axisMaxMin.select('text');
                            if(textElem.empty()) {
                                axisMaxMin.append('text');
                            }
                            axisMaxMin.exit().remove();
                            axisMaxMin
                                .attr('transform', function(d,i) {
                                    return 'translate(' + nv.utils.NaNtoZero((scale(d) + (isOrdinal ? scale.bandwidth() / 2 : 0))) + ',0)'
                                })
                                .select('text')
                                .attr('dy', '.71em')
                                .attr('y', axis.tickPadding())
                                .attr('transform', rotateLabelsRule)
                                .style('text-anchor', rotateLabels ? (rotateLabels%360 > 0 ? 'start' : 'end') : 'middle')
                                .text(function(d,i) {
                                    var formatter = tickFormatMaxMin || fmt;
                                    var v = formatter(d);
                                    return ('' + v).match('NaN') ? '' : v;
                                });
                            axisMaxMin.watchTransition(renderWatch, 'min-max bottom')
                                .attr('transform', function(d,i) {
                                    return 'translate(' + nv.utils.NaNtoZero((scale(d) + (isOrdinal ? scale.bandwidth() / 2 : 0))) + ',0)'
                                });
                        }

                        break;
                    case 'right':
                        axislabelAppend=axisLabel.enter().append('text').attr('class', 'nv-axislabel');
                        axislabelAppend = container.selectAll('g.nv-wrap.nv-axis').selectAll('text.nv-axislabel');
                        axislabelAppend
                            .style('text-anchor', rotateYLabel ? 'middle' : 'begin')
                            .attr('transform', rotateYLabel ? 'rotate(90)' : '')
                            .attr('y', rotateYLabel ? (-Math.max(margin.right, width) + 12 - (axisLabelDistance || 0)) : -10) //TODO: consider calculating this based on largest tick width... OR at least expose this on chart
                            .attr('x', rotateYLabel ? (d3.max(scale.range()) / 2) : axis.tickPadding());
                        if (showMaxMin) {
                            axisMaxMin = gEnter
                                .enter()
                                .append("g")
                                .attr("class", (d, i) =>
                                    ["nv-axisMaxMin", "nv-axisMaxMin-y", i === 0 ? "nv-axisMin-y" : "nv-axisMax-y"].join(" ")
                                )
                                .merge(gEnter);

                            axisMaxMin = container.selectAll("g.nv-wrap.nv-axis").selectAll("g.nv-axisMaxMin")
                                .data(scale.domain())
                                .join("g")
                                .attr("class", (d, i) =>
                                    ["nv-axisMaxMin", "nv-axisMaxMin-y", i === 0 ? "nv-axisMin-y" : "nv-axisMax-y"].join(" ")
                                );
                            var textElem = axisMaxMin.select('text');
                            if(textElem.empty()) {
                                axisMaxMin.append('text').style('opacity', 0);
                            }
                            axisMaxMin.exit().remove();
                            axisMaxMin
                                .attr('transform', function(d,i) {
                                    return 'translate(0,' + nv.utils.NaNtoZero(scale(d)) + ')'
                                })
                                .select('text')
                                .attr('dy', '.32em')
                                .attr('y', 0)
                                .attr('x', axis.tickPadding())
                                .style('text-anchor', 'start')
                                .text(function(d, i) {
                                    var formatter = tickFormatMaxMin || fmt;
                                    var v = formatter(d);
                                    return ('' + v).match('NaN') ? '' : v;
                                });
                            axisMaxMin.watchTransition(renderWatch, 'min-max right')
                                .attr('transform', function(d,i) {
                                    return 'translate(0,' + nv.utils.NaNtoZero(scale.range()[i]) + ')'
                                })
                                .select('text')
                                .style('opacity', 1);
                        }
                        break;
                    case 'left':
                        /*
                     //For dynamically placing the label. Can be used with dynamically-sized chart axis margins
                     var yTicks = g.selectAll('g').select("text");
                     yTicks.each(function(d,i){
                     var labelPadding = this.getBoundingClientRect().width + axis.tickPadding() + 16;
                     if(labelPadding > width) width = labelPadding;
                     });
                     */
                        axislabelAppend=axisLabel.enter().append('text').attr('class', 'nv-axislabel');
                        axislabelAppend = container.selectAll('g.nv-wrap.nv-axis').selectAll('text.nv-axislabel');
                        axislabelAppend
                            .style('text-anchor', rotateYLabel ? 'middle' : 'end')
                            .attr('transform', rotateYLabel ? 'rotate(-90)' : '')
                            .attr('y', rotateYLabel ? (-Math.max(margin.left, width) + 25 - (axisLabelDistance || 0)) : -10)
                            .attr('x', rotateYLabel ? (-d3.max(scale.range()) / 2) : -axis.tickPadding());
                        if (showMaxMin) {
                            axisMaxMin = gEnter
                                .enter()
                                .append("g")
                                .attr("class", (d, i) =>
                                    ["nv-axisMaxMin", "nv-axisMaxMin-y", i === 0 ? "nv-axisMin-y" : "nv-axisMax-y"].join(" ")
                                )
                                .merge(gEnter);

                            axisMaxMin = container.selectAll("g.nv-wrap.nv-axis").selectAll("g.nv-axisMaxMin")
                                .data(scale.domain())
                                .join("g")
                                .attr("class", (d, i) =>
                                    ["nv-axisMaxMin", "nv-axisMaxMin-y", i === 0 ? "nv-axisMin-y" : "nv-axisMax-y"].join(" ")
                                );
                            var textElem = axisMaxMin.select('text');
                            if(textElem.empty()) {
                                axisMaxMin.append('text').style('opacity', 0);
                            }
                            axisMaxMin.exit().remove();
                            axisMaxMin
                                .attr('transform', function(d,i) {
                                    return 'translate(0,' + nv.utils.NaNtoZero(scale0(d)) + ')'
                                })
                                .select('text')
                                .attr('dy', '.32em')
                                .attr('y', 0)
                                .attr('x', -axis.tickPadding())
                                .attr('text-anchor', 'end')
                                .text(function(d,i) {
                                    var formatter = tickFormatMaxMin || fmt;
                                    var v = formatter(d);
                                    return ('' + v).match('NaN') ? '' : v;
                                });
                            axisMaxMin.watchTransition(renderWatch, 'min-max right')
                                .attr('transform', function(d,i) {
                                    return 'translate(0,' + nv.utils.NaNtoZero(scale.range()[i]) + ')'
                                })
                                .select('text')
                                .style('opacity', 1);
                        }
                        break;
                }
                axislabelAppend.text(function(d) { return d });

                if (showMaxMin && (orientation === 'left' || orientation === 'right')) {
                    //check if max and min overlap other values, if so, hide the values that overlap
                    gEnter.selectAll('g') // the g's wrapping each tick
                        .each(function(d,i) {
                            d3.select(this).select('text').attr('opacity', 1);
                            if (scale(d) < scale.range()[1] + 10 || scale(d) > scale.range()[0] - 10) { // 10 is assuming text height is 16... if d is 0, leave it!
                                if (d > 1e-10 || d < -1e-10) // accounts for minor floating point errors... though could be problematic if the scale is EXTREMELY SMALL
                                    d3.select(this).attr('opacity', 0);

                                d3.select(this).select('text').attr('opacity', 0); // Don't remove the ZERO line!!
                            }
                        });

                    //if Max and Min = 0 only show min, Issue #281
                    if (scale.domain()[0] == scale.domain()[1] && scale.domain()[0] == 0) {
                        wrap.selectAll('g.nv-axisMaxMin').style('opacity', function (d, i) {
                            return !i ? 1 : 0
                        });
                    }
                }

                if (showMaxMin && (orientation === 'top' || orientation === 'bottom')) {
                    var maxMinRange = [];
                    axisMaxMin
                        .each(function(d,i) {
                            try {
                                if (i) // i== 1, max position
                                    maxMinRange.push(scale(d) - this.getBoundingClientRect().width - 4);  //assuming the max and min labels are as wide as the next tick (with an extra 4 pixels just in case)
                                else // i==0, min position
                                    maxMinRange.push(scale(d) + this.getBoundingClientRect().width + 4)
                            }catch (err) {
                                if (i) // i== 1, max position
                                    maxMinRange.push(scale(d) - 4);  //assuming the max and min labels are as wide as the next tick (with an extra 4 pixels just in case)
                                else // i==0, min position
                                    maxMinRange.push(scale(d) + 4);
                            }
                        });
                    // the g's wrapping each tick
                    gEnter.selectAll('g').each(function(d, i) {
                        if (scale(d) < maxMinRange[0] || scale(d) > maxMinRange[1]) {
                            if (d > 1e-10 || d < -1e-10) // accounts for minor floating point errors... though could be problematic if the scale is EXTREMELY SMALL
                                d3.select(this).remove();
                            else
                                d3.select(this).select('text').remove(); // Don't remove the ZERO line!!
                        }
                    });
                }

                //Highlight zero tick line
                gEnter.selectAll('.tick')
                    .filter(function (d) {
                        /*
                    The filter needs to return only ticks at or near zero.
                    Numbers like 0.00001 need to count as zero as well,
                    and the arithmetic trick below solves that.
                    */
                        return !parseFloat(Math.round(d * 100000) / 1000000) && (d !== undefined)
                    })
                    .classed('zero', true);

                gEnter.selectAll(".tick text")
                    .each(function(d) {
                        var tickText = d3.select(this);

                        // Check the width of each tick text
                        setTimeout(function() {
                            var textWidth = tickText.node().getComputedTextLength();
                            // Set a maximum width (e.g., 50 pixels)
                            var maxWidth = 120;

                            // If the width is greater than the maximum, trim the text
                            if (textWidth > maxWidth) {
                                var originalText = tickText.text();

                                // Trim the text and append ellipsis
                                var trimmedText = originalText.substring(0, 10) + "..."; // Adjust the substring length as needed
                                tickText.text(trimmedText);
                            }
                        }, 100);


                    });

                //store old scales for use in transitions on update
                scale0 = scale.copy();

            });

            renderWatch.renderEnd('axis immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.axis = axis;
        chart.dispatch = dispatch;

        chart.options = nv.utils.optionsFunc.bind(chart);
        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            axisLabelDistance: {get: function(){return axisLabelDistance;}, set: function(_){axisLabelDistance=_;}},
            staggerLabels:     {get: function(){return staggerLabels;}, set: function(_){staggerLabels=_;}},
            rotateLabels:      {get: function(){return rotateLabels;}, set: function(_){rotateLabels=_;}},
            rotateYLabel:      {get: function(){return rotateYLabel;}, set: function(_){rotateYLabel=_;}},
            showMaxMin:        {get: function(){return showMaxMin;}, set: function(_){showMaxMin=_;}},
            axisLabel:         {get: function(){return axisLabelText;}, set: function(_){axisLabelText=_;}},
            height:            {get: function(){return height;}, set: function(_){height=_;}},
            ticks:             {get: function(){return ticks;}, set: function(_){ticks=_;}},
            width:             {get: function(){return width;}, set: function(_){width=_;}},
            fontSize:          {get: function(){return fontSize;}, set: function(_){fontSize=_;}},
            tickFormatMaxMin:  {get: function(){return tickFormatMaxMin;}, set: function(_){tickFormatMaxMin=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top !== undefined    ? _.top    : margin.top;
                    margin.right  = _.right !== undefined  ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left !== undefined   ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration=_;
                    renderWatch.reset(duration);
                }},
            scale: {get: function(){return scale;}, set: function(_){
                    scale = _;
                    axis.scale(scale);
                    isOrdinal = typeof scale.rangeBands === 'function';
                    nv.utils.inheritOptionsD3(chart, scale, ['domain', 'range']);
                }}
        });

        nv.utils.initOptions(chart);
        nv.utils.inheritOptionsD3(chart, axis, ['tickValues', 'tickSubdivide', 'tickSizeInner', 'tickSizeOuter', 'tickPadding', 'tickFormat']);
        nv.utils.inheritOptionsD3(chart, scale, ['domain', 'range']);

        return chart;
    };
    nv.models.boxPlot = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0},
            width = 960,
            height = 500,
            id = Math.floor(Math.random() * 10000), // Create semi-unique ID in case user doesn't select one
            xScale = d3.scaleBand(),
            yScale = d3.scaleLinear(),
            getX  = function(d) { return d.label }, // Default data model selectors.
            getQ1 = function(d) { return d.values.Q1 },
            getQ2 = function(d) { return d.values.Q2 },
            getQ3 = function(d) { return d.values.Q3 },
            getWl = function(d) { return d.values.whisker_low },
            getWh = function(d) { return d.values.whisker_high },
            getColor = function(d) { return d.color },
            getOlItems  = function(d) { return d.values.outliers },
            getOlValue = function(d, i, j) { return d },
            getOlLabel = function(d, i, j) { return d },
            getOlColor = function(d, i, j) { return undefined },
            color = nv.utils.defaultColor(),
            container = null,
            xDomain, xRange,
            yDomain, yRange,
            dispatch = d3.dispatch('elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd'),
            duration = 250,
            maxBoxWidth = null;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var xScale0, yScale0;
        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                container = d3.select(this);
                nv.utils.initSVG(container);

                // Setup Scales
                xScale.domain(xDomain || data.map(function(d,i) { return getX(d,i); }))
                    .range(xRange || [0, availableWidth], 0.1);

                // if we know yDomain, no need to calculate
                var yData = []
                if (!yDomain) {
                    // (y-range is based on quartiles, whiskers and outliers)
                    var values = [], yMin, yMax;
                    data.forEach(function (d, i) {
                        var q1 = getQ1(d), q3 = getQ3(d), wl = getWl(d), wh = getWh(d);
                        var olItems = getOlItems(d);
                        if (olItems) {
                            olItems.forEach(function (e, i) {
                                values.push(getOlValue(e, i, undefined));
                            });
                        }
                        if (wl) { values.push(wl) }
                        if (q1) { values.push(q1) }
                        if (q3) { values.push(q3) }
                        if (wh) { values.push(wh) }
                    });
                    yMin = d3.min(values);
                    yMax = d3.max(values);
                    yData = [ yMin, yMax ] ;
                }

                yScale.domain(yDomain || yData);
                yScale.range(yRange || [availableHeight, 0]);

                //store old scales if they exist
                xScale0 = xScale0 || xScale;
                yScale0 = yScale0 || yScale.copy().range([yScale(0),yScale(0)]);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var boxplots = wrapEnter.selectAll('.nv-boxplot').data(function(d) { return d });
                var boxEnter = boxplots.enter().append('g').style('stroke-opacity', 1e-6).style('fill-opacity', 1e-6);
                boxEnter
                    .attr('class', 'nv-boxplot')
                    .attr('transform', function(d,i,j) { return 'translate(' + (xScale(getX(d,i)) + xScale.bandwidth() * 0.05) + ', 0)'; })
                    .classed('hover', function(d) { return d.hover });
                boxEnter
                    .watchTransition(renderWatch, 'nv-boxplot: boxplots')
                    .style('stroke-opacity', 1)
                    .style('fill-opacity', 0.75)
                    .delay(function(d,i) { return i * duration / data.length })
                    .attr('transform', function(d,i) {
                        return 'translate(' + (xScale(getX(d,i)) + xScale.bandwidth() * 0.05) + ', 0)';
                    });
                boxplots.exit().remove();

                // ----- add the SVG elements for each boxPlot -----

                // conditionally append whisker lines
                boxEnter.each(function(d,i) {
                    var box = d3.select(this);
                    [getWl, getWh].forEach(function (f) {
                        if (f(d) !== undefined && f(d) !== null) {
                            var key = (f === getWl) ? 'low' : 'high';
                            box.append('line')
                                .style('stroke', getColor(d) || color(d,i))
                                .attr('class', 'nv-boxplot-whisker nv-boxplot-' + key);
                            box.append('line')
                                .style('stroke', getColor(d) || color(d,i))
                                .attr('class', 'nv-boxplot-tick nv-boxplot-' + key);
                        }
                    });
                });

                var box_width = function() { return (maxBoxWidth === null ? xScale.bandwidth() * 0.9 : Math.min(75, xScale.bandwidth() * 0.9)); };
                var box_left  = function() { return xScale.bandwidth() * 0.45 - box_width()/2; };
                var box_right = function() { return xScale.bandwidth() * 0.45 + box_width()/2; };

                // update whisker lines and ticks
                [getWl, getWh].forEach(function (f) {
                    var key = (f === getWl) ? 'low' : 'high';
                    var endpoint = (f === getWl) ? getQ1 : getQ3;
                    boxEnter.select('line.nv-boxplot-whisker.nv-boxplot-' + key)
                        .watchTransition(renderWatch, 'nv-boxplot: boxplots')
                        .attr('x1', xScale.bandwidth() * 0.45 )
                        .attr('y1', function(d,i) { return yScale(f(d)); })
                        .attr('x2', xScale.bandwidth() * 0.45 )
                        .attr('y2', function(d,i) { return yScale(endpoint(d)); });
                    boxEnter.select('line.nv-boxplot-tick.nv-boxplot-' + key)
                        .watchTransition(renderWatch, 'nv-boxplot: boxplots')
                        .attr('x1', box_left )
                        .attr('y1', function(d,i) { return yScale(f(d)); })
                        .attr('x2', box_right )
                        .attr('y2', function(d,i) { return yScale(f(d)); });
                });

                [getWl, getWh].forEach(function (f) {
                    var key = (f === getWl) ? 'low' : 'high';
                    boxEnter.selectAll('.nv-boxplot-' + key)
                        .on('mouseover', function(event, d,i,j) {
                            setCoordinates(event.pageX, event.pageY);
                            d3.select(this).classed('hover', true);
                            dispatch.call('elementMouseover', this, {
                                series: { key: f(d), color: getColor(d) || color(d,j) },
                                e: event
                            });
                        })
                        .on('mouseout', function(event,d,i,j) {
                            d3.select(this).classed('hover', false);
                            dispatch.call('elementMouseout', this, {
                                series: { key: f(d), color: getColor(d) || color(d,j) },
                                e: event
                            });
                        })
                        .on('mousemove', function(event,d,i) {
                            dispatch.call('elementMousemove', this, {e: event});
                        });
                });

                // boxes
                var rectAppend=boxEnter.append('rect')
                    .attr('class', 'nv-boxplot-box')
                    // tooltip events
                    .on('mouseover', function(event,d,i) {
                        setCoordinates(event.pageX, event.pageY);
                        d3.select(this).classed('hover', true);
                        dispatch.call('elementMouseover', this, {
                            key: getX(d),
                            value: getX(d),
                            series: [
                                { key: 'Q3', value: getQ3(d), color: getColor(d) || color(d,i) },
                                { key: 'Q2', value: getQ2(d), color: getColor(d) || color(d,i) },
                                { key: 'Q1', value: getQ1(d), color: getColor(d) || color(d,i) }
                            ],
                            data: d,
                            index: d.index,
                            e: event
                        });
                    })
                    .on('mouseout', function(event,d,i) {
                        d3.select(this).classed('hover', false);
                        dispatch.call('elementMouseout', this, {
                            key: getX(d),
                            value: getX(d),
                            series: [
                                { key: 'Q3', value: getQ3(d), color: getColor(d) || color(d,i) },
                                { key: 'Q2', value: getQ2(d), color: getColor(d) || color(d,i) },
                                { key: 'Q1', value: getQ1(d), color: getColor(d) || color(d,i) }
                            ],
                            data: d,
                            index: d.index,
                            e: event
                        });
                    })
                    .on('mousemove', function(event,d,i) {
                        dispatch.call('elementMousemove', this, {e: event});
                    });

                // box transitions
                rectAppend
                    .watchTransition(renderWatch, 'nv-boxplot: boxes')
                    .attr('y', function(d,i) { return yScale(getQ3(d)); })
                    .attr('width', box_width)
                    .attr('x', box_left )
                    .attr('height', function(d,i) { return Math.abs(yScale(getQ3(d)) - yScale(getQ1(d))) || 1 })
                    .style('fill', function(d,i) { return getColor(d) || color(d,i) })
                    .style('stroke', function(d,i) { return getColor(d) || color(d,i) });

                // median line
                var lineAppend=boxEnter.append('line').attr('class', 'nv-boxplot-median');

                lineAppend
                    .watchTransition(renderWatch, 'nv-boxplot: boxplots line')
                    .attr('x1', box_left)
                    .attr('y1', function(d,i) { return yScale(getQ2(d)); })
                    .attr('x2', box_right)
                    .attr('y2', function(d,i) { return yScale(getQ2(d)); });

                // outliers
                var outliers = boxEnter.selectAll('.nv-boxplot-outlier').data(function(d) {
                    return getOlItems(d) || [];
                });
                outliers.enter().append('circle')
                    .style('fill', function(d,i,j) { return getOlColor(d,i,j) || color(d,j) })
                    .style('stroke', function(d,i,j) { return getOlColor(d,i,j) || color(d,j) })
                    .style('z-index', 9000)
                    .on('mouseover', function(event,d,i,j) {
                        setCoordinates(event.pageX, event.pageY);
                        d3.select(this).classed('hover', true);
                        dispatch.call('elementMouseover', this, {
                            series: { key: getOlLabel(d,i,j), color: getOlColor(d,i,j) || color(d,j) },
                            e: event
                        });
                    })
                    .on('mouseout', function(event,d,i,j) {
                        d3.select(this).classed('hover', false);
                        dispatch.call('elementMouseout', this, {
                            series: { key: getOlLabel(d,i,j), color: getOlColor(d,i,j) || color(d,j) },
                            e: event
                        });
                    })
                    .on('mousemove', function(event,d,i) {
                        dispatch.call('elementMousemove', this, {e: event});
                    });
                outliers.attr('class', 'nv-boxplot-outlier');
                outliers
                    .watchTransition(renderWatch, 'nv-boxplot: nv-boxplot-outlier')
                    .attr('cx', xScale.bandwidth() * 0.45)
                    .attr('cy', function(d,i,j) { return yScale(getOlValue(d,i,j)); })
                    .attr('r', '3');
                outliers.exit().remove();

                //store old scales for use in transitions on update
                xScale0 = xScale.copy();
                yScale0 = yScale.copy();
            });

            renderWatch.renderEnd('nv-boxplot immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:       {get: function(){return width;}, set: function(_){width=_;}},
            height:      {get: function(){return height;}, set: function(_){height=_;}},
            maxBoxWidth: {get: function(){return maxBoxWidth;}, set: function(_){maxBoxWidth=_;}},
            x:           {get: function(){return getX;}, set: function(_){getX=_;}},
            q1: {get: function(){return getQ1;}, set: function(_){getQ1=_;}},
            q2: {get: function(){return getQ2;}, set: function(_){getQ2=_;}},
            q3: {get: function(){return getQ3;}, set: function(_){getQ3=_;}},
            wl: {get: function(){return getWl;}, set: function(_){getWl=_;}},
            wh: {get: function(){return getWh;}, set: function(_){getWh=_;}},
            itemColor:    {get: function(){return getColor;}, set: function(_){getColor=_;}},
            outliers:     {get: function(){return getOlItems;}, set: function(_){getOlItems=_;}},
            outlierValue: {get: function(){return getOlValue;}, set: function(_){getOlValue=_;}},
            outlierLabel: {get: function(){return getOlLabel;}, set: function(_){getOlLabel=_;}},
            outlierColor: {get: function(){return getOlColor;}, set: function(_){getOlColor=_;}},
            xScale:  {get: function(){return xScale;}, set: function(_){xScale=_;}},
            yScale:  {get: function(){return yScale;}, set: function(_){yScale=_;}},
            xDomain: {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain: {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:  {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:  {get: function(){return yRange;}, set: function(_){yRange=_;}},
            id:          {get: function(){return id;}, set: function(_){id=_;}},
            // rectClass: {get: function(){return rectClass;}, set: function(_){rectClass=_;}},
            y: {
                get: function() {
                    console.warn('BoxPlot \'y\' chart option is deprecated. Please use model overrides instead.');
                    return {};
                },
                set: function(_) {
                    console.warn('BoxPlot \'y\' chart option is deprecated. Please use model overrides instead.');
                }
            },
            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };
    nv.models.boxPlotChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var boxplot = nv.models.boxPlot(),
            xAxis = nv.models.axis(d3.axisBottom(d3.scaleBand()), 'bottom'),
            yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left');

        var margin = {top: 15, right: 10, bottom: 50, left: 60},
            width = null,
            height = null,
            color = nv.utils.getColor(),
            showXAxis = true,
            showYAxis = true,
            rightAlignYAxis = false,
            staggerLabels = false,
            tooltip = nv.models.tooltip(),
            x, y,
            noData = 'No Data Available.',
            dispatch = d3.dispatch('beforeUpdate', 'renderEnd'),
            duration = 250,
            t = d3.transition()
                .duration(duration)
                .ease(d3.easeLinear);

        xAxis.showMaxMin(false).scale()
        xAxis
            .tickFormat(function(d) { return d })
        ;
        yAxis
            //@todo .orient((rightAlignYAxis) ? 'right' : 'left')
            .scale()
        yAxis
            .tickFormat(d3.format(',.1f'))
        ;

        tooltip.duration(0);

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(boxplot);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this), that = this;
                nv.utils.initSVG(container);
                var availableWidth = (width  || parseInt(container.style('width')) || 960) - margin.left - margin.right;
                var availableHeight = (height || parseInt(container.style('height')) || 400) - margin.top - margin.bottom;

                chart.update = function() {
                    dispatch.call('beforeUpdate', this);
                    container.transition().duration(duration).call(chart);
                };
                chart.container = this;

                // TODO still need to find a way to validate quartile data presence using boxPlot callbacks.
                // Display No Data message if there's nothing to show. (quartiles required at minimum).
                if (!data || !data.length) {
                    var noDataText = container.selectAll('.nv-noData').data([noData]);

                    var textAppend=noDataText.enter().append('text')
                        .attr('class', 'nvd3 nv-noData')
                        .attr('dy', '-.7em')
                        .style('text-anchor', 'middle');

                    noDataText
                        .attr('x', margin.left + availableWidth / 2)
                        .attr('y', margin.top + availableHeight / 2)
                        .text(function(d) { return d });

                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = boxplot.xScale();
                y = boxplot.yScale().clamp(true);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-boxPlotWithAxes').data([data]);
                var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-boxPlotWithAxes').append('g');
                var defsEnter = gEnter.append('defs');
                var g = wrap.select('g');

                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-boxPlotWithAxes').select('.nv-x');
                var yAxisAppend=gEnter.append('g').attr('class', 'nv-y nv-axis');
                var lineAppend=yAxisAppend
                    .append('g').attr('class', 'nv-zeroLine')
                    .append('line');

                var barsWrapAppend=gEnter.append('g').attr('class', 'nv-barsWrap');
                gEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                if (rightAlignYAxis) {
                    yAxisAppend
                        .attr('transform', 'translate(' + availableWidth + ',0)');
                }

                // Main Chart Component(s)
                boxplot.width(availableWidth).height(availableHeight);

                var barsWrap = barsWrapAppend
                    .datum(data.filter(function(d) { return !d.disabled }))

                barsWrap.transition().call(boxplot);

                var defsRect=defsEnter.append('clipPath')
                    .attr('id', 'nv-x-label-clip-' + boxplot.id())
                    .append('rect');

                defsRect
                    .attr('width', x.bandwidth() * (staggerLabels ? 2 : 1))
                    .attr('height', 16)
                    .attr('x', -x.bandwidth() / (staggerLabels ? 1 : 2 ));

                // Setup Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner(-availableHeight);

                    xAxisAppend.attr('transform', 'translate(0,' + y.range()[0] + ')');
                    xAxisAppend.call(xAxis);

                    var xTicks = xAxisAppend.select("g.nvd3.nv-wrap.nv-axis").selectAll('g');
                    if (staggerLabels) {
                        xTicks
                            .selectAll('text')
                            .attr('transform', function(d,i,j) { return 'translate(0,' + (j % 2 === 0 ? '5' : '17') + ')' })
                    }
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( Math.floor(availableHeight/36) ) // can't use nv.utils.calcTicksY with Object data
                    yAxis
                        .tickSizeInner( -availableWidth);

                    yAxisAppend.call(yAxis);
                }

                // Zero line
                lineAppend
                    .attr('x1',0)
                    .attr('x2',availableWidth)
                    .attr('y1', y(0))
                    .attr('y2', y(0))
                ;

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------
            });

            renderWatch.renderEnd('nv-boxplot chart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        boxplot.dispatch.on('elementMouseover.tooltip', function(evt) {
            tooltip.data(evt).hidden(false);
        });

        boxplot.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.data(evt).hidden(true);
        });

        boxplot.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.boxplot = boxplot;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            staggerLabels: {get: function(){return staggerLabels;}, set: function(_){staggerLabels=_;}},
            showXAxis: {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis: {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            tooltipContent:    {get: function(){return tooltip;}, set: function(_){tooltip=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                    boxplot.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    boxplot.color(color);
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    yAxis.orient( (_) ? 'right' : 'left');
                }}
        });

        nv.utils.inheritOptions(chart, boxplot);
        nv.utils.initOptions(chart);

        return chart;
    }

// Chart design based on the recommendations of Stephen Few. Implementation
// based on the work of Clint Ivy, Jamie Love, and Jason Davies.
// http://projects.instantcognition.com/protovis/bulletchart/

    nv.models.bullet = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , orient = 'left' // TODO top & bottom
            , reverse = false
            , ranges = function(d) { return d.ranges }
            , markers = function(d) { return d.markers ? d.markers : [] }
            , markerLines = function(d) { return d.markerLines ? d.markerLines : [0] }
            , measures = function(d) { return d.measures }
            , rangeLabels = function(d) { return d.rangeLabels ? d.rangeLabels : [] }
            , markerLabels = function(d) { return d.markerLabels ? d.markerLabels : []  }
            , markerLineLabels = function(d) { return d.markerLineLabels ? d.markerLineLabels : []  }
            , measureLabels = function(d) { return d.measureLabels ? d.measureLabels : []  }
            , forceX = [0] // List of numbers to Force into the X scale (ie. 0, or a max / min, etc.)
            , width = 380
            , height = 30
            , container = null
            , tickFormat = null
            , color = nv.utils.getColor(['#1f77b4'])
            , dispatch = d3.dispatch('elementMouseover', 'elementMouseout', 'elementMousemove')
            , defaultRangeLabels = ["Maximum", "Mean", "Minimum"]
            , legacyRangeClassNames = ["Max", "Avg", "Min"]
            , duration = 1000
            ,t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear);

        function sortLabels(labels, values){
            var lz = labels.slice();
            labels.sort(function(a, b){
                var iA = lz.indexOf(a);
                var iB = lz.indexOf(b);
                return d3.descending(values[iA], values[iB]);
            });
        };

        function chart(selection) {
            selection.each(function(d, i) {
                var availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                container = d3.select(this);
                nv.utils.initSVG(container);

                var rangez = ranges.call(this, d, i).slice(),
                    markerz = markers.call(this, d, i).slice(),
                    markerLinez = markerLines.call(this, d, i).slice(),
                    measurez = measures.call(this, d, i).slice(),
                    rangeLabelz = rangeLabels.call(this, d, i).slice(),
                    markerLabelz = markerLabels.call(this, d, i).slice(),
                    markerLineLabelz = markerLineLabels.call(this, d, i).slice(),
                    measureLabelz = measureLabels.call(this, d, i).slice();

                // Sort labels according to their sorted values
                sortLabels(rangeLabelz, rangez);
                sortLabels(markerLabelz, markerz);
                sortLabels(markerLineLabelz, markerLinez);
                sortLabels(measureLabelz, measurez);

                // sort values descending
                rangez.sort(d3.descending);
                markerz.sort(d3.descending);
                markerLinez.sort(d3.descending);
                measurez.sort(d3.descending);

                // Setup Scales
                // Compute the new x-scale.
                var x1 = d3.scaleLinear()
                    .domain( d3.extent(d3.merge([forceX, rangez])) )
                    .range(reverse ? [availableWidth, 0] : [0, availableWidth]);

                // Retrieve the old x-scale, if this is an update.
                var x0 = this.__chart__ || d3.scaleLinear()
                    .domain([0, Infinity])
                    .range(x1.range());

                // Stash the new scale.
                this.__chart__ = x1;

                var rangeMin = d3.min(rangez), //rangez[2]
                    rangeMax = d3.max(rangez), //rangez[0]
                    rangeAvg = rangez[1];

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-bullet').data([d]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-bullet');
                var gEnter = wrapEnter.append('g');
                var g = wrap.select('g');

                for(var i=0,il=rangez.length; i<il; i++){
                    var rangeClassNames = 'nv-range nv-range'+i;
                    if(i <= 2){
                        rangeClassNames = rangeClassNames + ' nv-range'+legacyRangeClassNames[i];
                    }
                    gEnter.append('rect').attr('class', rangeClassNames);
                }

                gEnter.append('rect').attr('class', 'nv-measure');

                wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var w0 = function(d) { return Math.abs(x0(d) - x0(0)) }, // TODO: could optimize by precalculating x0(0) and x1(0)
                    w1 = function(d) { return Math.abs(x1(d) - x1(0)) };
                var xp0 = function(d) { return d < 0 ? x0(d) : x0(0) },
                    xp1 = function(d) { return d < 0 ? x1(d) : x1(0) };

                for(var i=0,il=rangez.length; i<il; i++){
                    var range = rangez[i];
                    g.select('rect.nv-range'+i)
                        .datum(range)
                        .attr('height', availableHeight)
                        .transition().duration(1000)
                        .attr('width', w1(range))
                        .attr('x', xp1(range))
                }

                g.select('rect.nv-measure')
                    .style('fill', color)
                    .attr('height', availableHeight / 3)
                    .attr('y', availableHeight / 3)
                    .on('mouseover', function() {
                        dispatch.call('elementMouseover', this, {
                            value: measurez[0],
                            label: measureLabelz[0] || 'Current',
                            color: d3.select(this).style("fill")
                        })
                    })
                    .on('mousemove', function() {
                        dispatch.call('elementMousemove', this, {
                            value: measurez[0],
                            label: measureLabelz[0] || 'Current',
                            color: d3.select(this).style("fill")
                        })
                    })
                    .on('mouseout', function() {
                        dispatch.call('elementMouseout', this, {
                            value: measurez[0],
                            label: measureLabelz[0] || 'Current',
                            color: d3.select(this).style("fill")
                        })
                    })
                    .transition().duration(1000)
                    .attr('width', measurez < 0 ?
                        x1(0) - x1(measurez[0])
                        : x1(measurez[0]) - x1(0))
                    .attr('x', xp1(measurez));

                var h3 =  availableHeight / 6;

                var markerData = markerz.map( function(marker, index) {
                    return {value: marker, label: markerLabelz[index]}
                });
                gEnter
                    .selectAll("path.nv-markerTriangle")
                    .data(markerData)
                    .enter()
                    .append('path')
                    .attr('class', 'nv-markerTriangle')
                    .attr('d', 'M0,' + h3 + 'L' + h3 + ',' + (-h3) + ' ' + (-h3) + ',' + (-h3) + 'Z')
                    .on('mouseover', function(d) {
                        dispatch.call('elementMouseover', this, {
                            value: d.value,
                            label: d.label || 'Previous',
                            color: d3.select(this).style("fill"),
                            pos: [x1(d.value), availableHeight/2]
                        })

                    })
                    .on('mousemove', function(d) {
                        dispatch.call('elementMousemove', this, {
                            value: d.value,
                            label: d.label || 'Previous',
                            color: d3.select(this).style("fill")
                        })
                    })
                    .on('mouseout', function(d, i) {
                        dispatch.call('elementMouseout', this, {
                            value: d.value,
                            label: d.label || 'Previous',
                            color: d3.select(this).style("fill")
                        })
                    });

                g.selectAll("path.nv-markerTriangle")
                    .data(markerData)
                    .transition().duration(1000)
                    .attr('transform', function(d) { return 'translate(' + x1(d.value) + ',' + (availableHeight / 2) + ')' });

                var markerLinesData = markerLinez.map( function(marker, index) {
                    return {value: marker, label: markerLineLabelz[index]}
                });
                gEnter
                    .selectAll("line.nv-markerLine")
                    .data(markerLinesData)
                    .enter()
                    .append('line')
                    .attr('cursor', '')
                    .attr('class', 'nv-markerLine')
                    .attr('x1', function(d) { return x1(d.value) })
                    .attr('y1', '2')
                    .attr('x2', function(d) { return x1(d.value) })
                    .attr('y2', availableHeight - 2)
                    .on('mouseover', function(d) {
                        dispatch.call('elementMouseover', this, {
                            value: d.value,
                            label: d.label || 'Previous',
                            color: d3.select(this).style("fill"),
                            pos: [x1(d.value), availableHeight/2]
                        })

                    })
                    .on('mousemove', function(d) {
                        dispatch.call('elementMousemove', this, {
                            value: d.value,
                            label: d.label || 'Previous',
                            color: d3.select(this).style("fill")
                        })
                    })
                    .on('mouseout', function(d, i) {
                        dispatch.call('elementMouseout', this, {
                            value: d.value,
                            label: d.label || 'Previous',
                            color: d3.select(this).style("fill")
                        })
                    });

                g.selectAll("line.nv-markerLine")
                    .data(markerLinesData)
                    .transition().duration(1000)
                    .attr('x1', function(d) { return x1(d.value) })
                    .attr('x2', function(d) { return x1(d.value) });

                wrap.selectAll('.nv-range')
                    .on('mouseover', function(d,i) {
                        var label = rangeLabelz[i] || defaultRangeLabels[i];
                        dispatch.call('elementMouseover', this, {
                            value: d,
                            label: label,
                            color: d3.select(this).style("fill")
                        })
                    })
                    .on('mousemove', function() {
                        dispatch.call('elementMousemove', this, {
                            value: measurez[0],
                            label: measureLabelz[0] || 'Previous',
                            color: d3.select(this).style("fill")
                        })
                    })
                    .on('mouseout', function(d,i) {
                        var label = rangeLabelz[i] || defaultRangeLabels[i];
                        dispatch.call('elementMouseout', this, {
                            value: d,
                            label: label,
                            color: d3.select(this).style("fill")
                        })
                    });
            });

            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            ranges:      {get: function(){return ranges;}, set: function(_){ranges=_;}}, // ranges (bad, satisfactory, good)
            markers:     {get: function(){return markers;}, set: function(_){markers=_;}}, // markers (previous, goal)
            measures: {get: function(){return measures;}, set: function(_){measures=_;}}, // measures (actual, forecast)
            forceX:      {get: function(){return forceX;}, set: function(_){forceX=_;}},
            width:    {get: function(){return width;}, set: function(_){width=_;}},
            height:    {get: function(){return height;}, set: function(_){height=_;}},
            tickFormat:    {get: function(){return tickFormat;}, set: function(_){tickFormat=_;}},
            duration:    {get: function(){return duration;}, set: function(_){duration=_;
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                }},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            orient: {get: function(){return orient;}, set: function(_){ // left, right, top, bottom
                    orient = _;
                    reverse = orient == 'right' || orient == 'bottom';
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }}
        });

        nv.utils.initOptions(chart);
        return chart;
    };



// Chart design based on the recommendations of Stephen Few. Implementation
// based on the work of Clint Ivy, Jamie Love, and Jason Davies.
// http://projects.instantcognition.com/protovis/bulletchart/
    nv.models.bulletChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var bullet = nv.models.bullet();
        var tooltip = nv.models.tooltip();

        var orient = 'left' // TODO top & bottom
            , reverse = false
            , margin = {top: 5, right: 40, bottom: 20, left: 120}
            , ranges = function(d) { return d.ranges }
            , markers = function(d) { return d.markers ? d.markers : [] }
            , measures = function(d) { return d.measures }
            , width = null
            , height = 55
            , tickFormat = null
            , ticks = null
            , noData = null
            , dispatch = d3.dispatch()
        ;

        tooltip
            .duration(0)
            .headerEnabled(false);

        function chart(selection) {
            selection.each(function(d, i) {
                var container = d3.select(this);
                nv.utils.initSVG(container);

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = height - margin.top - margin.bottom,
                    that = this;

                chart.update = function() { chart(selection) };
                chart.container = this;

                // Display No Data message if there's nothing to show.
                if (!d || !ranges.call(this, d, i)) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                var rangez = ranges.call(this, d, i).slice().sort(d3.descending),
                    markerz = markers.call(this, d, i).slice().sort(d3.descending),
                    measurez = measures.call(this, d, i).slice().sort(d3.descending);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-bulletChart').data([d]);
                wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-bulletChart');
                var gEnter = wrapEnter.append('g');
                var g = wrap.select('g');

                var bulletWrapAppend=gEnter.append('g').attr('class', 'nv-bulletWrap');
                var titlesAppend=gEnter.append('g').attr('class', 'nv-titles');

                // Compute the new x-scale.
                var x1 = d3.scaleLinear()
                    .domain([0, Math.max(rangez[0], (markerz[0] || 0), measurez[0])])  // TODO: need to allow forceX and forceY, and xDomain, yDomain
                    .range(reverse ? [availableWidth, 0] : [0, availableWidth]);

                // Retrieve the old x-scale, if this is an update.
                var x0 = this.__chart__ || d3.scaleLinear()
                    .domain([0, Infinity])
                    .range(x1.range());

                // Stash the new scale.
                this.__chart__ = x1;

                var w0 = function(d) { return Math.abs(x0(d) - x0(0)) }, // TODO: could optimize by precalculating x0(0) and x1(0)
                    w1 = function(d) { return Math.abs(x1(d) - x1(0)) };

                var title = titlesAppend.append('g')
                    .attr('text-anchor', 'end')
                    .attr('transform', 'translate(-6,' + (height - margin.top - margin.bottom) / 2 + ')');
                title.append('text')
                    .attr('class', 'nv-title')
                    .text(function(d) { return d.title; });

                title.append('text')
                    .attr('class', 'nv-subtitle')
                    .attr('dy', '1em')
                    .text(function(d) { return d.subtitle; });

                bullet
                    .width(availableWidth)
                    .height(availableHeight);

                var bulletWrap = bulletWrapAppend
                    .transition().call(bullet);

                // Compute the tick format.
                var format = tickFormat || x1.tickFormat( availableWidth / 100 );

                // Update the tick groups.
                var tick = g.selectAll('g.nv-tick')
                    .data(x1.ticks( ticks ? ticks : (availableWidth / 50) ), function(d) {
                        return this.textContent || format(d);
                    });

                // Initialize the ticks with the old scale, x0.
                var tickEnter = tick.enter().append('g')
                    .attr('class', 'nv-tick')
                    .attr('transform', function(d) { return 'translate(' + x0(d) + ',0)' })
                    .style('opacity', 1e-6);

                tickEnter.append('line')
                    .attr('y1', availableHeight)
                    .attr('y2', availableHeight * 7 / 6);

                var textAppend=tickEnter.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('dy', '1em')
                    .attr('y', availableHeight * 7 / 6)
                    .text(format);

                // Transition the updating ticks to the new scale, x1.
                var tickUpdate = tick
                    .transition()
                    .duration(bullet.duration())
                    .attr('transform', function(d) { return 'translate(' + x1(d) + ',0)' })
                    .style('opacity', 1);

                tickUpdate.select('line')
                    .attr('y1', availableHeight)
                    .attr('y2', availableHeight * 7 / 6);

                tickUpdate.select('text')
                    .attr('y', availableHeight * 7 / 6);

                // Transition the exiting ticks to the new scale, x1.
                tickEnter
                    .transition()
                    .duration(bullet.duration())
                    .attr('transform', function(d) { return 'translate(' + x1(d) + ',0)' })
                    .style('opacity', 1e-6)
                    .remove();
            });

            d3.timerFlush();
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        bullet.dispatch.on('elementMouseover.tooltip', function(evt) {
            evt['series'] = {
                key: evt.label,
                value: evt.value,
                color: evt.color
            };
            tooltip.data(evt).hidden(false);
        });

        bullet.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        bullet.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.bullet = bullet;
        chart.dispatch = dispatch;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            ranges:      {get: function(){return ranges;}, set: function(_){ranges=_;}}, // ranges (bad, satisfactory, good)
            markers:     {get: function(){return markers;}, set: function(_){markers=_;}}, // markers (previous, goal)
            measures: {get: function(){return measures;}, set: function(_){measures=_;}}, // measures (actual, forecast)
            width:    {get: function(){return width;}, set: function(_){width=_;}},
            height:    {get: function(){return height;}, set: function(_){height=_;}},
            tickFormat:    {get: function(){return tickFormat;}, set: function(_){tickFormat=_;}},
            ticks:    {get: function(){return ticks;}, set: function(_){ticks=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            orient: {get: function(){return orient;}, set: function(_){ // left, right, top, bottom
                    orient = _;
                    reverse = orient == 'right' || orient == 'bottom';
                }}
        });

        nv.utils.inheritOptions(chart, bullet);
        nv.utils.initOptions(chart);

        return chart;
    };



    nv.models.candlestickBar = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = null
            , height = null
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container
            , x = d3.scaleLinear()
            , y = d3.scaleLinear()
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , getOpen = function(d) { return d.open }
            , getClose = function(d) { return d.close }
            , getHigh = function(d) { return d.high }
            , getLow = function(d) { return d.low }
            , forceX = []
            , forceY = []
            , padData     = false // If true, adds half a data points width to front and back, for lining up a line chart with a bar chart
            , clipEdge = true
            , color = nv.utils.defaultColor()
            , interactive = false
            , xDomain
            , yDomain
            , xRange
            , yRange
            , dispatch = d3.dispatch('stateChange', 'changeState', 'renderEnd', 'chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'elementMousemove')
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        function chart(selection) {
            selection.each(function(data) {
                container = d3.select(this);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                nv.utils.initSVG(container);

                // Width of the candlestick bars.
                var barWidth = (availableWidth / data[0].values.length) * .45;

                // Setup Scales
                x.domain(xDomain || d3.extent(data[0].values.map(getX).concat(forceX) ));

                if (padData)
                    x.range(xRange || [availableWidth * .5 / data[0].values.length, availableWidth * (data[0].values.length - .5)  / data[0].values.length ]);
                else
                    x.range(xRange || [5 + barWidth / 2, availableWidth - barWidth / 2 - 5]);

                y.domain(yDomain || [
                    d3.min(data[0].values.map(getLow).concat(forceY)),
                    d3.max(data[0].values.map(getHigh).concat(forceY))
                ]
                ).range(yRange || [availableHeight, 0]);

                // If scale's domain don't have a range, slightly adjust to make one... so a chart can show a single data point
                if (x.domain()[0] === x.domain()[1])
                    x.domain()[0] ?
                        x.domain([x.domain()[0] - x.domain()[0] * 0.01, x.domain()[1] + x.domain()[1] * 0.01])
                        : x.domain([-1,1]);

                if (y.domain()[0] === y.domain()[1])
                    y.domain()[0] ?
                        y.domain([y.domain()[0] + y.domain()[0] * 0.01, y.domain()[1] - y.domain()[1] * 0.01])
                        : y.domain([-1,1]);

                // Setup containers and skeleton of chart
                var wrap = d3.select(this).selectAll('g.nv-wrap.nv-candlestickBar').data([data[0].values]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-candlestickBar');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var defsEnter = wrapEnter.append('defs');
                var gEnter = wrapEnter.append('g');
                var g = wrap.select('g');

                var ticksAppend=gEnter.append('g').attr('class', 'nv-ticks');

                container
                    .on('click', function(event,d,i) {
                        dispatch.call('chartClick', this, {
                            data: d,
                            index: d.index,
                            pos: event,
                            id: id
                        });
                    });

                var rectAppend=defsEnter.append('clipPath')
                    .attr('id', 'nv-chart-clip-path-' + id)
                    .append('rect');

                rectAppend
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                gEnter   .attr('clip-path', clipEdge ? 'url(#nv-chart-clip-path-' + id + ')' : '');

                var ticks = ticksAppend.selectAll('.nv-tick')
                    .data(function(d) { return d });
                ticks.exit().remove();

                var tickGroups = ticks.enter().append('g');

                // The colors are currently controlled by CSS.
                tickGroups
                    .attr('class', function(d, i, j) { return (getOpen(d, i) > getClose(d, i) ? 'nv-tick negative' : 'nv-tick positive') + ' nv-tick-' + j + '-' + i});

                var lines = tickGroups.append('line')
                    .attr('class', 'nv-candlestick-lines')
                    .attr('transform', function(d, i) { return 'translate(' + x(getX(d, i)) + ',0)'; })
                    .attr('x1', 0)
                    .attr('y1', function(d, i) { return y(getHigh(d, i)); })
                    .attr('x2', 0)
                    .attr('y2', function(d, i) { return y(getLow(d, i)); });

                var rects = tickGroups.append('rect')
                    .attr('class', 'nv-candlestick-rects nv-bars')
                    .attr('transform', function(d, i) {
                        return 'translate(' + (x(getX(d, i)) - barWidth/2) + ','
                            + (y(getY(d, i)) - (getOpen(d, i) > getClose(d, i) ? (y(getClose(d, i)) - y(getOpen(d, i))) : 0))
                            + ')';
                    })
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('width', barWidth)
                    .attr('height', function(d, i) {
                        var open = getOpen(d, i);
                        var close = getClose(d, i);
                        return open > close ? y(close) - y(open) : y(open) - y(close);
                    });

                tickGroups.select('.nv-candlestick-lines').transition()
                    .attr('transform', function(d, i) { return 'translate(' + x(getX(d, i)) + ',0)'; })
                    .attr('x1', 0)
                    .attr('y1', function(d, i) { return y(getHigh(d, i)); })
                    .attr('x2', 0)
                    .attr('y2', function(d, i) { return y(getLow(d, i)); });

                tickGroups.select('.nv-candlestick-rects').transition()
                    .attr('transform', function(d, i) {
                        return 'translate(' + (x(getX(d, i)) - barWidth/2) + ','
                            + (y(getY(d, i)) - (getOpen(d, i) > getClose(d, i) ? (y(getClose(d, i)) - y(getOpen(d, i))) : 0))
                            + ')';
                    })
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('width', barWidth)
                    .attr('height', function(d, i) {
                        var open = getOpen(d, i);
                        var close = getClose(d, i);
                        return open > close ? y(close) - y(open) : y(open) - y(close);
                    });
            });

            return chart;
        }


        //Create methods to allow outside functions to highlight a specific bar.
        chart.highlightPoint = function(pointIndex, isHoverOver) {
            chart.clearHighlights();
            container.select(".nv-candlestickBar .nv-tick-0-" + pointIndex)
                .classed("hover", isHoverOver)
            ;
        };

        chart.clearHighlights = function() {
            container.select(".nv-candlestickBar .nv-tick.hover")
                .classed("hover", false)
            ;
        };

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:    {get: function(){return width;}, set: function(_){width=_;}},
            height:   {get: function(){return height;}, set: function(_){height=_;}},
            xScale:   {get: function(){return x;}, set: function(_){x=_;}},
            yScale:   {get: function(){return y;}, set: function(_){y=_;}},
            xDomain:  {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain:  {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:   {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:   {get: function(){return yRange;}, set: function(_){yRange=_;}},
            forceX:   {get: function(){return forceX;}, set: function(_){forceX=_;}},
            forceY:   {get: function(){return forceY;}, set: function(_){forceY=_;}},
            padData:  {get: function(){return padData;}, set: function(_){padData=_;}},
            clipEdge: {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},
            id:       {get: function(){return id;}, set: function(_){id=_;}},
            interactive: {get: function(){return interactive;}, set: function(_){interactive=_;}},

            x:     {get: function(){return getX;}, set: function(_){getX=_;}},
            y:     {get: function(){return getY;}, set: function(_){getY=_;}},
            open:  {get: function(){return getOpen();}, set: function(_){getOpen=_;}},
            close: {get: function(){return getClose();}, set: function(_){getClose=_;}},
            high:  {get: function(){return getHigh;}, set: function(_){getHigh=_;}},
            low:   {get: function(){return getLow;}, set: function(_){getLow=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    != undefined ? _.top    : margin.top;
                    margin.right  = _.right  != undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom != undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   != undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }}
        });

        nv.utils.initOptions(chart);
        return chart;
    };

    nv.models.cumulativeLineChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var lines = nv.models.line()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , legend = nv.models.legend()
            , controls = nv.models.legend()
            , interactiveLayer = nv.interactiveGuideline()
            , tooltip = nv.models.tooltip()
        ;

        var margin = {top: 30, right: 30, bottom: 50, left: 60}
            , marginTop = null
            , color = nv.utils.defaultColor()
            , width = null
            , height = null
            , showLegend = true
            , showXAxis = true
            , showYAxis = true
            , rightAlignYAxis = false
            , showControls = true
            , useInteractiveGuideline = false
            , rescaleY = true
            , legendPosition = "top"
            , x //can be accessed via chart.xScale()
            , y //can be accessed via chart.yScale()
            , id = lines.id()
            , state = nv.utils.state()
            , defaultState = null
            , noData = null
            , average = function(d) { return d.average }
            , dispatch = d3.dispatch('stateChange', 'changeState', 'renderEnd')
            , transitionDuration = 250
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear)
            , noErrorCheck = false  //if set to TRUE, will bypass an error check in the indexify function.
        ;

        state.index = 0;
        state.rescaleY = rescaleY;

        xAxis.tickPadding(7);
        //yAxis.orient((rightAlignYAxis) ? 'right' : 'left');

        tooltip.valueFormatter(function(d, i) {
            return yAxis.tickFormat()(d, i);
        }).headerFormatter(function(d, i) {
            return xAxis.tickFormat()(d, i);
        });

        controls.updateState(false);

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var dx = d3.scaleLinear()
            , index = {i: 0, x: 0}
            , renderWatch = nv.utils.renderWatch(dispatch, duration)
            , currentYDomain
        ;

        var stateGetter = function(data) {
            return function(){
                return {
                    active: data.map(function(d) { return !d.disabled }),
                    index: index.i,
                    rescaleY: rescaleY
                };
            }
        };

        var stateSetter = function(data) {
            return function(state) {
                if (state.index !== undefined)
                    index.i = state.index;
                if (state.rescaleY !== undefined)
                    rescaleY = state.rescaleY;
                if (state.active !== undefined)
                    data.forEach(function(series,i) {
                        series.disabled = !state.active[i];
                    });
            }
        };

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(lines);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);
            selection.each(function(data) {
                var container = d3.select(this);
                nv.utils.initSVG(container);
                container.classed('nv-chart-' + id, true);
                var that = this;

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() {
                    if (duration === 0)
                        container.call(chart);
                    else {
                        container.transition().duration(duration).call(chart)
                    }

                };
                chart.container = this;

                state
                    .setter(stateSetter(data), chart.update)
                    .getter(stateGetter(data))
                    .update();

                // DEPRECATED set state.disableddisabled
                state.disabled = data.map(function(d) { return !!d.disabled });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                var indexDrag = d3.drag()
                    .on('start', dragStart)
                    .on('drag', dragMove)
                    .on('end', dragEnd);


                function dragStart(d,i) {
                    d3.select(chart.container)
                        .style('cursor', 'ew-resize');
                }

                function dragMove(event,d,i) {
                    index.x = event.x;
                    index.i = Math.round(dx.invert(index.x));
                    updateZero();
                }

                function dragEnd(d,i) {
                    d3.select(chart.container)
                        .style('cursor', 'auto');

                    // update state and send stateChange with new index
                    state.index = index.i;
                    dispatch.call('stateChange', this, state);
                }

                // Display No Data message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = lines.xScale();
                y = lines.yScale();


                dx.domain([0, data[0].values.length - 1]) //Assumes all series have same length
                    .range([0, availableWidth])
                    .clamp(true);

                var data = indexify(index.i, data);

                // initialize the starting yDomain for the not-rescale case after indexify (to have calculated point.display)
                if (typeof(currentYDomain) === "undefined") {
                    currentYDomain = getCurrentYDomain(data);
                }

                if (!rescaleY) {
                    lines.yDomain(currentYDomain);
                    lines.clipEdge(true);
                } else {
                    lines.yDomain(null);
                }

                // Setup containers and skeleton of chart
                var interactivePointerEvents = (useInteractiveGuideline) ? "none" : "all";

                var wrap = container.selectAll('g.nv-wrap.nv-cumulativeLine')
                    .data([data]);
                var dataReturned = data.filter(function(d) { return  !d.disabled && !d.tempDisabled });
                var wrapEnter = wrap.enter()
                    .append('g')
                    .attr('class', 'nvd3 nv-wrap nv-cumulativeLine')

                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var interactiveAppend=gEnter.append('g').attr('class', 'nv-interactive');
                interactiveAppend = container.selectAll('g.nv-wrap.nv-cumulativeLine').select('.nv-interactive');
                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis').style("pointer-events","none");
                xAxisAppend = container.selectAll('g.nv-wrap.nv-cumulativeLine').select('.nv-x');
                var yAxisAppend=gEnter.append('g').attr('class', 'nv-y nv-axis');
                yAxisAppend = container.selectAll('g.nv-wrap.nv-cumulativeLine').select('.nv-y');
                var backgroundAppend=gEnter.append('g').attr('class', 'nv-background');
                backgroundAppend = container.selectAll('g.nv-wrap.nv-cumulativeLine').select('.nv-background');
                var linesWrapAppend = gEnter.append('g').data([dataReturned])
                    .attr('class', 'nv-linesWrap nvd3-svg')
                    .style("pointer-events", interactivePointerEvents);
                var avgLinesWrapAppend=gEnter.append('g').attr('class', 'nv-avgLinesWrap').style("pointer-events","none");
                avgLinesWrapAppend = container.selectAll('g.nv-wrap.nv-cumulativeLine').select('.nv-avgLinesWrap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                var controlsWrapAppend=gEnter.append('g').attr('class', 'nv-controlsWrap');
                controlsWrapAppend = container.selectAll('g.nv-wrap.nv-cumulativeLine').select('.nv-controlsWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-cumulativeLine').select('.nv-legendWrap');
                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    legend.width(availableWidth);

                    legendWrapAppend
                        .datum(data)
                        .call(legend);

                    if (!marginTop && legend.height() !== margin.top) {
                        margin.top = legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                    }

                    legendWrapAppend
                        .attr('transform', 'translate(0,' + (-margin.top) +')')
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                // Controls
                if (!showControls) {
                    controlsWrapAppend.selectAll('*').remove();
                } else {
                    var controlsData = [
                        { key: 'Re-scale y-axis', disabled: !rescaleY }
                    ];

                    controls
                        .width(140)
                        .color(['#444', '#444', '#444'])
                        .rightAlign(false)
                        .margin({top: 5, right: 0, bottom: 5, left: 20})
                    ;

                    controlsWrapAppend
                        .datum(controlsData)
                        .attr('transform', 'translate(0,' + (-margin.top) +')')
                        .call(controls);
                }

                if (rightAlignYAxis) {
                    yAxisAppend
                        .attr("transform", "translate(" + availableWidth + ",0)");
                }

                // Show error if index point value is 0 (division by zero avoided)
                var tempDisabled = data.filter(function(d) { return d.tempDisabled });

                wrapEnter.select('.tempDisabled').remove(); //clean-up and prevent duplicates
                if (tempDisabled.length) {
                    wrapEnter.append('text').attr('class', 'tempDisabled')
                        .attr('x', availableWidth / 2)
                        .attr('y', '-.71em')
                        .style('text-anchor', 'end')
                        .text(tempDisabled.map(function(d) { return d.key }).join(', ') + ' values cannot be calculated for this time period.');
                }

                //Set up interactive layer
                if (useInteractiveGuideline) {
                    interactiveLayer
                        .width(availableWidth)
                        .height(availableHeight)
                        .margin({left:margin.left,top:margin.top})
                        .svgContainer(container)
                        .xScale(x);
                    interactiveAppend.call(interactiveLayer);
                }
                var rectAppend = backgroundAppend.select('rect');
                if(rectAppend.empty()) {
                    var rect= backgroundAppend
                        .append('rect');
                }
                rectAppend
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                lines
                    //.x(function(d) { return d.x })
                    .y(function(d) { return d.display.y })
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled && !data[i].tempDisabled; }));



                var linesWrap = container.selectAll("g.nv-linesWrap.nvd3-svg").data([dataReturned]);
                linesWrapAppend = linesWrap.merge(linesWrapAppend)
                linesWrapAppend.call(lines);

                //Store a series index number in the data array.
                data.forEach(function(d,i) {
                    d.seriesIndex = i;
                });

                var avgLineData = data.filter(function(d) {
                    return !d.disabled && !!average(d);
                });

                var avgLines = avgLinesWrapAppend.selectAll("line")
                    .data(avgLineData, function(d) { return d.key; });

                var getAvgLineY = function(d) {
                    //If average lines go off the svg element, clamp them to the svg bounds.
                    var yVal = y(average(d));
                    if (yVal < 0) return 0;
                    if (yVal > availableHeight) return availableHeight;
                    return yVal;
                };

                avgLines.exit().remove();

                var avgLinesEnter=avgLines.enter()
                    .append('line')
                    .style('stroke-width',2)
                    .style('stroke-dasharray','10,10')
                    .style('stroke',function (d,i) {
                        return lines.color()(d,d.seriesIndex);
                    })
                    .attr('x1',0)
                    .attr('x2',availableWidth)
                    .attr('y1', getAvgLineY)
                    .attr('y2', getAvgLineY);

                avgLinesEnter
                    .style('stroke-opacity',function(d){
                        //If average lines go offscreen, make them transparent
                        var yVal = y(average(d));
                        if (yVal < 0 || yVal > availableHeight) return 0;
                        return 1;
                    })
                    .attr('x1',0)
                    .attr('x2',availableWidth)
                    .attr('y1', getAvgLineY)
                    .attr('y2', getAvgLineY).merge(avgLines);

                //Create index line
                var indexLine = linesWrapAppend.selectAll('.nv-indexLine')
                    .data([index]);
                var indexLineEnter=indexLine.merge(indexLine.enter().append('rect').attr('class', 'nv-indexLine')
                    .attr('width', 3)
                    .attr('x', -2)
                    .attr('fill', 'red')
                    .attr('fill-opacity', .5)
                    .style("pointer-events","all")
                    .call(indexDrag));

                indexLineEnter
                    .attr('transform', function(d) { return 'translate(' + dx(d.i) + ',0)' })
                    .attr('height', availableHeight).merge(indexLine);

                // Setup Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/70, data) )
                    xAxis
                        .tickSizeInner(-availableHeight);

                    xAxisAppend
                        .attr('transform', 'translate(0,' + y.range()[0] + ')');
                    xAxisAppend
                        .call(xAxis).merge(wrap.select('.nv-x.nv-axis'));
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                    yAxis
                        .tickSizeInner( -availableWidth);

                    yAxisAppend
                        .call(yAxis);
                }

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                function updateZero() {
                    indexLine
                        .data([index]);

                    //When dragging the index line, turn off line transitions.
                    // Then turn them back on when done dragging.
                    var oldDuration = chart.duration();
                    chart.duration(0);
                    chart.update();
                    chart.duration(oldDuration);
                }

                rectAppend
                    .on('click', function(event) {
                        index.x = d3.pointer(event)[0];
                        index.i = Math.round(dx.invert(index.x));

                        // update state and send stateChange with new index
                        state.index = index.i;
                        dispatch.call('stateChange', rectAppend, state);

                        updateZero();
                    });

                lines.dispatch.on('elementClick', function(e) {
                    index.i = e.pointIndex;
                    index.x = dx(index.i);

                    // update state and send stateChange with new index
                    state.index = index.i;
                    dispatch.call('stateChange', lines, state);

                    updateZero();
                });

                controls.dispatch.on('legendClick', function(e,d,i) {
                    d.disabled = !d.disabled;
                    rescaleY = !d.disabled;
                    state.rescaleY = rescaleY;
                    if (!rescaleY) {
                        currentYDomain = getCurrentYDomain(data); // rescale is turned off, so set the currentYDomain
                    }
                    dispatch.call('stateChange', this, state);
                    chart.update();
                });

                legend.dispatch.on('stateChange', function(newState) {
                    for (var key in newState)
                        state[key] = newState[key];
                    dispatch.call('stateChange', this, newState);
                    chart.update();
                });

                interactiveLayer.dispatch.on('elementMousemove', function(e) {
                    lines.clearHighlights();
                    var singlePoint, pointIndex, pointXLocation, allData = [];

                    data
                        .filter(function(series, i) {
                            series.seriesIndex = i;
                            return !(series.disabled || series.tempDisabled);
                        })
                        .forEach(function(series,i) {
                            pointIndex = nv.interactiveBisect(series.values, e.pointXValue, chart.x());
                            lines.highlightPoint(i, pointIndex, true);
                            var point = series.values[pointIndex];
                            if (typeof point === 'undefined') return;
                            if (typeof singlePoint === 'undefined') singlePoint = point;
                            if (typeof pointXLocation === 'undefined') pointXLocation = chart.xScale()(chart.x()(point,pointIndex));
                            allData.push({
                                key: series.key,
                                value: chart.y()(point, pointIndex),
                                color: color(series,series.seriesIndex)
                            });
                        });

                    //Highlight the tooltip entry based on which point the mouse is closest to.
                    if (allData.length > 2) {
                        var yValue = chart.yScale().invert(e.mouseY);
                        var domainExtent = Math.abs(chart.yScale().domain()[0] - chart.yScale().domain()[1]);
                        var threshold = 0.03 * domainExtent;
                        var indexToHighlight = nv.nearestValueIndex(allData.map(function(d){return d.value}),yValue,threshold);
                        if (indexToHighlight !== null)
                            allData[indexToHighlight].highlight = true;
                    }

                    var xValue = xAxis.tickFormat()(chart.x()(singlePoint,pointIndex), pointIndex);
                    interactiveLayer.tooltip
                        .valueFormatter(function(d,i) {
                            return yAxis.tickFormat()(d);
                        })
                        .data(
                            {
                                value: xValue,
                                series: allData
                            }
                        )();

                    interactiveLayer.renderGuideLine(pointXLocation);
                });

                interactiveLayer.dispatch.on("elementMouseout",function(e) {
                    lines.clearHighlights();
                });

                // Update chart from a state object passed to event handler
                dispatch.on('changeState', function(e) {
                    if (typeof e.disabled !== 'undefined') {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });

                        state.disabled = e.disabled;
                    }

                    if (typeof e.index !== 'undefined') {
                        index.i = e.index;
                        index.x = dx(index.i);

                        state.index = e.index;

                        indexLine
                            .data([index]);
                    }

                    if (typeof e.rescaleY !== 'undefined') {
                        rescaleY = e.rescaleY;
                    }

                    chart.update();
                });

            });

            renderWatch.renderEnd('cumulativeLineChart immediate');

            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        lines.dispatch.on('elementMouseover.tooltip', function(evt) {
            var point = {
                x: chart.x()(evt.point),
                y: chart.y()(evt.point),
                color: evt.point.color
            };
            evt.point = point;
            tooltip.data(evt).hidden(false);
        });

        lines.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true)
        });

        //============================================================
        // Functions
        //------------------------------------------------------------

        var indexifyYGetter = null;
        /* Normalize the data according to an index point. */
        function indexify(idx, data) {
            if (!indexifyYGetter) indexifyYGetter = lines.y();
            return data.map(function(line, i) {
                if (!line.values) {
                    return line;
                }
                var indexValue = line.values[idx];
                if (indexValue == null) {
                    return line;
                }
                var v = indexifyYGetter(indexValue, idx);

                // avoid divide by zero
                if (Math.abs(v) < 0.00001 && !noErrorCheck) {
                    line.tempDisabled = true;
                    return line;
                }

                line.tempDisabled = false;

                line.values = line.values.map(function(point, pointIndex) {
                    point.display = {'y': (indexifyYGetter(point, pointIndex) - v) / v };
                    return point;
                });

                return line;
            })
        }

        function getCurrentYDomain(data) {
            var seriesDomains = data
                .filter(function(series) { return !(series.disabled || series.tempDisabled)})
                .map(function(series,i) {
                    return d3.extent(series.values, function (d) { return d.display.y });
                });

            return [
                d3.min(seriesDomains, function(d) { return d[0] }),
                d3.max(seriesDomains, function(d) { return d[1] })
            ];
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.lines = lines;
        chart.legend = legend;
        chart.controls = controls;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.interactiveLayer = interactiveLayer;
        chart.state = state;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showControls:     {get: function(){return showControls;}, set: function(_){showControls=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            legendPosition: {get: function(){return legendPosition;}, set: function(_){legendPosition=_;}},
            average: {get: function(){return average;}, set: function(_){average=_;}},
            defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
            showXAxis:    {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis:    {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            noErrorCheck:    {get: function(){return noErrorCheck;}, set: function(_){noErrorCheck=_;}},

            // options that require extra logic in the setter
            rescaleY:     {get: function(){return rescaleY;}, set: function(_){
                    rescaleY = _;
                    chart.state.rescaleY = _; // also update state
                }},
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                }},
            useInteractiveGuideline: {get: function(){return useInteractiveGuideline;}, set: function(_){
                    useInteractiveGuideline = _;
                    if (_ === true) {
                        chart.interactive(false);
                        chart.useVoronoi(false);
                    }
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    //@todo yAxis.orient( (_) ? 'right' : 'left');
                }},
            duration:    {get: function(){return duration;}, set: function(_){
                    duration = _;
                    lines.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                }}
        });

        nv.utils.inheritOptions(chart, lines);
        nv.utils.initOptions(chart);

        return chart;
    };
    'use strict';

    nv.models.differenceChart = function () {
        'use strict';

        var container = void 0;
        var multiChart = nv.models.multiChart();
        var focus = nv.models.focus(nv.models.line());
        // const dispatch = d3.dispatch();
        // yAccessor for multi chart
        // Not modifiable by end user. They can
        // overload yAccessor which is used during the processData step
        var yForMultiChart = function yForMultiChart(d) {
            // check if the data is for an area chart
            // which has y0 and y1 values
            if (isDefined(d.y0)) {
                return d.y0;
            }
            // otherwise assume it's for a line chart
            return d.y;
        };
        var xForMultiChart = function xForMultiChart(d) {
            return d.x;
        };
        var xAccessor = function xAccessor(d) {
            return d.x;
        };
        var keyForXValue = 'x';
        var yAccessor = function yAccessor(d) {
            return d.y;
        };
        var duration = 300;
        var t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear);
        var keyForActualLessThanPredicted = null;
        var keyForActualGreaterThanPredicted = null;
        var height = null;
        var width = null;
        var margin = { top: 30, right: 50, bottom: 20, left: 70 };
        var focusMargin = { top: 0, right: 0, bottom: 0, left: 0 };
        var showPredictedLine = true;
        var interpolate = getInterpolationType(interpolate);
        var strokeWidth = 1;
        var xScale = d3.scaleTime();
        var tickFormat = d3.timeFormat([['%I:%M', function (d) {
            return d.getMinutes();
        }], ['%I %p', function (d) {
            return d.getHours();
        }], ['%a %d', function (d) {
            return d.getDay() && d.getDate() != 1;
        }], ['%b %d', function (d) {
            return d.getDate() != 1;
        }], ['%B', function (d) {
            return d.getMonth();
        }], ['%Y', function () {
            return true;
        }]]);

        function chart(selection) {
            selection.each(function (data) {
                container = d3.select(this);
                var dataWithoutDisabledSeries = (data || []).filter(function (dataset) {
                    return !dataset.disabled;
                });
                if (!data || !dataWithoutDisabledSeries.length) {
                    nv.utils.noData(chart, container);
                    return chart;
                }
                var processedData = processData(data);
                var availableHeight = nv.utils.availableHeight(height, container, margin) - focus.height();
                var availableWidth = nv.utils.availableWidth(width, container, margin);

                container.attr('class', 'nv-differenceChart');

                nv.utils.initSVG(container);

                chart.container = this;

                multiChart.margin(margin).color(d3.scaleOrdinal(d3.schemeCategory10).range()).y(yForMultiChart).width(width).height(availableHeight).interpolate(interpolate).useInteractiveGuideline(true);

                multiChart.interactiveLayer.tooltip.valueFormatter(function (value, i, datum) {
                    if (datum.key === keyForActualGreaterThanPredicted || datum.key === keyForActualLessThanPredicted) {
                        var diff = Math.abs(datum.data.y0 - datum.data.y1);
                        if (diff === 0) {
                            return '-';
                        }
                        return diff;
                    }
                    return value;
                });

                multiChart.stack1.areaY1(function (d) {
                    return multiChart.stack1.scatter.yScale()(d.display.y);
                });

                multiChart.stack1.transformData(function (d) {
                    d.display = { y: d.y1, y0: d.y0 };
                });
                multiChart.xAxis.scale(xScale);
                multiChart.xAxis.tickFormat(tickFormat);
                var allValues = processedData.filter(function (dataset) {
                    return !dataset.disabled;
                }).map(function (dataset) {
                    return dataset.values;
                });
                var dateExtent = d3.extent(d3.merge(allValues), function (d) {
                    return xForMultiChart(d);
                });
                multiChart.xAxis.domain(dateExtent).range([0, availableWidth]);

                var yExtent = d3.extent(d3.merge(allValues), function (d) {
                    return yForMultiChart(d);
                });
                multiChart.yDomain1(yExtent);
                multiChart.yAxis1.tickFormat(d3.format(',.1f'));
                multiChart.yAxis2.tickFormat(d3.format(',.1f'));

                focus.width(availableWidth);
                focus.margin(focusMargin);
                focus.xScale(xScale.copy());
                focus.xAxis.tickFormat(tickFormat);
                focus.xAxis.rotateLabels(0);
                var gAppend=container.append('g').attr('class', 'nv-focusWrap').style('display', 'initial').attr('transform', 'translate(' + margin.left + ', ' + (availableHeight + focus.margin().top) + ')').datum(processedData.filter(function (dataset) {
                    return dataset.type === 'line';
                })).call(focus);

                gAppend.datum(processedData).call(multiChart);

                focus.dispatch.on('brush', function (extent) {
                    var filteredData = processedData.map(function (datum) {
                        var leftIndex = -1;
                        var rightIndex = -1;
                        datum.values.some(function (val, index) {
                            if (leftIndex === -1 && val.x >= extent[0]) {
                                leftIndex = index;
                            }

                            if (rightIndex === -1 && val.x >= extent[1]) {
                                rightIndex = index;
                                return true;
                            }
                            return false;
                        });
                        var filteredValues = datum.values.slice(leftIndex, rightIndex);
                        var iterations = 0;
                        // don't want to end up with an empty dataset as this will
                        // break the viewfinder.
                        while (filteredValues.length < 2 && iterations < 5) {
                            leftIndex -= 1;
                            rightIndex += 1;
                            filteredValues = datum.values.slice(leftIndex, rightIndex);
                            iterations++;
                        }

                        return Object.assign({}, datum, {
                            values: filteredValues
                        });
                    });

                    gAppend.datum(filteredData);

                    multiChart.xAxis.domain(extent);

                    multiChart.update();
                });

                chart.update = function () {
                    gAppend.selectAll('*').remove();

                    if (duration === 0) {
                        gAppend.call(chart);
                    } else {
                        gAppend.transition().duration(duration).call(chart);
                    }
                };

                return chart;
            });
        }

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            width: {
                get: function get() {
                    return width;
                },
                set: function set(_) {
                    width = _;
                }
            },
            height: {
                get: function get() {
                    return height;
                },
                set: function set(_) {
                    height = _;
                }
            },
            strokeWidth: {
                get: function get() {
                    return strokeWidth;
                },
                set: function set(_) {
                    strokeWidth = _;
                }
            },
            x: {
                get: function get() {
                    return xAccessor;
                },
                set: function set(_) {
                    xAccessor = _;
                }
            },
            keyForXValue: {
                get: function get() {
                    return keyForXValue;
                },
                set: function set(_) {
                    keyForXValue = _;
                }
            },
            y: {
                get: function get() {
                    return yAccessor;
                },
                set: function set(_) {
                    yAccessor = _;
                }
            },
            xScale: {
                get: function get() {
                    return xScale;
                },
                set: function set(_) {
                    xScale = _;
                }
            },
            keyForActualLessThanPredicted: {
                get: function get() {
                    return keyForActualLessThanPredicted;
                },
                set: function set(_) {
                    keyForActualLessThanPredicted = _;
                }
            },
            keyForActualGreaterThanPredicted: {
                get: function get() {
                    return keyForActualGreaterThanPredicted;
                },
                set: function set(_) {
                    keyForActualGreaterThanPredicted = _;
                }
            },
            showPredictedLine: {
                get: function get() {
                    return showPredictedLine;
                },
                set: function set(_) {
                    showPredictedLine = _;
                }
            },
            tickFormat: {
                get: function get() {
                    return tickFormat;
                },
                set: function set(_) {
                    tickFormat = _;
                }
            },
            interpolate: {
                get: function get() {
                    return interpolate;
                },
                set: function set(_) {
                    interpolate = _;
                }
            },
            focusMargin: {
                get: function get() {
                    return focusMargin;
                },
                set: function set(_) {
                    focusMargin.top = _.top !== undefined ? _.top : focusMargin.top;
                    focusMargin.right = _.right !== undefined ? _.right : focusMargin.right;
                    focusMargin.bottom = _.bottom !== undefined ? _.bottom : focusMargin.bottom;
                    focusMargin.left = _.left !== undefined ? _.left : focusMargin.left;
                }
            },
            margin: {
                get: function get() {
                    return margin;
                },
                set: function set(_) {
                    margin.top = _.top !== undefined ? _.top : margin.top;
                    margin.right = _.right !== undefined ? _.right : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left = _.left !== undefined ? _.left : margin.left;
                }
            }
        });

        function processData(data) {
            var clonedData = data.slice(0);
            var allProcessed = clonedData.every(function (dataset) {
                return dataset.processed;
            });
            var actualData = clonedData.filter(function (dataSet) {
                return dataSet.type === 'actual';
            });
            var predictedData = clonedData.filter(function (dataSet) {
                return dataSet.type === 'expected';
            });

            if (allProcessed) {
                return clonedData;
            } else if (!actualData.length || !predictedData.length) {
                return [];
            }

            var defaultKeyForActualLessThanPredicted = predictedData[0].key + ' minus ' + actualData[0].key + ' (Predicted > Actual)';
            var defaultKeyForActualGreaterThanPredicted = predictedData[0].key + ' minus ' + actualData[0].key + ' (Predicted < Actual)';
            // processedData is mapped as follows:
            //  [0] => Savings (actual under predicted) area
            //  [1] => 'Loss' (actual over predicted) area
            //  [2] => Actual profile
            //  [3] => Predicted profile
            var processedData = [{
                key: keyForActualLessThanPredicted || defaultKeyForActualLessThanPredicted,
                type: 'area',
                values: [],
                yAxis: 1,
                color: 'rgba(44,160,44,.9)',
                processed: true,
                noHighlightSeries: true
            }, {
                key: keyForActualGreaterThanPredicted || defaultKeyForActualGreaterThanPredicted,
                type: 'area',
                values: [],
                yAxis: 1,
                color: 'rgba(234,39,40,.9)',
                processed: true,
                noHighlightSeries: true
            }, {
                key: actualData[0].key,
                type: 'line',
                values: [],
                yAxis: 1,
                color: '#666666',
                processed: true,
                strokeWidth: strokeWidth
            }];

            if (showPredictedLine) {
                processedData[3] = {
                    key: predictedData[0].key,
                    type: 'line',
                    values: [],
                    yAxis: 1,
                    color: '#aec7e8',
                    processed: true,
                    strokeWidth: strokeWidth
                };
            }

            var actualDataAsMap = actualData[0].values.reduce(function (result, datum, idx) {
                result[xAccessor(datum)] = yAccessor(datum);
                return result;
            }, {});

            var predictedDataAsMap = predictedData[0].values.reduce(function (result, datum, idx) {
                result[xAccessor(datum)] = yAccessor(datum);
                return result;
            }, {});

            Object.keys(actualDataAsMap).forEach(function (stringifiedXValue, idx) {
                var actualUsage = actualDataAsMap[stringifiedXValue];
                var predictedUsage = predictedDataAsMap[stringifiedXValue];
                var fakeDatumToGetProperXValue = {};
                // NB - stringifiedXValue will not be the correct data type
                // e.g. you might want to use a number/date. Pass the stringified
                // version back through xAccessor.
                fakeDatumToGetProperXValue[keyForXValue] = stringifiedXValue;
                var correctlyFormattedXValue = xAccessor(fakeDatumToGetProperXValue);

                var predictedActualDelta = predictedUsage - actualUsage;
                // The below code generates data for the difference chart.
                // We have four series: two for the area (processedData[0] and processedData[1]) charts
                // and two for the line charts ([2] and [3]). The way we achieve difference chart
                // is that for each datapoint, we calculate whether it represents a 'savings'
                // (actual less than predicted) or a 'loss' (actual greater than predicted).
                // The two areas are different colours (e.g. out of the box, a loss is red and a
                // saving is green).
                // If it's a loss, then we add an area datapoint in the loss dataset ranging from actual to predicted
                // (the area represents the magnitude of the loss).
                // At the same time, for the savings dataset, we make the datapoint equivalent to actual usage so that
                // a dot renders rather than a proper area. This basically makes the savings area invisible
                // when there is a loss.
                //
                // The opposite occurs when predicted is greater than savings (a saving).
                if (isNaN(predictedActualDelta)) {
                    // if there is no predicted value for this point, just use actual usage
                    processedData[1].values[idx] = {
                        x: correctlyFormattedXValue,
                        y0: actualUsage,
                        y1: actualUsage
                    };
                    processedData[0].values[idx] = {
                        x: correctlyFormattedXValue,
                        y0: actualUsage,
                        y1: actualUsage
                    };
                }
                else if (predictedActualDelta < 0) {
                    // actual greater than predicted - this is a loss
                    // add area for loss between actualUsage (y0) and predictedUsage(y1)
                    processedData[1].values[idx] = {
                        x: correctlyFormattedXValue,
                        y0: actualUsage,
                        y1: predictedUsage
                    };
                    // for the saving data series, render a dot (y0 and y1) at actualUsage - need
                    // this rather than NaN because otherwise if the next datapoint is a saving,
                    // D3 won't be able to link the two areas together
                    processedData[0].values[idx] = {
                        x: correctlyFormattedXValue,
                        y0: actualUsage,
                        y1: actualUsage
                    };
                } else {
                    processedData[0].values[idx] = {
                        x: correctlyFormattedXValue,
                        y0: actualUsage,
                        y1: predictedUsage
                    };
                    processedData[1].values[idx] = {
                        x: correctlyFormattedXValue,
                        y0: actualUsage,
                        y1: actualUsage
                    };
                }
                // Set actual
                processedData[2].values[idx] = { x: correctlyFormattedXValue, y: actualUsage };
                // Set predicted
                if (showPredictedLine) {
                    processedData[3].values[idx] = { x: correctlyFormattedXValue, y: predictedUsage };
                }
            });

            return processedData;
        }

        function isDefined(thingToCheck) {
            // NB: void 0 === undefined
            return thingToCheck !== void 0;
        }

        chart.xAxis = multiChart.xAxis;
        chart.yAxis = multiChart.yAxis1;
        chart.multiChart = multiChart;
        chart.focus = focus;
        chart.processData = processData;
        nv.utils.inheritOptions(chart, multiChart);
        nv.utils.initOptions(chart);

        return chart;
    };
//TODO: consider deprecating by adding necessary features to multiBar model
    nv.models.discreteBar = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 960
            , height = 500
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container
            , x = d3.scaleBand()
            , y = d3.scaleLinear()
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , forceY = [0] // 0 is forced by default.. this makes sense for the majority of bar graphs... user can always do chart.forceY([]) to remove
            , color = nv.utils.defaultColor()
            , cornerRadius = 0 // sets corner radius (in pixels) to each bar
            , showValues = false
            , valueFormat = d3.format(',.2f')
            , xDomain
            , yDomain
            , xRange
            , yRange
            , dispatch = d3.dispatch('chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd')
            , rectClass = 'discreteBar'
            , duration = 250
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var x0, y0;
        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                container = d3.select(this);
                nv.utils.initSVG(container);

                //add series index to each data point for reference
                data.forEach(function(series, i) {
                    series.values.forEach(function(point) {
                        point.series = i;
                        point.seriesIndex = i;
                    });
                });

                // Setup Scales
                // remap and flatten the data for use in calculating the scales' domains
                var seriesData = (xDomain && yDomain) ? [] : // if we know xDomain and yDomain, no need to calculate
                    data.map(function(d) {
                        return d.values.map(function(d,i) {
                            return { x: getX(d,i), y: getY(d,i), y0: d.y0 }
                        })
                    });

                x   .domain(xDomain || d3.merge(seriesData).map(function(d) { return d.x }))
                    .range(xRange || [0, availableWidth], .1);
                y   .domain(yDomain || d3.extent(d3.merge(seriesData).map(function(d) { return d.y }).concat(forceY)));

                // If showValues, pad the Y axis range to account for label height
                if (showValues) y.range(yRange || [availableHeight - (y.domain()[0] < 0 ? 12 : 0), y.domain()[1] > 0 ? 12 : 0]);
                else y.range(yRange || [availableHeight, 0]);

                //store old scales if they exist
                x0 = x0 || x;
                y0 = y0 || y.copy().range([y(0),y(0)]);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-discretebar').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-discretebar');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var groupsAppend=gEnter.append('g').attr('class', 'nv-groups');

                //TODO: by definition, the discrete bar should not have multiple groups, will modify/remove later
                var groups = groupsAppend.selectAll('.nv-group')
                    .data(function(d) { return d }, function(d) { return d.key });
                var gAppend=groups.enter().append('g')
                    .style('stroke-opacity', 1e-6)
                    .style('fill-opacity', 1e-6);
                gAppend.exit()
                    .watchTransition(renderWatch, 'discreteBar: exit groups')
                    .style('stroke-opacity', 1e-6)
                    .style('fill-opacity', 1e-6)
                    .remove();
                gAppend
                    .attr('class', function(d,i) { return 'nv-group nv-series-' + i })
                    .classed('hover', function(d) { return d.hover });
                gAppend
                    .watchTransition(renderWatch, 'discreteBar: groups')
                    .style('stroke-opacity', 1)
                    .style('fill-opacity', .75);

                var bars = gAppend.selectAll('g.nv-bar')
                    .data(function(d) { return d.values });
                bars.exit().remove();

                var barsEnter = bars.enter().append('g')
                    .attr('transform', function(d,i,j) {
                        return 'translate(' + (x(getX(d,i)) + x.bandwidth() * .05 ) + ', ' + y(0) + ')'
                    })
                    .on('mouseover', function(event,d,i) { //TODO: figure out why j works above, but not here
                        setCoordinates(event.pageX, event.pageY);
                        d3.select(this).classed('hover', true);
                        dispatch.call('elementMouseover', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('mouseout', function(event,d,i) {
                        d3.select(this).classed('hover', false);
                        dispatch.call('elementMouseout', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('mousemove', function(event,d,i) {
                        dispatch.call('elementMousemove', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('click', function(event,d,i) {
                        var element = this;
                        dispatch.call('elementClick', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill"),
                            event: event,
                            element: element
                        });
                        event.stopPropagation();
                    })
                    .on('dblclick', function(event,d,i) {
                        dispatch.call('elementDblClick', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                        event.stopPropagation();
                    });

                var rectAppend=barsEnter.append('rect')
                    .attr('height', 0)
                    .attr('width', x.bandwidth() * .9 / data.length )

                if (showValues) {
                    var textAppend=barsEnter.append('text')
                        .attr('text-anchor', 'middle')
                    ;

                    textAppend
                        .text(function(d,i) { return valueFormat(getY(d,i)) })
                        .watchTransition(renderWatch, 'discreteBar: bars text')
                        .attr('x', x.bandwidth() * .9 / 2)
                        .attr('y', function(d,i) { return getY(d,i) < 0 ? y(getY(d,i)) - y(0) + 12 : -4 })

                    ;
                } else {
                    rectAppend.selectAll('text').remove();
                }

                barsEnter
                    .attr('class', function(d,i) { return getY(d,i) < 0 ? 'nv-bar negative' : 'nv-bar positive' })
                    .style('fill', function(d,i) { return d.color || color(d,i) })
                    .style('stroke', function(d,i) { return d.color || color(d,i) })
                    .select('rect')
                    .attr('rx', cornerRadius)
                    .attr('class', rectClass)
                    .watchTransition(renderWatch, 'discreteBar: bars rect')
                    .attr('width', x.bandwidth() * .9 / data.length);
                barsEnter.watchTransition(renderWatch, 'discreteBar: bars')
                    //.delay(function(d,i) { return i * 1200 / data[0].values.length })
                    .attr('transform', function(d,i) {
                        var left = x(getX(d,i)) + x.bandwidth() * .05,
                            top = getY(d,i) < 0 ?
                                y(0) :
                                y(0) - y(getY(d,i)) < 1 ?
                                    y(0) - 1 : //make 1 px positive bars show up above y=0
                                    y(getY(d,i));

                        return 'translate(' + left + ', ' + top + ')'
                    })
                    .select('rect')
                    .attr('height', function(d,i) {
                        return  Math.max(Math.abs(y(getY(d,i)) - y(0)), 1)
                    });

                //store old scales for use in transitions on update
                x0 = x.copy();
                y0 = y.copy();

            });

            renderWatch.renderEnd('discreteBar immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:   {get: function(){return width;}, set: function(_){width=_;}},
            height:  {get: function(){return height;}, set: function(_){height=_;}},
            forceY:  {get: function(){return forceY;}, set: function(_){forceY=_;}},
            showValues: {get: function(){return showValues;}, set: function(_){showValues=_;}},
            cornerRadius:{get: function(){return cornerRadius;}, set: function(_){cornerRadius=_}},
            x:       {get: function(){return getX;}, set: function(_){getX=_;}},
            y:       {get: function(){return getY;}, set: function(_){getY=_;}},
            xScale:  {get: function(){return x;}, set: function(_){x=_;}},
            yScale:  {get: function(){return y;}, set: function(_){y=_;}},
            xDomain: {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain: {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:  {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:  {get: function(){return yRange;}, set: function(_){yRange=_;}},
            valueFormat:    {get: function(){return valueFormat;}, set: function(_){valueFormat=_;}},
            id:          {get: function(){return id;}, set: function(_){id=_;}},
            rectClass: {get: function(){return rectClass;}, set: function(_){rectClass=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.discreteBarChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var discretebar = nv.models.discreteBar()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , legend = nv.models.legend()
            , tooltip = nv.models.tooltip()
        ;

        var margin = {top: 15, right: 10, bottom: 50, left: 60}
            , marginTop = null
            , width = null
            , height = null
            , color = nv.utils.getColor()
            , showLegend = false
            , showXAxis = true
            , showYAxis = true
            , rightAlignYAxis = false
            , staggerLabels = false
            , wrapLabels = false
            , rotateLabels = 0
            , x
            , y
            , noData = null
            , dispatch = d3.dispatch('beforeUpdate','renderEnd')
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear);

        xAxis.showMaxMin(false)
        xAxis
            .tickFormat(function(d) { return d })
        ;
        yAxis
            //.orient((rightAlignYAxis) ? 'right' : 'left')
            .tickFormat(d3.format(',.1f'))
        ;

        tooltip
            .duration(0)
            .headerEnabled(false)
            .valueFormatter(function(d, i) {
                return yAxis.tickFormat()(d, i);
            })
            .keyFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            });

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(discretebar);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this),
                    that = this;
                nv.utils.initSVG(container);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() {
                    dispatch.call('beforeUpdate', that);
                    container.transition().duration(duration).call(chart);
                };
                chart.container = this;

                // Display No Data message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container);
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = discretebar.xScale();
                y = discretebar.yScale().clamp(true);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-discreteBarWithAxes').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-discreteBarWithAxes');

                var gEnter = wrapEnter.append('g');
                gEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                var defsEnter = gEnter.append('defs');
                var g = gEnter.select('g');

                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-discreteBarWithAxes').select('.nv-x');
                var yAxisAppend=gEnter.append('g').attr('class', 'nv-y nv-axis');
                var lineAppend=yAxisAppend
                    .append('g').attr('class', 'nv-zeroLine')
                    .append('line');

                var barsWrapAppend=gEnter.append('g').attr('class', 'nv-barsWrap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-discreteBarWithAxes').select('.nv-legendWrap');
                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    legend.width(availableWidth);

                    legendWrapAppend
                        .datum(data)
                        .call(legend);

                    if (!marginTop && legend.height() !== margin.top) {
                        margin.top = legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                    }

                    legendWrapAppend
                        .attr('transform', 'translate(0,' + (-margin.top) +')')
                }

                if (rightAlignYAxis) {
                    yAxisAppend
                        .attr("transform", "translate(" + availableWidth + ",0)");
                }

                // Main Chart Component(s)
                discretebar
                    .width(availableWidth)
                    .height(availableHeight);

                var barsWrap = barsWrapAppend
                    .datum(data.filter(function(d) { return !d.disabled }));

                barsWrap.transition().duration(0).call(discretebar);


                var defsRect=defsEnter.append('clipPath')
                    .attr('id', 'nv-x-label-clip-' + discretebar.id())
                    .append('rect');

                defsRect
                    .attr('width', x.bandwidth() * (staggerLabels ? 2 : 1))
                    .attr('height', 16)
                    .attr('x', -x.bandwidth() / (staggerLabels ? 1 : 2 ));

                // Setup Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner(-availableHeight);

                    xAxisAppend
                        .attr('transform', 'translate(0,' + (y.range()[0] + ((discretebar.showValues() && y.domain()[0] < 0) ? 16 : 0)) + ')');
                    xAxisAppend.call(xAxis);

                    var xTicks = xAxisAppend.select("g.nvd3.nv-wrap.nv-axis").selectAll('g');
                    if (staggerLabels) {
                        xTicks
                            .selectAll('text')
                            .attr('transform', function(d,i,j) { return 'translate(0,' + (j % 2 == 0 ? '5' : '17') + ')' })
                    }

                    if (rotateLabels) {
                        xTicks
                            .selectAll('.tick text')
                            .attr('transform', 'rotate(' + rotateLabels + ' 0,0)')
                            .style('text-anchor', rotateLabels > 0 ? 'start' : 'end');
                    }

                    if (wrapLabels) {
                        g.selectAll('.tick text')
                            .call(nv.utils.wrapTicks, chart.xAxis.bandwidth())
                    }
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( nv.utils.calcTicksY(availableHeight/36, data, discretebar.y()) )
                    yAxis
                        .tickSizeInner( -availableWidth);

                    yAxisAppend.call(yAxis);
                }

                // Zero line
                lineAppend
                    .attr("x1",0)
                    .attr("x2",(rightAlignYAxis) ? -availableWidth : availableWidth)
                    .attr("y1", y(0))
                    .attr("y2", y(0))
                ;
            });

            renderWatch.renderEnd('discreteBar chart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        discretebar.dispatch.on('elementMouseover.tooltip', function(evt) {
            evt['series'] = {
                key: chart.x()(evt.data),
                value: chart.y()(evt.data),
                color: evt.color
            };
            tooltip.data(evt).hidden(false);
        });

        discretebar.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        discretebar.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.discretebar = discretebar;
        chart.legend = legend;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            staggerLabels: {get: function(){return staggerLabels;}, set: function(_){staggerLabels=_;}},
            rotateLabels:  {get: function(){return rotateLabels;}, set: function(_){rotateLabels=_;}},
            wrapLabels:  {get: function(){return wrapLabels;}, set: function(_){wrapLabels=!!_;}},
            showXAxis: {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis: {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                    discretebar.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    discretebar.color(color);
                    legend.color(color);
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    yAxis.orient( (_) ? 'right' : 'left');
                }}
        });

        nv.utils.inheritOptions(chart, discretebar);
        nv.utils.initOptions(chart);

        return chart;
    }

    nv.models.distribution = function() {
        "use strict";
        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 400 //technically width or height depending on x or y....
            , size = 8
            , axis = 'x' // 'x' or 'y'... horizontal or vertical
            , getData = function(d) { return d[axis] }  // defaults d.x or d.y
            , color = nv.utils.defaultColor()
            , scale = d3.scaleLinear()
            , domain
            , duration = 250
            , dispatch = d3.dispatch('renderEnd')
        ;

        //============================================================


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var scale0;
        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        //============================================================


        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var availableLength = width - (axis === 'x' ? margin.left + margin.right : margin.top + margin.bottom),
                    naxis = axis == 'x' ? 'y' : 'x',
                    container = d3.select(this);
                nv.utils.initSVG(container);

                //------------------------------------------------------------
                // Setup Scales

                scale0 = scale0 || scale;

                //------------------------------------------------------------


                //------------------------------------------------------------
                // Setup containers and skeleton of chart

                var wrap = container.selectAll('g.nv-distribution').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-distribution');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

                var gEnter = wrapEnter.append('g');
                var g = wrap.select('g');

                //------------------------------------------------------------


                var distWrap = gEnter.selectAll('g.nv-dist')
                    .data(function(d) { return d }, function(d) { return d.key });

                distWrap.enter().append('g')
                    .attr('class', function(d,i) { return 'nv-dist nv-series-' + i })
                    .style('stroke', function(d,i) { return color(d, i) });

                var dist = distWrap.selectAll('line.nv-dist' + axis)
                    .data(function(d) { return d.values })
                dist.enter().append('line')
                    .attr(axis + '1', function(d,i) { return scale0(getData(d,i)) })
                    .attr(axis + '2', function(d,i) { return scale0(getData(d,i)) })
                renderWatch.transition(distWrap.exit().selectAll('line.nv-dist' + axis), 'dist exit')
                    // .transition()
                    .attr(axis + '1', function(d,i) { return scale(getData(d,i)) })
                    .attr(axis + '2', function(d,i) { return scale(getData(d,i)) })
                    .style('stroke-opacity', 0)
                    .remove();
                dist
                    .attr('class', function(d,i) { return 'nv-dist' + axis + ' nv-dist' + axis + '-' + i })
                    .attr(naxis + '1', 0)
                    .attr(naxis + '2', size);
                renderWatch.transition(dist, 'dist')
                    // .transition()
                    .attr(axis + '1', function(d,i) { return scale(getData(d,i)) })
                    .attr(axis + '2', function(d,i) { return scale(getData(d,i)) })


                scale0 = scale.copy();

            });
            renderWatch.renderEnd('distribution immediate');
            return chart;
        }


        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------
        chart.options = nv.utils.optionsFunc.bind(chart);
        chart.dispatch = dispatch;

        chart.margin = function(_) {
            if (!arguments.length) return margin;
            margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
            margin.right  = typeof _.right  != 'undefined' ? _.right  : margin.right;
            margin.bottom = typeof _.bottom != 'undefined' ? _.bottom : margin.bottom;
            margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
            return chart;
        };

        chart.width = function(_) {
            if (!arguments.length) return width;
            width = _;
            return chart;
        };

        chart.axis = function(_) {
            if (!arguments.length) return axis;
            axis = _;
            return chart;
        };

        chart.size = function(_) {
            if (!arguments.length) return size;
            size = _;
            return chart;
        };

        chart.getData = function(_) {
            if (!arguments.length) return getData;
            getData = typeof _ === "function" ? _ : function() {return _;};
            return chart;
        };

        chart.scale = function(_) {
            if (!arguments.length) return scale;
            scale = _;
            return chart;
        };

        chart.color = function(_) {
            if (!arguments.length) return color;
            color = nv.utils.getColor(_);
            return chart;
        };

        chart.duration = function(_) {
            if (!arguments.length) return duration;
            duration = _;
            renderWatch.reset(duration);
            return chart;
        };
        //============================================================


        return chart;
    }
    nv.models.distroPlot = function() {
        "use strict";

        // IMPROVEMENTS:
        // - cleanup tooltip to look like candlestick example (don't need color square for everything)
        // - extend y scale range to min/max data better visually
        // - tips of violins need to be cut off if very long
        // - transition from box to violin not great since box only has a few points, and violin has many - need to generate box with as many points as violin
        // - when providing colorGroup, should color boxes by either parent or child group category (e.g. isolator)

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0},
            width = 960,
            height = 500,
            id = Math.floor(Math.random() * 10000), // Create semi-unique ID in case user doesn't select one
            xScale = d3.scaleBand(),
            yScale = d3.scaleLinear(),
            getX  = function(d) { return d.label }, // Default data model selectors.
            getY  = function(d) { return d.value },
            getColor = function(d) { return d.color },
            getQ1 = function(d) { return d.values.q1 },
            getQ2 = function(d) { return d.values.q2 },
            getQ3 = function(d) { return d.values.q3 },
            getNl = function(d) { return (centralTendency == 'mean' ? getMean(d) : getQ2(d)) - d.values.notch },
            getNu = function(d) { return (centralTendency == 'mean' ? getMean(d) : getQ2(d)) + d.values.notch },
            getMean = function(d) { return d.values.mean },
            getWl = function(d) { return d.values.wl[whiskerDef] },
            getWh = function(d) { return d.values.wu[whiskerDef] },
            getMin = function(d) { return d.values.min },
            getMax = function(d) { return d.values.max },
            getDev = function(d) { return d.values.dev },
            getValsObj = function(d) { return d.values.observations; },
            getValsArr = function(d) { return d.values.observations.map(function(e) { return e.y }); },
            plotType, // type of background: 'box', 'violin', 'none'/false - default: 'box' - 'none' will activate random scatter automatically
            observationType = false, // type of observations to show: 'random', 'swarm', 'line', 'centered' - default: false (don't show any observations, even if an outlier)
            whiskerDef = 'iqr', // type of whisker to render: 'iqr', 'minmax', 'stddev' - default: iqr
            hideWhiskers = false,
            notchBox = false, // bool whether to notch box
            colorGroup = false, // if specified, each x-category will be split into groups, each colored
            centralTendency = false,
            showOnlyOutliers = true, // show only outliers in box plot
            jitter = 0.7, // faction of that jitter should take up in 'random' observationType, must be in range [0,1]; see jitterX(), default 0.7
            squash = true, // whether to remove the x-axis positions for empty data groups, default is true
            bandwidth = 'scott', // bandwidth for kde calculation, can be float or str, if str, must be one of scott or silverman
            clampViolin = true, // whether to clamp the "tails" of the violin; prevents long 0-density area
            resolution = 50,
            pointSize = 3,
            color = nv.utils.defaultColor(),
            container = null,
            xDomain, xRange,
            yDomain, yRange,
            dispatch = d3.dispatch('elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd'),
            duration = 250,
            maxBoxWidth = null;

        //============================================================
        // Helper Functions
        //------------------------------------------------------------


        /* Returns the smaller of std(X, ddof=1) or normalized IQR(X) over axis 0.
     *
     * @param (list) x - input x formatted as a single list of values
     *
     * @return float
     *
     * Source: https://github.com/statsmodels/statsmodels/blob/master/statsmodels/nonparametric/bandwidths.py#L9
     */
        function select_sigma(x) {
            var sorted = x.sort(d3.ascending); // sort our dat
            var normalize = 1.349;
            var IQR = (d3.quantile(sorted, 0.75) - d3.quantile(sorted, 0.25))/normalize; // normalized IQR
            return d3.min([d3.deviation(sorted), IQR]);
        }

        /*
    Scott's Rule of Thumb

    Parameters
    ----------
    x : array-like
        Array for which to get the bandwidth
    type : string
           The type of estimate to use, must be one of scott or silverman

    Returns
    -------
    bw : float
        The estimate of the bandwidth

    Notes
    -----
    Returns 1.059 * A * n ** (-1/5.) where ::
       A = min(std(x, ddof=1), IQR/1.349)
       IQR = np.subtract.reduce(np.percentile(x, [75,25]))

    References
    ----------
    Scott, D.W. (1992) Multivariate Density Estimation: Theory, Practice, and
        Visualization.
     */
        function calcBandwidth(x, type) {

            if (typeof type === 'undefined') type = 'scott';

            // TODO: consider using https://github.com/jasondavies/science.js
            var A = select_sigma(x);
            var n = x.length;
            return type==='scott' ? Math.pow(1.059 * A * n, -0.2) : Math.pow(.9 * A * n, -0.2);
        }



        /*
     * Prep data for use with distroPlot by grouping data
     * by .x() option set by user and then calculating
     * count, sum, mean, q1, q2 (median), q3, lower whisker (wl)
     * upper whisker (wu), iqr, min, max, and standard dev.
     *
     * NOTE: preparing this data can be resource intensive, and
     *       is therefore only run once on plot load. It can
     *       manually be run by calling recalcData(). This should
     *       be re-run any time the axis accessors are changed or
     *       when bandwidth/resolution are updated.
     *
     * NOTE: this will also setup the individual vertical scales
     *       for the violins.
     *
     * @param (list) dat - input data formatted as list of objects,
     *   with an object key that must exist when accessed by getX()
     *
     * @return prepared data in the form for box plotType:
     * [{
     *    key : YY,
     *    values: {
     *      count: XX,
     *      sum: XX,
     *      mean: XX,
     *      q1: XX,
     *      q2: XX,
     *      q3: XX,
     *      wl: XX,
     *      wu: XX,
     *      iqr: XX,
     *      min: XX,
     *      max: XX,
     *      dev: XX,
     *      observations: [{y:XX,..},..],
     *      key: XX,
     *      kdeDat: XX,
     *      notch: XX,
     *    }
     *  },
     *  ...
     *  ]
     * for violin plotType:
     * [{
     *    key : YY,
     *    values: {
     *      original: [{y:XX,..},..]
     *    }
     *  },
     *  ...
     *  ]
     * where YY are those keys in dat that define the
     * x-axis and which are defined by .x()
     */
        function prepData(dat) {

            // helper function to calcuate the various boxplot stats
            function calcStats(g, xGroup) {

                // sort data by Y so we can calc quartiles
                var v = g.map(function(d) {
                    if (colorGroup) allColorGroups.add(colorGroup(d)); // list of all colorGroups; used to set x-axis
                    return getY(d);
                }).sort(d3.ascending);

                var q1 = d3.quantile(v, 0.25);
                var q3 = d3.quantile(v, 0.75);
                var iqr = q3 - q1;
                var upper = q3 + 1.5 * iqr;
                var lower = q1 - 1.5 * iqr;

                /* whisker definitions:
             *  - iqr: also known as Tukey boxplot, the lowest datum still within 1.5 IQR of the lower quartile, and the highest datum still within 1.5 IQR of the upper quartile
             *  - minmax: the minimum and maximum of all of the data
             *  - sttdev: one standard deviation above and below the mean of the data
             * Note that the central tendency type (median or mean) does not impact the whisker location
             */
                var wl = {iqr: d3.max([d3.min(v),  d3.min(v.filter(function(d) {return d > lower}))]), minmax: d3.min(v), stddev: d3.mean(v) - d3.deviation(v)};
                var wu = {iqr: d3.min([d3.max(v), d3.max(v.filter(function(d) {return d < upper}))]), minmax: d3.max(v), stddev: d3.mean(v) + d3.deviation(v)};
                var median = d3.median(v);
                var mean = d3.mean(v);
                var observations = [];


                // d3-beeswarm library must be externally loaded if being used
                // https://github.com/Kcnarf/d3-beeswarm
                if (typeof d3.beeswarm !== 'undefined') {
                    observations = d3.beeswarm()
                        .data(g.map(function(e) { return getY(e); }))
                        .radius(pointSize+1)
                        .orientation('vertical')
                        .side('symmetric')
                        .distributeOn(function(e) { return yScale(e); })
                        .arrange()

                    // add group info for tooltip
                    observations.map(function(e,i) {
                        e.key = xGroup;
                        e.object_constancy = g[i].object_constancy;
                        e.isOutlier = (e.datum < wl.iqr || e.datum > wu.iqr) // add isOulier meta for proper class assignment
                        e.isOutlierStdDev = (e.datum < wl.stddev || e.datum > wu.stddev) // add isOulier meta for proper class assignment
                        e.randX = Math.random() * jitter * (Math.floor(Math.random()*2) == 1 ? 1 : -1) // calculate random x-position only once for each point
                    })
                } else {
                    v.forEach(function(e,i) {
                        observations.push({
                            object_constancy: e.object_constancy,
                            datum: e,
                            key: xGroup,
                            isOutlier: (e < wl.iqr || e > wu.iqr), // add isOulier meta for proper class assignment
                            isOutlierStdDev: (e < wl.stddev || e > wu.stddev), // add isOulier meta for proper class assignment
                            randX: Math.random() * jitter * (Math.floor(Math.random()*2) == 1 ? 1 : -1)
                        })
                    })
                }


                // calculate bandwidth if no number is provided
                if(isNaN(parseFloat(bandwidth))) { // if not is float
                    var bandwidthCalc;
                    if (['scott','silverman'].indexOf(bandwidth) != -1) {
                        bandwidthCalc = calcBandwidth(v, bandwidth);
                    } else {
                        bandwidthCalc = calcBandwidth(v); // calculate with default 'scott'
                    }
                }
                var kde = kernelDensityEstimator(eKernel(bandwidthCalc), yScale._ticks(resolution));
                var kdeDat = clampViolin ? clampViolinKDE(kde(v), d3.extent(v)) : kde(v);


                // make a new vertical scale for each group
                var tmpScale = d3.scaleLinear()
                    .domain([0, d3.max(kdeDat, function (e) { return e.y;})])
                    .clamp(true);
                yVScale.push(tmpScale);

                var reformat = {
                    count: v.length,
                    num_outlier: observations.filter(function (e) { return e.isOutlier; }).length,
                    sum: d3.sum(v),
                    mean: mean,
                    q1: q1,
                    q2: median,
                    q3: q3,
                    wl: wl,
                    wu: wu,
                    iqr: iqr,
                    min: d3.min(v),
                    max: d3.max(v),
                    dev: d3.deviation(v),
                    observations: observations,
                    key: xGroup,
                    kde: kdeDat,
                    notch: 1.57 * iqr / Math.sqrt(v.length), // notch distance from mean/median
                };

                if (colorGroup) {reformatDatFlat.push({key: xGroup, values: reformat});}

                return reformat;
            }

            // assign a unique identifier for each point for object constancy
            // this makes updating data possible
            dat.forEach(function(d,i) { d.object_constancy = i + '_' + getY(d) + '_' + getX(d); })


            // TODO not DRY
            // couldn't find a conditional way of doing the key() grouping
            var formatted;
            if (!colorGroup) {
                formatted = d3.group()
                    .key(function(d) { return getX(d); })
                    .rollup(function(v,i) {
                        return calcStats(v);
                    })
                    .entries(dat);
            } else {
                allColorGroups = new Set() // reset
                var tmp = d3.group()
                    .key(function(d) { return getX(d); })
                    .key(function(d) { return colorGroup(d); })
                    .rollup(function(v) {
                        return calcStats(v, getX(v[0]));
                    })
                    .entries(dat);

                // generate a final list of all x & colorGroup combinations
                // this is used to properly set the x-axis domain
                allColorGroups = allColorGroups.values(); // convert from d3.set to list
                var xGroups = tmp.map(function(d) { return d.key; });
                var allGroups = [];
                for (var i = 0; i < xGroups.length; i++) {
                    for (var j = 0; j < allColorGroups.length; j++) {
                        allGroups.push(xGroups[i] + '_' + allColorGroups[j]);
                    }
                }
                allColorGroups = allGroups;

                // flatten the inner most level so that
                // the plot retains the same DOM structure
                // to allow for smooth updating between
                // all groups.
                formatted = [];
                tmp.forEach(function(d) {
                    d.values.forEach(function(e) { e.key = d.key +'_'+e.key }) // generate a combo key so that each boxplot has a distinct x-position
                    formatted.push.apply(formatted, d.values)
                });

            }
            return formatted;
        }

        // https://bl.ocks.org/mbostock/4341954
        function kernelDensityEstimator(kernel, X) {
            return function (sample) {
                return X.map(function(x) {
                    var y = d3.mean(sample, function (v) {return kernel(x - v);});
                    return {x:x, y:y};
                });
            };
        }

        /*
     * Limit whether the density extends past the extreme datapoints
     * of the violin.
     *
     * @param (list) kde - x & y kde cooridinates
     * @param (list) extent - min/max y-values used for clamping violing
     */
        function clampViolinKDE(kde, extent) {

            // this handles the case when all the x-values are equal
            // which means no kde could be properly calculated
            // just return the kde data so we can continue plotting successfully
            if (extent[0] === extent[1]) return kde;

            var clamped = kde.reduce(function(res, d) {
                if (d.x >= extent[0] && d.x <= extent[1]) res.push(d);
                return res;
            },[]);

            // add the extreme data points back in
            if (extent[0] < clamped[0].x) clamped.unshift({x:extent[0], y:clamped[0].y})
            if (extent[1] > clamped[clamped.length-1].x) clamped.push({x:extent[1], y:clamped[clamped.length-1].y})

            return clamped;

        }

        // https://bl.ocks.org/mbostock/4341954
        function eKernel(scale) {
            return function (u) {
                return Math.abs(u /= scale) <= 1 ? .75 * (1 - u * u) / scale : 0;
            };
        }

        /**
         * Makes the svg polygon string for a boxplot in either a notched
         * or square version
         *
         * NOTE: this actually only draws the left half of the box, since
         * the shape is symmetric (and since this is how violins are drawn)
         * we can simply generate half the box and mirror it.
         *
         * @param boxLeft {float} - left position of box
         * @param notchLeft {float} - left position of notch
         * @param dat {obj} - box plot data that was run through prepDat, must contain
         *      data for Q1, median, Q2, notch upper and notch lower
         * @returns {string} A string in the proper format for a svg polygon
         */
        function makeNotchBox(boxLeft, notchLeft, boxCenter, dat) {

            var boxPoints;
            var y = centralTendency == 'mean' ? getMean(dat) : getQ2(dat); // if centralTendency is not specified, we still want to notch boxes on 'median'
            if (notchBox) {
                boxPoints = [
                    {x:boxCenter, y:yScale(getQ1(dat))},
                    {x:boxLeft, y:yScale(getQ1(dat))},
                    {x:boxLeft, y:yScale(getNl(dat))},
                    {x:notchLeft, y:yScale(y)},
                    {x:boxLeft, y:yScale(getNu(dat))},
                    {x:boxLeft, y:yScale(getQ3(dat))},
                    {x:boxCenter, y:yScale(getQ3(dat))},
                ];
            } else {
                boxPoints = [
                    {x:boxCenter, y:yScale(getQ1(dat))},
                    {x:boxLeft, y:yScale(getQ1(dat))},
                    {x:boxLeft, y:yScale(y)}, // repeated point so that transition between notched/regular more smooth
                    {x:boxLeft, y:yScale(y)},
                    {x:boxLeft, y:yScale(y)}, // repeated point so that transition between notched/regular more smooth
                    {x:boxLeft, y:yScale(getQ3(dat))},
                    {x:boxCenter, y:yScale(getQ3(dat))},
                ];
            }

            return boxPoints;
        }

        /**
         * Given an x-axis group, return the available color groups within it
         * provided that colorGroups is set, if not, x-axis group is returned
         */
        function getAvailableColorGroups(x) {
            if (!colorGroup) return x;
            var tmp = reformatDat.find(function(d) { return d.key == x });
            return tmp.values.map(function(d) { return d.key }).sort(d3.ascending);
        }

        // return true if point is an outlier
        function isOutlier(d) {
            return (whiskerDef == 'iqr' && d.isOutlier) || (whiskerDef == 'stddev' && d.isOutlierStdDev)
        }



        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var allColorGroups = new Set()
        var yVScale = [], reformatDat, reformatDatFlat = [];
        var renderWatch = nv.utils.renderWatch(dispatch, duration);
        var availableWidth, availableHeight;


        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                container = d3.select(this);
                nv.utils.initSVG(container);

                // Setup y-scale so that beeswarm layout can use it in prepData()
                yScale.domain(yDomain || d3.extent(data.map(function(d) { return getY(d)}))).nice()
                    .range(yRange || [availableHeight, 0]);


                if (typeof reformatDat === 'undefined') reformatDat = prepData(data); // this prevents us from recalculating data all the time

                // Setup x-scale
                xScale.range(xRange || [0, availableWidth], 0.1)
                    .domain(xDomain || (colorGroup && !squash) ? allColorGroups : reformatDat.map(function(d) { return d.key }))

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap').data([reformatDat]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap');
                wrapEnter.watchTransition(renderWatch, 'nv-wrap: wrap')
                    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var areaEnter,
                    distroplots = wrapEnter.selectAll('.nv-distroplot-x-group')
                        .data(function(d) { return d; });

                // rebind new data
                // we don't rebuild individual x-axis groups so that we can update transition them
                // however the data associated with each x-axis group needs to be updated
                // so we manually update it here
                distroplots.each(function(d,i) {
                    d3.select(this).selectAll('line.nv-distroplot-middle').datum(d);
                })

                areaEnter = distroplots.enter()
                    .append('g')
                    .attr('class', 'nv-distroplot-x-group')
                    .style('stroke-opacity', 1e-6).style('fill-opacity', 1e-6)
                    .style('fill', function(d,i) { return getColor(d) || color(d,i) })
                    .style('stroke', function(d,i) { return getColor(d) || color(d,i) })

                distroplots.exit().remove();

                var bandwidth = function() { return xScale.bandwidth() };
                var areaWidth = function() { return d3.min([maxBoxWidth,bandwidth() * 0.9]); };
                var areaCenter = function() { return areaWidth()/2; };
                var areaLeft  = function() { return areaCenter() - areaWidth()/2; };
                var areaRight = function() { return areaCenter() + areaWidth()/2; };
                var tickLeft  = function() { return areaCenter() - areaWidth()/5; };
                var tickRight = function() { return areaCenter() + areaWidth()/5; };

                areaEnter.attr('transform', function(d) {
                    return 'translate(' + (xScale(d.key) + (bandwidth() - areaWidth()) * 0.5) + ', 0)';
                });

                distroplots
                    .watchTransition(renderWatch, 'nv-distroplot-x-group: distroplots')
                    .style('stroke-opacity', 1)
                    .style('fill-opacity', 0.5)
                    .attr('transform', function(d) {
                        return 'translate(' + (xScale(d.key) + (bandwidth() - areaWidth()) * 0.5) + ', 0)';
                    });

                // set range for violin scale
                yVScale.map(function(d) { d.range([areaWidth()/2, 0]) });

                // ----- add the SVG elements for each plot type -----

                // scatter plot type
                if (!plotType) {
                    showOnlyOutliers = false; // force all observations to be seen
                    if (!observationType) observationType = 'random'
                }

                // conditionally append whisker lines
                areaEnter.each(function(d,i) {
                    var box = d3.select(this);
                    [getWl, getWh].forEach(function (f) {
                        var key = (f === getWl) ? 'low' : 'high';
                        box.append('line')
                            .style('opacity', function() { return !hideWhiskers ? '0' : '1' })
                            .attr('class', 'nv-distroplot-whisker nv-distroplot-' + key)
                        box.append('line')
                            .style('opacity', function() { return hideWhiskers ? '0' : '1' })
                            .attr('class', 'nv-distroplot-tick nv-distroplot-' + key)
                    });
                });


                // update whisker lines and ticks
                [getWl, getWh].forEach(function (f) {
                    var key = (f === getWl) ? 'low' : 'high';
                    var endpoint = (f === getWl) ? getQ1 : getQ3;
                    distroplots.select('line.nv-distroplot-whisker.nv-distroplot-' + key)
                        .watchTransition(renderWatch, 'nv-distroplot-x-group: distroplots')
                        .attr('x1', areaCenter())
                        .attr('y1', function(d) { return plotType!='violin' ? yScale(f(d)) : yScale(getQ2(d)); })
                        .attr('x2', areaCenter())
                        .attr('y2', function(d) { return plotType=='box' ? yScale(endpoint(d)) : yScale(getQ2(d)); })
                        .style('opacity', function() { return hideWhiskers ? '0' : '1' })
                    distroplots.select('line.nv-distroplot-tick.nv-distroplot-' + key)
                        .watchTransition(renderWatch, 'nv-distroplot-x-group: distroplots')
                        .attr('x1', function(d) { return plotType!='violin' ? tickLeft() : areaCenter()} )
                        .attr('y1', function(d,i) { return plotType!='violin' ? yScale(f(d)) : yScale(getQ2(d)); })
                        .attr('x2', function(d) { return plotType!='violin' ? tickRight() : areaCenter()} )
                        .attr('y2', function(d,i) { return plotType!='violin' ? yScale(f(d)) : yScale(getQ2(d)); })
                        .style('opacity', function() { return hideWhiskers ? '0' : '1' })
                });

                [getWl, getWh].forEach(function (f) {
                    var key = (f === getWl) ? 'low' : 'high';
                    areaEnter.selectAll('.nv-distroplot-' + key)
                        .on('mouseover', function(event,d,i,j) {
                            setCoordinates(event.pageX, event.pageY);
                            d3.select(this.parentNode).selectAll('line.nv-distroplot-'+key).classed('hover',true);
                            dispatch.call('elementMouseover', this, {
                                value: key == 'low' ? 'Lower whisker' : 'Upper whisker',
                                series: { key: f(d).toFixed(2), color: getColor(d) || color(d,j) },
                                e: event
                            });
                        })
                        .on('mouseout', function(event,d,i,j) {
                            d3.select(this.parentNode).selectAll('line.nv-distroplot-'+key).classed('hover',false);
                            dispatch.call('elementMouseout', this, {
                                value: key == 'low' ? 'Lower whisker' : 'Upper whisker',
                                series: { key: f(d).toFixed(2), color: getColor(d) || color(d,j) },
                                e: event
                            });
                        })
                        .on('mousemove', function(d,i) {
                            dispatch.call('elementMousemove', this, {e: event});
                        });
                });

                // setup boxes as 4 parts: left-area, left-line, right-area, right-line,
                // this way we can transition to a violin
                areaEnter.each(function(d,i) {
                    var violin = d3.select(this);

                    ['left','right'].forEach(function(side) {
                        ['line','area'].forEach(function(d) {
                            violin.append('path')
                                .attr('class', 'nv-distribution-' + d + ' nv-distribution-' + side)
                                .attr("transform", "rotate(90,0,0)   translate(0," + (side == 'left' ? -areaWidth() : 0) + ")" + (side == 'left' ? '' : ' scale(1,-1)')); // rotate violin
                        })

                    })

                    areaEnter.selectAll('.nv-distribution-line')
                        .style('fill','none')
                    areaEnter.selectAll('.nv-distribution-area')
                        .style('stroke','none')
                        .style('opacity',0.7)

                });

                // transitions
                distroplots.each(function(d,i) {
                    var violin = d3.select(this);
                    var objData = plotType == 'box' ? makeNotchBox(areaLeft(), tickLeft(), areaCenter(), d) : d.values.kde;

                    violin.selectAll('path')
                        .datum(objData)

                    var tmpScale = yVScale[i];

                    var interp = plotType=='box' ? d3.curveLinear : d3.curveBasis;

                    if (plotType == 'box' || plotType == 'violin') {
                        ['left','right'].forEach(function(side) {

                            // line
                            distroplots.selectAll('.nv-distribution-line.nv-distribution-' + side)
                                //.watchTransition(renderWatch, 'nv-distribution-line: distroplots') // disable transition for now because it's jaring
                                .attr("d", d3.line()
                                    .x(function(e) { return plotType=='box' ? e.y : yScale(e.x); })
                                    .y(function(e) { return plotType=='box' ? e.x : tmpScale(e.y) })
                                    .curve(interp)
                                )
                                .attr("transform", "rotate(90,0,0)   translate(0," + (side == 'left' ? -areaWidth() : 0) + ")" + (side == 'left' ? '' : ' scale(1,-1)')) // rotate violin
                                .style('opacity', !plotType ? '0' : '1');

                            // area
                            distroplots.selectAll('.nv-distribution-area.nv-distribution-' + side)
                                //.watchTransition(renderWatch, 'nv-distribution-line: distroplots') // disable transition for now because it's jaring
                                .attr("d", d3.area()
                                    .x(function(e) { return plotType=='box' ? e.y : yScale(e.x); })
                                    .y(function(e) { return plotType=='box' ? e.x : tmpScale(e.y) })
                                    .y0(areaWidth()/2)
                                    .curve(interp)
                                )
                                .attr("transform", "rotate(90,0,0)   translate(0," + (side == 'left' ? -areaWidth() : 0) + ")" + (side == 'left' ? '' : ' scale(1,-1)')) // rotate violin
                                .style('opacity', !plotType ? '0' : '1');

                        })
                    } else { // scatter type, hide areas
                        distroplots.selectAll('.nv-distribution-area')
                            .watchTransition(renderWatch, 'nv-distribution-area: distroplots')
                            .style('opacity', !plotType ? '0' : '1');

                        distroplots.selectAll('.nv-distribution-line')
                            .watchTransition(renderWatch, 'nv-distribution-line: distroplots')
                            .style('opacity', !plotType ? '0' : '1');
                    }

                })

                // tooltip events
                distroplots.selectAll('path')
                    .on('mouseover', function(event,d,i,j) {
                        setCoordinates(event.pageX, event.pageY);
                        d = d3.select(this.parentNode).datum(); // grab data from parent g
                        d3.select(this).classed('hover', true);
                        dispatch.call('elementMouseover', this, {
                            key: d.key,
                            value: 'Group ' + d.key + ' stats',
                            series: [
                                { key: 'max', value: getMax(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'Q3', value: getQ3(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'Q2', value: getQ2(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'Q1', value: getQ1(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'min', value: getMin(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'mean', value: getMean(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'std. dev.', value: getDev(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'count', value: d.values.count, color: getColor(d) || color(d,j) },
                                { key: 'num. outliers', value: d.values.num_outlier, color: getColor(d) || color(d,j) },
                            ],
                            data: d,
                            index: d.index,
                            e: event
                        });
                    })
                    .on('mouseout', function(event,d,i,j) {
                        d3.select(this).classed('hover', false);
                        d = d3.select(this.parentNode).datum(); // grab data from parent g
                        dispatch.call('elementMouseout', this, {
                            key: d.key,
                            value: 'Group ' + d.key + ' stats',
                            series: [
                                { key: 'max', value: getMax(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'Q3', value: getQ3(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'Q2', value: getQ2(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'Q1', value: getQ1(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'min', value: getMin(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'mean', value: getMean(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'std. dev.', value: getDev(d).toFixed(2), color: getColor(d) || color(d,j) },
                                { key: 'count', value: d.values.count, color: getColor(d) || color(d,j) },
                                { key: 'num. outliers', value: d.values.num_outlier, color: getColor(d) || color(d,j) },
                            ],
                            data: d,
                            index: d.index,
                            e: event
                        });
                    })
                    .on('mousemove', function(event,d,i) {
                        dispatch.call('elementMousemove', this, {e: event});
                    });


                // median/mean line
                areaEnter.append('line')
                    .attr('class', function(d) { return 'nv-distroplot-middle'})


                distroplots.selectAll('line.nv-distroplot-middle')
                    .watchTransition(renderWatch, 'nv-distroplot-x-group: distroplots line')
                    .attr('x1', notchBox ? tickLeft : plotType != 'violin' ? areaLeft : tickLeft())
                    .attr('y1', function(d,i,j) { return centralTendency == 'mean' ? yScale(getMean(d)) : yScale(getQ2(d)); })
                    .attr('x2', notchBox ? tickRight : plotType != 'violin' ? areaRight : tickRight())
                    .attr('y2', function(d,i) { return centralTendency == 'mean' ? yScale(getMean(d)) : yScale(getQ2(d)); })
                    .style('opacity', centralTendency ? '1' : '0');


                // tooltip
                distroplots.selectAll('.nv-distroplot-middle')
                    .on('mouseover', function(event,d,i,j) {
                        setCoordinates(event.pageX, event.pageY);
                        if (d3.select(this).style('opacity') == 0) return; // don't show tooltip for hidden lines
                        var fillColor = d3.select(this.parentNode).style('fill'); // color set by parent g fill
                        d3.select(this).classed('hover', true);
                        dispatch.call('elementMouseover', this, {
                            value: centralTendency == 'mean' ? 'Mean' : 'Median',
                            series: { key: centralTendency == 'mean' ? getMean(d).toFixed(2) : getQ2(d).toFixed(2), color: fillColor },
                            e: event
                        });
                    })
                    .on('mouseout', function(event,d,i,j) {
                        if (d3.select(this).style('opacity') == 0) return; // don't show tooltip for hidden lines
                        d3.select(this).classed('hover', false);
                        var fillColor = d3.select(this.parentNode).style('fill'); // color set by parent g fill
                        dispatch.call('elementMouseout', this, {
                            value: centralTendency == 'mean' ? 'Mean' : 'Median',
                            series: { key: centralTendency == 'mean' ? getMean(d).toFixed(2) : getQ2(d).toFixed(2), color: fillColor },
                            e: event
                        });
                    })
                    .on('mousemove', function(event,d,i) {
                        dispatch.call('elementMousemove', this, {e: event});
                    });


                // setup observations
                // create DOMs even if not requested (and hide them), so that
                // we can do transitions on them
                var obsWrap = distroplots.selectAll('g.nv-distroplot-observation')
                    .data(function(d) { return getValsObj(d) }, function(d) {  return d.object_constancy; });

                var obsGroup = obsWrap.enter()
                    .append('g')
                    .attr('class', 'nv-distroplot-observation')

                obsGroup.append('circle')
                    .style({'opacity': 0})

                obsGroup.append('line')
                    .style('stroke-width', 1)
                    .style({'stroke': d3.rgb(85, 85, 85), 'opacity': 0})

                obsWrap.exit().remove();
                obsWrap.attr('class', function(d) { return 'nv-distroplot-observation ' + (isOutlier(d) && plotType == 'box' ? 'nv-distroplot-outlier' : 'nv-distroplot-non-outlier')})

                // transition observations
                if (observationType == 'line') {
                    distroplots.selectAll('g.nv-distroplot-observation line')
                        .watchTransition(renderWatch, 'nv-distrolot-x-group: nv-distoplot-observation')
                        .attr("x1", tickLeft() + areaWidth()/4)
                        .attr("x2", tickRight() - areaWidth()/4)
                        .attr('y1', function(d) { return yScale(d.datum)})
                        .attr('y2', function(d) { return yScale(d.datum)});
                } else {
                    distroplots.selectAll('g.nv-distroplot-observation circle')
                        .watchTransition(renderWatch, 'nv-distroplot: nv-distroplot-observation')
                        .attr('cy', function(d) { return yScale(d.datum); })
                        .attr('r', pointSize);

                    // NOTE: this update can be slow when re-sizing window when many point visible
                    // TODO: filter selection down to only visible points, no need to update x-position
                    //       of the hidden points
                    distroplots.selectAll('g.nv-distroplot-observation circle')
                        .watchTransition(renderWatch, 'nv-distroplot: nv-distroplot-observation')
                        .attr('cx', function(d) { return observationType == 'swarm' ? d.x + areaWidth()/2 : observationType == 'random' ? areaWidth()/2 + d.randX * areaWidth()/2 : areaWidth()/2; })

                }

                // set opacity on outliers/non-outliers
                // any circle/line entering has opacity 0
                if (observationType !== false) { // observationType is False when hidding all circle/lines
                    if (!showOnlyOutliers) { // show all line/circle
                        distroplots.selectAll(observationType== 'line' ? 'line':'circle')
                            .watchTransition(renderWatch, 'nv-distroplot: nv-distroplot-observation')
                            .style('opacity',1)
                    } else { // show only outliers
                        distroplots.selectAll('.nv-distroplot-outlier '+ (observationType== 'line' ? 'line':'circle'))
                            .watchTransition(renderWatch, 'nv-distroplot: nv-distroplot-observation')
                            .style('opacity',1)
                        distroplots.selectAll('.nv-distroplot-non-outlier '+ (observationType== 'line' ? 'line':'circle'))
                            .watchTransition(renderWatch, 'nv-distroplot: nv-distroplot-observation')
                            .style('opacity',0)
                    }
                }

                // hide all other observations
                distroplots.selectAll('.nv-distroplot-observation' + (observationType=='line'?' circle':' line'))
                    .watchTransition(renderWatch, 'nv-distroplot: nv-distoplot-observation')
                    .style('opacity',0)

                // tooltip events for observations
                distroplots.selectAll('.nv-distroplot-observation')
                    .on('mouseover', function(event,d,i,j) {
                        setCoordinates(event.pageX, event.pageY);
                        var pt = d3.select(this);
                        if (showOnlyOutliers && plotType == 'box' && !isOutlier(d)) return; // don't show tooltip for hidden observation
                        var fillColor = d3.select(this.parentNode).style('fill'); // color set by parent g fill
                        pt.classed('hover', true);
                        dispatch.call('elementMouseover', this, {
                            value: (plotType == 'box' && isOutlier(d)) ? 'Outlier' : 'Observation',
                            series: { key: d.datum.toFixed(2), color: fillColor },
                            e: event
                        });
                    })
                    .on('mouseout', function(event,d,i,j) {
                        var pt = d3.select(this);
                        var fillColor = d3.select(this.parentNode).style('fill'); // color set by parent g fill
                        pt.classed('hover', false);
                        dispatch.call('elementMouseout', this, {
                            value: (plotType == 'box' && isOutlier(d)) ? 'Outlier' : 'Observation',
                            series: { key: d.datum.toFixed(2), color: fillColor },
                            e: event
                        });
                    })
                    .on('mousemove', function(event,d,i) {
                        dispatch.call('elementMousemove', this, {e: event});
                    });

            });

            renderWatch.renderEnd('nv-distroplot-x-group immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:            {get: function(){return width;}, set: function(_){width=_;}},
            height:           {get: function(){return height;}, set: function(_){height=_;}},
            maxBoxWidth:      {get: function(){return maxBoxWidth;}, set: function(_){maxBoxWidth=_;}},
            x:                {get: function(){return getX;}, set: function(_){getX=_;}},
            y:                {get: function(){return getY;}, set: function(_){getY=_;}},
            plotType:         {get: function(){return plotType;}, set: function(_){plotType=_;}}, // plotType of background: 'box', 'violin' - default: 'box'
            observationType:  {get: function(){return observationType;}, set: function(_){observationType=_;}}, // type of observations to show: 'random', 'swarm', 'line', 'point' - default: false (don't show observations)
            whiskerDef:       {get: function(){return whiskerDef;}, set: function(_){whiskerDef=_;}}, // type of whisker to render: 'iqr', 'minmax', 'stddev' - default: iqr
            notchBox:         {get: function(){return notchBox;}, set: function(_){notchBox=_;}}, // bool whether to notch box
            hideWhiskers:     {get: function(){return hideWhiskers;}, set: function(_){hideWhiskers=_;}},
            colorGroup:       {get: function(){return colorGroup;}, set: function(_){colorGroup=_;}}, // data key to use to set color group of each x-category - default: don't group
            centralTendency:       {get: function(){return centralTendency;}, set: function(_){centralTendency=_;}}, // add a mean or median line to the data - default: don't show, must be one of 'mean' or 'median'
            bandwidth:        {get: function(){return bandwidth;}, set: function(_){bandwidth=_;}}, // bandwidth for kde calculation, can be float or str, if str, must be one of scott or silverman
            clampViolin:           {get: function(){return clampViolin;}, set: function(_){clampViolin=_;}},
            resolution:       {get: function(){return resolution;}, set: function(_){resolution=_;}}, // resolution for kde calculation, default 50
            xScale:           {get: function(){return xScale;}, set: function(_){xScale=_;}},
            yScale:           {get: function(){return yScale;}, set: function(_){yScale=_;}},
            showOnlyOutliers: {get: function(){return showOnlyOutliers;}, set: function(_){showOnlyOutliers=_;}}, // show only outliers in box plot, default true
            jitter:           {get: function(){return jitter;}, set: function(_){jitter=_;}}, // faction of that jitter should take up in 'random' observationType, must be in range [0,1]; see jitterX(), default 0.7
            squash:           {get: function(){return squash;}, set: function(_){squash=_;}}, // whether to squash sparse distribution of color groups towards middle of x-axis position
            pointSize:     {get: function(){return pointSize;}, set: function(_){pointSize=_;}},
            xDomain: {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain: {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:  {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:  {get: function(){return yRange;}, set: function(_){yRange=_;}},
            recalcData:   {get: function() { reformatDat = prepData(container.datum()); } },
            itemColor:    {get: function(){return getColor;}, set: function(_){getColor=_;}},
            id:           {get: function(){return id;}, set: function(_){id=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };
    nv.models.distroPlotChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var distroplot = nv.models.distroPlot(),
            xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom'),
            yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')

        var margin = {top: 25, right: 10, bottom: 40, left: 60},
            width = null,
            height = null,
            color = nv.utils.getColor(),
            showXAxis = true,
            showYAxis = true,
            rightAlignYAxis = false,
            staggerLabels = false,
            xLabel = false,
            yLabel = false,
            tooltip = nv.models.tooltip(),
            x, y,
            noData = 'No Data Available.',
            dispatch = d3.dispatch('stateChange', 'beforeUpdate', 'renderEnd'),
            duration = 500,
            t = d3.transition()
                .duration(duration)
                .ease(d3.easeLinear);

        xAxis.showMaxMin(false)
            .tickFormat(function(d) { return d })
        ;
        yAxis
            //.orient((rightAlignYAxis) ? 'right' : 'left')
            .tickFormat(d3.format(',.1f'))
        ;

        tooltip.duration(0);


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch, duration);
        var colorGroup0, marginTop0 = margin.top, x0, y0, resolution0, bandwidth0, clampViolin0;
        var dataCache;


        // return true if data has changed somehow after
        // an .update() was called
        // works by comparing current data set to the
        // one previously cached
        // TODO - since we keep another version of the dataset
        // around for comparison, it doubles the memory usage :(
        function dataHasChanged(d) {
            if (arraysEqual(d, dataCache)) {
                return false;
            } else {
                dataCache = JSON.parse(JSON.stringify(d)) // deep copy
                return true;
            }
        }

        // return true if array of objects equivalent
        function arraysEqual(arr1, arr2) {
            if(arr1.length !== arr2.length) return false;

            for(var i = arr1.length; i--;) {
                if ('object_constancy' in arr1[i]) delete arr1[i].object_constancy
                if ('object_constancy' in arr2[i]) delete arr2[i].object_constancy

                if(!objectEquals(arr1[i], arr2[i])) {
                    return false;
                }
            }

            return true;
        }

        // return true if objects are equivalent
        function objectEquals(a, b) {
            // Create arrays of property names
            var aProps = Object.getOwnPropertyNames(a);
            var bProps = Object.getOwnPropertyNames(b);

            // If number of properties is different,
            // objects are not equivalent
            if (aProps.length != bProps.length) {
                return false;
            }

            for (var i = 0; i < aProps.length; i++) {
                var propName = aProps[i];

                // If values of same property are not equal,
                // objects are not equivalent
                if (a[propName] !== b[propName]) {
                    return false;
                }
            }

            return true;
        }


        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(distroplot);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this), that = this;
                nv.utils.initSVG(container);
                var availableWidth = (width  || parseInt(container.style('width')) || 960) - margin.left - margin.right;
                var availableHeight = (height || parseInt(container.style('height')) || 400) - margin.top - margin.bottom;

                if (typeof dataCache === 'undefined') {
                    dataCache = JSON.parse(JSON.stringify(data)) // deep copy
                }

                chart.update = function() {
                    dispatch.call('beforeUpdate', that);
                    var opts = distroplot.options()
                    if (colorGroup0 !== opts.colorGroup() || // recalc data when any of the axis accessors are changed
                        x0 !== opts.x() ||
                        y0 !== opts.y() ||
                        bandwidth0 !== opts.bandwidth() ||
                        resolution0 !== opts.resolution() ||
                        clampViolin0 !== opts.clampViolin() ||
                        dataHasChanged(data)
                    ) {
                        distroplot.recalcData();
                    }
                    container.transition().duration(duration).call(chart);
                };
                chart.container = this;


                if (typeof d3.beeswarm !== 'function' && chart.options().observationType() == 'swarm') {
                    var xPos = margin.left + availableWidth/2;
                    noData = 'Please include the library https://github.com/Kcnarf/d3-beeswarm to use "swarm".'
                    nv.utils.noData(chart, container);
                    return chart;
                } else if (!data || !data.length) {
                    nv.utils.noData(chart, container);
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = distroplot.xScale();
                y = distroplot.yScale().clamp(true);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-distroPlot').data([data]);
                var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-distroPlot').append('g');
                var defsEnter = gEnter.append('defs');
                var g = wrap.select('g');

                gEnter.append('g').attr('class', 'nv-x nv-axis');
                gEnter.append('g').attr('class', 'nv-y nv-axis')
                    .append('g').attr('class', 'nv-zeroLine')
                    .append('line');

                gEnter.append('g').attr('class', 'nv-distroWrap');
                gEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                g.watchTransition(renderWatch, 'nv-wrap: wrap')
                    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                if (rightAlignYAxis) {
                    g.select('.nv-y.nv-axis')
                        .attr('transform', 'translate(' + availableWidth + ',0)');
                }


                // Main Chart Component(s)
                distroplot.width(availableWidth).height(availableHeight);

                var distroWrap = g.select('.nv-distroWrap')
                    .datum(data)

                distroWrap.transition().call(distroplot);

                var defsRect=defsEnter.append('clipPath')
                    .attr('id', 'nv-x-label-clip-' + distroplot.id())
                    .append('rect');

                defsRect
                    .attr('width', x.range() * (staggerLabels ? 2 : 1))
                    .attr('height', 16)
                    .attr('x', -x.range() / (staggerLabels ? 1 : 2 ));

                // Setup Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner(-availableHeight);

                    g.select('.nv-x.nv-axis').attr('transform', 'translate(0,' + y.range()[0] + ')')
                    g.select('.nv-x.nv-axis').call(xAxis);

                    //g.select('.nv-x.nv-axis').select('.nv-axislabel')
                    //    .style('font-size', d3.min([availableWidth * 0.05,20]) + 'px')

                    var xTicks = g.select('.nv-x.nv-axis').select("g.nvd3.nv-wrap.nv-axis").selectAll('g');
                    if (staggerLabels) {
                        xTicks
                            .selectAll('text')
                            .attr('transform', function(d,i,j) { return 'translate(0,' + (j % 2 === 0 ? '5' : '17') + ')' })
                    }
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( Math.floor(availableHeight/36) ) // can't use nv.utils.calcTicksY with Object data
                    yAxis
                        .tickSizeInner( -availableWidth);

                    g.select('.nv-y.nv-axis').call(yAxis);

                    //g.select('.nv-y.nv-axis').select('.nv-axislabel')
                    //    .style('font-size', d3.min([availableHeight * 0.05,20]) + 'px')
                }




                // Zero line on chart bottom
                g.select('.nv-zeroLine line')
                    .attr('x1',0)
                    .attr('x2',availableWidth)
                    .attr('y1', y(0))
                    .attr('y2', y(0))
                ;

                // store original values so that we can
                // call 'recalcData()' if needed
                colorGroup0 = distroplot.options().colorGroup();
                x0 = distroplot.options().x();
                y0 = distroplot.options().y();
                bandwidth0 = distroplot.options().bandwidth();
                resolution0 = distroplot.options().resolution();
                clampViolin0 = distroplot.options().clampViolin();

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

            });

            renderWatch.renderEnd('nv-distroplot chart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        distroplot.dispatch.on('elementMouseover.tooltip', function(evt) {
            tooltip.data(evt).hidden(false);
        });

        distroplot.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.data(evt).hidden(true);
        });

        distroplot.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.distroplot = distroplot;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            staggerLabels: {get: function(){return staggerLabels;}, set: function(_){staggerLabels=_;}},
            showXAxis: {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis: {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            tooltipContent:    {get: function(){return tooltip;}, set: function(_){tooltip=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
            defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                    distroplot.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    distroplot.color(color);
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    yAxis.orient( (_) ? 'right' : 'left');
                }},
            xLabel:  {get: function(){return xLabel;}, set: function(_){
                    xLabel=_;
                    xAxis.axisLabel(xLabel);
                }},
            yLabel:  {get: function(){return yLabel;}, set: function(_){
                    yLabel=_;
                    yAxis.axisLabel(yLabel);
                }},
        });


        nv.utils.inheritOptions(chart, distroplot);
        nv.utils.initOptions(chart);

        return chart;
    }
    nv.models.focus = function(content) {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var content = content || nv.models.line()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , brush = d3.brush()
        ;

        var margin = {top: 10, right: 0, bottom: 30, left: 0}
            , color = nv.utils.defaultColor()
            , width = null
            , height = 70
            , showXAxis = true
            , showYAxis = false
            , rightAlignYAxis = false
            , ticks = null
            , x
            , y
            , brushExtent = null
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear)
            , dispatch = d3.dispatch('brush', 'onBrush', 'renderEnd')
            , syncBrushing = true
        ;

        content.interactive(false);
        content.pointActive(function(d) { return false; });

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(content);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this);
                nv.utils.initSVG(container);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = height - margin.top - margin.bottom;

                chart.update = function() {
                    if( duration === 0 ) {
                        container.call( chart );
                    } else {
                        container.transition().duration(duration).call(chart);
                    }
                };
                chart.container = this;

                // Setup Scales
                x = content.xScale();
                y = content.yScale();

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-focus').data([data]);
                var wrapEnter=wrap.enter().append('g').attr('class', 'nvd3 nv-focus');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var gEnter = wrapEnter.append('g');
                var g = gEnter;

                var backgroundAppend=gEnter.append('g').attr('class', 'nv-background').append('rect');
                var xAxisAppendFocus=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppendFocus= container.selectAll('.nv-focus').select('.nv-x.nv-axis');
                var yAxisAppendFocus=gEnter.append('g').attr('class', 'nv-y nv-axis');
                yAxisAppendFocus=container.selectAll('.nv-focus').select('.nv-x.nv-axis');
                var contentWrapAppend=gEnter.append('g').attr('class', 'nv-contentWrap');
                contentWrapAppend=container.selectAll('.nv-focus').select('.nv-contentWrap');
                var brushBackgroundAppend=gEnter.append('g').attr('class', 'nv-brushBackground');
                brushBackgroundAppend=container.selectAll('.nv-focus').select('.nv-brushBackground');
                var xBrushAppend=gEnter.append('g').attr('class', 'nv-x nv-brush');
                xBrushAppend=container.selectAll('.nv-focus').select('.nv-x.nv-brush');

                if (rightAlignYAxis) {
                    yAxisAppendFocus
                        .attr("transform", "translate(" + availableWidth + ",0)");
                }

                backgroundAppend
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                content
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled; }));

                contentWrapAppend
                    .datum(data.filter(function(d) { return !d.disabled; }));

                var s=contentWrapAppend.transition().call(content); //@todo
                //s.merge(gEnter);

                // Setup Brush
                brush
                    //@todo .x(x)
                    .on('brush', function() {
                        onBrush(syncBrushing);
                    });

                brush.on('end', function (event) {
                    if (!syncBrushing) {
                        dispatch.call('brush', this, event.selection === null ? x.domain() : brush.extent());
                    }
                });

                if (brushExtent) brush.extent(brushExtent);

                var brushBG = brushBackgroundAppend.selectAll('g')
                    .data([brushExtent || brush.extent()]);

                var brushBGenter = brushBG.enter()
                    .append('g');

                brushBGenter.append('rect')
                    .attr('class', 'left')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('height', availableHeight);

                brushBGenter.append('rect')
                    .attr('class', 'right')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('height', availableHeight).merge(gEnter);

                var gBrush = xBrushAppend
                    .call(brush);
                gBrush.selectAll('rect')
                    .attr('height', availableHeight);
                gBrush.selectAll('.resize').append('path').attr('d', resizePath).merge(gEnter);

                onBrush(true);

                backgroundAppend
                    .attr('width', availableWidth)
                    .attr('height', availableHeight).merge(gEnter);

                if (showXAxis) {
                    xAxis.scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner(-availableHeight);

                    xAxisAppendFocus
                        .attr('transform', 'translate(0,' + y.range()[0] + ')');
                    var xs=xAxisAppendFocus.transition()
                        .call(xAxis);
                    //xs.merge(xAxisAppend);
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                    yAxis
                        .tickSizeInner( -availableWidth);

                    var ys=yAxisAppendFocus
                        .call(yAxis);
                    //ys.merge(yAxisAppend);
                }

                xAxisAppendFocus
                    .attr('transform', 'translate(0,' + y.range()[0] + ')').merge(gEnter);
                //gEnter.merge(wrap);

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                //============================================================
                // Functions
                //------------------------------------------------------------

                // Taken from crossfilter (http://square.github.com/crossfilter/)
                function resizePath(d) {
                    var e = +(d == 'e'),
                        x = e ? 1 : -1,
                        y = availableHeight / 3;
                    return 'M' + (0.5 * x) + ',' + y
                        + 'A6,6 0 0 ' + e + ' ' + (6.5 * x) + ',' + (y + 6)
                        + 'V' + (2 * y - 6)
                        + 'A6,6 0 0 ' + e + ' ' + (0.5 * x) + ',' + (2 * y)
                        + 'Z'
                        + 'M' + (2.5 * x) + ',' + (y + 8)
                        + 'V' + (2 * y - 8)
                        + 'M' + (4.5 * x) + ',' + (y + 8)
                        + 'V' + (2 * y - 8);
                }


                function updateBrushBG() {
                    if (brushExtent != null) brush.extent(brushExtent);
                    brushBG
                        .data([brushExtent === null ? x.domain() : brushExtent])
                        .each(function(d,i) {
                            var leftWidth = x(d[0]) - x.range()[0],
                                rightWidth = availableWidth - x(d[1]);
                            d3.select(this).select('.left')
                                .attr('width',  leftWidth < 0 ? 0 : leftWidth);

                            d3.select(this).select('.right')
                                .attr('x', x(d[1]))
                                .attr('width', rightWidth < 0 ? 0 : rightWidth);
                        });
                }


                function onBrush(shouldDispatch) {
                    brushExtent = brush.extent().length ? brush.extent() : null;
                    var extent = brush.extent().length ? brush.extent() : x.domain();
                    dispatch.call('brush', null, {extent: extent, brush: brush});
                    updateBrushBG();
                    if (shouldDispatch) {
                        dispatch.call('brush', null, extent);
                    }
                }
            });

            renderWatch.renderEnd('focus immediate');
            return chart;
        }


        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.content = content;
        chart.brush = brush;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showXAxis:      {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis:    {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            brushExtent: {get: function(){return brushExtent;}, set: function(_){brushExtent=_;}},
            syncBrushing: {get: function(){return syncBrushing;}, set: function(_){syncBrushing=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                    content.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    content.color(color);
                }},
            interpolate: {get: function(){return content.interpolate();}, set: function(_){
                    content.interpolate(_);
                }},
            xTickFormat: {get: function(){return xAxis.tickFormat();}, set: function(_){
                    xAxis.tickFormat(_);
                }},
            yTickFormat: {get: function(){return yAxis.tickFormat();}, set: function(_){
                    yAxis.tickFormat(_);
                }},
            x: {get: function(){return content.x();}, set: function(_){
                    content.x(_);
                }},
            y: {get: function(){return content.y();}, set: function(_){
                    content.y(_);
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    yAxis.orient( rightAlignYAxis ? 'right' : 'left');
                }}
        });

        nv.utils.inheritOptions(chart, content);
        nv.utils.initOptions(chart);

        return chart;
    };
    nv.models.forceDirectedGraph = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------
        var margin = {top: 2, right: 0, bottom: 2, left: 0}
            , width = 400
            , height = 32
            , container = null
            , dispatch = d3.dispatch('renderEnd')
            , color = nv.utils.getColor(['#000'])
            , tooltip      = nv.models.tooltip()
            , noData = null
            // Force directed graph specific parameters [default values]
            , linkStrength = 0.1
            , friction = 0.5
            , linkDist = 30
            , charge = -120
            , gravity = 0.1
            , theta = 0.8
            , alpha = 0.3
            , radius = 5
            // These functions allow to add extra attributes to ndes and links
            ,nodeExtras = function(nodes) { /* Do nothing */ }
            ,linkExtras = function(links) { /* Do nothing */ }
            , getX=function() {return 0.0;}
            , getY=function() {return 0.0;}
        ;


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);

        function chart(selection) {
            renderWatch.reset();

            selection.each(function(data) {
                container = d3.select(this);
                nv.utils.initSVG(container);

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                container
                    .attr("width", availableWidth)
                    .attr("height", availableHeight);

                // Display No Data message if there's nothing to show.
                if (!data || !data.links || !data.nodes) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }
                container.selectAll('*').remove();

                // Collect names of all fields in the nodes
                var nodeFieldSet = new Set();
                data.nodes.forEach(function(node) {
                    var keys = Object.keys(node);
                    keys.forEach(function(key) {
                        nodeFieldSet.add(key);
                    });
                });

                var force = d3.forceSimulation()
                    .nodes(data.nodes)
                    .force("link", d3.forceLink(data.links).strength(linkStrength).distance(linkDist))
                    .force('center', d3.forceCenter(availableWidth / 2, availableHeight / 2))
                    .force("charge", d3.forceManyBody().strength(charge))
                    //.force("gravity", gravity);
                    //.theta(theta)
                    .alphaTarget(alpha)
                    .velocityDecay(friction);

                var link = container.selectAll(".link")
                    .data(data.links)
                    .enter().append("line")
                    .attr("class", "nv-force-link")
                    .style("stroke-width", function(d) { return Math.sqrt(d.value); });

                var node = container.selectAll(".node")
                    .data(data.nodes)
                    .enter()
                    .append("g")
                    .attr("class", "nv-force-node")
                    .call(d3.drag()
                        .on("start", function(event,d){
                            event.sourceEvent.stopPropagation();
                            if (!event.active) force.alphaTarget(alpha).restart();
                            d.fx = d.x;
                            d.fy = d.y;
                        })
                        .on("drag", function(event,d){
                            d.fx = event.x;
                            d.fy = event.y;
                        })
                        .on("end", function(event,d){
                            if (!event.active) force.alphaTarget(alpha);
                            d.fx = null;
                            d.fy = null;
                        }));

                node
                    .append("circle")
                    .attr("r", radius)
                    .style("fill", function(d) { return color(d) } )
                    .on("mouseover", function(evt) {
                        container.select('.nv-series-' + evt.seriesIndex + ' .nv-distx-' + evt.pointIndex)
                            .attr('y1', evt.py);
                        container.select('.nv-series-' + evt.seriesIndex + ' .nv-disty-' + evt.pointIndex)
                            .attr('x2', evt.px);

                        // Add 'series' object to
                        var nodeColor = color(evt);
                        evt.series = [];
                        nodeFieldSet.forEach(function(field) {
                            evt.series.push({
                                color: nodeColor,
                                key:   field,
                                value: evt[field]
                            });
                        });
                        tooltip.data(evt).hidden(false);
                    })
                    .on("mouseout",  function(d) {
                        tooltip.hidden(true);
                    });

                tooltip.headerFormatter(function(d) {return "Node";});

                // Apply extra attributes to nodes and links (if any)
                linkExtras(link);
                nodeExtras(node);

                force.on("tick", function() {
                    link.attr("x1", function(d) { return d.source.x; })
                        .attr("y1", function(d) { return d.source.y; })
                        .attr("x2", function(d) { return d.target.x; })
                        .attr("y2", function(d) { return d.target.y; });

                    node.attr("transform", function(d) {
                        return "translate(" + d.x + ", " + d.y + ")";
                    });
                });
            });

            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:     {get: function(){return width;}, set: function(_){width=_;}},
            height:    {get: function(){return height;}, set: function(_){height=_;}},

            // Force directed graph specific parameters
            linkStrength:{get: function(){return linkStrength;}, set: function(_){linkStrength=_;}},
            friction:    {get: function(){return friction;}, set: function(_){friction=_;}},
            linkDist:    {get: function(){return linkDist;}, set: function(_){linkDist=_;}},
            charge:      {get: function(){return charge;}, set: function(_){charge=_;}},
            gravity:     {get: function(){return gravity;}, set: function(_){gravity=_;}},
            theta:       {get: function(){return theta;}, set: function(_){theta=_;}},
            alpha:       {get: function(){return alpha;}, set: function(_){alpha=_;}},
            radius:      {get: function(){return radius;}, set: function(_){radius=_;}},

            //functor options
            x: {get: function(){return getX;}, set: function(_){getX= typeof _ === "function" ? _ : function(){return _;};}},
            y: {get: function(){return getY;}, set: function(_){getY=typeof _ === "function" ? _ : function(){return _;};}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
            nodeExtras: {get: function(){return nodeExtras;}, set: function(_){
                    nodeExtras = _;
                }},
            linkExtras: {get: function(){return linkExtras;}, set: function(_){
                    linkExtras = _;
                }}
        });

        chart.dispatch = dispatch;
        chart.tooltip = tooltip;
        nv.utils.initOptions(chart);
        return chart;
    };
    nv.models.furiousLegend = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 5, right: 0, bottom: 5, left: 0}
            , width = 400
            , height = 20
            , getKey = function(d) { return d.key }
            , keyFormatter = function (d) { return d }
            , color = nv.utils.getColor()
            , maxKeyLength = 20 //default value for key lengths
            , align = true
            , padding = 28 //define how much space between legend items. - recommend 32 for furious version
            , rightAlign = true
            , updateState = true   //If true, legend will update data.disabled and trigger a 'stateChange' dispatch.
            , radioButtonMode = false   //If true, clicking legend items will cause it to behave like a radio button. (only one can be selected at a time)
            , expanded = false
            , dispatch = d3.dispatch('legendClick', 'legendDblclick', 'legendMouseover', 'legendMouseout', 'stateChange')
            , vers = 'classic' //Options are "classic" and "furious"
        ;

        function chart(selection) {
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right,
                    container = d3.select(this);
                nv.utils.initSVG(container);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-legend').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-legend');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var series = container.selectAll('g.nv-legend').select('g').selectAll('.nv-series')
                    .data(function(d) {
                        if(vers != 'furious') return d;

                        return d.filter(function(n) {
                            return expanded ? true : !n.disengaged;
                        });
                    });
                var seriesEnter = series.enter().append('g').attr('class', 'nv-series')

                var seriesShape;

                if(vers == 'classic') {
                    var circleAppend=seriesEnter.append('circle')
                        .style('stroke-width', 2)
                        .attr('class','nv-legend-symbol')
                        .attr('r', 5);

                    seriesShape = circleAppend.select('circle');
                } else if (vers == 'furious') {
                    var rectAppend=seriesEnter.append('rect')
                        .style('stroke-width', 2)
                        .attr('class','nv-legend-symbol')
                        .attr('rx', 3)
                        .attr('ry', 3);

                    seriesShape = rectAppend.select('rect');

                    var checkBoxAppend=rectAppend.append('g')
                        .attr('class', 'nv-check-box')
                        .property('innerHTML','<path d="M0.5,5 L22.5,5 L22.5,26.5 L0.5,26.5 L0.5,5 Z" class="nv-box"></path><path d="M5.5,12.8618467 L11.9185089,19.2803556 L31,0.198864511" class="nv-check"></path>')
                        .attr('transform', 'translate(-10,-8)scale(0.5)');

                    var seriesCheckbox = series.select('.nv-check-box');

                    seriesCheckbox.each(function(d,i) {
                        d3.select(this).selectAll('path')
                            .attr('stroke', setTextColor(d,i));
                    });
                }

                var seriesText=seriesEnter.append('text')
                    .attr('text-anchor', 'start')
                    .attr('class','nv-legend-text')
                    .attr('dy', '.32em')
                    .attr('dx', '8');

                seriesEnter = series.merge(seriesEnter);

                seriesEnter
                    .on('mouseover', function(e,d,i) {
                        dispatch.call('legendMouseover', e,d,i);  //TODO: Make consistent with other event objects
                    })
                    .on('mouseout', function(e,d,i) {
                        dispatch.call('legendMouseout', e,d,i);
                    })
                    .on('click', function(e,d,i) {
                        dispatch.call('legendClick', e,d,i);
                        // make sure we re-get data in case it was modified
                        var data = seriesEnter.data();
                        if (updateState) {
                            if(vers =='classic') {
                                if (radioButtonMode) {
                                    //Radio button mode: set every series to disabled,
                                    //  and enable the clicked series.
                                    data.forEach(function(series) { series.disabled = true});
                                    d.disabled = false;
                                }
                                else {
                                    d.disabled = !d.disabled;
                                    if (data.every(function(series) { return series.disabled})) {
                                        //the default behavior of NVD3 legends is, if every single series
                                        // is disabled, turn all series' back on.
                                        data.forEach(function(series) { series.disabled = false});
                                    }
                                }
                            } else if(vers == 'furious') {
                                if(expanded) {
                                    d.disengaged = !d.disengaged;
                                    d.userDisabled = d.userDisabled == undefined ? !!d.disabled : d.userDisabled;
                                    d.disabled = d.disengaged || d.userDisabled;
                                } else if (!expanded) {
                                    d.disabled = !d.disabled;
                                    d.userDisabled = d.disabled;
                                    var engaged = data.filter(function(d) { return !d.disengaged; });
                                    if (engaged.every(function(series) { return series.userDisabled })) {
                                        //the default behavior of NVD3 legends is, if every single series
                                        // is disabled, turn all series' back on.
                                        data.forEach(function(series) {
                                            series.disabled = series.userDisabled = false;
                                        });
                                    }
                                }
                            }
                            dispatch.call('stateChange', this, {
                                disabled: data.map(function(d) { return !!d.disabled }),
                                disengaged: data.map(function(d) { return !!d.disengaged })
                            });

                        }
                    })
                    .on('dblclick', function(e,d,i) {
                        if(vers == 'furious' && expanded) return;
                        dispatch.call('legendDblclick', this, e,d,i);
                        if (updateState) {
                            // make sure we re-get data in case it was modified
                            var data = seriesEnter.data();
                            //the default behavior of NVD3 legends, when double clicking one,
                            // is to set all other series' to false, and make the double clicked series enabled.
                            data.forEach(function(series) {
                                series.disabled = true;
                                if(vers == 'furious') series.userDisabled = series.disabled;
                            });
                            d.disabled = false;
                            if(vers == 'furious') d.userDisabled = d.disabled;
                            dispatch.call('stateChange', this, {
                                disabled: data.map(function(d) { return !!d.disabled })
                            });
                        }
                    });

                seriesEnter.classed('nv-disabled', function(d) { return d.userDisabled });
                seriesEnter.exit().remove();

                seriesText
                    .attr('fill', setTextColor(d,i))
                    .text(function (d) { return keyFormatter(getKey(d)) });

                //TODO: implement fixed-width and max-width options (max-width is especially useful with the align option)
                // NEW ALIGNING CODE, TODO: clean up

                var versPadding;
                switch(vers) {
                    case 'furious' :
                        versPadding = 23;
                        break;
                    case 'classic' :
                        versPadding = 20;
                }

                if (align) {

                    var seriesWidths = [];
                    seriesEnter.each(function(d,i) {
                        var legendText;
                        if (keyFormatter(getKey(d)) && keyFormatter(getKey(d)).length > maxKeyLength) {
                            var trimmedKey = keyFormatter(getKey(d)).substring(0, maxKeyLength);
                            legendText = d3.select(this).select('text').text(trimmedKey + "...");
                            d3.select(this).append("svg:title").text(keyFormatter(getKey(d)));
                        } else {
                            legendText = d3.select(this).select('text');
                        }
                        var nodeTextLength;
                        try {
                            nodeTextLength = legendText.node().getComputedTextLength();
                            // If the legendText is display:none'd (nodeTextLength == 0), simulate an error so we approximate, instead
                            if(nodeTextLength <= 0) throw Error();
                        }
                        catch(e) {
                            nodeTextLength = nv.utils.calcApproxTextWidth(legendText);
                        }

                        seriesWidths.push(nodeTextLength + padding);
                    });

                    var seriesPerRow = 0;
                    var legendWidth = 0;
                    var columnWidths = [];

                    while ( legendWidth < availableWidth && seriesPerRow < seriesWidths.length) {
                        columnWidths[seriesPerRow] = seriesWidths[seriesPerRow];
                        legendWidth += seriesWidths[seriesPerRow++];
                    }
                    if (seriesPerRow === 0) seriesPerRow = 1; //minimum of one series per row

                    while ( legendWidth > availableWidth && seriesPerRow > 1 ) {
                        columnWidths = [];
                        seriesPerRow--;

                        for (var k = 0; k < seriesWidths.length; k++) {
                            if (seriesWidths[k] > (columnWidths[k % seriesPerRow] || 0) )
                                columnWidths[k % seriesPerRow] = seriesWidths[k];
                        }

                        legendWidth = columnWidths.reduce(function(prev, cur, index, array) {
                            return prev + cur;
                        });
                    }

                    var xPositions = [];
                    for (var i = 0, curX = 0; i < seriesPerRow; i++) {
                        xPositions[i] = curX;
                        curX += columnWidths[i];
                    }

                    seriesEnter
                        .attr('transform', function(d, i) {
                            return 'translate(' + xPositions[i % seriesPerRow] + ',' + (5 + Math.floor(i / seriesPerRow) * versPadding) + ')';
                        });

                    //position legend as far right as possible within the total width
                    if (rightAlign) {
                        g.attr('transform', 'translate(' + (width - margin.right - legendWidth) + ',' + margin.top + ')');
                    }
                    else {
                        g.attr('transform', 'translate(0' + ',' + margin.top + ')');
                    }

                    height = margin.top + margin.bottom + (Math.ceil(seriesWidths.length / seriesPerRow) * versPadding);

                } else {

                    var ypos = 5,
                        newxpos = 5,
                        maxwidth = 0,
                        xpos;
                    seriesEnter
                        .attr('transform', function(d, i) {
                            var length = d3.select(this).select('text').node().getComputedTextLength() + padding;
                            xpos = newxpos;

                            if (width < margin.left + margin.right + xpos + length) {
                                newxpos = xpos = 5;
                                ypos += versPadding;
                            }

                            newxpos += length;
                            if (newxpos > maxwidth) maxwidth = newxpos;

                            return 'translate(' + xpos + ',' + ypos + ')';
                        });

                    //position legend as far right as possible within the total width
                    g.attr('transform', 'translate(' + (width - margin.right - maxwidth) + ',' + margin.top + ')');

                    height = margin.top + margin.bottom + ypos + 15;
                }

                if(vers == 'furious') {
                    // Size rectangles after text is placed
                    seriesShape
                        .attr('width', function(d,i) {
                            return seriesText[0][i].getComputedTextLength() + 27;
                        })
                        .attr('height', 18)
                        .attr('y', -9)
                        .attr('x', -15)
                }

                seriesShape
                    .style('fill', setBGColor)
                    .style('stroke', function(d,i) { return d.color || color(d, i) });
            });

            function setTextColor(d,i) {
                if(vers != 'furious') return '#000';
                if(expanded) {
                    return d.disengaged ? color(d,i) : '#fff';
                } else if (!expanded) {
                    return !!d.disabled ? color(d,i) : '#fff';
                }
            }

            function setBGColor(d,i) {
                if(expanded && vers == 'furious') {
                    return d.disengaged ? '#fff' : color(d,i);
                } else {
                    return !!d.disabled ? '#fff' : color(d,i);
                }
            }

            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:          {get: function(){return width;}, set: function(_){width=_;}},
            height:         {get: function(){return height;}, set: function(_){height=_;}},
            key:            {get: function(){return getKey;}, set: function(_){getKey=_;}},
            keyFormatter:   {get: function(){return keyFormatter;}, set: function(_){keyFormatter=_;}},
            align:          {get: function(){return align;}, set: function(_){align=_;}},
            rightAlign:     {get: function(){return rightAlign;}, set: function(_){rightAlign=_;}},
            maxKeyLength:   {get: function(){return maxKeyLength;}, set: function(_){maxKeyLength=_;}},
            padding:        {get: function(){return padding;}, set: function(_){padding=_;}},
            updateState:    {get: function(){return updateState;}, set: function(_){updateState=_;}},
            radioButtonMode:{get: function(){return radioButtonMode;}, set: function(_){radioButtonMode=_;}},
            expanded:       {get: function(){return expanded;}, set: function(_){expanded=_;}},
            vers:           {get: function(){return vers;}, set: function(_){vers=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };
    /*
Improvements:
- consistenly apply no-hover classes to rect isntead of to containing g, see example CSS style for .no-hover rect, rect.no-hover
- row/column order (user specified) or 'ascending' / 'descending'
- I haven't tested for transitions between changing datasets
*/

    nv.models.heatMap = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 960
            , height = 500
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container
            , xScale = d3.scaleBand()
            , yScale = d3.scaleBand()
            , colorScale = false
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , getCellValue = function(d) { return d.value }
            , showCellValues = true
            , cellValueFormat = function(d) { return typeof d === 'number' ? d.toFixed(0) : d }
            , cellAspectRatio = false // width / height of cell
            , cellRadius = 2
            , cellBorderWidth = 4 // pixels between cells
            , normalize = false
            , highContrastText = true
            , xDomain
            , yDomain
            , xMetaColorScale = nv.utils.defaultColor()
            , yMetaColorScale = nv.utils.defaultColor()
            , missingDataColor = '#bcbcbc'
            , missingDataLabel = ''
            , metaOffset = 5 // spacing between meta rects and cells
            , xRange
            , yRange
            , xMeta
            , yMeta
            , colorRange
            , colorDomain
            , dispatch = d3.dispatch('chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd')
            , duration = 250
            , xMetaHeight = function(d) { return cellHeight / 3 }
            , yMetaWidth = function(d) { return cellWidth / 3 }
            , showGrid = false
        ;



        //============================================================
        // Aux helper function for heatmap
        //------------------------------------------------------------
        // choose high contrast text color based on background
        // shameful steal: https://github.com/alexandersimoes/d3plus/blob/master/src/color/text.coffee
        function cellTextColor(bgColor) {

            if (highContrastText) {
                var rgbColor = d3.rgb(bgColor);
                var r = rgbColor.r;
                var g = rgbColor.g;
                var b = rgbColor.b;
                var yiq = (r * 299 + g * 587 + b * 114) / 1000;
                return yiq >= 128 ? "#404040" : "#EDEDED"; // dark text else light text
            } else {
                return 'black';
            }
        }

        /* go through heatmap data and generate array of values
     * for each row/column or for entire dataset; for use in
     * calculating means/medians of data for normalizing
     * @param {str} axis - 'row', 'col' or null
     *
     * @returns {row/column index: [array of values for row/col]}
     * note that if axis is not specified, the return will be
     * {0: [all values in heatmap]}
     */
        function getHeatmapValues(data, axis) {
            var vals = {};

            data.forEach(function(cell, i) {
                if (axis == 'row') {
                    if (!(getIY(cell) in vals)) vals[getIY(cell)] = [];
                    vals[getIY(cell)].push(getCellValue(cell));
                } else if (axis == 'col') {
                    if (!(getIX(cell) in vals)) vals[getIX(cell)] = [];
                    vals[getIX(cell)].push(getCellValue(cell));
                } else if (axis == null) { // if calculating stat over entire dataset
                    if (!(0 in vals)) vals[0] = [];
                    vals[0].push(getCellValue(cell));
                }
            })

            return vals;
        }

        // calculate the median absolute deviation of the given array of data
        // https://en.wikipedia.org/wiki/Median_absolute_deviation
        // MAD = median(abs(Xi - median(X)))
        function mad(dat) {
            var med = d3.median(dat);
            var vals = dat.map(function(d) { return Math.abs(d - med); })
            return d3.median(vals);
        }


        // set cell color based on cell value
        // depending on whether it should be normalized or not
        function cellColor(d) {
            var colorVal = normalize ? getNorm(d) : getCellValue(d);
            return (cellsAreNumeric() && !isNaN(colorVal) || typeof colorVal !== 'undefined') ? colorScale(colorVal) : missingDataColor;
        }

        // return the domain of the color data
        // if ordinal data is given for the cells, this will
        // return all possible cells values; otherwise it
        // returns the extent of the cell values
        // will take into account normalization if specified
        function getColorDomain() {

            if (cellsAreNumeric()) { // if cell values are numeric
                return normalize ? d3.extent(prepedData, function(d) { return getNorm(d); }) : d3.extent(uniqueColor);
            } else if (!cellsAreNumeric()) { // if cell values are ordinal
                return uniqueColor;
            }
        }

        // return true if cells are numeric
        // as opposed to categorical
        function cellsAreNumeric() {
            return typeof uniqueColor[0] === 'number';
        }

        /*
     * Normalize input data
     *
     * normalize must be one of centerX, robustCenterX, centerScaleX, robustCenterScaleX, centerAll,
     * robustCenterAll, centerScaleAll, robustCenterScaleAll where X is either 'Row' or 'Column'
     *
     * - centerX: subtract row/column mean from cell
     * - centerAll: subtract mean of whole data set from cell
     * - centerScaleX: scale so that row/column has mean 0 and variance 1 (Z-score)
     * - centerScaleAll: scale by overall normalization factor so that the whole data set has mean 0 and variance 1 (Z-score)
     * - robustCenterX: subtract row/column median from cell
     * - robustCenterScaleX: subtract row/column median from cell and then scale row/column by median absolute deviation
     * - robustCenterAll: subtract median of whole data set from cell
     * - robustCenterScaleAll: subtract overall median from cell and scale by overall median absolute deviation
     */
        function normalizeData(dat) {

            var normTypes = ['centerRow',
                'robustCenterRow',
                'centerScaleRow',
                'robustCenterScaleRow',
                'centerColumn',
                'robustCenterColumn',
                'centerScaleColumn',
                'robustCenterScaleColumn',
                'centerAll',
                'robustCenterAll',
                'centerScaleAll',
                'robustCenterScaleAll'];


            if(normTypes.indexOf(normalize) != -1) {

                var xVals = Object.keys(uniqueX), yVals = Object.keys(uniqueY);

                // setup normalization options
                var scale = normalize.includes('Scale') ? true: false,
                    agg = normalize.includes('robust') ? 'median': 'mean',
                    axis = normalize.includes('Row') ? 'row' : normalize.includes('Column') ? 'col' : null,
                    vals = getHeatmapValues(dat, axis);

                // calculate mean or median
                // calculate standard dev or median absolute deviation
                var stat = {};
                var dev = {};
                for (var key in vals) {
                    stat[key] = agg == 'mean' ? d3.mean(vals[key]) : d3.median(vals[key]);
                    if (scale) dev[key] = agg == 'mean' ? d3.deviation(vals[key]) : mad(vals[key]);
                }


                // do the normalizing
                dat.forEach(function(cell, i) {
                    if (cellsAreNumeric()) {
                        if (axis == 'row') {
                            var key = getIY(cell);
                        } else if (axis == 'col') {
                            var key = getIX(cell);
                        } else if (axis == null) {  // if calculating stat over entire dataset
                            var key = 0;
                        }

                        var normVal = getCellValue(cell) - stat[key];
                        if (scale) {
                            cell._cellPos.norm = normVal / dev[key];
                        } else {
                            cell._cellPos.norm = normVal;
                        }
                    } else {
                        cell._cellPos.norm = getCellValue(cell); // if trying to normalize ordinal cells, just set norm to cell value
                    }
                })

            } else {
                normalize = false; // proper normalize option was not provided, disable it so heatmap still shows colors
            }

            return dat;
        }

        /*
     * Process incoming data for use with heatmap including:
     * - adding a unique key indexer to each data point (idx)
     * - getting a unique list of all x & y values
     * - generating a position index (x & y) for each data point
     * - sorting that data for correct traversal when generating rect
     * - generating placeholders for missing data
     *
     * In order to allow for the flexibility of the user providing either
     * categorical or quantitative data, we're going to position the cells
     * through indices that we increment based on previously seen data
     * this way we can use ordinal() axes even if the data is quantitative.
     *
     * When we generate the SVG elements, we assumes traversal occures from
     * top to bottom and from left to right.
     *
     * @param data {list} - input data organize as a list of objects
     *
     * @return - copy of input data with additional '_cellPos' key
     *           formatted as {idx: XXX, ix, XXX, iy: XXX}
     *           where idx is a global identifier; ix is an identifier
     *           within each column, and iy is an identifier within
     *           each row.
     */
        function prepData(data) {

            // reinitialize
            uniqueX = {}, // {cell x value: ix index}
                uniqueY = {}, // {cell y value: iy index}
                uniqueColor = [], // [cell color value]
                uniqueXMeta = [], // [cell x metadata value]
                uniqueYMeta = [], // [cell y metadata value]
                uniqueCells = []; // [cell x,y values stored as array]
            var warnings = [];
            var sortedCells = {}; // {cell x values: {cell y value: cell data, ... }, ... }

            var ix = 0, iy = 0; // use these indices to position cell in x & y direction
            var combo, idx=0;
            data.forEach(function(cell) {
                var valX = getX(cell),
                    valY = getY(cell),
                    valColor = getCellValue(cell);

                // assemble list of unique values for each dimension
                if (!(valX in uniqueX)) {
                    uniqueX[valX] = ix;
                    ix++;

                    sortedCells[valX] = {}

                    if (typeof xMeta === 'function') uniqueXMeta.push(xMeta(cell));
                }

                if (!(valY in uniqueY)) {
                    uniqueY[valY] = iy;
                    iy++;

                    sortedCells[valX][valY] = {}

                    if (typeof yMeta === 'function') uniqueYMeta.push(yMeta(cell));
                }
                if (uniqueColor.indexOf(valColor) == -1) uniqueColor.push(valColor)


                // for each data point, we generate an object of data
                // needed to properly position each cell
                cell._cellPos = {
                    idx: idx,
                    ix: uniqueX[valX],
                    iy: uniqueY[valY],
                }
                idx++;


                // keep track of row & column combinations we've already seen
                // this prevents the same cells from being generated when
                // the user hasn't provided proper data (one value for each
                // row & column).
                // if properly formatted data is not provided, only the first
                // row & column value is used (the rest are ignored)
                combo = [valX, valY];
                if (!isArrayInArray(uniqueCells, combo)) {
                    uniqueCells.push(combo)
                    sortedCells[valX][valY] = cell;
                } else if (warnings.indexOf(valX + valY) == -1) {
                    warnings.push(valX + valY);
                    console.warn("The row/column position " + valX + "/" + valY + " has multiple values; ensure each cell has only a single value.");
                }

            });

            uniqueColor = uniqueColor.sort()

            // check in sortedCells that each x has all the y's
            // if not, generate an empty placeholder
            // this will also sort all cells from left to right
            // and top to bottom
            var reformatData = [];
            Object.keys(uniqueY).forEach(function(j) {
                Object.keys(uniqueX).forEach(function(i) {
                    var cellVal = sortedCells[i][j];

                    if (cellVal) {
                        reformatData.push(cellVal);
                    } else {
                        var cellPos = {
                            idx: idx,
                            ix: uniqueX[i],
                            iy: uniqueY[j],
                        }
                        idx++;
                        reformatData.push({_cellPos: cellPos}); // empty cell placeholder
                    }
                })
            })


            // normalize data is needed
            return normalize ? normalizeData(reformatData) : reformatData;

        }

        // https://stackoverflow.com/a/41661388/1153897
        function isArrayInArray(arr, item){
            var item_as_string = JSON.stringify(item);

            var contains = arr.some(function(ele){
                return JSON.stringify(ele) === item_as_string;
            });
            return contains;
        }

        function removeAllHoverClasses() {
            // remove all hover classes
            d3.selectAll('.cell-hover').classed('cell-hover', false);
            d3.selectAll('.no-hover').classed('no-hover', false);
            d3.selectAll('.row-hover').classed('row-hover', false);
            d3.selectAll('.column-hover').classed('column-hover', false);
        }

        // return the formatted cell value if it is
        // a number, otherwise return missingDataLabel
        var cellValueLabel = function(d) {
            var val = !normalize ? cellValueFormat(getCellValue(d)) : cellValueFormat(getNorm(d));
            return (cellsAreNumeric() && !isNaN(val) || typeof val !== 'undefined') ? val : missingDataLabel;
        }

        // https://stackoverflow.com/a/16794116/1153897
        // note this returns the obj keys
        function sortObjByVals(obj) {
            return Object.keys(obj).sort(function(a,b){return obj[a]-obj[b]})
        }

        // https://stackoverflow.com/a/28191966/1153897
        function getKeyByValue(object, value) {
            //return Object.keys(object).find(key => object[key] === value);
            return Object.keys(object).filter(function(key) {return object[key] === value})[0];
        }


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var prepedData, cellHeight, cellWidth;
        var uniqueX = {}, uniqueY = {}, uniqueColor = [];
        var uniqueXMeta = [], uniqueYMeta = [], uniqueCells = []
        var renderWatch = nv.utils.renderWatch(dispatch, duration);
        var RdYlBu = ["#a50026","#d73027","#f46d43","#fdae61","#fee090","#ffffbf","#e0f3f8","#abd9e9","#74add1","#4575b4","#313695"];

        var getCellPos = function(d) { return d._cellPos; };
        var getIX = function(d) { return getCellPos(d).ix; } // get the given cell's x index position
        var getIY = function(d) { return getCellPos(d).iy; } // get the given cell's y index position
        var getNorm = function(d) { return getCellPos(d).norm; }
        var getIdx = function(d) { return getCellPos(d).idx; }


        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {

                prepedData = prepData(data);

                var availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                // available width/height set the cell dimenions unless
                // the aspect ratio is defined - in that case the cell
                // height is adjusted and availableHeight updated
                cellWidth = availableWidth / Object.keys(uniqueX).length;
                cellHeight = cellAspectRatio ? cellWidth / cellAspectRatio : availableHeight / Object.keys(uniqueY).length;
                if (cellAspectRatio) availableHeight = cellHeight * Object.keys(uniqueY).length - margin.top - margin.bottom;


                container = d3.select(this);
                nv.utils.initSVG(container);

                // Setup Scales
                xScale.domain(xDomain || sortObjByVals(uniqueX))
                    .range(xRange || [0, availableWidth-cellBorderWidth/2]);
                yScale.domain(yDomain || sortObjByVals(uniqueY))
                    .range(yRange || [0, availableHeight-cellBorderWidth/2]);
                colorScale = cellsAreNumeric() ? d3.scaleQuantize() : d3.scaleOrdinal();
                colorScale.domain(colorDomain || getColorDomain())
                    .range(colorRange || RdYlBu);


                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-heatMapWrap').data([prepedData]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-heatMapWrap');
                wrapEnter
                    .append('g')
                    .attr('class','cellWrap')

                wrap.watchTransition(renderWatch, 'nv-wrap: heatMapWrap')
                    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var gridWrap = wrapEnter
                    .append('g')
                    .attr('class','cellGrid')
                    .style('opacity',1e-6)

                var gridLinesV = wrapEnter.select('.cellGrid').selectAll('.gridLines.verticalGrid')
                    .data(Object.values(uniqueX).concat([Object.values(uniqueX).length]))

                gridLinesV.enter()
                    .append('line')
                    .attr('class','gridLines verticalGrid')

                gridLinesV.exit()
                    .remove()

                var gridLinesH = wrapEnter.select('.cellGrid').selectAll('.gridLines.horizontalGrid')
                    .data(Object.values(uniqueY).concat([Object.values(uniqueY).length]))

                gridLinesH.enter()
                    .append('line')
                    .attr('class','gridLines horizontalGrid')

                gridLinesH.exit()
                    .remove()

                var cellWrap = wrapEnter.select('.cellWrap')
                    .selectAll(".nv-cell")
                    .data(function(d) { return d; }, function(e) { return getIdx(e); })

                var xMetaWrap = wrapEnter
                    .append('g')
                    .attr('class','xMetaWrap')
                    .attr("transform", function() { return "translate(0," + (-xMetaHeight()-cellBorderWidth-metaOffset) + ")" })

                var xMetas = wrapEnter.select('.xMetaWrap').selectAll('.x-meta')
                    .data(uniqueXMeta)

                var xMetaEnter = xMetas
                    .enter()
                    .append('rect')
                    .attr('class','x-meta meta')
                    .attr("width", cellWidth-cellBorderWidth)
                    .attr("height", xMetaHeight())
                    .attr("transform", "translate(0,0)")
                    .attr("fill", function(d) { return xMetaColorScale(d); })

                var yMetaWrap = wrapEnter
                    .append('g')
                    .attr('class','yMetaWrap')
                    .attr("transform", function(d,i) { return "translate(" + (-yMetaWidth()-cellBorderWidth-metaOffset) + ",0)" })

                var yMetas = wrapEnter.select('.yMetaWrap').selectAll('.y-meta')
                    .data(uniqueYMeta)

                var yMetaEnter = yMetas
                    .enter()
                    .append('rect')
                    .attr('class','y-meta meta')
                    .attr("width", yMetaWidth())
                    .attr("height", cellHeight-cellBorderWidth)
                    .attr("transform", function(d,i) { return "translate(0,0)" })
                    .attr("fill", function(d,i) { return yMetaColorScale(d); })

                xMetas.exit().remove()
                yMetas.exit().remove()

                // CELLS
                var cellsEnter = cellWrap
                    .enter()
                    .append('g')
                    .style('opacity', 1e-6)
                    .attr("transform", function(d) { return "translate(0," + getIY(d) * cellHeight + ")" }) // enter all g's here for a sweep-right transition
                    .attr('data-row', function(d) { return getIY(d) })
                    .attr('data-column', function(d) { return getIX(d) });

                cellsEnter
                    .append("rect")

                cellsEnter
                    .append('text')
                    .attr('text-anchor', 'middle')
                    .attr("dy", 4)
                    .attr("class","cell-text")


                // transition cell (rect) size
                cellWrap.selectAll('rect')
                    .watchTransition(renderWatch, 'heatMap: rect')
                    .attr("width", cellWidth-cellBorderWidth)
                    .attr("height", cellHeight-cellBorderWidth)
                    .attr('rx', cellRadius)
                    .attr('ry', cellRadius)
                    .style('stroke', function(d) { return cellColor(d) })

                // transition cell (g) position, opacity and fill
                cellWrap
                    .attr("class",function(d) { return isNaN(getCellValue(d)) ? 'nv-cell cell-missing' : 'nv-cell'})
                    .watchTransition(renderWatch, 'heatMap: cells')
                    .style({
                        'opacity': 1,
                        'fill': function(d) { return cellColor(d) },
                    })
                    .attr("transform", function(d) { return "translate(" + getIX(d) * cellWidth + "," + getIY(d) * cellHeight + ")" })
                    .attr("class",function(d) { return isNaN(getCellValue(d)) ? 'nv-cell cell-missing' : 'nv-cell'})

                cellWrap.exit().remove();

                // transition text position and fill
                cellWrap.selectAll('text')
                    .watchTransition(renderWatch, 'heatMap: cells text')
                    .text(function(d) { return cellValueLabel(d); })
                    .attr("x", function(d) { return (cellWidth-cellBorderWidth) / 2; })
                    .attr("y", function(d) { return (cellHeight-cellBorderWidth) / 2; })
                    .style("fill", function(d) { return cellTextColor(cellColor(d)) })
                    .style('opacity', function() { return showCellValues ? 1 : 0 })

                // transition grid
                wrapEnter.selectAll('.verticalGrid')
                    .watchTransition(renderWatch, 'heatMap: gridLines')
                    .attr('y1',0)
                    .attr('y2',availableHeight-cellBorderWidth)
                    .attr('x1',function(d) { return d*cellWidth-cellBorderWidth/2; })
                    .attr('x2',function(d) { return d*cellWidth-cellBorderWidth/2; })

                var numHLines = Object.keys(uniqueY).length;
                wrapEnter.selectAll('.horizontalGrid')
                    .watchTransition(renderWatch, 'heatMap: gridLines')
                    .attr('x1',function(d) { return (d == 0 || d == numHLines) ? -cellBorderWidth : 0 })
                    .attr('x2',function(d) { return (d == 0 || d == numHLines) ? availableWidth : availableWidth-cellBorderWidth})
                    .attr('y1',function(d) { return d*cellHeight-cellBorderWidth/2; })
                    .attr('y2',function(d) { return d*cellHeight-cellBorderWidth/2; })

                wrapEnter.select('.cellGrid')
                    .watchTransition(renderWatch, 'heatMap: gridLines')
                    .style({
                        'stroke-width': cellBorderWidth,
                        'opacity': function() { return showGrid ? 1 : 1e-6 },
                    })

                var xMetaRect = wrapEnter.selectAll('.x-meta')
                var yMetaRect = wrapEnter.selectAll('.y-meta')
                var allMetaRect = wrapEnter.selectAll('.meta')

                // transition meta rect size
                xMetas
                    .watchTransition(renderWatch, 'heatMap: xMetaRect')
                    .attr("width", cellWidth-cellBorderWidth)
                    .attr("height", xMetaHeight())
                    .attr("transform", function(d,i) { return "translate(" + (i * cellWidth) + ",0)" })

                yMetas
                    .watchTransition(renderWatch, 'heatMap: yMetaRect')
                    .attr("width", yMetaWidth())
                    .attr("height", cellHeight-cellBorderWidth)
                    .attr("transform", function(d,i) { return "translate(0," + (i * cellHeight) + ")" })


                // transition position of meta wrap g & opacity
                wrapEnter.select('.xMetaWrap')
                    .watchTransition(renderWatch, 'heatMap: xMetaWrap')
                    .attr("transform", function(d,i) { return "translate(0," + (-xMetaHeight()-cellBorderWidth-metaOffset) + ")" })
                    .style("opacity", function() { return xMeta !== false ? 1 : 0 })
                wrapEnter.select('.yMetaWrap')
                    .watchTransition(renderWatch, 'heatMap: yMetaWrap')
                    .attr("transform", function(d,i) { return "translate(" + (-yMetaWidth()-cellBorderWidth-metaOffset) + ",0)" })
                    .style("opacity", function() { return yMeta !== false ? 1 : 0 })

                // TOOLTIPS
                cellWrap
                    .on('mouseover', function(d,i) {

                        var idx = getIdx(d);
                        var ix = getIX(d);
                        var iy = getIY(d);

                        // set the proper classes for all cells
                        // hover row gets class .row-hover
                        // hover column gets class .column-hover
                        // hover cell gets class .cell-hover
                        // all remaining cells get class .no-hover
                        d3.selectAll('.nv-cell').each(function(e) {
                            if (idx == getIdx(e)) {
                                d3.select(this).classed('cell-hover', true);
                                d3.select(this).classed('no-hover', false);
                            } else {
                                d3.select(this).classed('no-hover', true);
                                d3.select(this).classed('cell-hover', false);
                            }
                            if (ix == getIX(e)) {
                                d3.select(this).classed('no-hover', false);
                                d3.select(this).classed('column-hover', true);
                            }
                            if (iy == getIY(e)) {
                                d3.select(this).classed('no-hover', false);
                                d3.select(this).classed('row-hover', true);
                            }
                        })

                        // set hover classes for column metadata
                        d3.selectAll('.x-meta').each(function(e, j) {
                            if (j == ix) {
                                d3.select(this).classed('cell-hover', true);
                                d3.select(this).classed('no-hover', false);
                            } else {
                                d3.select(this).classed('no-hover', true);
                                d3.select(this).classed('cell-hover', false);
                            }
                        });

                        // set hover class for row metadata
                        d3.selectAll('.y-meta').each(function(e, j) {
                            if (j == iy) {
                                d3.select(this).classed('cell-hover', true);
                                d3.select(this).classed('no-hover', false);
                            } else {
                                d3.select(this).classed('no-hover', true);
                                d3.select(this).classed('cell-hover', false);
                            }
                        });

                        dispatch.call('elementMouseover', this, {
                            value: getKeyByValue(uniqueX, ix) + ' & ' + getKeyByValue(uniqueY, iy),
                            series: {
                                value: cellValueLabel(d),
                                color: d3.select(this).select('rect').style("fill")
                            },
                            e: d3.event,
                        });

                    })
                    .on('mouseout', function(d,i) {

                        // allow tooltip to remain even when mouse is over the
                        // space between the cell;
                        // this prevents cells from "flashing" when transitioning
                        // between cells
                        var bBox = d3.select(this).select('rect').node().getBBox();
                        var coordinates = d3.pointer(d3.select('.nv-heatMap').node());
                        var x = coordinates[0];
                        var y = coordinates[1];

                        // we only trigger mouseout when mouse moves outside of
                        // .nv-heatMap
                        if (x + cellBorderWidth >= availableWidth || y + cellBorderWidth >= availableHeight || x < 0 || y < 0) {
                            // remove all hover classes
                            removeAllHoverClasses();

                            dispatch.call('elementMouseout', this, {e: d3.event});
                        }
                    })
                    .on('mousemove', function(d,i) {

                        dispatch.call('elementMousemove', this, {e: d3.event});
                    })

                allMetaRect
                    .on('mouseover', function(d,i) {

                        // true if hovering over a row metadata rect
                        var isColMeta = d3.select(this).attr('class').indexOf('x-meta') != -1 ? true : false;

                        // apply proper .row-hover & .column-hover
                        // classes to cells
                        d3.selectAll('.nv-cell').each(function(e) {

                            if (isColMeta && i == getIX(e)) {
                                d3.select(this).classed('column-hover', true);
                                d3.select(this).classed('no-hover', false);
                            } else if (!isColMeta && i-uniqueXMeta.length == getIY(e)) {
                                // since allMetaRect selects all the meta rects, the index for the y's will
                                // be offset by the number of x rects. TODO - write seperate tooltip sections
                                // for x meta rect & y meta rect
                                d3.select(this).classed('row-hover', true);
                                d3.select(this).classed('no-hover', false);
                            } else {
                                d3.select(this).classed('no-hover', true);
                                d3.select(this).classed('column-hover', false);
                                d3.select(this).classed('row-hover', false);
                            }
                            d3.select(this).classed('cell-hover', false);
                        })

                        // apply proper .row-hover & .column-hover
                        // classes to meta rects
                        d3.selectAll('.meta').classed('no-hover', true);
                        d3.select(this).classed('cell-hover', true);
                        d3.select(this).classed('no-hover', false);

                        dispatch.call('elementMouseover', this, {
                            value: isColMeta ? 'Column meta' : 'Row meta',
                            series: { value: d, color: d3.select(this).style('fill'), }
                        });
                    })
                    .on('mouseout', function(d,i) {

                        // true if hovering over a row metadata rect
                        var isColMeta = d3.select(this).attr('class').indexOf('x-meta') != -1 ? true : false;

                        // allow tooltip to remain even when mouse is over the
                        // space between the cell;
                        // this prevents cells from "flashing" when transitioning
                        // between cells
                        var bBox = d3.select(this).node().getBBox();
                        var coordinates = d3.pointer(d3.select(isColMeta ? '.xMetaWrap' : '.yMetaWrap').node());
                        var x = coordinates[0];
                        var y = coordinates[1];

                        if ( y < 0 || x < 0 ||
                            (isColMeta && x + cellBorderWidth >= availableWidth) ||
                            (!isColMeta && y + cellBorderWidth >= availableHeight)
                        ) {
                            // remove all hover classes
                            removeAllHoverClasses();

                            dispatch.call('elementMouseout', this, {e: d3.event});
                        }
                    })
                    .on('mousemove', function(d,i) {
                        dispatch.call('elementMousemove', this, {e: d3.event});
                    })

            });


            renderWatch.renderEnd('heatMap immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:   {get: function(){return width;}, set: function(_){width=_;}},
            height:  {get: function(){return height;}, set: function(_){height=_;}},
            showCellValues: {get: function(){return showCellValues;}, set: function(_){showCellValues=_;}},
            x:       {get: function(){return getX;}, set: function(_){getX=_;}}, // data attribute for horizontal axis
            y:       {get: function(){return getY;}, set: function(_){getY=_;}}, // data attribute for vertical axis
            cellValue:       {get: function(){return getCellValue;}, set: function(_){getCellValue=_;}}, // data attribute that sets cell value and color
            missingDataColor:  {get: function(){return missingDataColor;}, set: function(_){missingDataColor=_;}},
            missingDataLabel:  {get: function(){return missingDataLabel;}, set: function(_){missingDataLabel=_;}},
            xScale:  {get: function(){return xScale;}, set: function(_){xScale=_;}},
            yScale:  {get: function(){return yScale;}, set: function(_){yScale=_;}},
            colorScale:  {get: function(){return colorScale;}, set: function(_){colorScale=_;}}, // scale to map cell values to colors
            xDomain:  {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain:  {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:  {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:  {get: function(){return yRange;}, set: function(_){yRange=_;}},
            colorRange:  {get: function(){return colorRange;}, set: function(_){colorRange=_;}},
            colorDomain:  {get: function(){return colorDomain;}, set: function(_){colorDomain=_;}},
            xMeta:  {get: function(){return xMeta;}, set: function(_){xMeta=_;}},
            yMeta:  {get: function(){return yMeta;}, set: function(_){yMeta=_;}},
            xMetaColorScale:  {get: function(){return color;}, set: function(_){color = nv.utils.getColor(_);}},
            yMetaColorScale:  {get: function(){return color;}, set: function(_){color = nv.utils.getColor(_);}},
            cellAspectRatio:  {get: function(){return cellAspectRatio;}, set: function(_){cellAspectRatio=_;}}, // cell width / height
            cellRadius:  {get: function(){return cellRadius;}, set: function(_){cellRadius=_;}}, // cell width / height
            cellHeight:  {get: function(){return cellHeight;}}, // TODO - should not be exposed since we don't want user setting this
            cellWidth:   {get: function(){return cellWidth;}}, // TODO - should not be exposed since we don't want user setting this
            normalize:   {get: function(){return normalize;}, set: function(_){normalize=_;}},
            cellBorderWidth:     {get: function(){return cellBorderWidth;}, set: function(_){cellBorderWidth=_;}},
            highContrastText:    {get: function(){return highContrastText;}, set: function(_){highContrastText=_;}},
            cellValueFormat:     {get: function(){return cellValueFormat;}, set: function(_){cellValueFormat=_;}},
            id:                  {get: function(){return id;}, set: function(_){id=_;}},
            metaOffset:          {get: function(){return metaOffset;}, set: function(_){metaOffset=_;}},
            xMetaHeight:         {get: function(){return xMetaHeight;}, set: function(_){xMetaHeight=_;}},
            yMetaWidth:          {get: function(){return yMetaWidth;}, set: function(_){yMetaWidth=_;}},
            showGrid:          {get: function(){return showGrid;}, set: function(_){showGrid=_;}},


            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                }}
        });

        nv.utils.initOptions(chart);


        return chart;
    };
    /* Heatmap Chart Type

A heatmap is a graphical representation of data where the individual values
contained in a matrix are represented as colors within cells. Furthermore,
metadata can be associated with each of the matrix rows or columns. By grouping
these rows/columns together by a given metadata value, data trends can be spotted.

Format for input data should be:
var data = [
    {day: 'mo', hour: '1a', value: 16, timeperiod: 'early morning', weekperiod: 'week', category: 1},
    {day: 'mo', hour: '2a', value: 20, timeperiod: 'early morning', weekperiod: 'week', category: 2},
    {day: 'mo', hour: '3a', value: 0, timeperiod: 'early morning', weekperiod: 'week', category: 1},
    ...
]
where the keys 'day' and 'hour' specify the row/column of the heatmap, 'value' specifies the  cell
value and the keys 'timeperiod', 'weekperiod' and 'week' are extra metadata that can be associated
with rows/columns.


Options for chart:
*/
    nv.models.heatMapChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var heatMap = nv.models.heatMap()
            , legend = nv.models.legend()
            , legendRowMeta = nv.models.legend()
            , legendColumnMeta = nv.models.legend()
            , tooltip = nv.models.tooltip()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
        ;


        var margin = {top: 20, right: 10, bottom: 50, left: 60}
            , marginTop = null
            , width = null
            , height = null
            , color = nv.utils.getColor()
            , showLegend = true
            , staggerLabels = false
            , showXAxis = true
            , showYAxis = true
            , alignYAxis = 'left'
            , alignXAxis = 'top'
            , rotateLabels = 0
            , title = false
            , x
            , y
            , noData = null
            , dispatch = d3.dispatch('beforeUpdate','renderEnd')
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear);

        xAxis.showMaxMin(false)
            .tickFormat(function(d) { return d })
        ;
        yAxis.showMaxMin(false)
            .tickFormat(function(d) { return d })
        ;

        tooltip
            .duration(0)
            .headerEnabled(true)
            .keyFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            })


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        // https://bl.ocks.org/mbostock/4573883
        // get max/min range for all the quantized cell values
        // returns an array where each element is [start,stop]
        // of color bin
        function quantizeLegendValues() {

            var e = heatMap.colorScale(), legendVals;

            if (typeof e.domain()[0] === 'string') { // if color scale is ordinal

                legendVals = e.domain();

            } else { // if color scale is numeric

                legendVals = e.range().map(function(color) {
                    var d = e.invertExtent(color);
                    if (d[0] === null) d[0] = e.domain()[0];
                    if (d[1] === null) d[1] = e.domain()[1];
                    return d;
                })

            }

            return legendVals

        }

        // return true if row metadata specified by user
        function hasRowMeta() {
            return typeof heatMap.yMeta() === 'function'
        }
        // return true if col metadata specified by user
        function hasColumnMeta() {
            return typeof heatMap.xMeta() === 'function'
        }

        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(heatMap);
            renderWatch.models(xAxis);
            renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this),
                    that = this;
                nv.utils.initSVG(container);

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() {
                    dispatch.call('beforeUpdate', this);
                    container.transition().duration(duration).call(chart);
                };
                chart.container = this;

                // Display No Data message if there's nothing to show.
                if (!data || !data.length) {
                    nv.utils.noData(chart, container);
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = heatMap.xScale();
                y = heatMap.yScale();

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap').data([data]);
                var wrapEnter=wrap.enter().append('g');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var gEnter = wrapEnter.attr('class', 'nvd3 nv-wrap').append('g');
                var g = wrap.select('g');


                var heatMapAppend=gEnter.append('g').attr('class', 'nv-heatMap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-heatMap').select('.nv-x');
                var yAxisAppend=gEnter.append('g').attr('class', 'nv-y nv-axis')

                legendWrapAppend = container.selectAll('g.nv-wrap').select('.nv-legendWrap');
                heatMap
                    .width(availableWidth)
                    .height(availableHeight);


                var heatMapWrap = heatMapAppend
                    .datum(data.filter(function(d) { return !d.disabled }));


                heatMapWrap.transition().call(heatMap);


                if (heatMap.cellAspectRatio()) {
                    availableHeight = heatMap.cellHeight() * y.domain().length;
                    heatMap.height(availableHeight);
                }


                // Setup Axes
                xAxis
                    .scale(x)
                    ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                xAxis
                    .tickSizeInner(-availableHeight);

                var axisX = xAxisAppend

                axisX.call(xAxis)
                    .watchTransition(renderWatch, 'heatMap: axisX')
                    .selectAll('.tick')
                    .style('opacity', function() { return showXAxis ? 1 : 0 } )

                var xTicks = axisX.select("g.nvd3.nv-wrap.nv-axis").selectAll('g');

                xTicks
                    .selectAll('.tick text')
                    .attr('transform', function(d,i,j) {
                        var rot = rotateLabels != 0 ? rotateLabels : '0';
                        var stagger = staggerLabels ? j % 2 == 0 ? '5' : '17' : '0';
                        return 'translate(0, ' + stagger + ') rotate(' + rot + ' 0,0)';
                    })
                    .style('text-anchor', rotateLabels > 0 ? 'start' : rotateLabels < 0 ? 'end' : 'middle');

                // position text in center of meta rects
                var yPos = -5;
                if (hasColumnMeta()) {
                    axisX.selectAll('text').style('text-anchor', 'middle')
                    yPos = -heatMap.xMetaHeight()()/2 - heatMap.metaOffset() + 3;
                }

                // adjust position of axis based on presence of metadata group
                if (alignXAxis == 'bottom') {
                    axisX
                        .watchTransition(renderWatch, 'heatMap: axisX')
                        .attr("transform", "translate(0," + (availableHeight - yPos) + ")");
                    if (heatMap.xMeta() !== false) { // if showing x metadata
                        var pos = availableHeight+heatMap.metaOffset()+heatMap.cellBorderWidth()
                        g.select('.xMetaWrap')
                            .watchTransition(renderWatch, 'heatMap: xMetaWrap')
                            .attr("transform", function(d,i) { return "translate(0," + pos + ")" })
                    }
                } else {
                    axisX
                        .watchTransition(renderWatch, 'heatMap: axisX')
                        .attr("transform", "translate(0," + yPos + ")");
                }


                yAxis
                    .scale(y)
                    ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                yAxis
                    .tickSizeInner( -availableWidth);

                var axisY = yAxisAppend

                axisY.call(yAxis)
                    .watchTransition(renderWatch, 'heatMap: axisY')
                    .selectAll('.tick')
                    .style('opacity', function() { return showYAxis ? 1 : 0 } )

                // position text in center of meta rects
                var xPos = -5;
                if (hasRowMeta()) {
                    axisY.selectAll('text').style('text-anchor', 'middle')
                    xPos = -heatMap.yMetaWidth()()/2 - heatMap.metaOffset();
                }

                // adjust position of axis based on presence of metadata group
                if (alignYAxis == 'right') {
                    axisY.attr("transform", "translate(" + (availableWidth - xPos) + ",0)");
                    if (heatMap.yMeta() !== false) { // if showing y meatdata
                        var pos = availableWidth+heatMap.metaOffset()+heatMap.cellBorderWidth()
                        g.select('.yMetaWrap')
                            .watchTransition(renderWatch, 'heatMap: yMetaWrap')
                            .attr("transform", function(d,i) { return "translate(" + pos + ",0)" })
                    }
                } else {
                    axisY.attr("transform", "translate(" + xPos + ",0)");
                }



                // Legend
                var legendWrap = legendWrapAppend

                legend
                    .width(availableWidth)
                    .color(heatMap.colorScale().range());

                var legendVal = quantizeLegendValues().map(function(d) {
                    if (Array.isArray(d)) { // if cell values are numeric
                        return {key: d[0].toFixed(1) + " - " + d[1].toFixed(1)};
                    } else { // if cell values are ordinal
                        return {key: d};
                    }
                })


                legendWrap
                    .datum(legendVal)
                    .call(legend)
                    .attr('transform', 'translate(0,' + (alignXAxis == 'top' ? availableHeight : -30) + ')'); // TODO: more intelligent offset (-30) when top aligning legend

                legendWrap
                    .watchTransition(renderWatch, 'heatMap: nv-legendWrap')
                    .style('opacity', function() { return showLegend ? 1 : 0 } )

            });

            // axis don't have a flag for disabling the zero line, so we do it manually
            d3.selectAll('.nv-axis').selectAll('line')
                .style('stroke-opacity', 0)
            yAxisAppend.select('path.domain').remove()

            renderWatch.renderEnd('heatMap chart immediate');

            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        heatMap.dispatch.on('elementMouseover.tooltip', function(evt) {
            tooltip.data(evt).hidden(false);
        });

        heatMap.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        heatMap.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.heatMap = heatMap;
        chart.legend = legend;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            noData:     {get: function(){return noData;}, set: function(_){noData=_;}},
            showXAxis:     {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis:     {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            staggerLabels: {get: function(){return staggerLabels;}, set: function(_){staggerLabels=_;}},
            rotateLabels:  {get: function(){return rotateLabels;}, set: function(_){rotateLabels=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    heatMap.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                }},
            alignYAxis: {get: function(){return alignYAxis;}, set: function(_){
                    alignYAxis = _;
                    //@todo yAxis.orient(_);
                }},
            alignXAxis: {get: function(){return alignXAxis;}, set: function(_){
                    alignXAxis = _;
                    //@todo xAxis.orient(_);
                }},
        });

        nv.utils.inheritOptions(chart, heatMap);
        nv.utils.initOptions(chart);

        return chart;
    }
//TODO: consider deprecating and using multibar with single series for this
    nv.models.historicalBar = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = null
            , height = null
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container = null
            , x = d3.scaleLinear()
            , y = d3.scaleLinear()
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , forceX = []
            , forceY = [0]
            , padData = false
            , clipEdge = true
            , color = nv.utils.defaultColor()
            , xDomain
            , yDomain
            , xRange
            , yRange
            , dispatch = d3.dispatch('chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd')
            , interactive = true
        ;

        var renderWatch = nv.utils.renderWatch(dispatch, 0);

        function chart(selection) {
            selection.each(function(data) {
                renderWatch.reset();

                container = d3.select(this);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                nv.utils.initSVG(container);

                // Setup Scales
                x.domain(xDomain || d3.extent(data[0].values.map(getX).concat(forceX) ));

                if (padData)
                    x.range(xRange || [availableWidth * .5 / data[0].values.length, availableWidth * (data[0].values.length - .5)  / data[0].values.length ]);
                else
                    x.range(xRange || [0, availableWidth]);

                y.domain(yDomain || d3.extent(data[0].values.map(getY).concat(forceY) ))
                    .range(yRange || [availableHeight, 0]);

                // If scale's domain don't have a range, slightly adjust to make one... so a chart can show a single data point
                if (x.domain()[0] === x.domain()[1])
                    x.domain()[0] ?
                        x.domain([x.domain()[0] - x.domain()[0] * 0.01, x.domain()[1] + x.domain()[1] * 0.01])
                        : x.domain([-1,1]);

                if (y.domain()[0] === y.domain()[1])
                    y.domain()[0] ?
                        y.domain([y.domain()[0] + y.domain()[0] * 0.01, y.domain()[1] - y.domain()[1] * 0.01])
                        : y.domain([-1,1]);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-historicalBar-' + id).data([data[0].values]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-historicalBar-' + id);
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                var defsEnter = wrapEnter.append('defs');
                var gEnter = wrapEnter.append('g');
                var g = wrapEnter.select('g');

                var barsAppend=gEnter.append('g').attr('class', 'nv-bars');

                container
                    .on('click', function(event,d,i) {
                        dispatch.call('chartClick', this, {
                            data: d,
                            index: d.index,
                            pos: event,
                            id: id
                        });
                    });

                var  defsRect=defsEnter.append('clipPath')
                    .attr('id', 'nv-chart-clip-path-' + id)
                    .append('rect');

                defsRect
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                g.attr('clip-path', clipEdge ? 'url(#nv-chart-clip-path-' + id + ')' : '');

                var bars = barsAppend.selectAll('.nv-bar')
                    .data(function(d) { return d }, function(d,i) {return getX(d,i)});
                bars.exit().remove();

                var rectAppend=bars.enter().append('rect')
                    .attr('x', 0 )
                    .attr('y', function(d,i) {  return nv.utils.NaNtoZero(y(Math.max(0, getY(d,i)))) })
                    .attr('height', function(d,i) { return nv.utils.NaNtoZero(Math.abs(y(getY(d,i)) - y(0))) })
                    .attr('transform', function(d,i) { return 'translate(' + (x(getX(d,i)) - availableWidth / data[0].values.length * .45) + ',0)'; })
                    .on('mouseover', function(event,d,i) {
                        setCoordinates(event.pageX, event.pageY);
                        if (!interactive) return;
                        d3.select(this).classed('hover', true);
                        dispatch.call('elementMouseover', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });

                    })
                    .on('mouseout', function(event,d,i) {
                        if (!interactive) return;
                        d3.select(this).classed('hover', false);
                        dispatch.call('elementMouseout', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('mousemove', function(event,d,i) {
                        if (!interactive) return;
                        dispatch.call('elementMousemove', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('click', function(event,d,i) {
                        if (!interactive) return;
                        var element = this;
                        dispatch.call('elementClick', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill"),
                            event: d3.event,
                            element: element
                        });
                        event.stopPropagation();
                    })
                    .on('dblclick', function(event,d,i) {
                        if (!interactive) return;
                        dispatch.call('elementDblClick', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                        event.stopPropagation();
                    });

                rectAppend
                    .attr('fill', function(d,i) { return color(d, i); })
                    .attr('class', function(d,i,j) { return (getY(d,i) < 0 ? 'nv-bar negative' : 'nv-bar positive') + ' nv-bar-' + 0 + '-' + i })
                    .watchTransition(renderWatch, 'bars')
                    .attr('transform', function(d,i) { return 'translate(' + (x(getX(d,i)) - availableWidth / data[0].values.length * .45) + ',0)'; })
                    //TODO: better width calculations that don't assume always uniform data spacing;w
                    .attr('width', (availableWidth / data[0].values.length) * .9 );

                rectAppend.watchTransition(renderWatch, 'bars')
                    .attr('y', function(d,i) {
                        var rval = getY(d,i) < 0 ?
                            y(0) :
                            y(0) - y(getY(d,i)) < 1 ?
                                y(0) - 1 :
                                y(getY(d,i));
                        return nv.utils.NaNtoZero(rval);
                    })
                    .attr('height', function(d,i) { return nv.utils.NaNtoZero(Math.max(Math.abs(y(getY(d,i)) - y(0)),1)) });

            });

            renderWatch.renderEnd('historicalBar immediate');
            return chart;
        }

        //Create methods to allow outside functions to highlight a specific bar.
        chart.highlightPoint = function(pointIndex, isHoverOver) {
            container
                .select(".nv-bars .nv-bar-0-" + pointIndex)
                .classed("hover", isHoverOver)
            ;
        };

        chart.clearHighlights = function() {
            container
                .select(".nv-bars .nv-bar.hover")
                .classed("hover", false)
            ;
        };

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:   {get: function(){return width;}, set: function(_){width=_;}},
            height:  {get: function(){return height;}, set: function(_){height=_;}},
            forceX:  {get: function(){return forceX;}, set: function(_){forceX=_;}},
            forceY:  {get: function(){return forceY;}, set: function(_){forceY=_;}},
            padData: {get: function(){return padData;}, set: function(_){padData=_;}},
            x:       {get: function(){return getX;}, set: function(_){getX=_;}},
            y:       {get: function(){return getY;}, set: function(_){getY=_;}},
            xScale:  {get: function(){return x;}, set: function(_){x=_;}},
            yScale:  {get: function(){return y;}, set: function(_){y=_;}},
            xDomain: {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain: {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:  {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:  {get: function(){return yRange;}, set: function(_){yRange=_;}},
            clipEdge:    {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},
            id:          {get: function(){return id;}, set: function(_){id=_;}},
            interactive: {get: function(){return interactive;}, set: function(_){interactive=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.historicalBarChart = function(bar_model) {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var bars = bar_model || nv.models.historicalBar()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , legend = nv.models.legend()
            , interactiveLayer = nv.interactiveGuideline()
            , tooltip = nv.models.tooltip()
        ;


        var margin = {top: 30, right: 90, bottom: 50, left: 90}
            , marginTop = null
            , color = nv.utils.defaultColor()
            , width = null
            , height = null
            , showLegend = false
            , showXAxis = true
            , showYAxis = true
            , rightAlignYAxis = false
            , useInteractiveGuideline = false
            , x
            , y
            , state = {}
            , defaultState = null
            , noData = null
            , dispatch = d3.dispatch('tooltipHide', 'stateChange', 'changeState', 'renderEnd')
            , transitionDuration = 250;

        xAxis.tickPadding(7);
        //yAxis.orient( (rightAlignYAxis) ? 'right' : 'left');
        tooltip
            .duration(0)
            .headerEnabled(false)
            .valueFormatter(function(d, i) {
                return yAxis.tickFormat()(d, i);
            })
            .headerFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            });


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch, 0);

        function chart(selection) {
            selection.each(function(data) {
                renderWatch.reset();
                renderWatch.models(bars);
                if (showXAxis) renderWatch.models(xAxis);
                if (showYAxis) renderWatch.models(yAxis);

                var container = d3.select(this),
                    that = this;
                nv.utils.initSVG(container);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() { container.transition().duration(transitionDuration).call(chart) };
                chart.container = this;

                //set state.disabled
                state.disabled = data.map(function(d) { return !!d.disabled });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display noData message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = bars.xScale();
                y = bars.yScale();

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-historicalBarChart').data([data]);
                var wrapEnter=wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-historicalBarChart');

                var gEnter = wrapEnter.append('g');
                var g = wrapEnter.select('g');

                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-historicalBarChart').select('.nv-x');
                var yAxisAppend=gEnter.append('g').attr('class', 'nv-y nv-axis');
                var barsWrapAppend=gEnter.append('g').attr('class', 'nv-barsWrap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                var interactiveAppend=gEnter.append('g').attr('class', 'nv-interactive');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-historicalBarChart').select('.nv-legendWrap');
                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    legend.width(availableWidth);

                    legendWrapAppend
                        .datum(data)
                        .call(legend);

                    if (!marginTop && legend.height() !== margin.top) {
                        margin.top = legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                    }

                    legendWrapAppend
                        .attr('transform', 'translate(0,' + (-margin.top) +')')
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                if (rightAlignYAxis) {
                    yAxisAppend
                        .attr("transform", "translate(" + availableWidth + ",0)");
                }

                //Set up interactive layer
                if (useInteractiveGuideline) {
                    interactiveLayer
                        .width(availableWidth)
                        .height(availableHeight)
                        .margin({left:margin.left, top:margin.top})
                        .svgContainer(container)
                        .xScale(x);
                    interactiveAppend.call(interactiveLayer);
                }
                bars
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled }));

                var barsWrap = barsWrapAppend
                    .datum(data.filter(function(d) { return !d.disabled }));
                barsWrap.transition().call(bars);

                // Setup Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner(-availableHeight);

                    xAxisAppend
                        .attr('transform', 'translate(0,' + y.range()[0] + ')');
                    xAxisAppend
                        .transition()
                        .call(xAxis);
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                    yAxis
                        .tickSizeInner( -availableWidth);

                    yAxisAppend
                        .transition()
                        .call(yAxis);
                }

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                interactiveLayer.dispatch.on('elementMousemove', function(e) {
                    bars.clearHighlights();

                    var singlePoint, pointIndex, pointXLocation, allData = [];
                    data
                        .filter(function(series, i) {
                            series.seriesIndex = i;
                            return !series.disabled;
                        })
                        .forEach(function(series,i) {
                            pointIndex = nv.interactiveBisect(series.values, e.pointXValue, chart.x());
                            bars.highlightPoint(pointIndex,true);
                            var point = series.values[pointIndex];
                            if (point === undefined) return;
                            if (singlePoint === undefined) singlePoint = point;
                            if (pointXLocation === undefined) pointXLocation = chart.xScale()(chart.x()(point,pointIndex));
                            allData.push({
                                key: series.key,
                                value: chart.y()(point, pointIndex),
                                color: color(series,series.seriesIndex),
                                data: series.values[pointIndex]
                            });
                        });

                    var xValue = xAxis.tickFormat()(chart.x()(singlePoint,pointIndex));
                    interactiveLayer.tooltip
                        .valueFormatter(function(d,i) {
                            return yAxis.tickFormat()(d);
                        })
                        .data({
                            value: xValue,
                            index: pointIndex,
                            series: allData
                        })();

                    interactiveLayer.renderGuideLine(pointXLocation);

                });

                interactiveLayer.dispatch.on("elementMouseout",function(e) {
                    dispatch.call('tooltipHide', this);
                    bars.clearHighlights();
                });

                legend.dispatch.on('legendClick', function(e,d,i) {
                    d.disabled = !d.disabled;

                    if (!data.filter(function(d) { return !d.disabled }).length) {
                        data.map(function(d) {
                            d.disabled = false;
                            wrap.selectAll('.nv-series').classed('disabled', false);
                            return d;
                        });
                    }

                    state.disabled = data.map(function(d) { return !!d.disabled });
                    dispatch.call('stateChange', this, state);

                    selection.transition().call(chart);
                });

                legend.dispatch.on('legendDblclick', function(d) {
                    //Double clicking should always enable current series, and disabled all others.
                    data.forEach(function(d) {
                        d.disabled = true;
                    });
                    d.disabled = false;

                    state.disabled = data.map(function(d) { return !!d.disabled });
                    dispatch.call('stateChange', this, state);
                    chart.update();
                });

                dispatch.on('changeState', function(e) {
                    if (typeof e.disabled !== 'undefined') {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });

                        state.disabled = e.disabled;
                    }

                    chart.update();
                });
            });

            renderWatch.renderEnd('historicalBarChart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        bars.dispatch.on('elementMouseover.tooltip', function(evt) {
            evt['series'] = {
                key: chart.x()(evt.data),
                value: chart.y()(evt.data),
                color: evt.color
            };
            tooltip.data(evt).hidden(false);
        });

        bars.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        bars.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.bars = bars;
        chart.legend = legend;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.interactiveLayer = interactiveLayer;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            showXAxis: {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis: {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                    bars.color(color);
                }},
            duration:    {get: function(){return transitionDuration;}, set: function(_){
                    transitionDuration=_;
                    renderWatch.reset(transitionDuration);
                    yAxis.duration(transitionDuration);
                    xAxis.duration(transitionDuration);
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    //@todo yAxis.orient( (_) ? 'right' : 'left');
                }},
            useInteractiveGuideline: {get: function(){return useInteractiveGuideline;}, set: function(_){
                    useInteractiveGuideline = _;
                    if (_ === true) {
                        chart.interactive(false);
                    }
                }}
        });

        nv.utils.inheritOptions(chart, bars);
        nv.utils.initOptions(chart);

        return chart;
    };


// ohlcChart is just a historical chart with ohlc bars and some tweaks
    nv.models.ohlcBarChart = function() {
        var chart = nv.models.historicalBarChart(nv.models.ohlcBar());

        // special default tooltip since we show multiple values per x
        chart.useInteractiveGuideline(true);
        chart.interactiveLayer.tooltip.contentGenerator(function(data) {
            // we assume only one series exists for this chart
            var d = data.series[0].data;
            // match line colors as defined in nv.d3.css
            var color = d.open < d.close ? "2ca02c" : "d62728";
            return '' +
                '<h3 style="color: #' + color + '">' + data.value + '</h3>' +
                '<table>' +
                '<tr><td>open:</td><td>' + chart.yAxis.tickFormat()(d.open) + '</td></tr>' +
                '<tr><td>close:</td><td>' + chart.yAxis.tickFormat()(d.close) + '</td></tr>' +
                '<tr><td>high</td><td>' + chart.yAxis.tickFormat()(d.high) + '</td></tr>' +
                '<tr><td>low:</td><td>' + chart.yAxis.tickFormat()(d.low) + '</td></tr>' +
                '</table>';
        });
        return chart;
    };

// candlestickChart is just a historical chart with candlestick bars and some tweaks
    nv.models.candlestickBarChart = function() {
        var chart = nv.models.historicalBarChart(nv.models.candlestickBar());

        // special default tooltip since we show multiple values per x
        chart.useInteractiveGuideline(true);
        chart.interactiveLayer.tooltip.contentGenerator(function(data) {
            // we assume only one series exists for this chart
            var d = data.series[0].data;
            // match line colors as defined in nv.d3.css
            var color = d.open < d.close ? "2ca02c" : "d62728";
            return '' +
                '<h3 style="color: #' + color + '">' + data.value + '</h3>' +
                '<table>' +
                '<tr><td>open:</td><td>' + chart.yAxis.tickFormat()(d.open) + '</td></tr>' +
                '<tr><td>close:</td><td>' + chart.yAxis.tickFormat()(d.close) + '</td></tr>' +
                '<tr><td>high</td><td>' + chart.yAxis.tickFormat()(d.high) + '</td></tr>' +
                '<tr><td>low:</td><td>' + chart.yAxis.tickFormat()(d.low) + '</td></tr>' +
                '</table>';
        });
        return chart;
    };
    nv.models.legend = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 5, right: 0, bottom: 5, left: 0}
            , width = 400
            , height = 20
            , getKey = function(d) { return d.key }
            , keyFormatter = function (d) { return d }
            , color = nv.utils.getColor()
            , maxKeyLength = 20 //default value for key lengths
            , align = true
            , padding = 32 //define how much space between legend items. - recommend 32 for furious version
            , rightAlign = true
            , updateState = true   //If true, legend will update data.disabled and trigger a 'stateChange' dispatch.
            , enableDoubleClick = true   //If true, legend will enable double click handling
            , radioButtonMode = false   //If true, clicking legend items will cause it to behave like a radio button. (only one can be selected at a time)
            , expanded = false
            , dispatch = d3.dispatch('legendClick', 'legendDblclick', 'legendMouseover', 'legendMouseout', 'stateChange')
            , vers = 'classic' //Options are "classic" and "furious"
        ;

        function chart(selection) {
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right,
                    container = d3.select(this);
                nv.utils.initSVG(container);
                container.selectAll('g.nv-legend').remove();
                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-legend').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-legend');
                if (rightAlign)
                    wrapEnter.attr('transform', 'translate(' + (- margin.right) + ',' + margin.top + ')');
                else
                    wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var series = container.selectAll('g.nv-legend').select('g').selectAll('.nv-series')
                    .data(function(d) {
                        if(vers != 'furious') return d;

                        return d.filter(function(n) {
                            return expanded ? true : !n.disengaged;
                        });
                    });

                var seriesEnter = series.enter().append('g').attr('class', 'nv-series');
                var seriesShape;
                seriesEnter = series.merge(seriesEnter);

                var versPadding;
                switch(vers) {
                    case 'furious' :
                        versPadding = 23;
                        break;
                    case 'classic' :
                        versPadding = 20;
                }

                if(vers == 'classic') {
                    var legendSymbolAppend=seriesEnter.append('circle')
                        .style('stroke-width', 2)
                        .attr('class','nv-legend-symbol')
                        .attr('r', 5);

                    seriesShape = seriesEnter.select('.nv-legend-symbol');
                } else if (vers == 'furious') {
                    var legendSymbolAppend=seriesEnter.append('rect')
                        .style('stroke-width', 2)
                        .attr('class','nv-legend-symbol')
                        .attr('rx', 3)
                        .attr('ry', 3);
                    seriesShape = seriesEnter.select('.nv-legend-symbol');

                    var checkBoxAppend = seriesEnter.append('g')
                        .attr('class', 'nv-check-box')
                        .property('innerHTML','<path d="M0.5,5 L22.5,5 L22.5,26.5 L0.5,26.5 L0.5,5 Z" class="nv-box"></path><path d="M5.5,12.8618467 L11.9185089,19.2803556 L31,0.198864511" class="nv-check"></path>')
                        .attr('transform', 'translate(-10,-8)scale(0.5)');

                    var seriesCheckbox = checkBoxAppend;

                    seriesCheckbox.each(function(d,i) {
                        d3.select(this).selectAll('path')
                            .attr('stroke', setTextColor(d,i));
                    });
                }

                var legendTextAppend=seriesEnter.append('text')
                    .attr('text-anchor', 'start')
                    .attr('class','nv-legend-text')
                    .attr('dy', '.32em')
                    .attr('dx', '8');




                var seriesText = seriesEnter.select('text.nv-legend-text');
                seriesEnter
                    .on('mouseover', function(e,d,i) {
                        dispatch.call('legendMouseover', seriesEnter, e, d,i);  //TODO: Make consistent with other event objects
                    })
                    .on('mouseout', function(e,d,i) {
                        dispatch.call('legendMouseout', seriesEnter, e,d,i);
                    })
                    .on('click', function(e,d,i) {
                        dispatch.call('legendClick', seriesEnter, e,d,i);
                        // make sure we re-get data in case it was modified
                        var data = seriesEnter.data();
                        if (updateState) {
                            if(vers =='classic') {
                                if (radioButtonMode) {
                                    //Radio button mode: set every series to disabled,
                                    //  and enable the clicked series.
                                    data.forEach(function(series) { series.disabled = true});
                                    d.disabled = false;
                                }
                                else {
                                    d.disabled = !d.disabled;
                                    if (data.every(function(series) { return series.disabled})) {
                                        //the default behavior of NVD3 legends is, if every single series
                                        // is disabled, turn all series' back on.
                                        data.forEach(function(series) { series.disabled = false});
                                    }
                                }
                            } else if(vers == 'furious') {
                                if(expanded) {
                                    d.disengaged = !d.disengaged;
                                    d.userDisabled = d.userDisabled == undefined ? !!d.disabled : d.userDisabled;
                                    d.disabled = d.disengaged || d.userDisabled;
                                } else if (!expanded) {
                                    d.disabled = !d.disabled;
                                    d.userDisabled = d.disabled;
                                    var engaged = data.filter(function(d) { return !d.disengaged; });
                                    if (engaged.every(function(series) { return series.userDisabled })) {
                                        //the default behavior of NVD3 legends is, if every single series
                                        // is disabled, turn all series' back on.
                                        data.forEach(function(series) {
                                            series.disabled = series.userDisabled = false;
                                        });
                                    }
                                }
                            }
                            dispatch.call('stateChange', series, {
                                disabled: data.map(function(d) { return !!d.disabled }),
                                disengaged: data.map(function(d) { return !!d.disengaged })
                            });

                        }
                    })
                    .on('dblclick', function(e,d,i) {
                        if (enableDoubleClick) {
                            if (vers == 'furious' && expanded) return;
                            dispatch.call('legendDblclick', seriesEnter, e,d, i);
                            if (updateState) {
                                // make sure we re-get data in case it was modified
                                var data = seriesEnter.data();
                                //the default behavior of NVD3 legends, when double clicking one,
                                // is to set all other series' to false, and make the double clicked series enabled.
                                data.forEach(function (series) {
                                    series.disabled = true;
                                    if (vers == 'furious') series.userDisabled = series.disabled;
                                });
                                d.disabled = false;
                                if (vers == 'furious') d.userDisabled = d.disabled;
                                dispatch.call('stateChange', seriesEnter, {
                                    disabled: data.map(function (d) {
                                        return !!d.disabled
                                    })
                                });
                            }
                        }
                    });

                seriesEnter.classed('nv-disabled', function(d) { return d.userDisabled });
                seriesEnter.exit().remove();

                seriesText
                    .attr('fill', setTextColor)
                    .text(function (d) { return keyFormatter(getKey(d)) });

                //TODO: implement fixed-width and max-width options (max-width is especially useful with the align option)
                // NEW ALIGNING CODE, TODO: clean up
                var legendWidth = 0;
                if (align) {

                    var seriesWidths = [];
                    seriesEnter.each(function(d,i) {
                        var legendText;
                        if (keyFormatter(getKey(d)) && keyFormatter(getKey(d)).length > maxKeyLength) {
                            var trimmedKey = keyFormatter(getKey(d)).substring(0, maxKeyLength);
                            legendText = d3.select(this).select('text').text(trimmedKey + "...");
                            d3.select(this).append("svg:title").text(keyFormatter(getKey(d)));
                        } else {
                            legendText = d3.select(this).select('text');
                        }
                        var nodeTextLength;
                        try {
                            nodeTextLength = legendText.node().getComputedTextLength();
                            // If the legendText is display:none'd (nodeTextLength == 0), simulate an error so we approximate, instead
                            if(nodeTextLength <= 0) throw Error();
                        }
                        catch(e) {
                            nodeTextLength = nv.utils.calcApproxTextWidth(legendText);
                        }

                        seriesWidths.push(nodeTextLength + padding);
                    });

                    var seriesPerRow = 0;
                    var columnWidths = [];
                    legendWidth = 0;

                    while ( legendWidth < availableWidth && seriesPerRow < seriesWidths.length) {
                        columnWidths[seriesPerRow] = seriesWidths[seriesPerRow];
                        legendWidth += seriesWidths[seriesPerRow++];
                    }
                    if (seriesPerRow === 0) seriesPerRow = 1; //minimum of one series per row

                    while ( legendWidth > availableWidth && seriesPerRow > 1 ) {
                        columnWidths = [];
                        seriesPerRow--;

                        for (var k = 0; k < seriesWidths.length; k++) {
                            if (seriesWidths[k] > (columnWidths[k % seriesPerRow] || 0) )
                                columnWidths[k % seriesPerRow] = seriesWidths[k];
                        }

                        legendWidth = columnWidths.reduce(function(prev, cur, index, array) {
                            return prev + cur;
                        });
                    }

                    var xPositions = [];
                    for (var i = 0, curX = 0; i < seriesPerRow; i++) {
                        xPositions[i] = curX;
                        curX += columnWidths[i];
                    }

                    seriesEnter
                        .attr('transform', function(d, i) {
                            return 'translate(' + xPositions[i % seriesPerRow] + ',' + (5 + Math.floor(i / seriesPerRow) * versPadding) + ')';
                        });

                    //position legend as far right as possible within the total width
                    if (rightAlign) {
                        gEnter.attr('transform', 'translate(' + (width - margin.right - legendWidth) + ',' + margin.top + ')');
                    }
                    else {
                        gEnter.attr('transform', 'translate(0' + ',' + margin.top + ')');
                    }

                    height = margin.top + margin.bottom + (Math.ceil(seriesWidths.length / seriesPerRow) * versPadding);

                } else {

                    var ypos = 5,
                        newxpos = 5,
                        maxwidth = 0,
                        xpos;
                    seriesEnter
                        .attr('transform', function(d, i) {
                            var length = d3.select(this).select('text').node().getComputedTextLength() + padding;
                            xpos = newxpos;

                            if (width < margin.left + margin.right + xpos + length) {
                                newxpos = xpos = 5;
                                ypos += versPadding;
                            }

                            newxpos += length;
                            if (newxpos > maxwidth) maxwidth = newxpos;

                            if(legendWidth < xpos + maxwidth) {
                                legendWidth = xpos + maxwidth;
                            }
                            return 'translate(' + xpos + ',' + ypos + ')';
                        });

                    //position legend as far right as possible within the total width
                    gEnter.attr('transform', 'translate(' + (width - margin.right - maxwidth) + ',' + margin.top + ')');

                    height = margin.top + margin.bottom + ypos + 15;
                }

                if(vers == 'furious') {
                    // Size rectangles after text is placed
                    seriesShape
                        .attr('width', function(d,i) {
                            return seriesEnter.select('text.nv-legend-text').nodes()[i].getComputedTextLength() + 27;
                        })
                        .attr('height', 18)
                        .attr('y', -9)
                        .attr('x', -15);

                    // The background for the expanded legend (UI)
                    gEnter.insert('rect',':first-child')
                        .attr('class', 'nv-legend-bg')
                        .attr('fill', '#eee')
                        // .attr('stroke', '#444')
                        .attr('opacity',0);

                    var seriesBG = gEnter.select('.nv-legend-bg');

                    seriesBG
                        .transition().duration(300)
                        .attr('x', -versPadding )
                        .attr('width', legendWidth + versPadding - 12)
                        .attr('height', height + 10)
                        .attr('y', -margin.top - 10)
                        .attr('opacity', expanded ? 1 : 0);


                }

                seriesShape
                    .style('fill', setBGColor)
                    .style('fill-opacity', setBGOpacity)
                    .style('stroke', setBGColor);

            });

            function setTextColor(d,i) {
                if(vers != 'furious') return '#000';
                if(expanded) {
                    return d.disengaged ? '#000' : '#fff';
                } else if (!expanded) {
                    if(!d.color) d.color = color(d,i);
                    return !!d.disabled ? d.color : '#fff';
                }
            }

            function setBGColor(d,i) {
                if(expanded && vers == 'furious') {
                    return d.disengaged ? '#eee' : d.color || color(d,i);
                } else {
                    return d.color || color(d,i);
                }
            }


            function setBGOpacity(d,i) {
                if(expanded && vers == 'furious') {
                    return 1;
                } else {
                    return !!d.disabled ? 0 : 1;
                }
            }

            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:          {get: function(){return width;}, set: function(_){width=_;}},
            height:         {get: function(){return height;}, set: function(_){height=_;}},
            key:            {get: function(){return getKey;}, set: function(_){getKey=_;}},
            keyFormatter:   {get: function(){return keyFormatter;}, set: function(_){keyFormatter=_;}},
            align:          {get: function(){return align;}, set: function(_){align=_;}},
            maxKeyLength:   {get: function(){return maxKeyLength;}, set: function(_){maxKeyLength=_;}},
            rightAlign:     {get: function(){return rightAlign;}, set: function(_){rightAlign=_;}},
            padding:        {get: function(){return padding;}, set: function(_){padding=_;}},
            updateState:    {get: function(){return updateState;}, set: function(_){updateState=_;}},
            enableDoubleClick: {get: function(){return enableDoubleClick;}, set: function(_){enableDoubleClick=_;}},
            radioButtonMode:{get: function(){return radioButtonMode;}, set: function(_){radioButtonMode=_;}},
            expanded:       {get: function(){return expanded;}, set: function(_){expanded=_;}},
            vers:           {get: function(){return vers;}, set: function(_){vers=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.line = function() {
        "use strict";
        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var  scatter = nv.models.scatter();

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 960
            , height = 500
            , container = null
            , strokeWidth = 1.5
            , color = nv.utils.defaultColor() // a function that returns a color
            , getX = function(d) { return d.x } // accessor to get the x value from a data point
            , getY = function(d) { return d.y } // accessor to get the y value from a data point
            , defined = function(d,i) { return !isNaN(getY(d,i)) && getY(d,i) !== null } // allows a line to be not continuous when it is not defined
            , isArea = function(d) { return d.area } // decides if a line is an area or just a line
            , clipEdge = false // if true, masks lines within x and y scale
            , x //can be accessed via chart.xScale()
            , y //can be accessed via chart.yScale()
            , interpolate = d3.curveLinear // controls the line interpolation
            , curve = d3.curveBasis
            , duration = 250
            , dispatch = d3.dispatch('elementClick', 'elementMouseover', 'elementMouseout', 'renderEnd')
        ;

        scatter
            .pointSize(16) // default size
            .pointDomain([16,256]) //set to speed up calculation, needs to be unset if there is a custom size accessor
        ;

        //============================================================


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var x0, y0 //used to store previous scales
            , renderWatch = nv.utils.renderWatch(dispatch, duration)
        ;

        //============================================================


        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(scatter);
            selection.each(function(data) {
                container = d3.select(this);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);
                nv.utils.initSVG(container);

                // Setup Scales
                x = scatter.xScale();
                y = scatter.yScale();

                x0 = x0 || x;
                y0 = y0 || y;

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-line').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-line')
                    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                var defsEnter = wrapEnter.append('defs');
                var gEnter = wrapEnter.append('g');

                gEnter.append('g').attr('class', 'nv-groups');
                gEnter.append('g').attr('class', 'nv-scatterWrap');

                var scatterWrap = container.select('.nv-scatterWrap');
                scatter
                    .width(availableWidth)
                    .height(availableHeight);
                scatterWrap.call(scatter);

                var defsRect=defsEnter.append('clipPath')
                    .attr('id', 'nv-edge-clip-' + scatter.id())
                    .append('rect')
                    .attr('width', availableWidth)
                    .attr('height', (availableHeight > 0) ? availableHeight : 0);

                gEnter.attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + scatter.id() + ')' : '');
                scatterWrap
                    .attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + scatter.id() + ')' : '');

                var groups = container.select('.nv-groups').selectAll('.nv-group')
                    .data(function(d) { return d }, function(d) { return d.key });

                var groupsEntries = groups.enter().append('g')
                    .style('stroke-opacity', 1e-6)
                    .style('stroke-width', function(d) { return d.strokeWidth || strokeWidth })
                    .style('fill-opacity', 1e-6);
                groups.exit().remove();
                groupsEntries = groups.merge(groupsEntries);
                groupsEntries
                    .attr('class', function(d,i) {
                        return (d.classed || '') + ' nv-group nv-series-' + i;
                    })
                    .classed('hover', function(d) { return d.hover })
                    .style('fill', function(d,i){ return color(d, i) })
                    .style('stroke', function(d,i){ return color(d, i)});
                groupsEntries.watchTransition(renderWatch, 'line: groups')
                    .style('stroke-opacity', 1)
                    .style('fill-opacity', function(d) { return d.fillOpacity || .5});

                var areaPaths = container.select('.nv-groups').selectAll('.nv-group').selectAll('path.nv-area')
                    .data(function(d) { return isArea(d) ? [d] : [] }); // this is done differently than lines because I need to check if series is an area
                var areaPathsEnter=areaPaths.enter().append('path')
                    .attr('class', 'nv-area')
                    .attr('d', function(d) {
                        return d3.area()
                            .curve(getInterpolationType(interpolate))
                            .defined(defined)
                            .x(function(d,i) { return nv.utils.NaNtoZero(x0(getX(d,i))) })
                            .y0(function(d,i) { return nv.utils.NaNtoZero(y0(getY(d,i))) })
                            .y1(function(d,i) { return y0( y.domain()[0] <= 0 ? y.domain()[1] >= 0 ? 0 : y.domain()[1] : y.domain()[0] ) })
                            //.y1(function(d,i) { return y0(0) }) //assuming 0 is within y domain.. may need to tweak this
                            .apply(this, [d.values])
                    });
                groups.exit().selectAll('path.nv-area')
                    .remove();

                areaPathsEnter = areaPaths.merge(areaPathsEnter);
                areaPathsEnter.watchTransition(renderWatch, 'line: areaPaths')
                    .attr('d', function(d) {
                        return d3.area()
                            .curve(getInterpolationType(interpolate))
                            .defined(defined)
                            .x(function(d,i) { return nv.utils.NaNtoZero(x(getX(d,i))) })
                            .y0(function(d,i) { return nv.utils.NaNtoZero(y(getY(d,i))) })
                            .y1(function(d,i) { return y( y.domain()[0] <= 0 ? y.domain()[1] >= 0 ? 0 : y.domain()[1] : y.domain()[0] ) })
                            //.y1(function(d,i) { return y0(0) }) //assuming 0 is within y domain.. may need to tweak this
                            .apply(this, [d.values])
                    });


                var linePaths = groupsEntries.selectAll('path.nv-line')
                    .data(function(d) { return [d.values] });

                var linePathsEnter=linePaths.enter().append('path')
                    .attr('class', 'nv-line')
                    .attr('d',
                        d3.line()
                            .curve(getInterpolationType(interpolate))
                            .defined(defined)
                            .x(function(d,i) { return nv.utils.NaNtoZero(x0(getX(d,i))) })
                            .y(function(d,i) { return nv.utils.NaNtoZero(y0(getY(d,i))) })
                    );
                linePathsEnter = linePaths.merge(linePathsEnter);

                linePathsEnter.watchTransition(renderWatch, 'line: linePaths')
                    .attr('d',
                        d3.line()
                            .curve(getInterpolationType(interpolate))
                            .defined(defined)
                            .x(function(d,i) { return nv.utils.NaNtoZero(x(getX(d,i))) })
                            .y(function(d,i) { return nv.utils.NaNtoZero(y(getY(d,i))) })
                    );


                //store old scales for use in transitions on update
                x0 = x.copy();
                y0 = y.copy();
            });
            renderWatch.renderEnd('line immediate');
            return chart;
        }


        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.scatter = scatter;
        // Pass through events
        scatter.dispatch.on('elementClick', function(){ dispatch.apply('elementClick', this, arguments); });
        scatter.dispatch.on('elementMouseover', function(){ dispatch.apply('elementMouseover', this, arguments); });
        scatter.dispatch.on('elementMouseout', function(){ dispatch.apply('elementMouseout', this, arguments); });

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            defined: {get: function(){return defined;}, set: function(_){defined=_;}},
            interpolate:      {get: function(){return interpolate;}, set: function(_){interpolate=_;}},
            clipEdge:    {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    scatter.duration(duration);
                }},
            isArea: {get: function(){return isArea;}, set: function(_){
                    isArea = typeof _ === "function" ? _ : function(){return _;};
                }},
            x: {get: function(){return getX;}, set: function(_){
                    getX = _;
                    scatter.x(_);
                }},
            y: {get: function(){return getY;}, set: function(_){
                    getY = _;
                    scatter.y(_);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    scatter.color(color);
                }}
        });

        nv.utils.inheritOptions(chart, scatter);
        nv.utils.initOptions(chart);

        return chart;
    };
    nv.models.lineChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var lines = nv.models.line()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , legend = nv.models.legend()
            , interactiveLayer = nv.interactiveGuideline()
            , tooltip = nv.models.tooltip()
            , focus = nv.models.focus(nv.models.line())
        ;

        var margin = {top: 30, right: 20, bottom: 50, left: 60}
            , marginTop = null
            , color = nv.utils.defaultColor()
            , width = null
            , height = null
            , showLegend = true
            , legendPosition = 'top'
            , showXAxis = true
            , showYAxis = true
            , rightAlignYAxis = false
            , useInteractiveGuideline = false
            , x
            , y
            , focusEnable = false
            , state = nv.utils.state()
            , defaultState = null
            , noData = null
            , dispatch = d3.dispatch('stateChange', 'changeState', 'renderEnd')
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear)
        ;

        // set options on sub-objects for this chart
        xAxis.tickPadding(7);
        //yAxis.orient(rightAlignYAxis ? 'right' : 'left');

        lines.clipEdge(true).duration(0);

        tooltip.valueFormatter(function(d, i) {
            return yAxis.tickFormat()(d, i);
        }).headerFormatter(function(d, i) {
            return xAxis.tickFormat()(d, i);
        });

        interactiveLayer.tooltip.valueFormatter(function(d, i) {
            return yAxis.tickFormat()(d, i);
        }).headerFormatter(function(d, i) {
            return xAxis.tickFormat()(d, i);
        });


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        var stateGetter = function(data) {
            return function(){
                return {
                    active: data.map(function(d) { return !d.disabled; })
                };
            };
        };

        var stateSetter = function(data) {
            return function(state) {
                if (state.active !== undefined)
                    data.forEach(function(series,i) {
                        series.disabled = !state.active[i];
                    });
            };
        };

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(lines);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this);
                nv.utils.initSVG(container);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);
                chart.update = function() {
                    if( duration === 0 ) {
                        container.call( chart );

                    } else {
                        var s=container.transition().duration(duration).call(chart);
                        //s.merge(container);
                    }
                };
                chart.container = this;

                state
                    .setter(stateSetter(data), chart.update)
                    .getter(stateGetter(data))
                    .update();

                // DEPRECATED set state.disabled
                state.disabled = data.map(function(d) { return !!d.disabled; });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display noData message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length; }).length) {
                    nv.utils.noData(chart, container);
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                /* Update `main' graph on brush update. */
                focus.dispatch.on("brush", function(extent) {
                    onBrush(extent);
                });

                // Setup Scales
                x = lines.xScale();
                y = lines.yScale();
                var dataReturned = data.filter(function(d) { return !d.disabled; });
                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-lineChart').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-lineChart');

                var gEnter = wrapEnter.append('g');
                var g = gEnter;

                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-lineChart').select('.nv-legendWrap');
                var focusEnter = gEnter.append('g').attr('class', 'nv-focus');
                var rectAppend=focusEnter.append('g').attr('class', 'nv-background').append('rect');
                var xAxisAppend=focusEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-lineChart').select('.nv-x');
                var yAxisAppend=focusEnter.append('g').attr('class', 'nv-y nv-axis');
                yAxisAppend = container.selectAll('g.nv-wrap.nv-lineChart').select('.nv-y');
                var linesWrapAppend = focusEnter.append('g').attr('class', 'nv-linesWrap');
                linesWrapAppend = container.selectAll('g.nv-wrap.nv-lineChart').select('.nv-linesWrap');
                var interactiveAppend=focusEnter.append('g').attr('class', 'nv-interactive');
                interactiveAppend = container.selectAll('g.nv-wrap.nv-lineChart').select('.nv-interactive');
                var contextEnter = gEnter.append('g').attr('class', 'nv-focusWrap');
                contextEnter = container.selectAll('g.nv-wrap.nv-lineChart').select('.nv-focusWrap');
                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    legend.width(availableWidth);

                    legendWrapAppend
                        .datum(data)
                        .call(legend);
                    if (legendPosition === 'bottom') {
                        margin.bottom = xAxis.height() + legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                        legendWrapAppend
                            .attr('transform', 'translate(0,' + (availableHeight + xAxis.height())  +')');
                    } else if (legendPosition === 'top') {
                        if (!marginTop && legend.height() !== margin.top) {
                            margin.top = legend.height();
                            availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);
                        }

                        legendWrapAppend
                            .attr('transform', 'translate(0,' + (-margin.top) +')');
                    }

                }

                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                if (rightAlignYAxis) {
                    yAxisAppend
                        .attr("transform", "translate(" + availableWidth + ",0)");
                }

                //Set up interactive layer
                if (useInteractiveGuideline) {
                    interactiveLayer
                        .width(availableWidth)
                        .height(availableHeight)
                        .margin({left:margin.left, top:margin.top})
                        .svgContainer(container)
                        .xScale(x);
                    interactiveAppend.call(interactiveLayer);
                }

                rectAppend
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                lines
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled; }));


                var linesWrap = container.selectAll("g.nv-linesWrap.nvd3-svg").data([dataReturned]);
                linesWrap = linesWrap.merge(linesWrapAppend)

                // Setup Main (Focus) Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks(nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner(-availableHeight);

                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                    yAxis
                        .tickSizeInner( -availableWidth);
                }

                //============================================================
                // Update Axes
                //============================================================
                function updateXAxis() {
                    if(showXAxis) {
                        xAxisAppend
                            .transition().duration(duration)
                            .call(xAxis)
                        ;
                    }
                }

                function updateYAxis() {
                    if(showYAxis) {
                        yAxisAppend
                            .transition().duration(duration)
                            .call(yAxis)
                        ;
                    }
                }

                xAxisAppend
                    .attr('transform', 'translate(0,' + availableHeight + ')');

                //============================================================
                // Update Focus
                //============================================================
                if (!focusEnable){//@todo && focus.brush.extent() === null) {
                    var s=linesWrap.transition().call(lines);
                    updateXAxis();
                    updateYAxis();
                } else {
                    focus.width(availableWidth);
                    var s=contextEnter
                        .style('display', focusEnable ? 'initial' : 'none')
                        .attr('transform', 'translate(0,' + ( availableHeight + margin.bottom + focus.margin().top) + ')')
                        .call(focus);
                    // s.merge(gEnter);
                    var extent = focus.brush.extent()=== null ? focus.xDomain() : focus.brush.extent();
                    if (extent !== null && extent.length) {
                        onBrush(extent);
                    }
                }
                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                legend.dispatch.on('stateChange', function(newState) {
                    for (var key in newState)
                        state[key] = newState[key];
                    dispatch.call('stateChange', this, newState);
                    chart.update();
                });

                interactiveLayer.dispatch.on('elementMousemove', function(e) {
                    lines.clearHighlights();
                    var singlePoint, pointIndex, pointXLocation, allData = [];
                    // Assuming you have the data and focus.brush properly defined
                    data
                        .filter(function(series, i) {
                            series.seriesIndex = i;
                            return !series.disabled && !series.disableTooltip;
                        })
                        .forEach(function(series,i) {
                            //var extent = focus.brush.extent() !== null ? (focus.brush.empty() ? focus.xScale().domain() : focus.brush.extent()) : x.domain();
                            var extent = focus.brush.extent() != null ? x.domain() : focus.xScale().domain();
                            var currentValues = series.values.filter(function(d,i) {
                                // Checks if the x point is between the extents, handling case where extent[0] is greater than extent[1]
                                // (e.g. x domain is manually set to reverse the x-axis)
                                if(extent[0] <= extent[1]) {
                                    return lines.x()(d,i) >= extent[0] && lines.x()(d,i) <= extent[1];
                                } else {
                                    return lines.x()(d,i) >= extent[1] && lines.x()(d,i) <= extent[0];
                                }
                            });

                            if (currentValues.length > 0) {
                                pointIndex = nv.interactiveBisect(currentValues, e.pointXValue, lines.x());
                                var point = currentValues[pointIndex];
                                var pointYValue = chart.y()(point, pointIndex);
                                if (pointYValue !== null) {
                                    lines.highlightPoint(i, series.values.indexOf(point), true);
                                }
                                if (point === undefined) return;
                                if (singlePoint === undefined) singlePoint = point;
                                if (pointXLocation === undefined) pointXLocation = chart.xScale()(chart.x()(point,pointIndex));
                                allData.push({
                                    key: series.key,
                                    value: pointYValue,
                                    color: color(series,series.seriesIndex),
                                    data: point
                                });
                            }
                        });
                    //Highlight the tooltip entry based on which point the mouse is closest to.
                    if (allData.length > 2) {
                        var yValue = chart.yScale().invert(e.mouseY);
                        var domainExtent = Math.abs(chart.yScale().domain()[0] - chart.yScale().domain()[1]);
                        var threshold = 0.03 * domainExtent;
                        var indexToHighlight = nv.nearestValueIndex(allData.map(function(d){return d.value;}),yValue,threshold);
                        if (indexToHighlight !== null)
                            allData[indexToHighlight].highlight = true;
                    }

                    var defaultValueFormatter = function(d,i) {
                        return d == null ? "N/A" : yAxis.tickFormat()(d);
                    };

                    if (typeof pointIndex !== 'undefined') {
                        interactiveLayer.tooltip
                            .valueFormatter(interactiveLayer.tooltip.valueFormatter() || defaultValueFormatter)
                            .data({
                                value: chart.x()( singlePoint,pointIndex ),
                                index: pointIndex,
                                series: allData
                            })();

                        interactiveLayer.renderGuideLine(pointXLocation);
                    }
                });

                interactiveLayer.dispatch.on('elementClick', function(e) {
                    var pointXLocation, allData = [];

                    data.filter(function(series, i) {
                        series.seriesIndex = i;
                        return !series.disabled;
                    }).forEach(function(series) {
                        var pointIndex = nv.interactiveBisect(series.values, e.pointXValue, chart.x());
                        var point = series.values[pointIndex];
                        if (typeof point === 'undefined') return;
                        if (typeof pointXLocation === 'undefined') pointXLocation = chart.xScale()(chart.x()(point,pointIndex));
                        var yPos = chart.yScale()(chart.y()(point,pointIndex));
                        allData.push({
                            point: point,
                            pointIndex: pointIndex,
                            pos: [pointXLocation, yPos],
                            seriesIndex: series.seriesIndex,
                            series: series
                        });
                    });

                    lines.dispatch.call('elementClick', this, allData);
                });

                interactiveLayer.dispatch.on("elementMouseout",function(e) {
                    lines.clearHighlights();
                });

                dispatch.on('changeState', function(e) {
                    if (typeof e.disabled !== 'undefined' && data.length === e.disabled.length) {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });

                        state.disabled = e.disabled;
                    }
                    chart.update();
                });

                //============================================================
                // Functions
                //------------------------------------------------------------

                // Taken from crossfilter (http://square.github.com/crossfilter/)
                function resizePath(d) {
                    var e = +(d == 'e'),
                        x = e ? 1 : -1,
                        y = availableHeight / 3;
                    return 'M' + (0.5 * x) + ',' + y
                        + 'A6,6 0 0 ' + e + ' ' + (6.5 * x) + ',' + (y + 6)
                        + 'V' + (2 * y - 6)
                        + 'A6,6 0 0 ' + e + ' ' + (0.5 * x) + ',' + (2 * y)
                        + 'Z'
                        + 'M' + (2.5 * x) + ',' + (y + 8)
                        + 'V' + (2 * y - 8)
                        + 'M' + (4.5 * x) + ',' + (y + 8)
                        + 'V' + (2 * y - 8);
                }

                function onBrush(extent) {
                    // Update Main (Focus)
                    var focusLinesWrap = g.select('.nv-focus .nv-linesWrap')
                        .datum(
                            data.filter(function(d) { return !d.disabled; })
                                .map(function(d,i) {
                                    return {
                                        key: d.key,
                                        area: d.area,
                                        classed: d.classed,
                                        values: d.values.filter(function(d,i) {
                                            return lines.x()(d,i) >= extent[0] && lines.x()(d,i) <= extent[1];
                                        }),
                                        disableTooltip: d.disableTooltip
                                    };
                                })
                        );
                    var s=focusLinesWrap.transition().duration(duration).call(lines);

                    // Update Main (Focus) Axes
                    updateXAxis();
                    updateYAxis();
                }
            });

            renderWatch.renderEnd('lineChart immediate');
            return chart;
        }


        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        lines.dispatch.on('elementMouseover.tooltip', function(evt) {
            if(!evt.series.disableTooltip){
                tooltip.data(evt).hidden(false);
            }
        });

        lines.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.lines = lines;
        chart.legend = legend;
        chart.focus = focus;
        chart.xAxis = xAxis;
        chart.x2Axis = focus.xAxis
        chart.yAxis = yAxis;
        chart.y2Axis = focus.yAxis
        chart.interactiveLayer = interactiveLayer;
        chart.tooltip = tooltip;
        chart.state = state;
        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            legendPosition: {get: function(){return legendPosition;}, set: function(_){legendPosition=_;}},
            showXAxis:      {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis:    {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
            // Focus options, mostly passed onto focus model.
            focusEnable:    {get: function(){return focusEnable;}, set: function(_){focusEnable=_;}},
            focusHeight:     {get: function(){return focus.height();}, set: function(_){focus.height(_);}},
            focusShowAxisX:    {get: function(){return focus.showXAxis();}, set: function(_){focus.showXAxis(_);}},
            focusShowAxisY:    {get: function(){return focus.showYAxis();}, set: function(_){focus.showYAxis(_);}},
            brushExtent: {get: function(){return focus.brushExtent();}, set: function(_){focus.brushExtent(_);}},

            // options that require extra logic in the setter
            focusMargin: {get: function(){return focus.margin}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    focus.margin.right  = _.right  !== undefined ? _.right  : focus.margin.right;
                    focus.margin.bottom = _.bottom !== undefined ? _.bottom : focus.margin.bottom;
                    focus.margin.left   = _.left   !== undefined ? _.left   : focus.margin.left;
                }},
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                    lines.duration(duration);
                    focus.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                    lines.color(color);
                    focus.color(color);
                }},
            interpolate: {get: function(){return lines.interpolate();}, set: function(_){
                    lines.interpolate(_);
                    focus.interpolate(_);
                }},
            xTickFormat: {get: function(){return xAxis.tickFormat();}, set: function(_){
                    xAxis.tickFormat(_);
                    focus.xTickFormat(_);
                }},
            yTickFormat: {get: function(){return yAxis.tickFormat();}, set: function(_){
                    yAxis.tickFormat(_);
                    focus.yTickFormat(_);
                }},
            x: {get: function(){return lines.x();}, set: function(_){
                    lines.x(_);
                    focus.x(_);
                }},
            y: {get: function(){return lines.y();}, set: function(_){
                    lines.y(_);
                    focus.y(_);
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    yAxis.orient( rightAlignYAxis ? 'right' : 'left');
                }},
            useInteractiveGuideline: {get: function(){return useInteractiveGuideline;}, set: function(_){
                    useInteractiveGuideline = _;
                    if (useInteractiveGuideline) {
                        lines.interactive(false);
                        lines.useVoronoi(false);
                    }
                }}
        });

        nv.utils.inheritOptions(chart, lines);
        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.lineWithFocusChart = function() {
        return nv.models.lineChart()
            .margin({ bottom: 30 })
            .focusEnable( true );
    };
    nv.models.linePlusBarChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var lines = nv.models.line()
            , lines2 = nv.models.line()
            , bars = nv.models.historicalBar()
            , bars2 = nv.models.historicalBar()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , x2Axis = nv.models.axis(d3.axisTop(d3.scaleLinear()), 'top')
            , y1Axis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , y2Axis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , y3Axis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , y4Axis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , legend = nv.models.legend()
            , brush = d3.brush()
            , tooltip = nv.models.tooltip()
        ;

        var margin = {top: 30, right: 30, bottom: 30, left: 60}
            , marginTop = null
            , margin2 = {top: 0, right: 30, bottom: 20, left: 60}
            , width = null
            , height = null
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , color = nv.utils.defaultColor()
            , showLegend = true
            , focusEnable = true
            , focusShowAxisY = false
            , focusShowAxisX = true
            , focusHeight = 50
            , extent
            , brushExtent = null
            , x
            , x2
            , y1
            , y2
            , y3
            , y4
            , noData = null
            , dispatch = d3.dispatch('brush', 'stateChange', 'changeState')
            , transitionDuration = 0
            , t = d3.transition()
            .duration(transitionDuration)
            .ease(d3.easeLinear)
            , state = nv.utils.state()
            , defaultState = null
            , legendLeftAxisHint = ' (left axis)'
            , legendRightAxisHint = ' (right axis)'
            , switchYAxisOrder = false
        ;

        lines.clipEdge(true);
        lines2.interactive(false);
        // We don't want any points emitted for the focus chart's scatter graph.
        lines2.pointActive(function(d) { return false });
        xAxis.tickPadding(5);
        x2Axis.tickPadding(5);


        tooltip.headerEnabled(true).headerFormatter(function(d, i) {
            return xAxis.tickFormat()(d, i);
        });

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var getBarsAxis = function() {
            return switchYAxisOrder
                ? { main: y2Axis, focus: y4Axis }
                : { main: y1Axis, focus: y3Axis }
        }

        var getLinesAxis = function() {
            return switchYAxisOrder
                ? { main: y1Axis, focus: y3Axis }
                : { main: y2Axis, focus: y4Axis }
        }

        var stateGetter = function(data) {
            return function(){
                return {
                    active: data.map(function(d) { return !d.disabled })
                };
            }
        };

        var stateSetter = function(data) {
            return function(state) {
                if (state.active !== undefined)
                    data.forEach(function(series,i) {
                        series.disabled = !state.active[i];
                    });
            }
        };

        var allDisabled = function(data) {
            return data.every(function(series) {
                return series.disabled;
            });
        }

        function chart(selection) {
            selection.each(function(data) {
                var container = d3.select(this),
                    that = this;
                nv.utils.initSVG(container);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight1 = nv.utils.availableHeight(height, container, margin)
                        - (focusEnable ? focusHeight : 0),
                    availableHeight2 = focusHeight - margin2.top - margin2.bottom;

                chart.update = function() { container.transition().duration(transitionDuration).call(chart); };
                chart.container = this;

                state
                    .setter(stateSetter(data), chart.update)
                    .getter(stateGetter(data))
                    .update();

                // DEPRECATED set state.disableddisabled
                state.disabled = data.map(function(d) { return !!d.disabled });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display No Data message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                var dataBars = data.filter(function(d) { return !d.disabled && d.bar });
                var dataLines = data.filter(function(d) { return !d.bar }); // removed the !d.disabled clause here to fix Issue #240

                if (dataBars.length && !switchYAxisOrder) {
                    x = bars.xScale();
                } else {
                    x = lines.xScale();
                }

                x2 = x2Axis.scale();

                // select the scales and series based on the position of the yAxis
                y1 = switchYAxisOrder ? lines.yScale() : bars.yScale();
                y2 = switchYAxisOrder ? bars.yScale() : lines.yScale();
                y3 = switchYAxisOrder ? lines2.yScale() : bars2.yScale();
                y4 = switchYAxisOrder ? bars2.yScale() : lines2.yScale();

                var series1 = data
                    .filter(function(d) { return !d.disabled && (switchYAxisOrder ? !d.bar : d.bar) })
                    .map(function(d) {
                        return d.values.map(function(d,i) {
                            return { x: getX(d,i), y: getY(d,i) }
                        })
                    });

                var series2 = data
                    .filter(function(d) { return !d.disabled && (switchYAxisOrder ? d.bar : !d.bar) })
                    .map(function(d) {
                        return d.values.map(function(d,i) {
                            return { x: getX(d,i), y: getY(d,i) }
                        })
                    });

                x.range([0, availableWidth]);

                x2  .domain(d3.extent(d3.merge(series1.concat(series2)), function(d) { return d.x } ))
                    .range([0, availableWidth]);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-linePlusBar').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-linePlusBar');


                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-linePlusBar').select('.nv-legendWrap');
                // this is the main chart
                var focusEnter = gEnter.append('g').attr('class', 'nv-focus');
                var xAxisAppend=focusEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-linePlusBar').select('.nv-x');
                var y1AxisAppend=focusEnter.append('g').attr('class', 'nv-y1 nv-axis');
                var y2AxisAppend=focusEnter.append('g').attr('class', 'nv-y2 nv-axis');
                var barsWrapAppend=focusEnter.append('g').attr('class', 'nv-barsWrap');
                var linesWrapAppend=focusEnter.append('g').attr('class', 'nv-linesWrap');

                // context chart is where you can focus in
                var contextEnter = gEnter.append('g').attr('class', 'nv-context');
                var xAxisContextAppend=contextEnter.append('g').attr('class', 'nv-x nv-axis');
                var y1AxisContextAppend=contextEnter.append('g').attr('class', 'nv-y1 nv-axis');
                var y2AxisContextAppend=contextEnter.append('g').attr('class', 'nv-y2 nv-axis');
                var barsContextAppend=contextEnter.append('g').attr('class', 'nv-barsWrap');
                var linesContextAppend=contextEnter.append('g').attr('class', 'nv-linesWrap');
                var brushBackgroundAppend=contextEnter.append('g').attr('class', 'nv-brushBackground');
                var xAxisBrushAppend=contextEnter.append('g').attr('class', 'nv-x nv-brush');

                //============================================================
                // Legend
                //------------------------------------------------------------

                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    var legendWidth = legend.align() ? availableWidth / 2 : availableWidth;
                    var legendXPosition = legend.align() ? legendWidth : 0;

                    legend.width(legendWidth);

                    legendWrapAppend
                        .datum(data.map(function(series) {
                            series.originalKey = series.originalKey === undefined ? series.key : series.originalKey;
                            if(switchYAxisOrder) {
                                series.key = series.originalKey + (series.bar ? legendRightAxisHint : legendLeftAxisHint);
                            } else {
                                series.key = series.originalKey + (series.bar ? legendLeftAxisHint : legendRightAxisHint);
                            }
                            return series;
                        }))
                        .call(legend);

                    if (!marginTop && legend.height() !== margin.top) {
                        margin.top = legend.height();
                        // FIXME: shouldn't this be "- (focusEnabled ? focusHeight : 0)"?
                        availableHeight1 = nv.utils.availableHeight(height, container, margin) - focusHeight;
                    }

                    legendWrapAppend
                        .attr('transform', 'translate(' + legendXPosition + ',' + (-margin.top) +')');
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                //============================================================
                // Context chart (focus chart) components
                //------------------------------------------------------------

                // hide or show the focus context chart
                contextEnter.style('display', focusEnable ? 'initial' : 'none');

                bars2
                    .width(availableWidth)
                    .height(availableHeight2)
                    .color(data.map(function (d, i) {
                        return d.color || color(d, i);
                    }).filter(function (d, i) {
                        return !data[i].disabled && data[i].bar
                    }));
                lines2
                    .width(availableWidth)
                    .height(availableHeight2)
                    .color(data.map(function (d, i) {
                        return d.color || color(d, i);
                    }).filter(function (d, i) {
                        return !data[i].disabled && !data[i].bar
                    }));

                var bars2Wrap = barsContextAppend
                    .datum(dataBars.length ? dataBars : [
                        {values: []}
                    ]);
                var lines2Wrap = linesContextAppend
                    .datum(allDisabled(dataLines) ?
                        [{values: []}] :
                        dataLines.filter(function(dataLine) {
                            return !dataLine.disabled;
                        }));

                contextEnter
                    .attr('transform', 'translate(0,' + ( availableHeight1 + margin.bottom + margin2.top) + ')');

                bars2Wrap.transition().call(bars2);
                lines2Wrap.transition().call(lines2);

                // context (focus chart) axis controls
                if (focusShowAxisX) {
                    x2Axis
                        ._ticks( nv.utils.calcTicksX(availableWidth / 100, data))
                    x2Axis
                        .tickSizeInner(-availableHeight2);
                    xAxisAppend
                        .attr('transform', 'translate(0,' + y3.range()[0] + ')');
                    xAxisAppend.transition()
                        .call(x2Axis);
                }

                if (focusShowAxisY) {
                    y3Axis
                        .scale(y3)
                        ._ticks( availableHeight2 / 36 )
                    y3Axis
                        .tickSizeInner( -availableWidth);
                    y4Axis
                        .scale(y4)
                        ._ticks( availableHeight2 / 36 )
                    y4Axis
                        .tickSizeInner(dataBars.length ? 0 : -availableWidth); // Show the y2 rules only if y1 has none

                    g.select('.nv-context .nv-y3.nv-axis')
                        .style('opacity', dataBars.length ? 1 : 0)
                        .attr('transform', 'translate(0,' + x2.range()[0] + ')');
                    y2AxisContextAppend
                        .style('opacity', dataLines.length ? 1 : 0)
                        .attr('transform', 'translate(' + x2.range()[1] + ',0)');

                    y1AxisContextAppend.transition()
                        .call(y3Axis);
                    y2AxisContextAppend.transition()
                        .call(y4Axis);
                }

                // Setup Brush
                brush.on('brush', onBrush);

                if (brushExtent) brush.extent(brushExtent);

                var brushBG = brushBackgroundAppend.selectAll('g')
                    .data([brushExtent || brush.extent()]);

                var brushBGenter = brushBG.enter()
                    .append('g');

                brushBGenter.append('rect')
                    .attr('class', 'left')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('height', availableHeight2);

                brushBGenter.append('rect')
                    .attr('class', 'right')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('height', availableHeight2);

                var gBrush = xAxisBrushAppend
                    .call(brush);
                gBrush.selectAll('rect')
                    //.attr('y', -5)
                    .attr('height', availableHeight2);
                gBrush.selectAll('.resize').append('path').attr('d', resizePath);

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                legend.dispatch.on('stateChange', function(newState) {
                    for (var key in newState)
                        state[key] = newState[key];
                    dispatch.call('stateChange', this, newState);
                    chart.update();
                });

                // Update chart from a state object passed to event handler
                dispatch.on('changeState', function(e) {
                    if (typeof e.disabled !== 'undefined') {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });
                        state.disabled = e.disabled;
                    }
                    chart.update();
                });

                //============================================================
                // Functions
                //------------------------------------------------------------

                // Taken from crossfilter (http://square.github.com/crossfilter/)
                function resizePath(d) {
                    var e = +(d == 'e'),
                        x = e ? 1 : -1,
                        y = availableHeight2 / 3;
                    return 'M' + (.5 * x) + ',' + y
                        + 'A6,6 0 0 ' + e + ' ' + (6.5 * x) + ',' + (y + 6)
                        + 'V' + (2 * y - 6)
                        + 'A6,6 0 0 ' + e + ' ' + (.5 * x) + ',' + (2 * y)
                        + 'Z'
                        + 'M' + (2.5 * x) + ',' + (y + 8)
                        + 'V' + (2 * y - 8)
                        + 'M' + (4.5 * x) + ',' + (y + 8)
                        + 'V' + (2 * y - 8);
                }


                function updateBrushBG(event) {
                    if (!(event === null)) brush.extent(brushExtent);
                    brushBG
                        .data([event === null ? x2.domain() : brushExtent])
                        .each(function(d, i) {
                            var leftWidth = x2(d[0]) - x2.range()[0];
                            var rightWidth = x2.range()[1] - x2(d[1]);
                            d3.select(this).select('.left')
                                .attr('width', leftWidth < 0 ? 0 : leftWidth);

                            d3.select(this).select('.right')
                                .attr('x', x2(d[1]))
                                .attr('width', rightWidth < 0 ? 0 : rightWidth);
                        });
                }

                function onBrush(event) {
                    brushExtent = event === null ? null : event.selection;
                    var extent = event === null ? x.domain() : event.selection;
                    dispatch.call('brush', this, { extent: extent, brush: brush });
                    updateBrushBG(event);

                    // Prepare Main (Focus) Bars and Lines
                    bars
                        .width(availableWidth)
                        .height(availableHeight1)
                        .color(data.map(function(d,i) {
                            return d.color || color(d, i);
                        }).filter(function(d,i) { return !data[i].disabled && data[i].bar }));

                    lines
                        .width(availableWidth)
                        .height(availableHeight1)
                        .color(data.map(function(d,i) {
                            return d.color || color(d, i);
                        }).filter(function(d,i) { return !data[i].disabled && !data[i].bar }));

                    var focusBarsWrap = barsWrapAppend
                        .datum(!dataBars.length ? [{values:[]}] :
                            dataBars
                                .map(function(d,i) {
                                    return {
                                        key: d.key,
                                        values: d.values.filter(function(d,i) {
                                            return bars.x()(d,i) >= extent[0] && bars.x()(d,i) <= extent[1];
                                        })
                                    }
                                })
                        );

                    var focusLinesWrap = linesWrapAppend
                        .datum(allDisabled(dataLines) ? [{values:[]}] :
                            dataLines
                                .filter(function(dataLine) { return !dataLine.disabled; })
                                .map(function(d,i) {
                                    return {
                                        area: d.area,
                                        fillOpacity: d.fillOpacity,
                                        strokeWidth: d.strokeWidth,
                                        key: d.key,
                                        values: d.values.filter(function(d,i) {
                                            return lines.x()(d,i) >= extent[0] && lines.x()(d,i) <= extent[1];
                                        })
                                    }
                                })
                        );

                    // Update Main (Focus) X Axis
                    if (dataBars.length && !switchYAxisOrder) {
                        x = bars.xScale();
                    } else {
                        x = lines.xScale();
                    }

                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner(-availableHeight1);

                    xAxis.domain([Math.ceil(extent[0]), Math.floor(extent[1])]);

                    xAxisAppend.transition().duration(transitionDuration).call(xAxis);

                    // Update Main (Focus) Bars and Lines
                    focusBarsWrap.transition().duration(transitionDuration).call(bars);
                    focusLinesWrap.transition().duration(transitionDuration).call(lines);

                    // Setup and Update Main (Focus) Y Axes
                    xAxisContextAppend
                        .attr('transform', 'translate(0,' + y1.range()[0] + ')');

                    y1Axis
                        .scale(y1)
                        ._ticks( nv.utils.calcTicksY(availableHeight1/36, data) )
                    y1Axis
                        .tickSizeInner(-availableWidth);
                    y2Axis
                        .scale(y2)
                        ._ticks( nv.utils.calcTicksY(availableHeight1/36, data) );

                    // Show the y2 rules only if y1 has none
                    if(!switchYAxisOrder) {
                        y2Axis.tickSizeInner(dataBars.length ? 0 : -availableWidth);
                    } else {
                        y2Axis.tickSizeInner(dataLines.length ? 0 : -availableWidth, 0);
                    }

                    // Calculate opacity of the axis
                    var barsOpacity = dataBars.length ? 1 : 0;
                    var linesOpacity = dataLines.length && !allDisabled(dataLines) ? 1 : 0;

                    var y1Opacity = switchYAxisOrder ? linesOpacity : barsOpacity;
                    var y2Opacity = switchYAxisOrder ? barsOpacity : linesOpacity;

                    y1AxisAppend
                        .style('opacity', y1Opacity);
                    y2AxisAppend
                        .style('opacity', y2Opacity)
                        .attr('transform', 'translate(' + x.range()[1] + ',0)');

                    y1AxisAppend.transition().duration(transitionDuration)
                        .call(y1Axis);
                    y2AxisAppend.transition().duration(transitionDuration)
                        .call(y2Axis);
                }

                onBrush(event);

            });

            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        lines.dispatch.on('elementMouseover.tooltip', function(evt) {
            tooltip
                .duration(100)
                .valueFormatter(function(d, i) {
                    return getLinesAxis().main.tickFormat()(d, i);
                })
                .data(evt)
                .hidden(false);
        });

        lines.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true)
        });

        bars.dispatch.on('elementMouseover.tooltip', function(evt) {
            evt.value = chart.x()(evt.data);
            evt['series'] = {
                value: chart.y()(evt.data),
                color: evt.color
            };
            tooltip
                .duration(0)
                .valueFormatter(function(d, i) {
                    return getBarsAxis().main.tickFormat()(d, i);
                })
                .data(evt)
                .hidden(false);
        });

        bars.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        bars.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================


        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.legend = legend;
        chart.lines = lines;
        chart.lines2 = lines2;
        chart.bars = bars;
        chart.bars2 = bars2;
        chart.xAxis = xAxis;
        chart.x2Axis = x2Axis;
        chart.y1Axis = y1Axis;
        chart.y2Axis = y2Axis;
        chart.y3Axis = y3Axis;
        chart.y4Axis = y4Axis;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            brushExtent:    {get: function(){return brushExtent;}, set: function(_){brushExtent=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
            focusEnable:    {get: function(){return focusEnable;}, set: function(_){focusEnable=_;}},
            focusHeight:    {get: function(){return focusHeight;}, set: function(_){focusHeight=_;}},
            focusShowAxisX:    {get: function(){return focusShowAxisX;}, set: function(_){focusShowAxisX=_;}},
            focusShowAxisY:    {get: function(){return focusShowAxisY;}, set: function(_){focusShowAxisY=_;}},
            legendLeftAxisHint:    {get: function(){return legendLeftAxisHint;}, set: function(_){legendLeftAxisHint=_;}},
            legendRightAxisHint:    {get: function(){return legendRightAxisHint;}, set: function(_){legendRightAxisHint=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            focusMargin: {get: function(){return margin2;}, set: function(_){
                    margin2.top    = _.top    !== undefined ? _.top    : margin2.top;
                    margin2.right  = _.right  !== undefined ? _.right  : margin2.right;
                    margin2.bottom = _.bottom !== undefined ? _.bottom : margin2.bottom;
                    margin2.left   = _.left   !== undefined ? _.left   : margin2.left;
                }},
            duration: {get: function(){return transitionDuration;}, set: function(_){
                    transitionDuration = _;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                }},
            x: {get: function(){return getX;}, set: function(_){
                    getX = _;
                    lines.x(_);
                    lines2.x(_);
                    bars.x(_);
                    bars2.x(_);
                }},
            y: {get: function(){return getY;}, set: function(_){
                    getY = _;
                    lines.y(_);
                    lines2.y(_);
                    bars.y(_);
                    bars2.y(_);
                }},
            switchYAxisOrder:    {get: function(){return switchYAxisOrder;}, set: function(_){
                    // Switch the tick format for the yAxis
                    if(switchYAxisOrder !== _) {
                        var y1 = y1Axis;
                        y1Axis = y2Axis;
                        y2Axis = y1;

                        var y3 = y3Axis;
                        y3Axis = y4Axis;
                        y4Axis = y3;
                    }
                    switchYAxisOrder=_;

//@todo            y1Axis.orient('left');
//            y2Axis.orient('right');
//            y3Axis.orient('left');
//            y4Axis.orient('right');
                }}
        });

        nv.utils.inheritOptions(chart, lines);
        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.multiBar = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 960
            , height = 500
            , x = d3.scaleBand()
            , y = d3.scaleLinear()
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container = null
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , forceY = [0] // 0 is forced by default.. this makes sense for the majority of bar graphs... user can always do chart.forceY([]) to remove
            , clipEdge = true
            , stacked = false
            , stackOffset = d3.stackOffsetNone // options include 'silhouette', 'wiggle', 'expand', 'zero', or a custom function
            , color = nv.utils.defaultColor()
            , hideable = false
            , barColor = null // adding the ability to set the color for each rather than the whole group
            , disabled // used in conjunction with barColor to communicate from multiBarHorizontalChart what series are disabled
            , duration = 500
            , xDomain
            , yDomain
            , xRange
            , yRange
            , groupSpacing = 0.1
            , fillOpacity = 0.75
            , dispatch = d3.dispatch('chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd')
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var x0, y0 //used to store previous scales
            , renderWatch = nv.utils.renderWatch(dispatch, duration)
        ;

        var last_datalength = 0;

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                container = d3.select(this);
                nv.utils.initSVG(container);
                var nonStackableCount = 0;
                // This function defines the requirements for render complete
                var endFn = function(d, i) {
                    if (d.seriesIndex === data.length - 1 && i === data[0].values.length - 1)
                        return true;
                    return false;
                };

                if(hideable && data.length) hideable = [{
                    values: data[0].values.map(function(d) {
                        return {
                            x: d.x,
                            y: 0,
                            series: data[d.seriesIndex],
                            size: 0.01
                        };}
                    )}];

                if (stacked) {
                    var rawData = data;
                    data.forEach(function(aseries, i) {
                        aseries.seriesIndex = i;
                        aseries.values = aseries.values.map(function(d, j) {
                            d.index = j;
                            d.seriesIndex = i;
                            return d;
                        });
                    });

                    var newData=[];
                    data[0].values.forEach(function(d){
                        newData.push({x: d.x});
                    });
                    data.forEach(function(d, y, y0) {
                        d.display = { y: y, y0: y0 };
                        d.values.forEach(function(d2){
                            newData[d2.index][d.key]=d2.y;
                        });
                        //console.log(d.display);
                    });
                    var keys = data.map(a => a.key);

                    var parsed = d3.stack().keys(keys)
                        .offset(stackOffset)
                        .value(function(d, key){ return d[key] })
                        //.y(getY)
                        (!newData.length && hideable ? hideable : newData);
                    var scatterData=[]; //legacy data shape to pass to scatter
                    parsed.forEach(function(aseries, i) {
                        aseries.seriesIndex = i;
                        //aseries.x=Array.from(Array(aseries.length).keys())
                        //console.log(i+" "+aseries.length);
                        var values = [];
                        aseries.map(function(d, j) {
                            values.push({x:  (d.data && d.data.x ? d.data.x : j), y: d[1]-d[0], y0: d[0], index:j, series: i, seriesIndex: i, display: {y: d[1]-d[0], y0: d[0]}});
                            return values;
                        });
                        scatterData.push({key: keys[i], nonStackable: rawData[i].nonStackable, values: values});
                    });

                    scatterData.forEach(function(series, i){
                        // if series is non-stackable, use un-parsed data
                        if (series.nonStackable) {
                            data[i].nonStackableSeries = nonStackableCount++;
                            scatterData[i] = data[i];
                        } else {
                            // don't stack this seires on top of the nonStackable seriees
                            if (i > 0 && scatterData[i - 1].nonStackable){
                                scatterData[i].values.map(function(d,j){
                                    d.y0 -= scatterData[i - 1].values[j].y;
                                    d.y1 = d.y0 + d.y;
                                });
                            }
                        }
                    });
                    data = scatterData;
                }
                //add series index and key to each data point for reference
                data.forEach(function(series, i) {
                    series.values.forEach(function(point) {
                        point.series = i;
                        point.seriesIndex = i;
                        point.key = series.key;
                    });
                });

                // HACK for negative value stacking
                if (stacked && data.length > 0) {
                    data[0].values.map(function(d,i) {
                        var posBase = 0, negBase = 0;
                        data.map(function(d, idx) {
                            if (!data[idx].nonStackable) {
                                var f = d.values[i]
                                f.size = Math.abs(f.y);
                                if (f.y<0)  {
                                    f.y1 = negBase;
                                    negBase = negBase - f.size;
                                } else
                                {
                                    f.y1 = f.size + posBase;
                                    posBase = posBase + f.size;
                                }
                            }

                        });
                    });
                }
                // Setup Scales
                // remap and flatten the data for use in calculating the scales' domains
                var seriesData = (xDomain && yDomain) ? [] : // if we know xDomain and yDomain, no need to calculate
                    data.map(function(d, idx) {
                        return d.values.map(function(d,i) {
                            return { x: getX(d,i), y: getY(d,i), y0: d.y0, y1: d.y1, idx:idx }
                        })
                    });

                x.domain(xDomain || d3.merge(seriesData).map(function(d) { return d.x }))
                    .range(xRange || [0, availableWidth])
                    .paddingInner(groupSpacing) // Adjust the padding between bars within a group
                    .paddingOuter(groupSpacing);

                y.domain(yDomain || d3.extent(d3.merge(seriesData).map(function(d) {
                    var domain = d.y;
                    // increase the domain range if this series is stackable
                    if (stacked && !data[d.idx].nonStackable) {
                        if (d.y > 0){
                            domain = d.y1
                        } else {
                            domain = d.y1 + d.y
                        }
                    }
                    return domain;
                }).concat(forceY)))
                    .range(yRange || [availableHeight, 0]);

                // If scale's domain don't have a range, slightly adjust to make one... so a chart can show a single data point
                if (x.domain()[0] === x.domain()[1])
                    x.domain()[0] ?
                        x.domain([x.domain()[0] - x.domain()[0] * 0.01, x.domain()[1] + x.domain()[1] * 0.01])
                        : x.domain([-1,1]);

                if (y.domain()[0] === y.domain()[1])
                    y.domain()[0] ?
                        y.domain([y.domain()[0] + y.domain()[0] * 0.01, y.domain()[1] - y.domain()[1] * 0.01])
                        : y.domain([-1,1]);

                x0 = x0 || x;
                y0 = y0 || y;

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-multibar').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-multibar');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                var defsEnter = wrapEnter.append('defs');
                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var groupsAppend=gEnter.append('g').attr('class', 'nv-groups');

                var defsRect=defsEnter.append('clipPath')
                    .attr('id', 'nv-edge-clip-' + id)
                    .append('rect');
                defsRect
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                gEnter.attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + id + ')' : '');

                var groups = container.select('.nv-groups').selectAll('.nv-group')
                    .data(function(d) { return d }, function(d,i) { return i });
                groups.exit().remove();
                var gAppend=groups.enter().append('g')
                    .style('stroke-opacity', 1e-6)
                    .style('fill-opacity', 1e-6);
                gAppend = groups.merge(gAppend);
                var exitTransition = renderWatch
                    .transition(gAppend.exit().selectAll('rect.nv-bar'), 'multibarExit', Math.min(100, duration))
                    .attr('y', function(d, i, j) {
                        var yVal = y0(0) || 0;
                        if (stacked) {
                            if (data[d.seriesIndex] && !data[d.seriesIndex].nonStackable) {
                                yVal = y0(d.y0);
                            }
                        }
                        return yVal;
                    })
                    .attr('height', 0)
                    .remove();
                if (exitTransition.delay)
                    exitTransition.delay(function(d,i) {
                        var delay = i * (duration / (last_datalength + 1)) - i;
                        return delay;
                    });
                gAppend
                    .attr('class', function(d,i) { return 'nv-group nv-series-' + i })
                    .classed('hover', function(d) { return d.hover })
                    .style('fill', function(d,i){ return color(d, i) })
                    .style('stroke', function(d,i){ return color(d, i) });
                gAppend
                    .style('stroke-opacity', 1)
                    .style('fill-opacity', fillOpacity);

                var bars = container.select('.nv-groups').selectAll('.nv-group').selectAll('rect.nv-bar')
                    .data(function(d, i) { return (hideable && !data.length) ? hideable.values : (data[i] ? data[i].values : []) });

                bars.exit().remove();
                var barsEnter = bars.enter().append('rect')
                    .attr('class', function(d,i) { return getY(d,i) < 0 ? 'nv-bar negative' : 'nv-bar positive'})
                    .attr('x', function(d,i,j) {
                        return stacked && !data[d.seriesIndex].nonStackable ? 0 : (d.seriesIndex * x.bandwidth() / data.length )
                    })
                    .attr('y', function(d,i,j) { return y0(stacked && !data[d.seriesIndex].nonStackable ? d.y0 : 0) || 0 })
                    .attr('height', 0)
                    .attr('width', function(d,i,j) { return x.bandwidth() / (stacked && !data[d.seriesIndex].nonStackable ? 1 : data.length) })
                    .attr('transform', function(d,i) { return 'translate(' + x(getX(d,i)) + ',0)'; })
                ;
                barsEnter = bars.merge(barsEnter);


                barsEnter
                    .style('fill', function(d,i,j){ return color(d, d.seriesIndex, i);  })
                    .style('stroke', function(d,i,j){ return color(d, d.seriesIndex, i); })
                    .on('mouseover', function(event, d,i,j) {
                        d3.select(this).classed('hover', true);
                        setCoordinates(event.pageX, event.pageY);
                        dispatch.call('elementMouseover', this, {
                            data: d,
                            index: d.index,
                            series: data[d.seriesIndex],
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('mouseout', function(event,d,i,j) {
                        d3.select(this).classed('hover', false);
                        dispatch.call('elementMouseout', this, {
                            data: d,
                            index: d.index,
                            series: data[d.seriesIndex],
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('mousemove', function(event,d,i,j) {
                        dispatch.call('elementMousemove', this, {
                            data: d,
                            index: d.index,
                            series: data[d.seriesIndex],
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('click', function(event,d,i,j) {
                        var element = this;
                        dispatch.call('elementClick', this, {
                            data: d,
                            index: d.index,
                            series: data[d.seriesIndex],
                            color: d3.select(this).style("fill"),
                            event: event,
                            element: element
                        });
                        event.stopPropagation();
                    })
                    .on('dblclick', function(event,d,i,j) {
                        dispatch.call('elementDblClick', this, {
                            data: d,
                            index: d,index,
                            series: data[d.seriesIndex],
                            color: d3.select(this).style("fill")
                        });
                        event.stopPropagation();
                    });
                barsEnter
                    .attr('class', function(d,i) { return getY(d,i) < 0 ? 'nv-bar negative' : 'nv-bar positive'})
                    .attr('transform', function(d,i) { return 'translate(' + x(getX(d,i)) + ',0)'; })

                if (barColor) {
                    if (!disabled) disabled = data.map(function() { return true });
                    barsEnter
                        .style('fill', function(d,i,j) { return d3.rgb(barColor(d,i)).darker(  disabled.map(function(d,i) { return i }).filter(function(d,i){ return !disabled[i]  })[d.seriesIndex]   ).toString(); })
                        .style('stroke', function(d,i,j) { return d3.rgb(barColor(d,i)).darker(  disabled.map(function(d,i) { return i }).filter(function(d,i){ return !disabled[i]  })[d.seriesIndex]   ).toString(); });
                }

                var barSelection =
                    barsEnter.watchTransition(renderWatch, 'multibar', Math.min(250, duration))
                        .delay(function(d,i) {
                            return i * duration / data[0].values.length;
                        });
                if (stacked){
                    barSelection
                        .attr('y', function(d,i,j) {
                            var yVal = 0;
                            // if stackable, stack it on top of the previous series
                            if (!data[d.seriesIndex].nonStackable) {
                                yVal = y(d.y1);
                            } else {
                                if (getY(d,i) < 0){
                                    yVal = y(0);
                                } else {
                                    if (y(0) - y(getY(d,i)) < -1){
                                        yVal = y(0) - 1;
                                    } else {
                                        yVal = y(getY(d, i)) || 0;
                                    }
                                }
                            }
                            return yVal;
                        })
                        .attr('height', function(d,i,j) {
                            if (!data[d.seriesIndex].nonStackable) {
                                return Math.max(Math.abs(y(d.y+d.y0) - y(d.y0)), 0);
                            } else {
                                return Math.max(Math.abs(y(getY(d,i)) - y(0)), 0) || 0;
                            }
                        })
                        .attr('x', function(d,i,j) {
                            var width = 0;
                            if (data[d.seriesIndex].nonStackable) {
                                width = d.seriesIndex * x.bandwidth() / data.length;
                                if (data.length !== nonStackableCount){
                                    width = data[d.seriesIndex].nonStackableSeries * x.bandwidth()/(nonStackableCount*2);
                                }
                            }
                            return width;
                        })
                        .attr('width', function(d,i,j){
                            if (!data[d.seriesIndex].nonStackable) {
                                return x.bandwidth();
                            } else {
                                // if all series are nonStacable, take the full width
                                var width = (x.bandwidth() / nonStackableCount);
                                // otherwise, nonStackable graph will be only taking the half-width
                                // of the x bandwidth
                                if (data.length !== nonStackableCount) {
                                    width = x.bandwidth()/(nonStackableCount*2);
                                }
                                return width;
                            }
                        });
                }
                else {
                    barSelection
                        .attr('x', function(d,i) {
                            return d.seriesIndex * x.bandwidth() / data.length;
                        })
                        .attr('width', x.bandwidth() / data.length)
                        .attr('y', function(d,i) {
                            return getY(d,i) < 0 ?
                                y(0) :
                                y(0) - y(getY(d,i)) < 1 ?
                                    y(0) - 1 :
                                    y(getY(d,i)) || 0;
                        })
                        .attr('height', function(d,i) {
                            return Math.max(Math.abs(y(getY(d,i)) - y(0)),1) || 0;
                        });
                }

                //store old scales for use in transitions on update
                x0 = x.copy();
                y0 = y.copy();

                // keep track of the last data value length for transition calculations
                if (data[0] && data[0].values) {
                    last_datalength = data[0].values.length;
                }

            });

            renderWatch.renderEnd('multibar immediate');

            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:   {get: function(){return width;}, set: function(_){width=_;}},
            height:  {get: function(){return height;}, set: function(_){height=_;}},
            x:       {get: function(){return getX;}, set: function(_){getX=_;}},
            y:       {get: function(){return getY;}, set: function(_){getY=_;}},
            xScale:  {get: function(){return x;}, set: function(_){x=_;}},
            yScale:  {get: function(){return y;}, set: function(_){y=_;}},
            xDomain: {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain: {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:  {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:  {get: function(){return yRange;}, set: function(_){yRange=_;}},
            forceY:  {get: function(){return forceY;}, set: function(_){forceY=_;}},
            stacked: {get: function(){return stacked;}, set: function(_){stacked=_;}},
            stackOffset: {get: function(){return stackOffset;}, set: function(_){stackOffset=_;}},
            clipEdge:    {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},
            disabled:    {get: function(){return disabled;}, set: function(_){disabled=_;}},
            id:          {get: function(){return id;}, set: function(_){id=_;}},
            hideable:    {get: function(){return hideable;}, set: function(_){hideable=_;}},
            groupSpacing:{get: function(){return groupSpacing;}, set: function(_){groupSpacing=_;}},
            fillOpacity: {get: function(){return fillOpacity;}, set: function(_){fillOpacity=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            barColor:  {get: function(){return barColor;}, set: function(_){
                    barColor = _ ? nv.utils.getColor(_) : null;
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };
    nv.models.multiBarChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var multibar = nv.models.multiBar()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , interactiveLayer = nv.interactiveGuideline()
            , legend = nv.models.legend()
            , controls = nv.models.legend()
            , tooltip = nv.models.tooltip()
        ;

        var margin = {top: 30, right: 20, bottom: 50, left: 60}
            , marginTop = null
            , width = null
            , height = null
            , color = nv.utils.defaultColor()
            , showControls = true
            , controlLabels = {}
            , showLegend = true
            , legendPosition = null
            , showXAxis = true
            , showYAxis = true
            , rightAlignYAxis = false
            , reduceXTicks = true // if false a tick will show for every data point
            , staggerLabels = false
            , wrapLabels = false
            , rotateLabels = 0
            , x //can be accessed via chart.xScale()
            , y //can be accessed via chart.yScale()
            , state = nv.utils.state()
            , defaultState = null
            , noData = null
            , dispatch = d3.dispatch('stateChange', 'changeState', 'renderEnd')
            , controlWidth = function() { return showControls ? 180 : 0 }
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear)
            , useInteractiveGuideline = false
        ;

        state.stacked = false // DEPRECATED Maintained for backward compatibility

        multibar.stacked(false);
        xAxis.tickPadding(7)
        xAxis.showMaxMin(false)
            .tickFormat(function(d) { return d })
        ;
        yAxis
            //@todo .orient((rightAlignYAxis) ? 'right' : 'left')
            .tickFormat(d3.format(',.1f'))
        ;

        tooltip
            .duration(0)
            .valueFormatter(function(d, i) {
                return yAxis.tickFormat()(d, i);
            })
            .headerFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            });

        interactiveLayer.tooltip
            .valueFormatter(function(d, i) {
                return d == null ? "N/A" : yAxis.tickFormat()(d, i);
            })
            .headerFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            });

        interactiveLayer.tooltip
            .valueFormatter(function (d, i) {
                return d == null ? "N/A" : yAxis.tickFormat()(d, i);
            })
            .headerFormatter(function (d, i) {
                return xAxis.tickFormat()(d, i);
            });

        interactiveLayer.tooltip
            .duration(0)
            .valueFormatter(function(d, i) {
                return yAxis.tickFormat()(d, i);
            })
            .headerFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            });

        controls.updateState(false);

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);
        var stacked = false;

        var stateGetter = function(data) {
            return function(){
                return {
                    active: data.map(function(d) { return !d.disabled }),
                    stacked: stacked
                };
            }
        };

        var stateSetter = function(data) {
            return function(state) {
                if (state.stacked !== undefined)
                    stacked = state.stacked;
                if (state.active !== undefined)
                    data.forEach(function(series,i) {
                        series.disabled = !state.active[i];
                    });
            }
        };

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(multibar);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this),
                    that = this;
                nv.utils.initSVG(container);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() {
                    if (duration === 0)
                        container.call(chart);
                    else
                        container.transition().duration(duration)
                            .call(chart);
                };
                chart.container = this;

                state
                    .setter(stateSetter(data), chart.update)
                    .getter(stateGetter(data))
                    .update();

                // DEPRECATED set state.disableddisabled
                state.disabled = data.map(function(d) { return !!d.disabled });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display noData message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = multibar.xScale();
                y = multibar.yScale();

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-multiBarWithLegend').data([data]);
                var wrapEnter=wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-multiBarWithLegend');

                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-multiBarWithLegend').select('.nv-x');
                var yAxisAppend=gEnter.append('g').attr('class', 'nv-y nv-axis');
                yAxisAppend = container.selectAll('g.nv-wrap.nv-multiBarWithLegend').select('.nv-y');
                var barsWrapAppend=gEnter.append('g').attr('class', 'nv-barsWrap');
                barsWrapAppend = container.selectAll('g.nv-wrap.nv-multiBarWithLegend').select('.nv-barsWrap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-multiBarWithLegend').select('.nv-legendWrap');
                var controlsWrapAppend=gEnter.append('g').attr('class', 'nv-controlsWrap');
                controlsWrapAppend = container.selectAll('g.nv-wrap.nv-multiBarWithLegend').select('.nv-controlsWrap');
                var interactiveAppend=gEnter.append('g').attr('class', 'nv-interactive');
                interactiveAppend = container.selectAll('g.nv-wrap.nv-multiBarWithLegend').select('.nv-interactive');


                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    if (legendPosition === 'bottom') {
                        legend.width(availableWidth - margin.right);

                        legendWrapAppend
                            .datum(data)
                            .call(legend);

                        margin.bottom = xAxis.height() + legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                        legendWrapAppend
                            .attr('transform', 'translate(0,' + (availableHeight + xAxis.height())  +')');
                    } else {
                        legend.width(availableWidth - controlWidth());

                        legendWrapAppend
                            .datum(data)
                            .call(legend);

                        if (!marginTop && legend.height() !== margin.top) {
                            margin.top = legend.height();
                            availableHeight = nv.utils.availableHeight(height, container, margin);
                        }

                        legendWrapAppend
                            .attr('transform', 'translate(' + controlWidth() + ',' + (-margin.top) +')');
                    }
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                // Controls
                if (!showControls) {
                    controlsWrapAppend.selectAll('*').remove();
                } else {
                    var controlsData = [
                        { key: controlLabels.grouped || 'Grouped', disabled: multibar.stacked() },
                        { key: controlLabels.stacked || 'Stacked', disabled: !multibar.stacked() }
                    ];

                    controls.width(controlWidth()).color(['#444', '#444', '#444']);
                    controlsWrapAppend
                        .datum(controlsData)
                        .attr('transform', 'translate(0,' + (-margin.top) +')')
                        .call(controls);
                }

                if (rightAlignYAxis) {
                    yAxisAppend
                        .attr("transform", "translate(" + availableWidth + ",0)");
                }

                // Main Chart Component(s)
                multibar
                    .disabled(data.map(function(series) { return series.disabled }))
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled }));


                var barsWrap = container.select('.nv-multiBarWithLegend').selectAll('.nv-barsWrap')
                    .data([data.filter(function(d) { return !d.disabled })]);
                barsWrap = barsWrap.merge(barsWrapAppend);

                barsWrap.call(multibar);

                // Setup Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner(-availableHeight);

                    xAxisAppend
                        .attr('transform', 'translate(0,' + y.range()[0] + ')');
                    xAxisAppend
                        .call(xAxis);

                    var xTicks = xAxisAppend.select("g.nvd3.nv-wrap.nv-axis").selectAll('g');

                    xTicks
                        .selectAll('line, text')
                        .style('opacity', 1)

                    if (staggerLabels) {
                        var getTranslate = function(x,y) {
                            return "translate(" + x + "," + y + ")";
                        };

                        var staggerUp = 5, staggerDown = 17;  //pixels to stagger by
                        // Issue #140
                        xTicks
                            .selectAll("text")
                            .attr('transform', function(d,i,j) {
                                return  getTranslate(0, (j % 2 == 0 ? staggerUp : staggerDown));
                            });

                        var totalInBetweenTicks = d3.selectAll(".nv-x.nv-axis .nv-wrap g g text").nodes().length;
                        xTicks.selectAll(".nv-x.nv-axis .nv-axisMaxMin text")
                            .attr("transform", function(d,i) {
                                return getTranslate(0, (i === 0 || totalInBetweenTicks % 2 !== 0) ? staggerDown : staggerUp);
                            });
                    }

                    if (wrapLabels) {
                        gEnter.selectAll('.tick text')
                            .call(nv.utils.wrapTicks, chart.xScale().bandwidth())
                    }

                    if (reduceXTicks)
                        xTicks
                            .filter(function(d,i) {
                                return i % Math.ceil(data[0].values.length / (availableWidth / 100)) !== 0;
                            })
                            .selectAll('text, line')
                            .style('opacity', 0);

                    if(rotateLabels)
                        xTicks
                            .selectAll('.tick text')
                            .attr('transform', 'rotate(' + rotateLabels + ' 0,0)')
                            .style('text-anchor', rotateLabels > 0 ? 'start' : 'end');

                    xAxisAppend.selectAll('g.nv-axisMaxMin text')
                        .style('opacity', 1);
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                    yAxis
                        .tickSizeInner( -availableWidth);

                    yAxisAppend
                        .call(yAxis);
                }

                //Set up interactive layer
                if (useInteractiveGuideline) {
                    interactiveLayer
                        .width(availableWidth)
                        .height(availableHeight)
                        .margin({left:margin.left, top:margin.top})
                        .svgContainer(container)
                        .xScale(x);
                    interactiveAppend.call(interactiveLayer);
                }

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                legend.dispatch.on('stateChange', function(newState) {
                    for (var key in newState)
                        state[key] = newState[key];
                    dispatch.call('stateChange', this, newState);
                    chart.update();
                });

                controls.dispatch.on('legendClick', function(e,d,i) {
                    if (!d.disabled) return;
                    controlsData = controlsData.map(function(s) {
                        s.disabled = true;
                        return s;
                    });
                    d.disabled = false;

                    switch (d.key) {
                        case 'Grouped':
                        case controlLabels.grouped:
                            multibar.stacked(false);
                            break;
                        case 'Stacked':
                        case controlLabels.stacked:
                            multibar.stacked(true);
                            break;
                    }

                    state.stacked = multibar.stacked();
                    dispatch.call('stateChange', this, state);
                    chart.update();
                });

                // Update chart from a state object passed to event handler
                dispatch.on('changeState', function(e) {
                    if (typeof e.disabled !== 'undefined') {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });
                        state.disabled = e.disabled;
                    }
                    if (typeof e.stacked !== 'undefined') {
                        multibar.stacked(e.stacked);
                        state.stacked = e.stacked;
                        stacked = e.stacked;
                    }
                    chart.update();
                });

                if (useInteractiveGuideline) {
                    interactiveLayer.dispatch.on('elementMousemove', function(e) {
                        if (e.pointXValue == undefined) return;

                        var singlePoint, pointIndex, pointXLocation, xValue, allData = [];
                        data
                            .filter(function(series, i) {
                                series.seriesIndex = i;
                                return !series.disabled;
                            })
                            .forEach(function(series,i) {
                                pointIndex = x.domain().indexOf(e.pointXValue);

                                var point = series.values[pointIndex];
                                if (point === undefined) return;

                                xValue = point.x;
                                if (singlePoint === undefined) singlePoint = point;
                                if (pointXLocation === undefined) pointXLocation = e.mouseX;
                                allData.push({
                                    key: series.key,
                                    value: chart.y()(point, pointIndex),
                                    color: color(series,series.seriesIndex),
                                    data: series.values[pointIndex]
                                });
                            });

                        interactiveLayer.tooltip
                            .data({
                                value: xValue,
                                index: pointIndex,
                                series: allData
                            })();

                        interactiveLayer.renderGuideLine(pointXLocation);
                    });

                    interactiveLayer.dispatch.on("elementMouseout",function(e) {
                        interactiveLayer.tooltip.hidden(true);
                    });
                }
                else {
                    multibar.dispatch.on('elementMouseover.tooltip', function(evt) {
                        evt.value = chart.x()(evt.data);
                        evt['series'] = {
                            key: evt.data.key,
                            value: chart.y()(evt.data),
                            color: evt.color
                        };
                        tooltip.data(evt).hidden(false);
                    });

                    multibar.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true);
                    });

                    multibar.dispatch.on('elementMousemove.tooltip', function(evt) {
                        tooltip();
                    });
                }
            });

            renderWatch.renderEnd('multibarchart immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.multibar = multibar;
        chart.legend = legend;
        chart.controls = controls;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.state = state;
        chart.tooltip = tooltip;
        chart.interactiveLayer = interactiveLayer;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            legendPosition: {get: function(){return legendPosition;}, set: function(_){legendPosition=_;}},
            showControls: {get: function(){return showControls;}, set: function(_){showControls=_;}},
            controlLabels: {get: function(){return controlLabels;}, set: function(_){controlLabels=_;}},
            showXAxis:      {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis:    {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
            reduceXTicks:    {get: function(){return reduceXTicks;}, set: function(_){reduceXTicks=_;}},
            rotateLabels:    {get: function(){return rotateLabels;}, set: function(_){rotateLabels=_;}},
            staggerLabels:    {get: function(){return staggerLabels;}, set: function(_){staggerLabels=_;}},
            wrapLabels:   {get: function(){return wrapLabels;}, set: function(_){wrapLabels=!!_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    multibar.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                    renderWatch.reset(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    //@todo yAxis.orient( rightAlignYAxis ? 'right' : 'left');
                }},
            useInteractiveGuideline: {get: function(){return useInteractiveGuideline;}, set: function(_){
                    useInteractiveGuideline = _;
                }},
            barColor:  {get: function(){return multibar.barColor;}, set: function(_){
                    multibar.barColor(_);
                    legend.color(function(d,i) {return d3.rgb('#ccc').darker(i * 1.5).toString();})
                }}
        });

        nv.utils.inheritOptions(chart, multibar);
        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.multiBarHorizontal = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 960
            , height = 500
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container = null
            , x = d3.scaleBand()
            , y = d3.scaleLinear()
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , getYerr = function(d) { return d.yErr }
            , forceY = [0] // 0 is forced by default.. this makes sense for the majority of bar graphs... user can always do chart.forceY([]) to remove
            , color = nv.utils.defaultColor()
            , barColor = null // adding the ability to set the color for each rather than the whole group
            , disabled // used in conjunction with barColor to communicate from multiBarHorizontalChart what series are disabled
            , stacked = false
            , showValues = false
            , showBarLabels = false
            , valuePadding = 60
            , groupSpacing = 0.1
            , fillOpacity = 0.75
            , valueFormat = d3.format(',.2f')
            , delay = 1200
            , xDomain
            , yDomain
            , xRange
            , yRange
            , duration = 250
            , dispatch = d3.dispatch('chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd')
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var x0, y0; //used to store previous scales
        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                container = d3.select(this);
                nv.utils.initSVG(container);

                if (stacked){
                    var rawData = data;
                    data.forEach(function(aseries, i) {
                        aseries.seriesIndex = i;
                        aseries.values = aseries.values.map(function(d, j) {
                            d.index = j;
                            d.series = i;
                            d.seriesIndex = i;
                            return d;
                        });
                    });
                    var newData=[];
                    data[0].values.forEach(function(d){
                        newData.push({x: d.x});
                    });
                    data.forEach(function(d, y, y0) {
                        d.display = { y: y, y0: y0 };
                        d.values.forEach(function(d2){
                            newData[d2.index][d.key]=d2.y;
                        });
                        //console.log(d.display);
                    });
                    var keys = data.map(a => a.key);
                    data = d3.stack().keys(keys)
                        .offset(d3.stackOffsetNone)
                        .value(function(d, key) {return d[key] })
                        //.y(getY)
                        (newData);
                    var scatterData=[]; //legacy data shape to pass to scatter
                    data.forEach(function(aseries, i) {
                        aseries.seriesIndex = i;
                        aseries.x=Array.from(Array(aseries.length).keys())
                        //console.log(i+" "+aseries.length);
                        var values = [];
                        aseries.map(function(d, j) {
                            values.push({label: rawData[i].values[j].label, x: j, y: d[1]-d[0], y0: d[0], series: i, seriesIndex: i, index: j});
                            return values;
                        });
                        scatterData.push({values: values, key: keys[i], seriesIndex: i});
                    });
                    data=scatterData;
                }

                //add series index and key to each data point for reference
                data.forEach(function(series, i) {
                    series.values.forEach(function(point) {
                        point.series = i;
                        point.seriesIndex = i;
                        point.key = series.key;
                    });
                });

                // HACK for negative value stacking
                if (stacked)
                    data[0].values.map(function(d,i) {
                        var posBase = 0, negBase = 0;
                        data.map(function(d) {
                            var f = d.values[i]
                            f.size = Math.abs(f.y);
                            if (f.y<0)  {
                                f.y1 = negBase - f.size;
                                negBase = negBase - f.size;
                            } else
                            {
                                f.y1 = posBase;
                                posBase = posBase + f.size;
                            }
                        });
                    });

                // Setup Scales
                // remap and flatten the data for use in calculating the scales' domains
                var seriesData = (xDomain && yDomain) ? [] : // if we know xDomain and yDomain, no need to calculate
                    data.map(function(d) {
                        return d.values.map(function(d,i) {
                            return { x: getX(d,i), y: getY(d,i), y0: d.y0, y1: d.y1 }
                        })
                    });

                x.domain(xDomain || d3.merge(seriesData).map(function(d) { return d.x }))
                    .range(xRange || [0, availableHeight])
                    .paddingInner(groupSpacing) // Adjust the padding between bars within a group
                    .paddingOuter(groupSpacing);


                y.domain(yDomain || d3.extent(d3.merge(seriesData).map(function(d) { return stacked ? (d.y > 0 ? d.y1 + d.y : d.y1 ) : d.y }).concat(forceY)))

                if (showValues && !stacked)
                    y.range(yRange || [(y.domain()[0] < 0 ? valuePadding : 0), availableWidth - (y.domain()[1] > 0 ? valuePadding : 0) ]);
                else
                    y.range(yRange || [0, availableWidth]);

                x0 = x0 || x;
                y0 = y0 || d3.scaleLinear().domain(y.domain()).range([y(0),y(0)]);

                // Setup containers and skeleton of chart
                var wrap = d3.select(this).selectAll('g.nv-wrap.nv-multibarHorizontal').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-multibarHorizontal');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                var defsEnter = wrapEnter.append('defs');
                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var groupsAppend=gEnter.append('g').attr('class', 'nv-groups');

                var groupAll = d3.select(this).selectAll('g.nv-groups').selectAll('.nv-group')
                    .data(data);

                var groupAppend = groupAll.enter().append('g')
                    .style('stroke-opacity', 1e-6)
                    .style('fill-opacity', 1e-6);
                groupAll.exit().remove();
                var groups = groupAll.merge(groupAppend);

                groups.exit().watchTransition(renderWatch, 'multibarhorizontal: exit groups')
                    .style('stroke-opacity', 1e-6)
                    .style('fill-opacity', 1e-6)
                    .remove();
                groups
                    .attr('class', function(d,i) { return 'nv-group nv-series-' + i })
                    .classed('hover', function(d) { return d.hover })
                    .style('fill', function(d,i){ return color(d, i) })
                    .style('stroke', function(d,i){ return color(d, i) });
                groups.watchTransition(renderWatch, 'multibarhorizontal: groups')
                    .style('stroke-opacity', 1)
                    .style('fill-opacity', fillOpacity);

                var bars = groups.selectAll('g.nv-bar')
                    .data(function(d) { return d.values });
                bars.exit().remove();


                var barsEnter = bars.enter().append('g')
                    .attr('transform', function(d, i, nodes) {
                        var index = nodes.indexOf(this);
                        return 'translate(' + y0(stacked ? d.y0 : 0) + ',' + (stacked ? 0 : (index * x.bandwidth() / data.length) + x(getX(d, i))) + ')';
                    });


                bars = bars.merge(barsEnter);
                bars.select('rect').remove();
                var rectAppend=bars.append('rect')
                    .attr('width', 0)
                    .attr('height', x.bandwidth() / (stacked ? 1 : data.length) )

                bars
                    .on('mouseover', function(event,d,i) { //TODO: figure out why j works above, but not here
                        d3.select(this).classed('hover', true);
                        setCoordinates(event.pageX, event.pageY);
                        dispatch.call('elementMouseover', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('mouseout', function(event,d,i) {
                        d3.select(this).classed('hover', false);
                        dispatch.call('elementMouseout', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('mouseout', function(event,d,i) {
                        dispatch.call('elementMouseout', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('mousemove', function(event,d,i) {
                        dispatch.call('elementMousemove', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                    })
                    .on('click', function(event,d,i) {
                        var element = this;
                        dispatch.call('elementClick', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill"),
                            event: event,
                            element: element
                        });
                        event.stopPropagation();
                    })
                    .on('dblclick', function(event,d,i) {
                        dispatch.call('elementDblClick', this, {
                            data: d,
                            index: d.index,
                            color: d3.select(this).style("fill")
                        });
                        event.stopPropagation();
                    });

                if (getYerr(data[0],0)) {
                    barsEnter.append('polyline');

                    bars.select('polyline')
                        .attr('fill', 'none')
                        .attr('points', function(d,i) {
                            var xerr = getYerr(d,i)
                                , mid = 0.8 * x.bandwidth() / ((stacked ? 1 : data.length) * 2);
                            xerr = xerr.length ? xerr : [-Math.abs(xerr), Math.abs(xerr)];
                            xerr = xerr.map(function(e) { return y(e + ((getY(d,i) < 0) ? 0 : getY(d,i))) - y(0); });
                            var a = [[xerr[0],-mid], [xerr[0],mid], [xerr[0],0], [xerr[1],0], [xerr[1],-mid], [xerr[1],mid]];
                            return a.map(function (path) { return path.join(',') }).join(' ');
                        })
                        .attr('transform', function(d,i) {
                            var mid = x.bandwidth() / ((stacked ? 1 : data.length) * 2);
                            return 'translate(0, ' + mid + ')';
                        });
                }

                barsEnter.append('text');

                if (showValues && !stacked) {
                    bars.select('text')
                        .attr('text-anchor', function(d,i) { return getY(d,i) < 0 ? 'end' : 'start' })
                        .attr('y', x.bandwidth() / (data.length * 2))
                        .attr('dy', '.32em')
                        .text(function(d,i) {
                            var t = valueFormat(getY(d,i)).replace(/\.0+%$/, "%")
                                , yerr = getYerr(d,i);
                            if (yerr === undefined)
                                return t;
                            if (!yerr.length)
                                return t + '±' + valueFormat(Math.abs(yerr))
                            return t + '+' + valueFormat(Math.abs(yerr[1])) + '-' + valueFormat(Math.abs(yerr[0]));
                        });
                    bars.watchTransition(renderWatch, 'multibarhorizontal: bars')
                        .select('text')
                        .attr('x', function(d,i) { return getY(d,i) < 0 ? -4 : y(getY(d,i)) - y(0) + 4 })
                } else {
                    bars.selectAll('text').text('');
                }

                if (showBarLabels && !stacked) {
                    barsEnter.append('text').classed('nv-bar-label',true);
                    bars.select('text.nv-bar-label')
                        .attr('text-anchor', function(d,i) { return getY(d,i) < 0 ? 'start' : 'end' })
                        .attr('y', x.bandwidth() / (data.length * 2))
                        .attr('dy', '.32em')
                        .text(function(d,i) { return getX(d,i) });
                    bars.watchTransition(renderWatch, 'multibarhorizontal: bars')
                        .select('text.nv-bar-label')
                        .attr('x', function(d,i) { return getY(d,i) < 0 ? y(0) - y(getY(d,i)) + 4 : -4 });
                }
                else {
                    bars.selectAll('text.nv-bar-label').text('');
                }

                bars
                    .attr('class', function(d,i) { return getY(d,i) < 0 ? 'nv-bar negative' : 'nv-bar positive'})

                if (barColor) {
                    if (!disabled) disabled = data.map(function() { return true });
                    bars
                        .style('fill', function(d,i,j) { return d3.rgb(barColor(d,i)).darker(  disabled.map(function(d,i) { return i }).filter(function(d,i){ return !disabled[i]  })[j]   ).toString(); })
                        .style('stroke', function(d,i,j) { return d3.rgb(barColor(d,i)).darker(  disabled.map(function(d,i) { return i }).filter(function(d,i){ return !disabled[i]  })[j]   ).toString(); });
                }

                if (stacked)
                    bars.watchTransition(renderWatch, 'multibarhorizontal: bars')
                        .attr('transform', function(d,i) {
                            return 'translate(' + y(d.y1) + ',' + x(getX(d,i)) + ')'
                        })
                        .select('rect')
                        .attr('width', function(d,i) {
                            return Math.abs(y(getY(d,i) + d.y0) - y(d.y0)) || 0
                        })
                        .attr('height', x.bandwidth() );
                else
                    bars.watchTransition(renderWatch, 'multibarhorizontal: bars')
                        .attr('transform', function(d,i) {
                            //TODO: stacked must be all positive or all negative, not both?
                            return 'translate(' +
                                (getY(d,i) < 0 ? y(getY(d,i)) : y(0))
                                + ',' +
                                (d.series * x.bandwidth() / data.length
                                    +
                                    x(getX(d,i)) )
                                + ')'
                        })
                        .select('rect')
                        .attr('height', x.bandwidth() / data.length )
                        .attr('width', function(d,i) {
                            return Math.max(Math.abs(y(getY(d,i)) - y(0)),1) || 0
                        });


                //store old scales for use in transitions on update
                x0 = x.copy();
                y0 = y.copy();

            });

            renderWatch.renderEnd('multibarHorizontal immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:   {get: function(){return width;}, set: function(_){width=_;}},
            height:  {get: function(){return height;}, set: function(_){height=_;}},
            x:       {get: function(){return getX;}, set: function(_){getX=_;}},
            y:       {get: function(){return getY;}, set: function(_){getY=_;}},
            yErr:       {get: function(){return getYerr;}, set: function(_){getYerr=_;}},
            xScale:  {get: function(){return x;}, set: function(_){x=_;}},
            yScale:  {get: function(){return y;}, set: function(_){y=_;}},
            xDomain: {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain: {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:  {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:  {get: function(){return yRange;}, set: function(_){yRange=_;}},
            forceY:  {get: function(){return forceY;}, set: function(_){forceY=_;}},
            stacked: {get: function(){return stacked;}, set: function(_){stacked=_;}},
            showValues: {get: function(){return showValues;}, set: function(_){showValues=_;}},
            // this shows the group name, seems pointless?
            //showBarLabels:    {get: function(){return showBarLabels;}, set: function(_){showBarLabels=_;}},
            disabled:     {get: function(){return disabled;}, set: function(_){disabled=_;}},
            id:           {get: function(){return id;}, set: function(_){id=_;}},
            valueFormat:  {get: function(){return valueFormat;}, set: function(_){valueFormat=_;}},
            valuePadding: {get: function(){return valuePadding;}, set: function(_){valuePadding=_;}},
            groupSpacing: {get: function(){return groupSpacing;}, set: function(_){groupSpacing=_;}},
            fillOpacity:  {get: function(){return fillOpacity;}, set: function(_){fillOpacity=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            barColor:  {get: function(){return barColor;}, set: function(_){
                    barColor = _ ? nv.utils.getColor(_) : null;
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.multiBarHorizontalChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var multibar = nv.models.multiBarHorizontal()
            , xAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , yAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , legend = nv.models.legend().height(30)
            , controls = nv.models.legend().height(30)
            , tooltip = nv.models.tooltip()
        ;

        var margin = {top: 30, right: 20, bottom: 50, left: 60}
            , marginTop = null
            , width = null
            , height = null
            , color = nv.utils.defaultColor()
            , showControls = true
            , controlsPosition = 'top'
            , controlLabels = {}
            , showLegend = true
            , legendPosition = 'top'
            , showXAxis = true
            , showYAxis = true
            , stacked = false
            , x //can be accessed via chart.xScale()
            , y //can be accessed via chart.yScale()
            , state = nv.utils.state()
            , defaultState = null
            , noData = null
            , dispatch = d3.dispatch('stateChange', 'changeState','renderEnd')
            , controlWidth = function() { return showControls ? 180 : 0 }
            , duration = 250
        ;

        state.stacked = false; // DEPRECATED Maintained for backward compatibility

        multibar.stacked(stacked);

        xAxis.tickPadding(5)
        xAxis
            .showMaxMin(false)
            .tickFormat(function(d) { return d })
        ;
        yAxis.tickFormat(d3.format(',.1f'))
        ;

        tooltip
            .duration(0)
            .valueFormatter(function(d, i) {
                return yAxis.tickFormat()(d, i);
            })
            .headerFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            });

        controls.updateState(false);

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var stateGetter = function(data) {
            return function(){
                return {
                    active: data.map(function(d) { return !d.disabled }),
                    stacked: stacked
                };
            }
        };

        var stateSetter = function(data) {
            return function(state) {
                if (state.stacked !== undefined)
                    stacked = state.stacked;
                if (state.active !== undefined)
                    data.forEach(function(series,i) {
                        series.disabled = !state.active[i];
                    });
            }
        };

        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(multibar);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this),
                    that = this;
                nv.utils.initSVG(container);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() { container.transition().duration(duration).call(chart) };
                chart.container = this;

                stacked = multibar.stacked();

                state
                    .setter(stateSetter(data), chart.update)
                    .getter(stateGetter(data))
                    .update();

                // DEPRECATED set state.disableddisabled
                state.disabled = data.map(function(d) { return !!d.disabled });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display No Data message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = multibar.xScale();
                y = multibar.yScale().clamp(true);


                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-multiBarHorizontalChart').data([data]);
                var wrapEnter=wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-multiBarHorizontalChart');

                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-multiBarHorizontalChart').select('.nv-x');
                var yAxisAppend=gEnter.append('g').attr('class', 'nv-y nv-axis');
                var lineAppend=yAxisAppend.append('g').attr('class', 'nv-zeroLine')
                    .append('line');
                yAxisAppend = container.selectAll('g.nv-wrap.nv-multiBarHorizontalChart').select('.nv-y');

                lineAppend = container.selectAll('g.nv-wrap.nv-multiBarHorizontalChart.nv-zeroLine').select('line');
                var barsWrapAppend=gEnter.append('g').attr('class', 'nv-barsWrap');
                barsWrapAppend = container.selectAll('g.nv-wrap.nv-multiBarHorizontalChart').select('.nv-barsWrap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-multiBarHorizontalChart').select('.nv-legendWrap');
                var controlsWrapAppend=gEnter.append('g').attr('class', 'nv-controlsWrap');
                barsWrapAppend = container.selectAll('g.nv-wrap.nv-multiBarHorizontalChart').select('.nv-controlsWrap');
                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    legend.width(availableWidth - controlWidth());

                    legendWrapAppend
                        .datum(data)
                        .call(legend);
                    if (legendPosition === 'bottom') {
                        margin.bottom = xAxis.height() + legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                        legendWrapAppend
                            .attr('transform', 'translate(' + controlWidth() + ',' + (availableHeight + xAxis.height())  +')');
                    } else if (legendPosition === 'top') {

                        if (!marginTop && legend.height() !== margin.top) {
                            margin.top = legend.height();
                            availableHeight = nv.utils.availableHeight(height, container, margin);
                        }

                        legendWrapAppend
                            .attr('transform', 'translate(' + controlWidth() + ',' + (-margin.top) +')');
                    }
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                // Controls
                if (!showControls) {
                    controlsWrapAppend.selectAll('*').remove();
                } else {
                    var controlsData = [
                        { key: controlLabels.grouped || 'Grouped', disabled: multibar.stacked() },
                        { key: controlLabels.stacked || 'Stacked', disabled: !multibar.stacked() }
                    ];

                    controls.width(controlWidth()).color(['#444', '#444', '#444']);

                    if (controlsPosition === 'bottom') {
                        margin.bottom = xAxis.height() + legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                        controlsWrapAppend
                            .datum(controlsData)
                            .attr('transform', 'translate(0,' + (availableHeight + xAxis.height()) +')')
                            .call(controls);

                    } else if (controlsPosition === 'top') {
                        controlsWrapAppend
                            .datum(controlsData)
                            .attr('transform', 'translate(0,' + (-margin.top) +')')
                            .call(controls);
                    }
                }


                // Main Chart Component(s)
                multibar
                    .disabled(data.map(function(series) { return series.disabled }))
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled }));

                var barsWrap = container.select('.nv-multiBarHorizontalChart').selectAll(".nv-barsWrap")
                    .data([data.filter(function(d) { return !d.disabled })])
                barsWrapAppend = barsWrap.merge(barsWrapAppend);

                barsWrapAppend.transition().call(multibar);

                // Setup Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksY(availableHeight/24, data) )
                    xAxis
                        .tickSizeInner(-availableWidth);

                    xAxisAppend.call(xAxis);

                    var xTicks = xAxisAppend.select("g.nvd3.nv-wrap.nv-axis").selectAll('g');

                    xTicks
                        .selectAll('line, text');
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    yAxis
                        .tickSizeInner( -availableHeight);

                    yAxisAppend
                        .attr('transform', 'translate(0,' + availableHeight + ')');
                    yAxisAppend.call(yAxis);
                }

                // Zero line
                lineAppend
                    .attr("x1", y(0))
                    .attr("x2", y(0))
                    .attr("y1", 0)
                    .attr("y2", -availableHeight)
                ;

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                legend.dispatch.on('stateChange', function(newState) {
                    for (var key in newState)
                        state[key] = newState[key];
                    dispatch.call('stateChange', this, newState);
                    chart.update();
                });

                controls.dispatch.on('legendClick', function(e,d,i) {
                    if (!d.disabled) return;
                    controlsData = controlsData.map(function(s) {
                        s.disabled = true;
                        return s;
                    });
                    d.disabled = false;

                    switch (d.key) {
                        case 'Grouped':
                        case controlLabels.grouped:
                            multibar.stacked(false);
                            break;
                        case 'Stacked':
                        case controlLabels.stacked:
                            multibar.stacked(true);
                            break;
                    }

                    state.stacked = multibar.stacked();
                    dispatch.call('stateChange', this, state);
                    stacked = multibar.stacked();

                    chart.update();
                });

                // Update chart from a state object passed to event handler
                dispatch.on('changeState', function(e) {

                    if (typeof e.disabled !== 'undefined') {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });

                        state.disabled = e.disabled;
                    }

                    if (typeof e.stacked !== 'undefined') {
                        multibar.stacked(e.stacked);
                        state.stacked = e.stacked;
                        stacked = e.stacked;
                    }

                    chart.update();
                });
            });
            renderWatch.renderEnd('multibar horizontal chart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        multibar.dispatch.on('elementMouseover.tooltip', function(evt) {
            evt.value = chart.x()(evt.data);
            evt['series'] = {
                key: evt.data.key,
                value: chart.y()(evt.data),
                color: evt.color
            };
            tooltip.data(evt).hidden(false);
        });

        multibar.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        multibar.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.multibar = multibar;
        chart.legend = legend;
        chart.controls = controls;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.state = state;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            legendPosition: {get: function(){return legendPosition;}, set: function(_){legendPosition=_;}},
            controlsPosition: {get: function(){return controlsPosition;}, set: function(_){controlsPosition=_;}},
            showControls: {get: function(){return showControls;}, set: function(_){showControls=_;}},
            controlLabels: {get: function(){return controlLabels;}, set: function(_){controlLabels=_;}},
            showXAxis:      {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis:    {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    multibar.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                }},
            barColor:  {get: function(){return multibar.barColor;}, set: function(_){
                    multibar.barColor(_);
                    legend.color(function(d,i) {return d3.rgb('#ccc').darker(i * 1.5).toString();})
                }}
        });

        nv.utils.inheritOptions(chart, multibar);
        nv.utils.initOptions(chart);

        return chart;
    };
    nv.models.multiChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 30, right: 20, bottom: 50, left: 60},
            marginTop = null,
            color = nv.utils.defaultColor(),
            width = null,
            height = null,
            showLegend = true,
            noData = null,
            yDomain1,
            yDomain2,
            getX = function(d) { return d.x },
            getY = function(d) { return d.y},
            interpolate = getInterpolationType(interpolate),
            useVoronoi = true,
            interactiveLayer = nv.interactiveGuideline(),
            useInteractiveGuideline = false,
            legendRightAxisHint = ' (right axis)',
            duration = 250
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var x = d3.scaleLinear(),
            yScale1 = d3.scaleLinear(),
            yScale2 = d3.scaleLinear(),

            lines1 = nv.models.line().yScale(yScale1).duration(duration),
            lines2 = nv.models.line().yScale(yScale2).duration(duration),

            scatters1 = nv.models.scatter().yScale(yScale1).duration(duration),
            scatters2 = nv.models.scatter().yScale(yScale2).duration(duration),

            bars1 = nv.models.multiBar().stacked(false).yScale(yScale1).duration(duration),
            bars2 = nv.models.multiBar().stacked(false).yScale(yScale2).duration(duration),

            stack1 = nv.models.stackedArea().yScale(yScale1).duration(duration),
            stack2 = nv.models.stackedArea().yScale(yScale2).duration(duration),

            xAxis = nv.models.axis(d3.axisBottom(x), 'bottom').tickPadding(5).duration(duration),
            yAxis1 = nv.models.axis(d3.axisLeft(yScale1), 'left').duration(duration),
            yAxis2 = nv.models.axis(d3.axisRight(yScale2), 'right').duration(duration),

            legend = nv.models.legend().height(30),
            tooltip = nv.models.tooltip(),
            dispatch = d3.dispatch();

        var charts = [lines1, lines2, scatters1, scatters2, bars1, bars2, stack1, stack2];

        function chart(selection) {
            selection.each(function(data) {
                var container = d3.select(this),
                    that = this;
                nv.utils.initSVG(container);

                chart.update = function() {
                    var s=container.call(chart);
                };
                chart.container = this;

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                var dataLines1 = data.filter(function(d) {return d.type == 'line' && d.yAxis == 1});
                var dataLines2 = data.filter(function(d) {return d.type == 'line' && d.yAxis == 2});
                var dataScatters1 = data.filter(function(d) {return d.type == 'scatter' && d.yAxis == 1});
                var dataScatters2 = data.filter(function(d) {return d.type == 'scatter' && d.yAxis == 2});
                var dataBars1 =  data.filter(function(d) {return d.type == 'bar'  && d.yAxis == 1});
                var dataBars2 =  data.filter(function(d) {return d.type == 'bar'  && d.yAxis == 2});
                var dataStack1 = data.filter(function(d) {return d.type == 'area' && d.yAxis == 1});
                var dataStack2 = data.filter(function(d) {return d.type == 'area' && d.yAxis == 2});

                // Display noData message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container);
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                var series1 = data.filter(function(d) {return !d.disabled && d.yAxis == 1})
                    .map(function(d) {
                        return d.values.map(function(d,i) {
                            return { x: getX(d), y: getY(d) }
                        })
                    });

                var series2 = data.filter(function(d) {return !d.disabled && d.yAxis == 2})
                    .map(function(d) {
                        return d.values.map(function(d,i) {
                            return { x: getX(d), y: getY(d) }
                        })
                    });

                x   .domain(d3.extent(d3.merge(series1.concat(series2)), function(d) { return d.x }))
                    .range([0, availableWidth]);

                var wrap = container.selectAll('g.wrap.multiChart').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'wrap nvd3 multiChart');


                var gEnter = wrapEnter.append('g');

                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.wrap.multiChart').select('.nv-x');
                var y1AxisAppend=gEnter.append('g').attr('class', 'nv-y1 nv-axis');
                var y2AxisAppend=gEnter.append('g').attr('class', 'nv-y2 nv-axis');
                var stack1WrapAppend=gEnter.append('g').attr('class', 'stack1Wrap');
                var stack2WrapAppend=gEnter.append('g').attr('class', 'stack2Wrap');
                var bars1WrapAppend=gEnter.append('g').attr('class', 'bars1Wrap');
                var bars2WrapAppend=gEnter.append('g').attr('class', 'bars2Wrap');
                var scatters1WrapAppend=gEnter.append('g').attr('class', 'scatters1Wrap');
                var scatters2WrapAppend=gEnter.append('g').attr('class', 'scatters2Wrap');
                var lines1WrapAppend=gEnter.append('g').attr('class', 'lines1Wrap');
                var lines2WrapAppend=gEnter.append('g').attr('class', 'lines2Wrap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'legendWrap');
                var interactiveAppend=gEnter.append('g').attr('class', 'nv-interactive');
                legendWrapAppend = container.selectAll('g.wrap.nv-multiChart').select('.nv-legendWrap');
                var g = wrap.select('g');

                var color_array = data.map(function(d,i) {
                    return data[i].color || color(d, i);
                });

                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    var legendWidth = legend.align() ? availableWidth / 2 : availableWidth;
                    var legendXPosition = legend.align() ? legendWidth : 0;

                    legend.width(legendWidth);
                    legend.color(color_array);

                    legendWrapAppend
                        .datum(data.map(function(series) {
                            series.originalKey = series.originalKey === undefined ? series.key : series.originalKey;
                            series.key = series.originalKey + (series.yAxis == 1 ? '' : legendRightAxisHint);
                            return series;
                        }))
                        .call(legend);

                    if (!marginTop && legend.height() !== margin.top) {
                        margin.top = legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                    }

                    legendWrapAppend
                        .attr('transform', 'translate(' + legendXPosition + ',' + (-margin.top) +')');
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                lines1
                    .width(availableWidth)
                    .height(availableHeight)
                    .interpolate(interpolate)
                    .color(color_array.filter(function(d,i) { return !data[i].disabled && data[i].yAxis == 1 && data[i].type == 'line'}));
                lines2
                    .width(availableWidth)
                    .height(availableHeight)
                    .interpolate(interpolate)
                    .color(color_array.filter(function(d,i) { return !data[i].disabled && data[i].yAxis == 2 && data[i].type == 'line'}));
                scatters1
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(color_array.filter(function(d,i) { return !data[i].disabled && data[i].yAxis == 1 && data[i].type == 'scatter'}));
                scatters2
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(color_array.filter(function(d,i) { return !data[i].disabled && data[i].yAxis == 2 && data[i].type == 'scatter'}));
                bars1
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(color_array.filter(function(d,i) { return !data[i].disabled && data[i].yAxis == 1 && data[i].type == 'bar'}));
                bars2
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(color_array.filter(function(d,i) { return !data[i].disabled && data[i].yAxis == 2 && data[i].type == 'bar'}));
                stack1
                    .width(availableWidth)
                    .height(availableHeight)
                    .interpolate(interpolate)
                    .color(color_array.filter(function(d,i) { return !data[i].disabled && data[i].yAxis == 1 && data[i].type == 'area'}));
                stack2
                    .width(availableWidth)
                    .height(availableHeight)
                    .interpolate(interpolate)
                    .color(color_array.filter(function(d,i) { return !data[i].disabled && data[i].yAxis == 2 && data[i].type == 'area'}));

                var lines1Wrap = lines1WrapAppend
                    .datum(dataLines1.filter(function(d){return !d.disabled}));
                var scatters1Wrap = scatters1WrapAppend
                    .datum(dataScatters1.filter(function(d){return !d.disabled}));
                var bars1Wrap = bars1WrapAppend
                    .datum(dataBars1.filter(function(d){return !d.disabled}));
                var stack1Wrap = stack1WrapAppend
                    .datum(dataStack1.filter(function(d){return !d.disabled}));
                var lines2Wrap = lines2WrapAppend
                    .datum(dataLines2.filter(function(d){return !d.disabled}));
                var scatters2Wrap = scatters2WrapAppend
                    .datum(dataScatters2.filter(function(d){return !d.disabled}));
                var bars2Wrap = bars2WrapAppend
                    .datum(dataBars2.filter(function(d){return !d.disabled}));
                var stack2Wrap = stack2WrapAppend
                    .datum(dataStack2.filter(function(d){return !d.disabled}));

                var extraValue1BarStacked = [];
                if (bars1.stacked() && dataBars1.length) {
                    var extraValue1BarStacked = dataBars1.filter(function(d){return !d.disabled}).map(function(a){return a.values});

                    if (extraValue1BarStacked.length > 0)
                        extraValue1BarStacked = extraValue1BarStacked.reduce(function(a,b){
                            return a.map(function(aVal,i){return {x: aVal.x, y: aVal.y + b[i].y}})
                        });
                }
                if (dataBars1.length) {
                    extraValue1BarStacked.push({x:0, y:0});
                }

                var extraValue2BarStacked = [];
                if (bars2.stacked() && dataBars2.length) {
                    var extraValue2BarStacked = dataBars2.filter(function(d){return !d.disabled}).map(function(a){return a.values});

                    if (extraValue2BarStacked.length > 0)
                        extraValue2BarStacked = extraValue2BarStacked.reduce(function(a,b){
                            return a.map(function(aVal,i){return {x: aVal.x, y: aVal.y + b[i].y}})
                        });
                }

                if (dataBars2.length) {
                    extraValue2BarStacked.push({x:0, y:0});
                }

                function getStackedAreaYs(series) {
                    return d3.transpose(series).map(function(x) {
                        return x.map(function(g) {
                            return g.y;
                        });
                    }).map(function(x) {return d3.sum(x);})
                }

                yScale1 .domain(yDomain1 || d3.extent(d3.merge(series1).concat(extraValue1BarStacked), function(d) { return d.y } ))
                    .range([0, availableHeight]);

                yScale2 .domain(yDomain2 || d3.extent(d3.merge(series2).concat(extraValue2BarStacked), function(d) { return d.y } ))
                    .range([0, availableHeight]);

                lines1.yDomain(yScale1.domain());
                scatters1.yDomain(yScale1.domain());
                if(bars1.stacked()) {
                    var yStackScale1 = yScale1.domain([0, d3.max(getStackedAreaYs(series1))]).range([0, availableHeight]);
                    bars1.yDomain(yStackScale1.domain())
                } else {
                    bars1.yDomain(yScale1.domain());
                }
                stack1.yDomain(yScale1.domain());

                lines2.yDomain(yScale2.domain());
                scatters2.yDomain(yScale2.domain());
                if(bars2.stacked()) {
                    var yStackScale2 = yScale2.domain([0, d3.max(getStackedAreaYs(series2))]).range([0, availableHeight]);
                    bars2.yDomain(yStackScale2.domain())
                } else {
                    bars2.yDomain(yScale2.domain());
                }
                stack2.yDomain(yScale2.domain());

                if(dataStack1.length){stack1WrapAppend.transition().call(stack1);}
                if(dataStack2.length){stack2WrapAppend.transition().call(stack2);}

                if(dataBars1.length){bars1WrapAppend.transition().call(bars1);}
                if(dataBars2.length){bars2WrapAppend.transition().call(bars2);}

                if(dataLines1.length){lines1WrapAppend.transition().call(lines1);}
                if(dataLines2.length){lines2WrapAppend.transition().call(lines2);}

                if(dataScatters1.length){scatters1WrapAppend.transition().call(scatters1);}
                if(dataScatters2.length){scatters2WrapAppend.transition().call(scatters2);}

                xAxis
                    ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                xAxis
                    .tickSizeInner(-availableHeight);

                xAxisAppend
                    .attr('transform', 'translate(0,' + availableHeight + ')');
                xAxisAppend.transition()
                    .call(xAxis);

                yAxis1
                    ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                yAxis1
                    .tickSizeInner( -availableWidth);


                y1AxisAppend.transition()
                    .call(yAxis1);

                yAxis2
                    ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                yAxis2
                    .tickSizeInner( -availableWidth);

                y2AxisAppend.transition()
                    .call(yAxis2);

                y1AxisAppend
                    .classed('nv-disabled', series1.length ? false : true)
                    .attr('transform', 'translate(' + x.range()[0] + ',0)');

                y2AxisAppend
                    .classed('nv-disabled', series2.length ? false : true)
                    .attr('transform', 'translate(' + x.range()[1] + ',0)');

                legend.dispatch.on('stateChange', function(newState) {
                    dispatch.call('stateChange', this, newState);
                    chart.update();
                });

                if(useInteractiveGuideline){
                    interactiveLayer
                        .width(availableWidth)
                        .height(availableHeight)
                        .margin({left:margin.left, top:margin.top})
                        .svgContainer(container)
                        .xScale(x);
                    interactiveAppend.call(interactiveLayer);
                }

                //============================================================
                // Event Handling/Dispatching
                //------------------------------------------------------------

                function mouseover_line(evt) {
                    var yaxis = evt.series.yAxis === 2 ? yAxis2 : yAxis1;
                    evt.value = evt.point.x;
                    evt.series = {
                        value: evt.point.y,
                        color: evt.point.color,
                        key: evt.series.key
                    };
                    tooltip
                        .duration(0)
                        .headerFormatter(function(d, i) {
                            return xAxis.tickFormat()(d, i);
                        })
                        .valueFormatter(function(d, i) {
                            return yaxis.tickFormat()(d, i);
                        })
                        .data(evt)
                        .hidden(false);
                }

                function mouseover_scatter(evt) {
                    var yaxis = evt.series.yAxis === 2 ? yAxis2 : yAxis1;
                    evt.value = evt.point.x;
                    evt.series = {
                        value: evt.point.y,
                        color: evt.point.color,
                        key: evt.series.key
                    };
                    tooltip
                        .duration(100)
                        .headerFormatter(function(d, i) {
                            return xAxis.tickFormat()(d, i);
                        })
                        .valueFormatter(function(d, i) {
                            return yaxis.tickFormat()(d, i);
                        })
                        .data(evt)
                        .hidden(false);
                }

                function mouseover_stack(evt) {
                    var yaxis = evt.series.yAxis === 2 ? yAxis2 : yAxis1;
                    evt.point['x'] = stack1.x()(evt.point);
                    evt.point['y'] = stack1.y()(evt.point);
                    tooltip
                        .duration(0)
                        .headerFormatter(function(d, i) {
                            return xAxis.tickFormat()(d, i);
                        })
                        .valueFormatter(function(d, i) {
                            return yaxis.tickFormat()(d, i);
                        })
                        .data(evt)
                        .hidden(false);
                }

                function mouseover_bar(evt) {
                    var yaxis = evt.series.yAxis === 2 ? yAxis2 : yAxis1;

                    evt.value = bars1.x()(evt.data);
                    evt['series'] = {
                        value: bars1.y()(evt.data),
                        color: evt.color,
                        key: evt.data.key
                    };
                    tooltip
                        .duration(0)
                        .headerFormatter(function(d, i) {
                            return xAxis.tickFormat()(d, i);
                        })
                        .valueFormatter(function(d, i) {
                            return yaxis.tickFormat()(d, i);
                        })
                        .data(evt)
                        .hidden(false);
                }



                function clearHighlights() {
                    for(var i=0, il=charts.length; i < il; i++){
                        var chart = charts[i];
                        try {
                            chart.clearHighlights();
                        } catch(e){}
                    }
                }

                function highlightPoint(series, pointIndex, b, pointYValue) {

                    var chartMap = {
                        'line': {
                            'yAxis1': {
                                chart: lines1,
                                data: dataLines1
                            },
                            'yAxis2': {
                                chart: lines2,
                                data: dataLines2
                            }
                        },
                        'scatter': {
                            'yAxis1': {
                                chart: scatters1,
                                data: dataScatters1
                            },
                            'yAxis2': {
                                chart: scatters2,
                                data: dataScatters2
                            }
                        },
                        'bar': {
                            'yAxis1': {
                                chart: bars1,
                                data: dataBars1
                            },
                            'yAxis2': {
                                chart: bars2,
                                data: dataBars2
                            }
                        },
                        'area': {
                            'yAxis1': {
                                chart: stack1,
                                data: dataStack1
                            },
                            'yAxis2': {
                                chart: stack2,
                                data: dataStack2
                            }
                        }
                    };

                    var relevantChart = chartMap[series.type]['yAxis' + series.yAxis].chart;
                    var relevantDatasets = chartMap[series.type]['yAxis' + series.yAxis].data;
                    var seriesIndex = relevantDatasets.reduce(function (seriesIndex, dataSet, i) {
                        return dataSet.key === series.key ? i : seriesIndex;
                    }, 0);

                    try {
                        relevantChart.highlightPoint(seriesIndex, pointIndex, b, pointYValue);
                    } catch(e){}
                }

                if(useInteractiveGuideline){
                    interactiveLayer.dispatch.on('elementMousemove', function(e) {
                        clearHighlights();
                        var singlePoint, pointIndex, pointXLocation, allData = [];
                        data
                            .filter(function(series, i) {
                                series.seriesIndex = i;
                                return !series.disabled;
                            })
                            .forEach(function(series, i) {
                                var extent = x.domain();
                                var currentValues = series.values.filter(function(d,i) {
                                    return chart.x()(d,i) >= extent[0] && chart.x()(d,i) <= extent[1];
                                });

                                pointIndex = nv.interactiveBisect(currentValues, e.pointXValue, chart.x());
                                var point = currentValues[pointIndex];
                                var pointYValue = chart.y()(point, pointIndex);
                                if (pointYValue !== null && !isNaN(pointYValue) && !series.noHighlightSeries) {
                                    highlightPoint(series, pointIndex, true);
                                }
                                if (point === undefined) return;
                                if (singlePoint === undefined) singlePoint = point;
                                if (pointXLocation === undefined) pointXLocation = x(chart.x()(point,pointIndex));
                                allData.push({
                                    key: series.key,
                                    value: pointYValue,
                                    color: color(series,series.seriesIndex),
                                    data: point,
                                    yAxis: series.yAxis == 2 ? yAxis2 : yAxis1
                                });
                            });

                        var defaultValueFormatter = function(d,i) {
                            var yAxis = allData[i].yAxis;
                            return d == null ? "N/A" : yAxis.tickFormat()(d);
                        };
                        interactiveLayer.tooltip
                            .headerFormatter(function(d, i) {
                                return xAxis.tickFormat()(d, i);
                            })
                            .valueFormatter(interactiveLayer.tooltip.valueFormatter() || defaultValueFormatter)
                            .data({
                                value: chart.x()( singlePoint,pointIndex ),
                                index: pointIndex,
                                series: allData
                            })();

                        interactiveLayer.renderGuideLine(pointXLocation);
                    });

                    interactiveLayer.dispatch.on("elementMouseout",function(e) {
                        clearHighlights();
                    });
                } else {
                    lines1.dispatch.on('elementMouseover.tooltip', mouseover_line);
                    lines2.dispatch.on('elementMouseover.tooltip', mouseover_line);
                    lines1.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true)
                    });
                    lines2.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true)
                    });

                    scatters1.dispatch.on('elementMouseover.tooltip', mouseover_scatter);
                    scatters2.dispatch.on('elementMouseover.tooltip', mouseover_scatter);
                    scatters1.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true)
                    });
                    scatters2.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true)
                    });

                    stack1.dispatch.on('elementMouseover.tooltip', mouseover_stack);
                    stack2.dispatch.on('elementMouseover.tooltip', mouseover_stack);
                    stack1.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true)
                    });
                    stack2.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true)
                    });

                    bars1.dispatch.on('elementMouseover.tooltip', mouseover_bar);
                    bars2.dispatch.on('elementMouseover.tooltip', mouseover_bar);

                    bars1.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true);
                    });
                    bars2.dispatch.on('elementMouseout.tooltip', function(evt) {
                        tooltip.hidden(true);
                    });
                    bars1.dispatch.on('elementMousemove.tooltip', function(evt) {
                        tooltip();
                    });
                    bars2.dispatch.on('elementMousemove.tooltip', function(evt) {
                        tooltip();
                    });
                }
            });

            return chart;
        }

        //============================================================
        // Global getters and setters
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.legend = legend;
        chart.lines1 = lines1;
        chart.lines2 = lines2;
        chart.scatters1 = scatters1;
        chart.scatters2 = scatters2;
        chart.bars1 = bars1;
        chart.bars2 = bars2;
        chart.stack1 = stack1;
        chart.stack2 = stack2;
        chart.xAxis = xAxis;
        chart.yAxis1 = yAxis1;
        chart.yAxis2 = yAxis2;
        chart.tooltip = tooltip;
        chart.interactiveLayer = interactiveLayer;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            xScale: {get: function(){return x;}, set: function(_){ x = _; xAxis.scale(x); }},
            yDomain1:      {get: function(){return yDomain1;}, set: function(_){yDomain1=_;}},
            yDomain2:    {get: function(){return yDomain2;}, set: function(_){yDomain2=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
            interpolate:    {get: function(){return interpolate;}, set: function(_){interpolate=_;}},
            legendRightAxisHint:    {get: function(){return legendRightAxisHint;}, set: function(_){legendRightAxisHint=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            x: {get: function(){return getX;}, set: function(_){
                    getX = _;
                    lines1.x(_);
                    lines2.x(_);
                    scatters1.x(_);
                    scatters2.x(_);
                    bars1.x(_);
                    bars2.x(_);
                    stack1.x(_);
                    stack2.x(_);
                }},
            y: {get: function(){return getY;}, set: function(_){
                    getY = _;
                    lines1.y(_);
                    lines2.y(_);
                    scatters1.y(_);
                    scatters2.y(_);
                    stack1.y(_);
                    stack2.y(_);
                    bars1.y(_);
                    bars2.y(_);
                }},
            useVoronoi: {get: function(){return useVoronoi;}, set: function(_){
                    useVoronoi=_;
                    lines1.useVoronoi(_);
                    lines2.useVoronoi(_);
                    stack1.useVoronoi(_);
                    stack2.useVoronoi(_);
                }},

            useInteractiveGuideline: {get: function(){return useInteractiveGuideline;}, set: function(_){
                    useInteractiveGuideline = _;
                    if (useInteractiveGuideline) {
                        lines1.interactive(false);
                        lines1.useVoronoi(false);
                        lines2.interactive(false);
                        lines2.useVoronoi(false);
                        stack1.interactive(false);
                        stack1.useVoronoi(false);
                        stack2.interactive(false);
                        stack2.useVoronoi(false);
                        scatters1.interactive(false);
                        scatters2.interactive(false);
                    }
                }},

            duration: {get: function(){return duration;}, set: function(_) {
                    duration = _;
                    [lines1, lines2, stack1, stack2, scatters1, scatters2, xAxis, yAxis1, yAxis2].forEach(function(model){
                        model.duration(duration);
                    });
                }}
        });

        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.ohlcBar = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = null
            , height = null
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container = null
            , x = d3.scaleLinear()
            , y = d3.scaleLinear()
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , getOpen = function(d) { return d.open }
            , getClose = function(d) { return d.close }
            , getHigh = function(d) { return d.high }
            , getLow = function(d) { return d.low }
            , forceX = []
            , forceY = []
            , padData     = false // If true, adds half a data points width to front and back, for lining up a line chart with a bar chart
            , clipEdge = true
            , color = nv.utils.defaultColor()
            , interactive = false
            , xDomain
            , yDomain
            , xRange
            , yRange
            , dispatch = d3.dispatch('stateChange', 'changeState', 'renderEnd', 'chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'elementMousemove')
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        function chart(selection) {
            selection.each(function(data) {
                container = d3.select(this);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                nv.utils.initSVG(container);

                // ohlc bar width.
                var w = (availableWidth / data[0].values.length) * .9;

                // Setup Scales
                x.domain(xDomain || d3.extent(data[0].values.map(getX).concat(forceX) ));

                if (padData)
                    x.range(xRange || [availableWidth * .5 / data[0].values.length, availableWidth * (data[0].values.length - .5)  / data[0].values.length ]);
                else
                    x.range(xRange || [5 + w/2, availableWidth - w/2 - 5]);

                y.domain(yDomain || [
                    d3.min(data[0].values.map(getLow).concat(forceY)),
                    d3.max(data[0].values.map(getHigh).concat(forceY))
                ]
                ).range(yRange || [availableHeight, 0]);

                // If scale's domain don't have a range, slightly adjust to make one... so a chart can show a single data point
                if (x.domain()[0] === x.domain()[1])
                    x.domain()[0] ?
                        x.domain([x.domain()[0] - x.domain()[0] * 0.01, x.domain()[1] + x.domain()[1] * 0.01])
                        : x.domain([-1,1]);

                if (y.domain()[0] === y.domain()[1])
                    y.domain()[0] ?
                        y.domain([y.domain()[0] + y.domain()[0] * 0.01, y.domain()[1] - y.domain()[1] * 0.01])
                        : y.domain([-1,1]);

                // Setup containers and skeleton of chart
                var wrap = d3.select(this).selectAll('g.nv-wrap.nv-ohlcBar').data([data[0].values]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-ohlcBar');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var defsEnter = wrapEnter.append('defs');
                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var ticksAppend=gEnter.append('g').attr('class', 'nv-ticks');

                container
                    .on('click', function(event,d,i) {
                        dispatch.call('chartClick', this, {
                            data: d,
                            index: d.index,
                            pos: event,
                            id: id
                        });
                    });

                var defsRect=defsEnter.append('clipPath')
                    .attr('id', 'nv-chart-clip-path-' + id)
                    .append('rect');

                defsRect
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                gEnter   .attr('clip-path', clipEdge ? 'url(#nv-chart-clip-path-' + id + ')' : '');

                var ticks = ticksAppend.selectAll('.nv-tick')
                    .data(function(d) { return d });
                ticks.exit().remove();

                ticks.enter().append('path')
                    .attr('class', function(d,i,j) { return (getOpen(d,i) > getClose(d,i) ? 'nv-tick negative' : 'nv-tick positive') + ' nv-tick-' + j + '-' + i })
                    .attr('d', function(d,i) {
                        return 'm0,0l0,'
                            + (y(getOpen(d,i))
                                - y(getHigh(d,i)))
                            + 'l'
                            + (-w/2)
                            + ',0l'
                            + (w/2)
                            + ',0l0,'
                            + (y(getLow(d,i)) - y(getOpen(d,i)))
                            + 'l0,'
                            + (y(getClose(d,i))
                                - y(getLow(d,i)))
                            + 'l'
                            + (w/2)
                            + ',0l'
                            + (-w/2)
                            + ',0z';
                    })
                    .attr('transform', function(d,i) { return 'translate(' + x(getX(d,i)) + ',' + y(getHigh(d,i)) + ')'; })
                    .attr('fill', function(d,i) { return color[0]; })
                    .attr('stroke', function(d,i) { return color[0]; })
                    .attr('x', 0 )
                    .attr('y', function(d,i) {  return y(Math.max(0, getY(d,i))) })
                    .attr('height', function(d,i) { return Math.abs(y(getY(d,i)) - y(0)) });

                // the bar colors are controlled by CSS currently
                ticks.attr('class', function(d,i,j) {
                    return (getOpen(d,i) > getClose(d,i) ? 'nv-tick negative' : 'nv-tick positive') + ' nv-tick-' + j + '-' + i;
                });

                ticks.transition().duration(0)//@todo
                    .attr('transform', function(d,i) { return 'translate(' + x(getX(d,i)) + ',' + y(getHigh(d,i)) + ')'; })
                    .attr('d', function(d,i) {
                        var w = (availableWidth / data[0].values.length) * .9;
                        return 'm0,0l0,'
                            + (y(getOpen(d,i))
                                - y(getHigh(d,i)))
                            + 'l'
                            + (-w/2)
                            + ',0l'
                            + (w/2)
                            + ',0l0,'
                            + (y(getLow(d,i))
                                - y(getOpen(d,i)))
                            + 'l0,'
                            + (y(getClose(d,i))
                                - y(getLow(d,i)))
                            + 'l'
                            + (w/2)
                            + ',0l'
                            + (-w/2)
                            + ',0z';
                    });
            });

            return chart;
        }


        //Create methods to allow outside functions to highlight a specific bar.
        chart.highlightPoint = function(pointIndex, isHoverOver) {
            chart.clearHighlights();
            container.select(".nv-ohlcBar .nv-tick-0-" + pointIndex)
                .classed("hover", isHoverOver)
            ;
        };

        chart.clearHighlights = function() {
            container.select(".nv-ohlcBar .nv-tick.hover")
                .classed("hover", false)
            ;
        };

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:    {get: function(){return width;}, set: function(_){width=_;}},
            height:   {get: function(){return height;}, set: function(_){height=_;}},
            xScale:   {get: function(){return x;}, set: function(_){x=_;}},
            yScale:   {get: function(){return y;}, set: function(_){y=_;}},
            xDomain:  {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain:  {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:   {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:   {get: function(){return yRange;}, set: function(_){yRange=_;}},
            forceX:   {get: function(){return forceX;}, set: function(_){forceX=_;}},
            forceY:   {get: function(){return forceY;}, set: function(_){forceY=_;}},
            padData:  {get: function(){return padData;}, set: function(_){padData=_;}},
            clipEdge: {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},
            id:       {get: function(){return id;}, set: function(_){id=_;}},
            interactive: {get: function(){return interactive;}, set: function(_){interactive=_;}},

            x:     {get: function(){return getX;}, set: function(_){getX=_;}},
            y:     {get: function(){return getY;}, set: function(_){getY=_;}},
            open:  {get: function(){return getOpen();}, set: function(_){getOpen=_;}},
            close: {get: function(){return getClose();}, set: function(_){getClose=_;}},
            high:  {get: function(){return getHigh;}, set: function(_){getHigh=_;}},
            low:   {get: function(){return getLow;}, set: function(_){getLow=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    != undefined ? _.top    : margin.top;
                    margin.right  = _.right  != undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom != undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   != undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }}
        });

        nv.utils.initOptions(chart);
        return chart;
    };
// Code adapted from Jason Davies' "Parallel Coordinates"
// http://bl.ocks.org/jasondavies/1341281
    nv.models.parallelCoordinates = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 30, right: 0, bottom: 10, left: 0}
            , width = null
            , height = null
            , availableWidth = null
            , availableHeight = null
            , x = d3.scalePoint()
            , y = {}
            , undefinedValuesLabel = "undefined values"
            , dimensionData = []
            , enabledDimensions = []
            , dimensionNames = []
            , displayBrush = true
            , color = nv.utils.defaultColor()
            , filters = []
            , active = []
            , dragging = []
            , axisWithUndefinedValues = []
            , lineTension = 1
            , foreground
            , background
            , dimensions
            , line = d3.line()
            , axis = d3.axisLeft(d3.scaleLinear())
            , dispatch = d3.dispatch('start', 'brush', 'end', 'dimensionsOrder', "stateChange", 'elementClick', 'elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd', 'activeChanged')
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var container = d3.select(this);
                availableWidth = nv.utils.availableWidth(width, container, margin);
                availableHeight = nv.utils.availableHeight(height, container, margin);

                nv.utils.initSVG(container);

                //Convert old data to new format (name, values)
                if (data[0].values === undefined) {
                    var newData = [];
                    data.forEach(function (d) {
                        var val = {};
                        var key = Object.keys(d);
                        key.forEach(function (k) { if (k !== "name") val[k] = d[k] });
                        newData.push({ key: d.name, values: val });
                    });
                    data = newData;
                }

                var dataValues = data.map(function (d) {return d.values});
                if (active.length === 0) {
                    active = data;
                }; //set all active before first brush call

                dimensionNames = dimensionData.sort(function (a, b) { return a.currentPosition - b.currentPosition; }).map(function (d) { return d.key });
                enabledDimensions = dimensionData.filter(function (d) { return !d.disabled; });

                // Setup Scales
                x.range([0, availableWidth], 1).domain(enabledDimensions.map(function (d) { return d.key; }));

                //Set as true if all values on an axis are missing.
                // Extract the list of dimensions and create a scale for each.
                var oldDomainMaxValue = {};
                var displayMissingValuesline = false;
                var currentTicks = [];

                dimensionNames.forEach(function(d) {
                    var extent = d3.extent(dataValues, function (p) { return +p[d]; });
                    var min = extent[0];
                    var max = extent[1];
                    var onlyUndefinedValues = false;
                    //If there is no values to display on an axis, set the extent to 0
                    if (isNaN(min) || isNaN(max)) {
                        onlyUndefinedValues = true;
                        min = 0;
                        max = 0;
                    }
                    //Scale axis if there is only one value
                    if (min === max) {
                        min = min - 1;
                        max = max + 1;
                    }
                    var f = filters.filter(function (k) { return k.dimension == d; });
                    if (f.length !== 0) {
                        //If there is only NaN values, keep the existing domain.
                        if (onlyUndefinedValues) {
                            min = y[d].domain()[0];
                            max = y[d].domain()[1];
                        }
                        //If the brush extent is > max (< min), keep the extent value.
                        else if (!f[0].hasOnlyNaN && displayBrush) {
                            min = min > f[0].extent[0] ? f[0].extent[0] : min;
                            max = max < f[0].extent[1] ? f[0].extent[1] : max;
                        }
                        //If there is NaN values brushed be sure the brush extent is on the domain.
                        else if (f[0].hasNaN) {
                            max = max < f[0].extent[1] ? f[0].extent[1] : max;
                            oldDomainMaxValue[d] = y[d].domain()[1];
                            displayMissingValuesline = true;
                        }
                    }
                    //Use 90% of (availableHeight - 12) for the axis range, 12 reprensenting the space necessary to display "undefined values" text.
                    //The remaining 10% are used to display the missingValue line.
                    y[d] = d3.scaleLinear()
                        .domain([min, max])
                        .range([(availableHeight - 12) * 0.9, 0]);

                    axisWithUndefinedValues = [];
                    y[d].brush = d3.brush().on('start', brushstart).on('brush', brush).on('end', brushend);
                });

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-parallelCoordinates').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-parallelCoordinates');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var gEnter = wrapEnter.append('g');
                var g = wrapEnter.select('g');

                var backgroundAppend=gEnter.append('g').attr('class', 'nv-parallelCoordinates background');
                var foregroundAppend=gEnter.append('g').attr('class', 'nv-parallelCoordinates foreground');
                var missingValueslineAppend=gEnter.append('g').attr('class', 'nv-parallelCoordinates missingValuesline');

                line.curve(d3.curveCardinal.tension(lineTension));
                //axis.orient('left');
                var axisDrag = d3.drag()
                    .on('start', dragStart)
                    .on('drag', dragMove)
                    .on('end', dragEnd);

                //Add missing value line at the bottom of the chart
                var missingValuesline, missingValueslineText;
                var step = x.range()[1] - x.range()[0];
                step = isNaN(step) ? x.range()[0] : step;
                if (!isNaN(step)) {
                    var lineData = [0 + step / 2, availableHeight - 12, availableWidth - step / 2, availableHeight - 12];
                    missingValuesline = missingValueslineAppend.selectAll('line').data([lineData]);
                    missingValuesline.enter().append('line');
                    missingValuesline.exit().remove();
                    missingValuesline.attr("x1", function(d) { return d[0]; })
                        .attr("y1", function(d) { return d[1]; })
                        .attr("x2", function(d) { return d[2]; })
                        .attr("y2", function(d) { return d[3]; });

                    //Add the text "undefined values" under the missing value line
                    missingValueslineText = missingValueslineAppend.selectAll('text').data([undefinedValuesLabel]);
                    missingValueslineText.append('text').data([undefinedValuesLabel]);
                    missingValueslineText.enter().append('text');
                    missingValueslineText.exit().remove();
                    missingValueslineText.attr("y", availableHeight)
                        //To have the text right align with the missingValues line, substract 92 representing the text size.
                        .attr("x", availableWidth - 92 - step / 2)
                        .text(function(d) { return d; });
                }
                // Add grey background lines for context.
                background = backgroundAppend.selectAll('path').data(data);
                background.enter().append('path');
                background.exit().remove();
                background.attr('d', path);

                // Add blue foreground lines for focus.
                foreground = foregroundAppend.selectAll('path').data(data);
                foreground.enter().append('path')
                foreground.exit().remove();
                foreground.attr('d', path)
                    .style("stroke-width", function (d, i) {
                        if (isNaN(d.strokeWidth)) { d.strokeWidth = 1;} return d.strokeWidth;})
                    .attr('stroke', function (d, i) { return d.color || color(d, i); });
                foreground.on("mouseover", function (event,d, i) {
                    setCoordinates(event.pageX, event.pageY);
                    d3.select(this).classed('hover', true).style("stroke-width", d.strokeWidth + 2 + "px").style("stroke-opacity", 1);
                    dispatch.call('elementMouseover', this, {
                        label: d.name,
                        color: d.color || color(d, i),
                        values: d.values,
                        dimensions: enabledDimensions
                    });

                });
                foreground.on("mouseout", function (event, d, i) {
                    d3.select(this).classed('hover', false).style("stroke-width", d.strokeWidth + "px").style("stroke-opacity", 0.7);
                    dispatch.call('elementMouseout', this, {
                        label: d.name,
                        index: d.index
                    });
                });
                foreground.on('mousemove', function (d, i) {
                    dispatch.call('elementMousemove', this);
                });
                foreground.on('click', function (d) {
                    dispatch.call('elementClick', this, {
                        id: d.id
                    });
                });
                // Add a group element for each dimension.
                dimensions = g.selectAll('.dimension').data(enabledDimensions);
                var dimensionsEnter = dimensions.enter().append('g').attr('class', 'nv-parallelCoordinates dimension');

                dimensions.attr('transform', function(d) { return 'translate(' + x(d.key) + ',0)'; });
                dimensionsEnter.append('g').attr('class', 'nv-axis');

                // Add an axis and title.
                dimensionsEnter.append('text')
                    .attr('class', 'nv-label')
                    .style("cursor", "move")
                    .attr('dy', '-1em')
                    .attr('text-anchor', 'middle')
                    .on("mouseover", function(event, d, i) {
                        setCoordinates(event.pageX, event.pageY);
                        dispatch.call('elementMouseover', this, {
                            label: d.tooltip || d.key,
                            color: d.color
                        });
                    })
                    .on("mouseout", function(d, i) {
                        dispatch.call('elementMouseout', this, {
                            label: d.tooltip
                        });
                    })
                    .on('mousemove', function (d, i) {
                        dispatch.call('elementMousemove', this);
                    })
                    .call(axisDrag);

                dimensionsEnter.append('g').attr('class', 'nv-brushBackground');
                dimensions.exit().remove();
                dimensions.select('.nv-label').text(function (d) { return d.key });

                // Add and store a brush for each axis.
                restoreBrush(displayBrush);

                var actives = dimensionNames.filter(function (p) { return !(event.selection === null); }),
                    extents = actives.map(function (p) { return y[p].brush.extent(); });
                var formerActive = active.slice(0);

                //Restore active values
                active = [];
                foreground.style("display", function (d) {
                    var isActive = actives.every(function (p, i) {
                        if ((isNaN(d.values[p]) || isNaN(parseFloat(d.values[p]))) && extents[i][0] == y[p].brush.extent()[1][0]) {
                            return true;
                        }
                        return (extents[i][0] <= d.values[p] && d.values[p] <= extents[i][1]) && !isNaN(parseFloat(d.values[p]));
                    });
                    if (isActive)
                        active.push(d);
                    return !isActive ? "none" : null;

                });

                if (filters.length > 0 || !nv.utils.arrayEquals(active, formerActive)) {
                    dispatch.call('activeChanged', this, active);
                }

                // Returns the path for a given data point.
                function path(d) {
                    return line(enabledDimensions.map(function (p) {
                        //If value if missing, put the value on the missing value line
                        if (isNaN(d.values[p.key]) || isNaN(parseFloat(d.values[p.key])) || displayMissingValuesline) {
                            var domain = y[p.key].domain();
                            var range = y[p.key].range();
                            var min = domain[0] - (domain[1] - domain[0]) / 9;

                            //If it's not already the case, allow brush to select undefined values
                            if (axisWithUndefinedValues.indexOf(p.key) < 0) {

                                var newscale = d3.scaleLinear().domain([min, domain[1]]).range([availableHeight - 12, range[1]]);
                                y[p.key].brush.extent([[newscale.range()[0], 0], [newscale.range()[1], 1]]);//@todo set brush height
                                axisWithUndefinedValues.push(p.key);
                            }
                            if (isNaN(d.values[p.key]) || isNaN(parseFloat(d.values[p.key]))) {
                                return [x(p.key), y[p.key](min)];
                            }
                        }

                        //If parallelCoordinate contain missing values show the missing values line otherwise, hide it.
                        if (missingValuesline !== undefined) {
                            if (axisWithUndefinedValues.length > 0 || displayMissingValuesline) {
                                missingValuesline.style("display", "inline");
                                missingValueslineText.style("display", "inline");
                            } else {
                                missingValuesline.style("display", "none");
                                missingValueslineText.style("display", "none");
                            }
                        }
                        return [x(p.key), y[p.key](d.values[p.key])];
                    }));
                }

                function restoreBrush(visible) {
                    filters.forEach(function (f) {
                        //If filter brushed NaN values, keep the brush on the bottom of the axis.
                        var brushDomain = y[f.dimension].brush.extent();
                        if (f.hasOnlyNaN) {
                            f.extent[1] = (y[f.dimension].domain()[1] - brushDomain[0]) * (f.extent[1] - f.extent[0]) / (oldDomainMaxValue[f.dimension] - f.extent[0]) + brushDomain[0];
                        }
                        if (f.hasNaN) {
                            f.extent[0] = brushDomain[0];
                        }
                        if (visible)
                            y[f.dimension].brush.extent(f.extent);
                    });

                    dimensions.select('.nv-brushBackground')
                        .each(function (d) {
                            d3.select(this).call(y[d.key].brush);

                        })
                        .selectAll('rect')
                        .attr('x', -8)
                        .attr('width', 16);

                    updateTicks();
                }

                // Handles a brush event, toggling the display of foreground lines.
                function brushstart() {
                    //If brush aren't visible, show it before brushing again.
                    if (displayBrush === false) {
                        displayBrush = true;
                        restoreBrush(true);
                    }
                }

                // Handles a brush event, toggling the display of foreground lines.
                function brush(event) {
                    actives = dimensionNames.filter(function (p) { return !(event.selection === null); });
                    extents = actives.map(function(p) { return y[p].brush.extent(); });

                    filters = []; //erase current filters
                    actives.forEach(function(d,i) {
                        filters[i] = {
                            dimension: d,
                            extent: extents[i],
                            hasNaN: false,
                            hasOnlyNaN: false
                        }
                    });

                    active = []; //erase current active list
                    foreground.style('display', function(d) {
                        var isActive = actives.every(function(p, i) {
                            if ((isNaN(d.values[p]) || isNaN(parseFloat(d.values[p]))) && extents[i][0] == y[p].brush.extent()[1][0]) return true;
                            return (extents[i][0] <= d.values[p] && d.values[p] <= extents[i][1]) && !isNaN(parseFloat(d.values[p]));
                        });
                        if (isActive) active.push(d);
                        return isActive ? null : 'none';
                    });

                    updateTicks();

                    dispatch.call('brush', this, {
                        filters: filters,
                        active: active
                    });
                }
                function brushend() {
                    var hasActiveBrush = actives.length > 0 ? true : false;
                    filters.forEach(function (f) {
                        if (f.extent[0] === y[f.dimension].brush.extent()[1] && axisWithUndefinedValues.indexOf(f.dimension) >= 0)
                            f.hasNaN = true;
                        if (f.extent[1] < y[f.dimension].domain()[0])
                            f.hasOnlyNaN = true;
                    });
                    dispatch.call('end', active, hasActiveBrush);
                }
                function updateTicks() {
                    dimensions.select('.nv-axis')
                        .each(function (d, i) {
                            var f = filters.filter(function (k) { return k.dimension == d.key; });
                            currentTicks[d.key] = y[d.key].domain();

                            //If brush are available, display brush extent
                            if (f.length != 0 && displayBrush)
                            {
                                currentTicks[d.key] = [];
                                if (f[0].extent[1] > y[d.key].domain()[0])
                                    currentTicks[d.key] = [f[0].extent[1]];
                                if (f[0].extent[0] >= y[d.key].domain()[0])
                                    currentTicks[d.key].push(f[0].extent[0]);
                            }

                            d3.select(this).call(axis.scale(y[d.key]).tickFormat(d.format).tickValues(currentTicks[d.key]));
                        });
                }
                function dragStart(d) {
                    dragging[d.key] = this.parentNode.__origin__ = x(d.key);
                    background.attr("visibility", "hidden");
                }
                function dragMove(event, d) {
                    dragging[d.key] = Math.min(availableWidth, Math.max(0, this.parentNode.__origin__ += event.x));
                    foreground.attr("d", path);
                    enabledDimensions.sort(function (a, b) { return dimensionPosition(a.key) - dimensionPosition(b.key); });
                    enabledDimensions.forEach(function (d, i) { return d.currentPosition = i; });
                    x.domain(enabledDimensions.map(function (d) { return d.key; }));
                    dimensions.attr("transform", function(d) { return "translate(" + dimensionPosition(d.key) + ")"; });
                }
                function dragEnd(d, i) {
                    delete this.parentNode.__origin__;
                    delete dragging[d.key];
                    d3.select(this.parentNode).attr("transform", "translate(" + x(d.key) + ")");
                    foreground
                        .attr("d", path);
                    background
                        .attr("d", path)
                        .attr("visibility", null);

                    dispatch.call('dimensionsOrder', this, enabledDimensions);
                }
                function dimensionPosition(d) {
                    var v = dragging[d];
                    return v == null ? x(d) : v;
                }
            });
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:         {get: function(){return width;},           set: function(_){width= _;}},
            height:        {get: function(){return height;},          set: function(_){height= _;}},
            dimensionData: { get: function () { return dimensionData; }, set: function (_) { dimensionData = _; } },
            displayBrush: { get: function () { return displayBrush; }, set: function (_) { displayBrush = _; } },
            filters: { get: function () { return filters; }, set: function (_) { filters = _; } },
            active: { get: function () { return active; }, set: function (_) { active = _; } },
            lineTension:   {get: function(){return lineTension;},     set: function(_){lineTension = _;}},
            undefinedValuesLabel : {get: function(){return undefinedValuesLabel;}, set: function(_){undefinedValuesLabel=_;}},

            // deprecated options
            dimensions: {get: function () { return dimensionData.map(function (d){return d.key}); }, set: function (_) {
                    // deprecated after 1.8.1
                    nv.deprecated('dimensions', 'use dimensionData instead');
                    if (dimensionData.length === 0) {
                        _.forEach(function (k) { dimensionData.push({ key: k }) })
                    } else {
                        _.forEach(function (k, i) { dimensionData[i].key= k })
                    }
                }},
            dimensionNames: {get: function () { return dimensionData.map(function (d){return d.key}); }, set: function (_) {
                    // deprecated after 1.8.1
                    nv.deprecated('dimensionNames', 'use dimensionData instead');
                    dimensionNames = [];
                    if (dimensionData.length === 0) {
                        _.forEach(function (k) { dimensionData.push({ key: k }) })
                    } else {
                        _.forEach(function (k, i) { dimensionData[i].key = k })
                    }

                }},
            dimensionFormats: {get: function () { return dimensionData.map(function (d) { return d.format }); }, set: function (_) {
                    // deprecated after 1.8.1
                    nv.deprecated('dimensionFormats', 'use dimensionData instead');
                    if (dimensionData.length === 0) {
                        _.forEach(function (f) { dimensionData.push({ format: f }) })
                    } else {
                        _.forEach(function (f, i) { dimensionData[i].format = f })
                    }

                }},
            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    =  _.top    !== undefined ? _.top    : margin.top;
                    margin.right  =  _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom =  _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   =  _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }}
        });
        nv.utils.initOptions(chart);
        return chart;
    };
    nv.models.parallelCoordinatesChart = function () {
        "use strict";
        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var parallelCoordinates = nv.models.parallelCoordinates()
        var legend = nv.models.legend()
        var tooltip = nv.models.tooltip();
        var dimensionTooltip = nv.models.tooltip();

        var margin = { top: 0, right: 0, bottom: 0, left: 0 }
            , marginTop = null
            , width = null
            , height = null
            , showLegend = true
            , color = nv.utils.defaultColor()
            , state = nv.utils.state()
            , dimensionData = []
            , displayBrush = true
            , defaultState = null
            , noData = null
            , nanValue = "undefined"
            , dispatch = d3.dispatch('dimensionsOrder', 'end', 'stateChange', 'changeState', 'renderEnd')
            , controlWidth = function () { return showControls ? 180 : 0 }
        ;

        //============================================================

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);

        var stateGetter = function(data) {
            return function() {
                return {
                    active: data.map(function(d) { return !d.disabled })
                };
            }
        };

        var stateSetter = function(data) {
            return function(state) {
                if(state.active !== undefined) {
                    data.forEach(function(series, i) {
                        series.disabled = !state.active[i];
                    });
                }
            }
        };

        tooltip.contentGenerator(function(data) {
            var str = '<table><thead><tr><td class="legend-color-guide"><div style="background-color:' + data.color + '"></div></td><td><strong>' + data.key + '</strong></td></tr></thead>';
            if(data.series.length !== 0)
            {
                str = str + '<tbody><tr><td height ="10px"></td></tr>';
                data.series.forEach(function(d){
                    str = str + '<tr><td class="legend-color-guide"><div style="background-color:' + d.color + '"></div></td><td class="key">' + d.key + '</td><td class="value">' + d.value + '</td></tr>';
                });
                str = str + '</tbody>';
            }
            str = str + '</table>';
            return str;
        });

        //============================================================
        // Chart function
        //------------------------------------------------------------

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(parallelCoordinates);

            selection.each(function(data) {
                var container = d3.select(this);
                nv.utils.initSVG(container);

                var that = this;

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() { container.call(chart); };
                chart.container = this;

                state.setter(stateSetter(dimensionData), chart.update)
                    .getter(stateGetter(dimensionData))
                    .update();

                //set state.disabled
                state.disabled = dimensionData.map(function (d) { return !!d.disabled });

                //Keep dimensions position in memory
                dimensionData = dimensionData.map(function (d) {d.disabled = !!d.disabled; return d});
                dimensionData.forEach(function (d, i) {
                    d.originalPosition = isNaN(d.originalPosition) ? i : d.originalPosition;
                    d.currentPosition = isNaN(d.currentPosition) ? i : d.currentPosition;
                });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for(key in state) {
                        if(state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display No Data message if there's nothing to show.
                if(!data || !data.length) {
                    nv.utils.noData(chart, container);
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                //------------------------------------------------------------
                // Setup containers and skeleton of chart

                var wrap = container.selectAll('g.nv-wrap.nv-parallelCoordinatesChart').data([data]);
                var wrapEnter=wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-parallelCoordinatesChart');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var gEnter = wrapEnter.append('g');

                var g = wrapEnter.select('g');

                var parallelCoordinatesWrapAppend=gEnter.append('g').attr('class', 'nv-parallelCoordinatesWrap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-parallelCoordinatesChart').select('.nv-legendWrap');

                gEnter.select("rect")
                    .attr("width", availableWidth)
                    .attr("height", (availableHeight > 0) ? availableHeight : 0);

                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    legend.width(availableWidth)
                        .color(function (d) { return "rgb(188,190,192)"; });

                    legendWrapAppend
                        .datum(dimensionData.sort(function (a, b) { return a.originalPosition - b.originalPosition; }))
                        .call(legend);

                    if (!marginTop && legend.height() !== margin.top) {
                        margin.top = legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                    }
                    legendWrapAppend
                        .attr('transform', 'translate( 0 ,' + (-margin.top) + ')');
                }
                // Main Chart Component(s)
                parallelCoordinates
                    .width(availableWidth)
                    .height(availableHeight)
                    .dimensionData(dimensionData)
                    .displayBrush(displayBrush);

                var parallelCoordinatesWrap = parallelCoordinatesWrapAppend
                    .datum(data);

                parallelCoordinatesWrap.transition().duration(0).call(parallelCoordinates);

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------
                //Display reset brush button
                parallelCoordinates.dispatch.on('end', function (active, hasActiveBrush) {
                    if (hasActiveBrush) {
                        displayBrush = true;
                        dispatch.call('end', this, active);
                    } else {

                        displayBrush = false;
                    }
                });

                legend.dispatch.on('stateChange', function(newState) {
                    for(var key in newState) {
                        state[key] = newState[key];
                    }
                    dispatch.call('stateChange', that, newState);
                    chart.update();
                });

                //Update dimensions order and display reset sorting button
                parallelCoordinates.dispatch.on('dimensionsOrder', function (e) {
                    dimensionData.sort(function (a, b) { return a.currentPosition - b.currentPosition; });
                    var isSorted = false;
                    dimensionData.forEach(function (d, i) {
                        d.currentPosition = i;
                        if (d.currentPosition !== d.originalPosition)
                            isSorted = true;
                    });
                    dispatch.call('dimensionsOrder', dimensionData, isSorted);
                });

                // Update chart from a state object passed to event handler
                dispatch.on('changeState', function (e) {

                    if (typeof e.disabled !== 'undefined') {
                        dimensionData.forEach(function (series, i) {
                            series.disabled = e.disabled[i];
                        });
                        state.disabled = e.disabled;
                    }
                    chart.update();
                });
            });

            renderWatch.renderEnd('parraleleCoordinateChart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        parallelCoordinates.dispatch.on('elementMouseover.tooltip', function (evt) {
            var tp = {
                key: evt.label,
                color: evt.color,
                series: []
            }
            if(evt.values){
                Object.keys(evt.values).forEach(function (d) {
                    var dim = evt.dimensions.filter(function (dd) {return dd.key === d;})[0];
                    if(dim){
                        var v;
                        if (isNaN(evt.values[d]) || isNaN(parseFloat(evt.values[d]))) {
                            v = nanValue;
                        } else {
                            v = dim.format(evt.values[d]);
                        }
                        tp.series.push({ idx: dim.currentPosition, key: d, value: v, color: dim.color });
                    }
                });
                tp.series.sort(function(a,b) {return a.idx - b.idx});
            }
            tooltip.data(tp).hidden(false);
        });

        parallelCoordinates.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true)
        });

        parallelCoordinates.dispatch.on('elementMousemove.tooltip', function () {
            tooltip();
        });
        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.parallelCoordinates = parallelCoordinates;
        chart.legend = legend;
        chart.tooltip = tooltip;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width: { get: function () { return width; }, set: function (_) { width = _; } },
            height: { get: function () { return height; }, set: function (_) { height = _; } },
            showLegend: { get: function () { return showLegend; }, set: function (_) { showLegend = _; } },
            defaultState: { get: function () { return defaultState; }, set: function (_) { defaultState = _; } },
            dimensionData: { get: function () { return dimensionData; }, set: function (_) { dimensionData = _; } },
            displayBrush: { get: function () { return displayBrush; }, set: function (_) { displayBrush = _; } },
            noData: { get: function () { return noData; }, set: function (_) { noData = _; } },
            nanValue: { get: function () { return nanValue; }, set: function (_) { nanValue = _; } },

            // options that require extra logic in the setter
            margin: {
                get: function () { return margin; },
                set: function (_) {
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right = _.right !== undefined ? _.right : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left = _.left !== undefined ? _.left : margin.left;
                }
            },
            color: {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                    parallelCoordinates.color(color);
                }}
        });

        nv.utils.inheritOptions(chart, parallelCoordinates);
        nv.utils.initOptions(chart);

        return chart;
    };
    nv.models.pie = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 500
            , height = 500
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container = null
            , color = nv.utils.defaultColor()
            , valueFormat = d3.format(',.2f')
            , showLabels = true
            , labelsOutside = false
            , labelType = "key"
            , labelThreshold = .02 //if slice percentage is under this, don't show label
            , hideOverlapLabels = false //Hide labels that don't fit in slice
            , donut = false
            , title = false
            , growOnHover = true
            , titleOffset = 0
            , labelSunbeamLayout = false
            , startAngle = false
            , padAngle = false
            , endAngle = false
            , cornerRadius = 0
            , donutRatio = 0.5
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear)
            , t70 = d3.transition()
            .duration(70)
            .ease(d3.easeLinear)
            , t50 = d3.transition()
            .duration(50)
            .ease(d3.easeLinear)
            , arcsRadius = []
            , dispatch = d3.dispatch('chartClick', 'elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd')
        ;

        var arcs = [];
        var arcsOver = [];

        //============================================================
        // chart function
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right
                    , availableHeight = height - margin.top - margin.bottom
                    , radius = Math.min(availableWidth, availableHeight) / 2
                    , arcsRadiusOuter = []
                    , arcsRadiusInner = []
                ;

                container = d3.select(this)
                if (arcsRadius.length === 0) {
                    var outer = radius - radius / 10;
                    var inner = donutRatio * radius;
                    for (var i = 0; i < data.length; i++) {
                        arcsRadiusOuter.push(outer);
                        arcsRadiusInner.push(inner);
                    }
                } else {
                    if(growOnHover){
                        arcsRadiusOuter = arcsRadius.map(function (d) { return (d.outer - d.outer / 10) * radius; });
                        arcsRadiusInner = arcsRadius.map(function (d) { return (d.inner - d.inner / 10) * radius; });
                        donutRatio = d3.min(arcsRadius.map(function (d) { return (d.inner - d.inner / 10); }));
                    } else {
                        arcsRadiusOuter = arcsRadius.map(function (d) { return d.outer * radius; });
                        arcsRadiusInner = arcsRadius.map(function (d) { return d.inner * radius; });
                        donutRatio = d3.min(arcsRadius.map(function (d) { return d.inner; }));
                    }
                }
                nv.utils.initSVG(container);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('.nv-wrap.nv-pie').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class','nvd3 nv-wrap nv-pie nv-chart-' + id);
                wrap = wrap.merge(wrapEnter);
                var gEnter = wrapEnter.append('g');
                var g = wrap.select('g');
                var g_pie = gEnter.append('g').attr('class', 'nv-pie');
                g_pie = container.selectAll('.nv-wrap.nv-pie').selectAll('.nv-pie');
                var g_pie_labels = gEnter.append('g').attr('class', 'nv-pieLabels');
                g_pie_labels = container.selectAll('.nv-wrap.nv-pie').selectAll('.nv-pieLabels');
                wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                g_pie.attr('transform', 'translate(' + availableWidth / 2 + ',' + availableHeight / 2 + ')');
                g_pie_labels.attr('transform', 'translate(' + availableWidth / 2 + ',' + availableHeight / 2 + ')');

                //
                container.on('click', function(event,d,i) {
                    dispatch.call('chartClick', this, {
                        data: d,
                        index: d.index,
                        pos: event,
                        id: id
                    });
                });

                arcs = [];
                arcsOver = [];
                for (var i = 0; i < data.length; i++) {

                    var arc = d3.arc().outerRadius(arcsRadiusOuter[i]);
                    var arcOver = d3.arc().outerRadius(arcsRadiusOuter[i] + 5);

                    if (startAngle !== false) {
                        arc.startAngle(startAngle);
                        arcOver.startAngle(startAngle);
                    }
                    if (endAngle !== false) {
                        arc.endAngle(endAngle);
                        arcOver.endAngle(endAngle);
                    }
                    if (donut) {
                        arc.innerRadius(arcsRadiusInner[i]);
                        arcOver.innerRadius(arcsRadiusInner[i]);
                    }

                    if (arc.cornerRadius && cornerRadius) {
                        arc.cornerRadius(cornerRadius);
                        arcOver.cornerRadius(cornerRadius);
                    }

                    arcs.push(arc);
                    arcsOver.push(arcOver);
                }

                // Setup the Pie chart and choose the data element
                var pie = d3.pie()
                    .sort(null)
                    .value(function(d) {return d.disabled ? 0 : getY(d) });

                // padAngle added in d3 3.5
                if (pie.padAngle && padAngle) {
                    pie.padAngle(padAngle);
                }

                // if title is specified and donut, put it in the middle
                if (donut && title) {
                    let pieTitle = g_pie.select('.nv-pie-title'); // Try to select existing path

                    if (pieTitle.empty()) {
                        // If title doesn't exist, append it
                        g_pie.append("text").attr('class', 'nv-pie-title');
                    }

                    wrap.select('.nv-pie-title')
                        .style("text-anchor", "middle")
                        .text(function (d) {
                            return title;
                        })
                        .style("font-size", (Math.min(availableWidth, availableHeight)) * donutRatio * 2 / (title.length + 2) + "px")
                        .attr("dy", "0.35em") // trick to vertically center text
                        .attr('transform', function(d, i) {
                            return 'translate(0, '+ titleOffset + ')';
                        });
                }

                var slices = container.select('.nv-wrap.nv-pie').selectAll('.nv-pie').selectAll('.nv-slice').data(pie(data));
                var pieLabels = container.select('.nv-wrap.nv-pie').selectAll('.nv-pieLabels').selectAll('.nv-label').data(pie(data.filter(function(d) {return !d.disabled}
                )));



                var ae = slices.enter().append('g');
                ae.attr('class', 'nv-slice');
                slices.exit().remove();

                pieLabels.exit().remove();
                ae.on('mouseover', function(event, d, i) {
                    setCoordinates(event.pageX, event.pageY);
                    d3.select(this).classed('hover', true);
                    if (growOnHover) {
                        d3.select(this).select("path").transition().duration(70)
                            .attr("d", arcsOver[d.index]);
                    }
                    dispatch.call('elementMouseover', this, {
                        data: d.data,
                        index: d.index,
                        color: d3.select(this).style("fill"),
                        percent: (d.endAngle - d.startAngle) / (2 * Math.PI)
                    });
                });
                ae.on('mouseout', function(event, d, i) {
                    d3.select(this).classed('hover', false);
                    if (growOnHover) {
                        d3.select(this).select("path").transition().duration(50)
                            .attr("d", arcs[d.index]);
                    }
                    dispatch.call('elementMouseout', this, {data: d.data, index: d.index});
                });
                ae.on('mousemove', function(event, d, i) {
                    dispatch.call('elementMousemove', this, {data: d.data, index: d.index});
                });
                ae.on('click', function(event,d, i) {
                    var element = this;
                    dispatch.call('elementClick', this, {
                        data: d.data,
                        index: d.index,
                        color: d3.select(this).style("fill"),
                        event: event,
                        element: element
                    });
                });
                ae.on('dblclick', function(event, d, i) {
                    dispatch.call('elementDblClick', this, {
                        data: d.data,
                        index: d.index,
                        color: d3.select(this).style("fill")
                    });
                });

                ae = slices.merge(ae);

                ae.attr('fill', function(d,i) { return color(d.data, i); });
                ae.attr('stroke', function(d,i) { return color(d.data, i); });
                var paths = ae.append('path').each(function(d) {
                    this._current = d;
                });

                ae.select('path')
                    .transition().duration(duration)
                    .attr('d', function (d, i) { return arcs[i](d); })
                    .attrTween('d', arcTween);


                if (showLabels) {
                    // This does the normal label
                    var labelsArc = [];
                    for (var i = 0; i < data.length; i++) {
                        labelsArc.push(arcs[i]);

                        if (labelsOutside) {
                            if (donut) {
                                labelsArc[i] = d3.arc().outerRadius(arcs[i].outerRadius());
                                if (startAngle !== false) labelsArc[i].startAngle(startAngle);
                                if (endAngle !== false) labelsArc[i].endAngle(endAngle);
                            }
                        } else if (!donut) {
                            labelsArc[i].innerRadius(0);
                        }
                    }
                    pieLabels.enter().append("g").classed("nv-label",true);

                    var pieLabelsEnter=container.select('.nv-wrap.nv-pie').selectAll('.nv-pieLabels').selectAll('.nv-label').each(function(d,i) {
                        var group = d3.select(this);

                        group.attr('transform', function (d, i) {
                            if (labelSunbeamLayout) {
                                d.outerRadius = arcsRadiusOuter[i] + 10; // Set Outer Coordinate
                                d.innerRadius = arcsRadiusOuter[i] + 15; // Set Inner Coordinate
                                var rotateAngle = (d.startAngle + d.endAngle) / 2 * (180 / Math.PI);
                                if ((d.startAngle + d.endAngle) / 2 < Math.PI) {
                                    rotateAngle -= 90;
                                } else {
                                    rotateAngle += 90;
                                }
                                return 'translate(' + labelsArc[i].centroid(d) + ') rotate(' + rotateAngle + ')';
                            } else {
                                d.outerRadius = radius + 10; // Set Outer Coordinate
                                d.innerRadius = radius + 15; // Set Inner Coordinate
                                return 'translate(' + labelsArc[i].centroid(d) + ')'
                            }
                        });
                        var rectAppend =  group.append('rect');
                        container.select(".nv-wrap.nv-pie").selectAll(".nv-pieLabels").select('rect')
                            .style('stroke', '#fff')
                            .style('fill', '#fff')
                            .attr("rx", 3)
                            .attr("ry", 3);

                        var textAppend =  group.append('text');
                        container.select(".nv-wrap.nv-pie").selectAll(".nv-pieLabels").select('text')
                            .style('text-anchor', labelSunbeamLayout ? ((d.startAngle + d.endAngle) / 2 < Math.PI ? 'start' : 'end') : 'middle') //center the text on it's origin or begin/end if orthogonal aligned
                            .style('fill', '#000')
                    });

                    var labelLocationHash = {};
                    var avgHeight = 14;
                    var avgWidth = 140;
                    var createHashKey = function(coordinates) {
                        return Math.floor(coordinates[0]/avgWidth) * avgWidth + ',' + Math.floor(coordinates[1]/avgHeight) * avgHeight;
                    };
                    var getSlicePercentage = function(d) {
                        return (d.endAngle - d.startAngle) / (2 * Math.PI);
                    };

                    pieLabelsEnter.watchTransition(renderWatch, 'pie labels').attr('transform', function (d, i) {
                        if (labelSunbeamLayout) {
                            d.outerRadius = arcsRadiusOuter[i] + 10; // Set Outer Coordinate
                            d.innerRadius = arcsRadiusOuter[i] + 15; // Set Inner Coordinate
                            var rotateAngle = (d.startAngle + d.endAngle) / 2 * (180 / Math.PI);
                            if ((d.startAngle + d.endAngle) / 2 < Math.PI) {
                                rotateAngle -= 90;
                            } else {
                                rotateAngle += 90;
                            }
                            return 'translate(' + labelsArc[i].centroid(d) + ') rotate(' + rotateAngle + ')';
                        } else {
                            d.outerRadius = radius + 10; // Set Outer Coordinate
                            d.innerRadius = radius + 15; // Set Inner Coordinate

                            /*
                        Overlapping pie labels are not good. What this attempts to do is, prevent overlapping.
                        Each label location is hashed, and if a hash collision occurs, we assume an overlap.
                        Adjust the label's y-position to remove the overlap.
                        */
                            var center = labelsArc[i].centroid(d);
                            var percent = getSlicePercentage(d);
                            if (d.value && percent >= labelThreshold) {
                                var hashKey = createHashKey(center);
                                if (labelLocationHash[hashKey]) {
                                    center[1] -= avgHeight;
                                }
                                labelLocationHash[createHashKey(center)] = true;
                            }
                            return 'translate(' + center + ')'
                        }
                    });

                    pieLabelsEnter.select(".nv-label text")
                        .style('text-anchor', function(d,i) {
                            //center the text on it's origin or begin/end if orthogonal aligned
                            return labelSunbeamLayout ? ((d.startAngle + d.endAngle) / 2 < Math.PI ? 'start' : 'end') : 'middle';
                        })
                        .text(function(d, i) {
                            var percent = getSlicePercentage(d);
                            var label = '';
                            if (!d.value || percent < labelThreshold) return '';

                            if(typeof labelType === 'function') {
                                label = labelType(d, i, {
                                    'key': String(getX(d.data)).replace(/\.0+([A-Za-z]*)$/, '$1').replace(/\.([1-9]+)0+([A-Za-z]*)$/, '.$1$2'),
                                    'value': String(getY(d.data)).replace(/\.0+([A-Za-z]*)$/, '$1').replace(/\.([1-9]+)0+([A-Za-z]*)$/, '.$1$2'),
                                    'percent': valueFormat(percent)
                                });
                            } else {
                                switch (labelType) {
                                    case 'key':
                                        label = getX(d.data).replace(/\.0+([A-Za-z]*)$/, '$1').replace(/\.([1-9]+)0+([A-Za-z]*)$/, '.$1$2');
                                        break;
                                    case 'value':
                                        label = valueFormat(getY(d.data)).replace(/\.0+([A-Za-z]*)$/, '$1').replace(/\.([1-9]+)0+([A-Za-z]*)$/, '.$1$2');;
                                        break;
                                    case 'percent':
                                        label = d3.format('.0%')(percent).replace(/\.0+([A-Za-z]*)$/, '$1').replace(/\.([1-9]+)0+([A-Za-z]*)$/, '.$1$2');;
                                        break;
                                }
                            }
                            return label;
                        });
                    ;

                    if (hideOverlapLabels) {
                        pieLabelsEnter
                            .each(function (d, i) {
                                if (!this.getBBox) return;
                                var bb = this.getBBox(),
                                    center = labelsArc[i].centroid(d);
                                var topLeft = {
                                    x : center[0] + bb.x,
                                    y : center[1] + bb.y
                                };

                                var topRight = {
                                    x : topLeft.x + bb.width,
                                    y : topLeft.y
                                };

                                var bottomLeft = {
                                    x : topLeft.x,
                                    y : topLeft.y + bb.height
                                };

                                var bottomRight = {
                                    x : topLeft.x + bb.width,
                                    y : topLeft.y + bb.height
                                };

                                d.visible = nv.utils.pointIsInArc(topLeft, d, arc) &&
                                    nv.utils.pointIsInArc(topRight, d, arc) &&
                                    nv.utils.pointIsInArc(bottomLeft, d, arc) &&
                                    nv.utils.pointIsInArc(bottomRight, d, arc);
                            })
                            .style('display', function (d) {
                                return d.visible ? null : 'none';
                            })
                        ;
                    }
                    pieLabelsEnter.merge(pieLabels);
                }


                // Computes the angle of an arc, converting from radians to degrees.
                function angle(d) {
                    var a = (d.startAngle + d.endAngle) * 90 / Math.PI - 90;
                    return a > 90 ? a - 180 : a;
                }

                function arcTween(a, idx) {
                    a.endAngle = isNaN(a.endAngle) ? 0 : a.endAngle;
                    a.startAngle = isNaN(a.startAngle) ? 0 : a.startAngle;
                    if (!donut) a.innerRadius = 0;
                    var i = d3.interpolate(this._current, a);
                    this._current = i(0);
                    return function (t) {
                        return arcs[idx](i(t));
                    };
                }
            });

            renderWatch.renderEnd('pie immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            arcsRadius: { get: function () { return arcsRadius; }, set: function (_) { arcsRadius = _; } },
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLabels: {get: function(){return showLabels;}, set: function(_){showLabels=_;}},
            title:      {get: function(){return title;}, set: function(_){title=_;}},
            titleOffset:    {get: function(){return titleOffset;}, set: function(_){titleOffset=_;}},
            labelThreshold: {get: function(){return labelThreshold;}, set: function(_){labelThreshold=_;}},
            hideOverlapLabels: {get: function(){return hideOverlapLabels;}, set: function(_){hideOverlapLabels=_;}},
            valueFormat:    {get: function(){return valueFormat;}, set: function(_){valueFormat=_;}},
            x:          {get: function(){return getX;}, set: function(_){getX=_;}},
            id:         {get: function(){return id;}, set: function(_){id=_;}},
            endAngle:   {get: function(){return endAngle;}, set: function(_){endAngle=_;}},
            startAngle: {get: function(){return startAngle;}, set: function(_){startAngle=_;}},
            padAngle:   {get: function(){return padAngle;}, set: function(_){padAngle=_;}},
            cornerRadius: {get: function(){return cornerRadius;}, set: function(_){cornerRadius=_;}},
            donutRatio:   {get: function(){return donutRatio;}, set: function(_){donutRatio=_;}},
            labelsOutside: {get: function(){return labelsOutside;}, set: function(_){labelsOutside=_;}},
            labelSunbeamLayout: {get: function(){return labelSunbeamLayout;}, set: function(_){labelSunbeamLayout=_;}},
            donut:              {get: function(){return donut;}, set: function(_){donut=_;}},
            growOnHover:        {get: function(){return growOnHover;}, set: function(_){growOnHover=_;}},

            // depreciated after 1.7.1
            pieLabelsOutside: {get: function(){return labelsOutside;}, set: function(_){
                    labelsOutside=_;
                    nv.deprecated('pieLabelsOutside', 'use labelsOutside instead');
                }},
            // depreciated after 1.7.1
            donutLabelsOutside: {get: function(){return labelsOutside;}, set: function(_){
                    labelsOutside=_;
                    nv.deprecated('donutLabelsOutside', 'use labelsOutside instead');
                }},
            // deprecated after 1.7.1
            labelFormat: {get: function(){ return valueFormat;}, set: function(_) {
                    valueFormat=_;
                    nv.deprecated('labelFormat','use valueFormat instead');
                }},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
                    margin.right  = typeof _.right  != 'undefined' ? _.right  : margin.right;
                    margin.bottom = typeof _.bottom != 'undefined' ? _.bottom : margin.bottom;
                    margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                }},
            y: {get: function(){return getY;}, set: function(_){
                    getY = typeof _ === "function" ? _ : function(){return _;};
                }},
            color: {get: function(){return color;}, set: function(_){
                    color=nv.utils.getColor(_);
                }},
            labelType:          {get: function(){return labelType;}, set: function(_){
                    labelType= _ || 'key';
                }}
        });

        nv.utils.initOptions(chart);
        return chart;
    };
    nv.models.pieChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var pie = nv.models.pie();
        var legend = nv.models.legend();
        var tooltip = nv.models.tooltip();

        var margin = {top: 30, right: 20, bottom: 20, left: 20}
            , marginTop = null
            , width = null
            , height = null
            , showTooltipPercent = false
            , showLegend = true
            , legendPosition = "top"
            , color = nv.utils.defaultColor()
            , state = nv.utils.state()
            , defaultState = null
            , noData = null
            , duration = 250
            , dispatch = d3.dispatch('stateChange', 'changeState','renderEnd')
        ;

        tooltip
            .duration(0)
            .headerEnabled(false)
            .valueFormatter(function(d, i) {
                return pie.valueFormat()(d, i);
            });

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);

        var stateGetter = function(data) {
            return function(){
                return {
                    active: data.map(function(d) { return !d.disabled })
                };
            }
        };

        var stateSetter = function(data) {
            return function(state) {
                if (state.active !== undefined) {
                    data.forEach(function (series, i) {
                        series.disabled = !state.active[i];
                    });
                }
            }
        };

        //============================================================
        // Chart function
        //------------------------------------------------------------

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(pie);

            selection.each(function(data) {
                var container = d3.select(this);
                nv.utils.initSVG(container);

                var that = this;
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() { container.transition().call(chart); };
                chart.container = this;

                state.setter(stateSetter(data), chart.update)
                    .getter(stateGetter(data))
                    .update();

                //set state.disabled
                state.disabled = data.map(function(d) { return !!d.disabled });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display No Data message if there's nothing to show.
                if (!data || !data.length) {
                    nv.utils.noData(chart, container);
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }
                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-pieChart').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-pieChart');

                var gEnter = wrapEnter.append('g');
                var g = wrapEnter.select('g');

                var pieWrapAppend=g.append('g').attr('class', 'nv-pieWrap');
                pieWrapAppend = container.selectAll('g.nv-wrap.nv-pieChart').select('.nv-pieWrap');
                var legendWrapAppend=g.append('g').attr('class', 'nv-legendWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-pieChart').select('.nv-legendWrap');

                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    if (legendPosition === "top") {
                        legend.width( availableWidth ).key(pie.x());

                        legendWrapAppend
                            .datum(data)
                            .call(legend);

                        if (!marginTop && legend.height() !== margin.top) {
                            margin.top = legend.height();
                            availableHeight = nv.utils.availableHeight(height, container, margin);
                        }

                        legendWrapAppend
                            .attr('transform', 'translate(0,' + (-margin.top) +')');
                    } else if (legendPosition === "right") {
                        var legendWidth = nv.models.legend().width();
                        if (availableWidth / 2 < legendWidth) {
                            legendWidth = (availableWidth / 2)
                        }
                        legend.height(availableHeight).key(pie.x());
                        legend.width(legendWidth);
                        availableWidth -= legend.width();

                        legendWrapAppend
                            .datum(data)
                            .call(legend)
                            .attr('transform', 'translate(' + (availableWidth) +',0)');
                    } else if (legendPosition === "bottom") {
                        legend.width( availableWidth ).key(pie.x());
                        legendWrapAppend
                            .datum(data)
                            .call(legend);

                        margin.bottom = legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                        legendWrapAppend
                            .attr('transform', 'translate(0,' + availableHeight +')');
                    }
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                // Main Chart Component(s)
                pie.width(availableWidth).height(availableHeight);

                var pieWrap = container.select('.nv-pieChart').selectAll('.nv-pieWrap').data([data]);
                pieWrap = pieWrap.merge(pieWrapAppend);
                //@todo come back to transition d3.transition(pieWrap).call(pie);
                pieWrap.transition().call(pie);

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                legend.dispatch.on('stateChange', function(newState) {
                    for (var key in newState) {
                        state[key] = newState[key];
                    }
                    dispatch.call('stateChange', this, newState);
                    chart.update();
                });

                // Update chart from a state object passed to event handler
                dispatch.on('changeState', function(e) {
                    if (typeof e.disabled !== 'undefined') {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });
                        state.disabled = e.disabled;
                    }
                    chart.update();
                });
            });

            renderWatch.renderEnd('pieChart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        pie.dispatch.on('elementMouseover.tooltip', function(evt) {
            evt['series'] = {
                key: chart.x()(evt.data),
                value: chart.y()(evt.data),
                color: evt.color,
                percent: evt.percent
            };
            if (!showTooltipPercent) {
                delete evt.percent;
                delete evt.series.percent;
            }
            tooltip.data(evt).hidden(false);
        });

        pie.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        pie.dispatch.on('elementMousemove.tooltip', function(evt){
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.legend = legend;
        chart.dispatch = dispatch;
        chart.pie = pie;
        chart.tooltip = tooltip;
        chart.options = nv.utils.optionsFunc.bind(chart);

        // use Object get/set functionality to map between vars and chart functions
        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:              {get: function(){return width;},                set: function(_){width=_;}},
            height:             {get: function(){return height;},               set: function(_){height=_;}},
            noData:             {get: function(){return noData;},               set: function(_){noData=_;}},
            showTooltipPercent: {get: function(){return showTooltipPercent;},   set: function(_){showTooltipPercent=_;}},
            showLegend:         {get: function(){return showLegend;},           set: function(_){showLegend=_;}},
            legendPosition:     {get: function(){return legendPosition;},       set: function(_){legendPosition=_;}},
            defaultState:       {get: function(){return defaultState;},         set: function(_){defaultState=_;}},

            // options that require extra logic in the setter
            color: {get: function(){return color;}, set: function(_){
                    color = _;
                    legend.color(color);
                    pie.color(color);
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    pie.duration(duration);
                }},
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }}
        });
        nv.utils.inheritOptions(chart, pie);
        nv.utils.initOptions(chart);
        return chart;
    };
    nv.models.sankey = function() {
        'use strict';

        // Sources:
        // - https://bost.ocks.org/mike/sankey/
        // - https://github.com/soxofaan/d3-plugin-captain-sankey

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var sankey = {},
            nodeWidth = 24,
            nodePadding = 8,
            size = [1, 1],
            nodes = [],
            links = [],
            sinksRight = true;

        var layout = function(iterations) {
            computeNodeLinks();
            computeNodeValues();
            computeNodeBreadths();
            computeNodeDepths(iterations);
        };

        var relayout = function() {
            computeLinkDepths();
        };

        // SVG path data generator, to be used as 'd' attribute on 'path' element selection.
        var link = function() {
            var curvature = .5;

            function link(d) {

                var x0 = d.source.x + d.source.dx,
                    x1 = d.target.x,
                    xi = d3.interpolateNumber(x0, x1),
                    x2 = xi(curvature),
                    x3 = xi(1 - curvature),
                    y0 = d.source.y + d.sy + d.dy / 2,
                    y1 = d.target.y + d.ty + d.dy / 2;
                var linkPath = 'M' + x0 + ',' + y0
                    + 'C' + x2 + ',' + y0
                    + ' ' + x3 + ',' + y1
                    + ' ' + x1 + ',' + y1;
                return linkPath;
            }

            link.curvature = function(_) {
                if (!arguments.length) return curvature;
                curvature = +_;
                return link;
            };

            return link;
        };

        // Y-position of the middle of a node.
        var center = function(node) {
            return node.y + node.dy / 2;
        };

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        // Populate the sourceLinks and targetLinks for each node.
        // Also, if the source and target are not objects, assume they are indices.
        function computeNodeLinks() {
            nodes.forEach(function(node) {
                // Links that have this node as source.
                node.sourceLinks = [];
                // Links that have this node as target.
                node.targetLinks = [];
            });
            links.forEach(function(link) {
                var source = link.source,
                    target = link.target;
                if (typeof source === 'number') source = link.source = nodes[link.source];
                if (typeof target === 'number') target = link.target = nodes[link.target];
                source.sourceLinks.push(link);
                target.targetLinks.push(link);
            });
        }

        // Compute the value (size) of each node by summing the associated links.
        function computeNodeValues() {
            nodes.forEach(function(node) {
                node.value = Math.max(
                    d3.sum(node.sourceLinks, value),
                    d3.sum(node.targetLinks, value)
                );
            });
        }

        // Iteratively assign the breadth (x-position) for each node.
        // Nodes are assigned the maximum breadth of incoming neighbors plus one;
        // nodes with no incoming links are assigned breadth zero, while
        // nodes with no outgoing links are assigned the maximum breadth.
        function computeNodeBreadths() {
            //
            var remainingNodes = nodes,
                nextNodes,
                x = 0;

            // Work from left to right.
            // Keep updating the breath (x-position) of nodes that are target of recently updated nodes.
            //
            while (remainingNodes.length && x < nodes.length) {
                nextNodes = [];
                remainingNodes.forEach(function(node) {
                    node.x = x;
                    node.dx = nodeWidth;
                    node.sourceLinks.forEach(function(link) {
                        if (nextNodes.indexOf(link.target) < 0) {
                            nextNodes.push(link.target);
                        }
                    });
                });
                remainingNodes = nextNodes;
                ++x;
                //
            }

            // Optionally move pure sinks always to the right.
            if (sinksRight) {
                moveSinksRight(x);
            }

            scaleNodeBreadths((size[0] - nodeWidth) / (x - 1));
        }

        function moveSourcesRight() {
            nodes.forEach(function(node) {
                if (!node.targetLinks.length) {
                    node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
                }
            });
        }

        function moveSinksRight(x) {
            nodes.forEach(function(node) {
                if (!node.sourceLinks.length) {
                    node.x = x - 1;
                }
            });
        }

        function scaleNodeBreadths(kx) {
            nodes.forEach(function(node) {
                node.x *= kx;
            });
        }

        // Compute the depth (y-position) for each node.
        function computeNodeDepths(iterations) {
            // Group nodes by breath.
            var nodesByBreadth = d3.group()
                .key(function(d) { return d.x; })
                .sortKeys(d3.ascending)
                .entries(nodes)
                .map(function(d) { return d.values; });

            //
            initializeNodeDepth();
            resolveCollisions();
            computeLinkDepths();
            for (var alpha = 1; iterations > 0; --iterations) {
                relaxRightToLeft(alpha *= .99);
                resolveCollisions();
                computeLinkDepths();
                relaxLeftToRight(alpha);
                resolveCollisions();
                computeLinkDepths();
            }

            function initializeNodeDepth() {
                // Calculate vertical scaling factor.
                var ky = d3.min(nodesByBreadth, function(nodes) {
                    return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
                });

                nodesByBreadth.forEach(function(nodes) {
                    nodes.forEach(function(node, i) {
                        node.y = i;
                        node.dy = node.value * ky;
                    });
                });

                links.forEach(function(link) {
                    link.dy = link.value * ky;
                });
            }

            function relaxLeftToRight(alpha) {
                nodesByBreadth.forEach(function(nodes, breadth) {
                    nodes.forEach(function(node) {
                        if (node.targetLinks.length) {
                            // Value-weighted average of the y-position of source node centers linked to this node.
                            var y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
                            node.y += (y - center(node)) * alpha;
                        }
                    });
                });

                function weightedSource(link) {
                    return (link.source.y + link.sy + link.dy / 2) * link.value;
                }
            }

            function relaxRightToLeft(alpha) {
                nodesByBreadth.slice().reverse().forEach(function(nodes) {
                    nodes.forEach(function(node) {
                        if (node.sourceLinks.length) {
                            // Value-weighted average of the y-positions of target nodes linked to this node.
                            var y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
                            node.y += (y - center(node)) * alpha;
                        }
                    });
                });

                function weightedTarget(link) {
                    return (link.target.y + link.ty + link.dy / 2) * link.value;
                }
            }

            function resolveCollisions() {
                nodesByBreadth.forEach(function(nodes) {
                    var node,
                        dy,
                        y0 = 0,
                        n = nodes.length,
                        i;

                    // Push any overlapping nodes down.
                    nodes.sort(ascendingDepth);
                    for (i = 0; i < n; ++i) {
                        node = nodes[i];
                        dy = y0 - node.y;
                        if (dy > 0) node.y += dy;
                        y0 = node.y + node.dy + nodePadding;
                    }

                    // If the bottommost node goes outside the bounds, push it back up.
                    dy = y0 - nodePadding - size[1];
                    if (dy > 0) {
                        y0 = node.y -= dy;

                        // Push any overlapping nodes back up.
                        for (i = n - 2; i >= 0; --i) {
                            node = nodes[i];
                            dy = node.y + node.dy + nodePadding - y0;
                            if (dy > 0) node.y -= dy;
                            y0 = node.y;
                        }
                    }
                });
            }

            function ascendingDepth(a, b) {
                return a.y - b.y;
            }
        }

        // Compute y-offset of the source endpoint (sy) and target endpoints (ty) of links,
        // relative to the source/target node's y-position.
        function computeLinkDepths() {
            nodes.forEach(function(node) {
                node.sourceLinks.sort(ascendingTargetDepth);
                node.targetLinks.sort(ascendingSourceDepth);
            });
            nodes.forEach(function(node) {
                var sy = 0, ty = 0;
                node.sourceLinks.forEach(function(link) {
                    link.sy = sy;
                    sy += link.dy;
                });
                node.targetLinks.forEach(function(link) {
                    link.ty = ty;
                    ty += link.dy;
                });
            });

            function ascendingSourceDepth(a, b) {
                return a.source.y - b.source.y;
            }

            function ascendingTargetDepth(a, b) {
                return a.target.y - b.target.y;
            }
        }

        // Value property accessor.
        function value(x) {
            return x.value;
        }

        sankey.options = nv.utils.optionsFunc.bind(sankey);
        sankey._options = Object.create({}, {
            nodeWidth:    {get: function(){return nodeWidth;},   set: function(_){nodeWidth=+_;}},
            nodePadding:  {get: function(){return nodePadding;}, set: function(_){nodePadding=_;}},
            nodes:        {get: function(){return nodes;},       set: function(_){nodes=_;}},
            links:        {get: function(){return links ;},      set: function(_){links=_;}},
            size:         {get: function(){return size;},        set: function(_){size=_;}},
            sinksRight:   {get: function(){return sinksRight;},  set: function(_){sinksRight=_;}},

            layout:       {get: function(){layout(32);},         set: function(_){layout(_);}},
            relayout:     {get: function(){relayout();},         set: function(_){}},
            center:       {get: function(){return center();},    set: function(_){
                    if(typeof _ === 'function'){
                        center=_;
                    }
                }},
            link:         {get: function(){return link();},      set: function(_){
                    if(typeof _ === 'function'){
                        link=_;
                    }
                    return link();
                }}
        });

        nv.utils.initOptions(sankey);

        return sankey;
    };
    nv.models.sankeyChart = function() {
        "use strict";

        // Sources:
        // - https://bost.ocks.org/mike/sankey/
        // - https://github.com/soxofaan/d3-plugin-captain-sankey

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 5, right: 0, bottom: 5, left: 0}
            , sankey = nv.models.sankey()
            , width = 600
            , height = 400
            , nodeWidth = 36
            , nodePadding =  40
            , units = 'units'
            , center = undefined
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var formatNumber = d3.format(',.0f');    // zero decimal places
        var format = function(d) {
            return formatNumber(d) + ' ' + units;
        };
        var color = d3.scaleOrdinal(d3.schemeAccent);
        var linkTitle = function(d){
            return d.source.name + ' → ' + d.target.name + '\n' + format(d.value);
        };
        var nodeFillColor = function(d){
            return d.color = color(d.name.replace(/ .*/, ''));
        };
        var nodeStrokeColor = function(d){
            return d3.rgb(d.color).darker(2);
        };
        var nodeTitle = function(d){
            return d.name + '\n' + format(d.value);
        };

        var showError = function(element, message) {
            element.append('text')
                .attr('x', 0)
                .attr('y', 0)
                .attr('class', 'nvd3-sankey-chart-error')
                .attr('text-anchor', 'middle')
                .text(message);
        };

        function chart(selection) {
            selection.each(function(data) {

                var testData = {
                    nodes:
                        [
                            {'node': 1, 'name': 'Test 1'},
                            {'node': 2, 'name': 'Test 2'},
                            {'node': 3, 'name': 'Test 3'},
                            {'node': 4, 'name': 'Test 4'},
                            {'node': 5, 'name': 'Test 5'},
                            {'node': 6, 'name': 'Test 6'}
                        ],
                    links:
                        [
                            {'source': 0, 'target': 1, 'value': 2295},
                            {'source': 0, 'target': 5, 'value': 1199},
                            {'source': 1, 'target': 2, 'value': 1119},
                            {'source': 1, 'target': 5, 'value': 1176},
                            {'source': 2, 'target': 3, 'value': 487},
                            {'source': 2, 'target': 5, 'value': 632},
                            {'source': 3, 'target': 4, 'value': 301},
                            {'source': 3, 'target': 5, 'value': 186}
                        ]
                };

                // Error handling
                var isDataValid = false;
                var dataAvailable = false;

                // check if data is valid
                if(
                    (typeof data['nodes'] === 'object' && data['nodes'].length) >= 0 &&
                    (typeof data['links'] === 'object' && data['links'].length) >= 0
                ){
                    isDataValid = true;
                }

                // check if data is available
                if(
                    data['nodes'] && data['nodes'].length > 0 &&
                    data['links'] && data['links'].length > 0
                ) {
                    dataAvailable = true;
                }

                // show error
                if(!isDataValid) {
                    console.error('NVD3 Sankey chart error:', 'invalid data format for', data);
                    console.info('Valid data format is: ', testData, JSON.stringify(testData));
                    showError(selection, 'Error loading chart, data is invalid');
                    return false;
                }

                // TODO use nv.utils.noData
                if(!dataAvailable) {
                    showError(selection, 'No data available');
                    return false;
                }

                // No errors, continue

                // append the svg canvas to the page
                var svg = selection.append('svg')
                    .attr('width', width)
                    .attr('height', height)
                    .append('g')
                    .attr('class', 'nvd3 nv-wrap nv-sankeyChart');

                // Set the sankey diagram properties
                sankey
                    .nodeWidth(nodeWidth)
                    .nodePadding(nodePadding)
                    .size([width, height]);

                var path = sankey.link();

                sankey
                    .nodes(data.nodes)
                    .links(data.links)
                    .layout(32)
                    .center(center);

                // add in the links
                var link = svg.append('g').selectAll('.link')
                    .data(data.links)
                    .enter().append('path')
                    .attr('class', 'link')
                    .attr('d', path)
                    .style('stroke-width', function(d) { return Math.max(1, d.dy); })
                    .sort(function(a,b) { return b.dy - a.dy; });

                // add the link titles
                link.append('title')
                    .text(linkTitle);

                // add in the nodes
                var node = svg.append('g').selectAll('.node')
                    .data(data.nodes)
                    .enter().append('g')
                    .attr('class', 'node')
                    .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; })
                    .call(
                        d3.drag()
                            .subject(function(d) { return d; })
                            .on('start', function() {
                                this.parentNode.appendChild(this);
                            })
                            .on('drag', dragmove)
                    );

                // add the rectangles for the nodes
                node.append('rect')
                    .attr('height', function(d) { return d.dy; })
                    .attr('width', sankey.nodeWidth())
                    .style('fill', nodeFillColor)
                    .style('stroke', nodeStrokeColor)
                    .append('title')
                    .text(nodeTitle);

                // add in the title for the nodes
                node.append('text')
                    .attr('x', -6)
                    .attr('y', function(d) { return d.dy / 2; })
                    .attr('dy', '.35em')
                    .attr('text-anchor', 'end')
                    .attr('transform', null)
                    .text(function(d) { return d.name; })
                    .filter(function(d) { return d.x < width / 2; })
                    .attr('x', 6 + sankey.nodeWidth())
                    .attr('text-anchor', 'start');

                // the function for moving the nodes
                function dragmove(event,d) {
                    d3.select(this).attr('transform',
                        'translate(' + d.x + ',' + (
                            d.y = Math.max(0, Math.min(height - d.dy, event.y))
                        ) + ')');
                    sankey.relayout();
                    link.attr('d', path);
                }
            });

            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            units:           {get: function(){return units;},       set: function(_){units=_;}},
            width:           {get: function(){return width;},       set: function(_){width=_;}},
            height:          {get: function(){return height;},      set: function(_){height=_;}},
            format:          {get: function(){return format;},      set: function(_){format=_;}},
            linkTitle:       {get: function(){return linkTitle;},   set: function(_){linkTitle=_;}},
            nodeWidth:       {get: function(){return nodeWidth;},   set: function(_){nodeWidth=_;}},
            nodePadding:     {get: function(){return nodePadding;}, set: function(_){nodePadding=_;}},
            center:          {get: function(){return center},       set: function(_){center=_}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            nodeStyle: {get: function(){return {};}, set: function(_){
                    nodeFillColor   = _.fillColor   !== undefined ? _.fillColor   : nodeFillColor;
                    nodeStrokeColor = _.strokeColor !== undefined ? _.strokeColor : nodeStrokeColor;
                    nodeTitle       = _.title       !== undefined ? _.title       : nodeTitle;
                }}

        });

        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.scatter = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin       = {top: 0, right: 0, bottom: 0, left: 0}
            , width        = null
            , height       = null
            , color        = nv.utils.defaultColor() // chooses color
            , pointBorderColor = null
            , id           = Math.floor(Math.random() * 100000) //Create semi-unique ID incase user doesn't select one
            , container    = null
            , x            = d3.scaleLinear()
            , y            = d3.scaleLinear()
            , z            = d3.scaleLinear() //linear because d3.svg.shape.size is treated as area
            , getX         = function(d) { return d.x } // accessor to get the x value
            , getY         = function(d) { return d.y } // accessor to get the y value
            , getSize      = function(d) { return d.size || 1} // accessor to get the point size
            , getShape     = function(d) { return d.shape || 'circle' } // accessor to get point shape
            , forceX       = [] // List of numbers to Force into the X scale (ie. 0, or a max / min, etc.)
            , forceY       = [] // List of numbers to Force into the Y scale
            , forceSize    = [] // List of numbers to Force into the Size scale
            , interactive  = true // If true, plots a voronoi overlay for advanced point intersection
            , pointActive  = function(d) { return !d.notActive } // any points that return false will be filtered out
            , padData      = false // If true, adds half a data points width to front and back, for lining up a line chart with a bar chart
            , padDataOuter = .1 //outerPadding to imitate ordinal scale outer padding
            , clipEdge     = false // if true, masks points within x and y scale
            , clipVoronoi  = true // if true, masks each point with a circle... can turn off to slightly increase performance
            , showVoronoi  = false // display the voronoi areas
            , clipRadius   = function() { return 25 } // function to get the radius for voronoi point clips
            , xDomain      = null // Override x domain (skips the calculation from data)
            , yDomain      = null // Override y domain
            , xRange       = null // Override x range
            , yRange       = null // Override y range
            , sizeDomain   = null // Override point size domain
            , sizeRange    = null
            , singlePoint  = false
            , dispatch     = d3.dispatch('elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'renderEnd')
            , useVoronoi   = true
            , duration     = 250
            , interactiveUpdateDelay = 300
            , showLabels    = false
        ;


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var x0, y0, z0 // used to store previous scales
            , xDom, yDom // used to store previous domains
            , width0
            , height0
            , timeoutID
            , needsUpdate = false // Flag for when the points are visually updating, but the interactive layer is behind, to disable tooltips
            , renderWatch = nv.utils.renderWatch(dispatch, duration)
            , _sizeRange_def = [16, 256]
            , _cache = {}
        ;

        //============================================================
        // Diff and Cache Utilities
        //------------------------------------------------------------
        // getDiffs is used to filter unchanged points from the update
        // selection. It implicitly updates it's cache when called and
        // therefor the diff is based upon the previous invocation NOT
        // the previous update.
        //
        // getDiffs takes a point as its first argument followed by n
        // key getter pairs (d, [key, get... key, get]) this approach
        // was chosen for efficiency. (The filter will call it a LOT).
        //
        // It is important to call delCache on point exit to prevent a
        // memory leak. It is also needed to prevent invalid caches if
        // a new point uses the same series and point id key.
        //
        // Argument Performance Concerns:
        // - Object property lists for key getter pairs would be very
        // expensive (points * objects for the GC every update).
        // - ES6 function names for implicit keys would be nice but
        // they are not guaranteed to be unique.
        // - function.toString to obtain implicit keys is possible
        // but long object keys are not free (internal hash).
        // - Explicit key without objects are the most efficient.

        function getCache(d) {
            var key, val;
            key = d[0].series + ':' + d[1];
            val = _cache[key] = _cache[key] || {};
            return val;
        }

        function delCache(d) {
            var key, val;
            key = d[0].series + ':' + d[1];
            delete _cache[key];
        }

        function getDiffs(d) {
            var i, key, val,
                cache = getCache(d),
                diffs = false;
            for (i = 1; i < arguments.length; i += 2) {
                key = arguments[i];
                val = arguments[i + 1](d[0], d[1]);
                if (cache[key] !== val || !cache.hasOwnProperty(key)) {
                    cache[key] = val;
                    diffs = true;
                }
            }
            return diffs;
        }

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                container = d3.select(this);
                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                nv.utils.initSVG(container);

                //add series index to each data point for reference
                data.forEach(function(series, i) {
                    series.values.forEach(function(point) {
                        point.series = i;
                        point.seriesIndex = i;
                    });
                });

                // Setup Scales
                var logScale = (typeof(chart.yScale().base) === "function"); // Only log scale has a method "base()"
                // remap and flatten the data for use in calculating the scales' domains
                var seriesData = (xDomain && yDomain && sizeDomain) ? [] : // if we know xDomain and yDomain and sizeDomain, no need to calculate.... if Size is constant remember to set sizeDomain to speed up performance
                    d3.merge(
                        data.map(function(d) {
                            return d.values.map(function(d,i) {
                                return { x: getX(d,i), y: getY(d,i), size: getSize(d,i) }
                            })
                        })
                    );

                x   .domain(xDomain || d3.extent(seriesData.map(function(d) { return d.x; }).concat(forceX)))

                if (padData && data[0])
                    x.range(xRange || [(availableWidth * padDataOuter +  availableWidth) / (2 *data[0].values.length), availableWidth - availableWidth * (1 + padDataOuter) / (2 * data[0].values.length)  ]);
                //x.range([availableWidth * .5 / data[0].values.length, availableWidth * (data[0].values.length - .5)  / data[0].values.length ]);
                else
                    x.range(xRange || [0, availableWidth]);

                if (logScale) {
                    var min = d3.min(seriesData.map(function(d) { if (d.y !== 0) return d.y; }));
                    y.clamp(true)
                        .domain(yDomain || d3.extent(seriesData.map(function(d) {
                            if (d.y !== 0) return d.y;
                            else return min * 0.1;
                        }).concat(forceY)))
                        .range(yRange || [availableHeight, 0]);
                } else {
                    y.domain(yDomain || d3.extent(seriesData.map(function (d) { return d.y;}).concat(forceY)))
                        .range(yRange || [availableHeight, 0]);
                }

                z   .domain(sizeDomain || d3.extent(seriesData.map(function(d) { return d.size }).concat(forceSize)))
                    .range(sizeRange || _sizeRange_def);

                // If scale's domain don't have a range, slightly adjust to make one... so a chart can show a single data point
                singlePoint = x.domain()[0] === x.domain()[1] || y.domain()[0] === y.domain()[1];

                if (x.domain()[0] === x.domain()[1])
                    x.domain()[0] ?
                        x.domain([x.domain()[0] - x.domain()[0] * 0.01, x.domain()[1] + x.domain()[1] * 0.01])
                        : x.domain([-1,1]);

                if (y.domain()[0] === y.domain()[1])
                    y.domain()[0] ?
                        y.domain([y.domain()[0] - y.domain()[0] * 0.01, y.domain()[1] + y.domain()[1] * 0.01])
                        : y.domain([-1,1]);

                if ( isNaN(x.domain()[0])) {
                    x.domain([-1,1]);
                }

                if ( isNaN(y.domain()[0])) {
                    y.domain([-1,1]);
                }

                x0 = x0 || x;
                y0 = y0 || y;
                z0 = z0 || z;

                var scaleDiff = x(1) !== x0(1) || y(1) !== y0(1) || z(1) !== z0(1);

                width0 = width0 || width;
                height0 = height0 || height;

                var sizeDiff = width0 !== width || height0 !== height;

                // Domain Diffs

                xDom = xDom || [];
                var domainDiff = xDom[0] !== x.domain()[0] || xDom[1] !== x.domain()[1];
                xDom = x.domain();

                yDom = yDom || [];
                domainDiff = domainDiff || yDom[0] !== y.domain()[0] || yDom[1] !== y.domain()[1];
                yDom = y.domain();

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-scatter').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-scatter nv-chart-' + id)
                wrapEnter.classed('nv-single-point', singlePoint);
                var defsEnter = wrapEnter.append('defs');
                var gEnter = wrapEnter.append('g');

                var nvGroups = gEnter.append('g').attr('class', 'nv-groups');
                var nvPointPaths = gEnter.append('g').attr('class', 'nv-point-paths');
                var nvPointClips = wrapEnter.append('g').attr('class', 'nv-point-clips');
                wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                var defsRect=defsEnter.append('clipPath')
                    .attr('id', 'nv-edge-clip-' + id)
                    .append('rect')
                    .attr('transform', 'translate( -10, -10)')
                    .attr('width', availableWidth + 20)
                    .attr('height', (availableHeight > 0) ? availableHeight + 20 : 0);

                if(clipEdge) gEnter.attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + id + ')' : '');

                function updateInteractiveLayer() {
                    // Always clear needs-update flag regardless of whether or not
                    // we will actually do anything (avoids needless invocations).
                    needsUpdate = false;

                    if (!interactive) return false;
                    container.selectAll(".nv-point.hover").classed("hover", false);

                    // nuke all voronoi paths
                    nvPointPaths.selectAll('path').remove();

                    // inject series and point index for reference into voronoi
                    if (useVoronoi === true) {
                        var vertices = d3.merge(data.map(function(group, groupIndex) {
                                return group.values
                                    .map(function(point, pointIndex) {
                                        // *Adding noise to make duplicates very unlikely
                                        // *Injecting series and point index for reference
                                        // *Adding a 'jitter' to the points, because there's an issue in d3.geom.voronoi.
                                        var pX = getX(point,pointIndex);
                                        var pY = getY(point,pointIndex);

                                        return [nv.utils.NaNtoZero(x(pX)) + Math.random() * 1e-4,
                                            nv.utils.NaNtoZero(y(pY)) + Math.random() * 1e-4,
                                            groupIndex,
                                            pointIndex, point];
                                    })
                                    .filter(function(pointArray, pointIndex) {
                                        return pointActive(pointArray[4], pointIndex); // Issue #237.. move filter to after map, so pointIndex is correct!
                                    })
                            })
                        );

                        if (vertices.length == 0) return false;  // No active points, we're done
                        if (vertices.length < 3) {
                            // Issue #283 - Adding 2 dummy points to the voronoi b/c voronoi requires min 3 points to work
                            vertices.push([x.range()[0] - 20, y.range()[0] - 20, null, null]);
                            vertices.push([x.range()[1] + 20, y.range()[1] + 20, null, null]);
                            vertices.push([x.range()[0] - 20, y.range()[0] + 20, null, null]);
                            vertices.push([x.range()[1] + 20, y.range()[1] - 20, null, null]);
                        }

                        // keep voronoi sections from going more than 10 outside of graph
                        // to avoid overlap with other things like legend etc
                        var bounds = [
                            [-10,-10],
                            [-10,height + 10],
                            [width + 10,height + 10],
                            [width + 10,-10]
                        ];

                        // delete duplicates from vertices - essential assumption for d3.geom.voronoi
                        var epsilon = 1e-4; // Uses 1e-4 to determine equivalence.
                        vertices = vertices.sort(function(a,b){return ((a[0] - b[0]) || (a[1] - b[1]))});
                        for (var i = 0; i < vertices.length - 1; ) {
                            if ((Math.abs(vertices[i][0] - vertices[i+1][0]) < epsilon) &&
                                (Math.abs(vertices[i][1] - vertices[i+1][1]) < epsilon)) {
                                vertices.splice(i+1, 1);
                            } else {
                                i++;
                            }
                        }
                        // Assuming you have bounds and vertices defined elsewhere in your code

// Create Delaunay triangulation
                        var delaunay = d3.Delaunay.from(vertices, d => d[0], d => d[1]);

// Calculate Voronoi diagram with specified bounds
                        var voronoi = delaunay.voronoi([bounds[0][0], bounds[0][1], bounds[2][0], bounds[2][1]]);
                        var cellPolygons = Array.from(voronoi.cellPolygons());

// Map the polygons to the desired format
                        var mappedVoronoi = cellPolygons.map(function(d, i) {
                            return {
                                'data': d,
                                'series': vertices[i][2],
                                'point': vertices[i][3]
                            };
                        });

// mappedVoronoi now contains the Voronoi diagram cells within the specified bounds


                        var pointPaths = nvPointPaths.selectAll('path').data(mappedVoronoi);
                        var vPointPaths = pointPaths
                            .enter().append("svg:path")
                            .attr("d", function(d) {
                                if (!d || !d.data || d.data.length === 0)
                                    return 'M 0 0';
                                else
                                    return "M" + d.data.join(",") + "Z";
                            })
                            .attr("id", function(d,i) {
                                return "nv-path-"+i; })
                            .attr("clip-path", function(d,i) { return "url(#nv-clip-"+id+"-"+i+")"; })
                        ;

                        // good for debugging point hover issues
                        if (showVoronoi) {
                            vPointPaths.style("fill", d3.rgb(230, 230, 230))
                                .style('fill-opacity', 0.4)
                                .style('stroke-opacity', 1)
                                .style("stroke", d3.rgb(200,200,200));
                        }

                        if (clipVoronoi) {
                            // voronoi sections are already set to clip,
                            // just create the circles with the IDs they expect
                            nvPointClips.selectAll('*').remove(); // must do * since it has sub-dom
                            var pointClips = nvPointClips.selectAll('clipPath').data(vertices);
                            var vPointClips = pointClips
                                .enter().append("svg:clipPath")
                                .attr("id", function(d, i) { return "nv-clip-"+id+"-"+i;})
                                .append("svg:circle")
                                .attr('cx', function(d) { return d[0]; })
                                .attr('cy', function(d) { return d[1]; })
                                .attr('r', clipRadius);
                        }

                        var mouseEventCallback = function(el, event, d, mDispatch) {
                            if (needsUpdate) return 0;
                            setCoordinates(event.pageX, event.pageY);
                            var eventEleIndex = d.seriesIndex || d.series;
                            var series = data[eventEleIndex];
                            if (series === undefined) return;
                            var point  = series.values[d.point];
                            point['color'] = color(series, d.seriesIndex);

                            // standardize attributes for tooltip.
                            point['x'] = getX(point);
                            point['y'] = getY(point);

                            // can't just get box of event node since it's actually a voronoi polygon
                            var box = container.node().getBoundingClientRect();
                            var scrollTop  = window.pageYOffset || document.documentElement.scrollTop;
                            var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

                            var pos = {
                                left: x(getX(point, d.point)) + box.left + scrollLeft + margin.left + 10,
                                top: y(getY(point, d.point)) + box.top + scrollTop + margin.top + 10
                            };

                            dispatch.call(mDispatch, this, {
                                point: point,
                                series: series,
                                pos: pos,
                                relativePos: [x(getX(point, d.point)) + margin.left, y(getY(point, d.point)) + margin.top],
                                seriesIndex: d.seriesIndex || d.series,
                                pointIndex: d.point,
                                event: d3.event,
                                element: el
                            });
                        };

                        vPointPaths
                            .on('click', function(event, d) {
                                mouseEventCallback(this, event, d, 'elementClick');
                            })
                            .on('dblclick', function(event, d) {
                                mouseEventCallback(this, event, d, 'elementDblClick');
                            })
                            .on('mouseover', function(event, d) {
                                mouseEventCallback(this, event, d, 'elementMouseover');
                            })
                            .on('mouseout', function(event, d, i) {
                                mouseEventCallback(this, event, d, 'elementMouseout');
                            });

                    } else {
                        // add event handlers to points instead voronoi paths
                        container.selectAll('.nv-group')
                            .selectAll('.nv-point')
                            //.data(dataWithPoints)
                            //.style('pointer-events', 'auto') // recativate events, disabled by css
                            .on('click', function(d,i) {
                                //nv.log('test', d, i);
                                if (needsUpdate || !data[d[0].series]) return 0; //check if this is a dummy point
                                var series = data[d[0].series],
                                    point  = series.values[i];
                                var element = this;
                                dispatch.call('elementClick', this, {
                                    point: point,
                                    series: series,
                                    pos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top], //TODO: make this pos base on the page
                                    relativePos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],
                                    seriesIndex: d[0].series,
                                    pointIndex: i,
                                    event: d3.event,
                                    element: element
                                });
                            })
                            .on('dblclick', function(d,i) {
                                if (needsUpdate || !data[d[0].series]) return 0; //check if this is a dummy point
                                var series = data[d[0].series],
                                    point  = series.values[i];

                                dispatch.call('elementDblClick', this, {
                                    point: point,
                                    series: series,
                                    pos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],//TODO: make this pos base on the page
                                    relativePos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],
                                    seriesIndex: d[0].series,
                                    pointIndex: i
                                });
                            })
                            .on('mouseover', function(d,i) {
                                if (needsUpdate || !data[d[0].series]) return 0; //check if this is a dummy point
                                var series = data[d[0].series],
                                    point  = series.values[i];

                                dispatch.call('elementMouseover', this, {
                                    point: point,
                                    series: series,
                                    pos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],//TODO: make this pos base on the page
                                    relativePos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],
                                    seriesIndex: d[0].series,
                                    pointIndex: i,
                                    color: color(d[0], i)
                                });
                            })
                            .on('mouseout', function(d,i) {
                                if (needsUpdate || !data[d[0].series]) return 0; //check if this is a dummy point
                                var series = data[d[0].series],
                                    point  = series.values[i];

                                dispatch.call('elementMouseout', this, {
                                    point: point,
                                    series: series,
                                    pos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],//TODO: make this pos base on the page
                                    relativePos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],
                                    seriesIndex: d[0].series,
                                    pointIndex: i,
                                    color: color(d[0], i)
                                });
                            });
                    }
                }

                needsUpdate = true;

                var groups = container.select('g.nv-groups').selectAll('g.nv-group')
                    .data(function(d) { return d }, function(d) { return d.key });
                var groupsEnterAppend = groups.enter().append('g')
                    .style('stroke-opacity', 1e-6)
                    .style('fill-opacity', 1e-6)
                    .attr('class', function(d,i) {
                        return (d.classed || '') + ' nv-group nv-series-' + i;
                    })
                    .classed('nv-noninteractive', !interactive)
                    .classed('hover', function(d) { return d.hover });
                groups.exit().remove();
                var mergedSelection = groups.merge(groupsEnterAppend);

                mergedSelection.watchTransition(renderWatch, 'scatter: groups')
                    .style('fill', function(d,i) { return color(d, i) })
                    .style('stroke', function(d,i) { return d.pointBorderColor || pointBorderColor || color(d, i) })
                    .style('stroke-opacity', 1)
                    .style('fill-opacity', .5);

                // create the points, maintaining their IDs from the original data set
                var pointsExisting = mergedSelection.selectAll('path.nv-point')
                    .data(function(d) {
                        return d.values.map(
                            function (point, pointIndex) {
                                return [point, pointIndex]
                            }).filter(
                            function(pointArray, pointIndex) {
                                return pointActive(pointArray[0], pointIndex)
                            })
                    });
                var pointsAppend = pointsExisting.enter().append('path')
                    .attr('class', function (d) {
                        return 'nv-point nv-point-' + d[1];
                    })
                    .style('fill', function (d) { return d.color })
                    .style('stroke', function (d) { return d.color })
                    .attr('transform', function(d) {
                        return 'translate(' + nv.utils.NaNtoZero(x0(getX(d[0],d[1]))) + ',' + nv.utils.NaNtoZero(y0(getY(d[0],d[1]))) + ')'
                    })
                    .attr('d',
                        nv.utils.symbol()
                            .type(function(d) { return getShape(d[0]); })
                            .size(function(d) { return z(getSize(d[0],d[1])) })
                    );
                pointsExisting.exit().each(delCache).remove();
                var points = pointsExisting.merge(pointsAppend);

                mergedSelection.exit().selectAll('path.nv-point')
                    .watchTransition(renderWatch, 'scatter exit')
                    .attr('transform', function(d) {
                        return 'translate(' + nv.utils.NaNtoZero(x(getX(d[0],d[1]))) + ',' + nv.utils.NaNtoZero(y(getY(d[0],d[1]))) + ')'
                    })
                    .remove();

                //============================================================
                // Point Update Optimisation Notes
                //------------------------------------------------------------
                // The following update selections are filtered with getDiffs
                // (defined at the top of this file) this brings a performance
                // benefit for charts with large data sets that accumulate a
                // subset of changes or additions over time.
                //
                // Uneccesary and expensive DOM calls are avoided by culling
                // unchanged points from the selection in exchange for the
                // cheaper overhead of caching and diffing each point first.
                //
                // Due to the way D3 and NVD3 work, other global changes need
                // to be considered in addition to local point properties.
                // This is a potential source of bugs (if any of the global
                // changes that possibly affect points are missed).

                // Update Point Positions [x, y]
                points.filter(function (d) {
                    // getDiffs must always be called to update cache
                    return getDiffs(d, 'x', getX, 'y', getY) ||
                        scaleDiff || sizeDiff || domainDiff;
                })
                    .watchTransition(renderWatch, 'scatter points')
                    .attr('transform', function (d) {
                        return 'translate(' +
                            nv.utils.NaNtoZero(x(getX(d[0], d[1]))) + ',' +
                            nv.utils.NaNtoZero(y(getY(d[0], d[1]))) + ')'
                    });

                // Update Point Appearance [shape, size]
                points.filter(function (d) {
                    // getDiffs must always be called to update cache
                    return getDiffs(d, 'shape', getShape, 'size', getSize) ||
                        scaleDiff || sizeDiff || domainDiff;
                })
                    .watchTransition(renderWatch, 'scatter points')
                    .attr('d', nv.utils.symbol()
                        .type(function (d) { return getShape(d[0]) })
                        .size(function (d) { return z(getSize(d[0], d[1])) })
                    );

                // add label a label to scatter chart
                if(showLabels)
                {
                    var titlesExisting =  mergedSelection.selectAll('.nv-label')
                        .data(function(d) {
                            return d.values.map(
                                function (point, pointIndex) {
                                    return [point, pointIndex]
                                }).filter(
                                function(pointArray, pointIndex) {
                                    return pointActive(pointArray[0], pointIndex)
                                })
                        });

                    var titlesAppend = titlesExisting.enter().append('text')
                        .style('fill', function (d,i) {
                            return d.color })
                        .style('stroke-opacity', 0)
                        .style('fill-opacity', 1)
                        .attr('transform', function(d) {
                            var dx = nv.utils.NaNtoZero(x0(getX(d[0],d[1]))) + Math.sqrt(z(getSize(d[0],d[1]))/Math.PI) + 2;
                            return 'translate(' + dx + ',' + nv.utils.NaNtoZero(y0(getY(d[0],d[1]))) + ')';
                        })
                        .text(function(d,i){
                            return d[0].label;});

                    titlesExisting.exit().remove();
                    var titles = titlesExisting.merge(titlesAppend);

                    mergedSelection.exit().selectAll('path.nv-label')
                        .watchTransition(renderWatch, 'scatter exit')
                        .attr('transform', function(d) {
                            var dx = nv.utils.NaNtoZero(x(getX(d[0],d[1])))+ Math.sqrt(z(getSize(d[0],d[1]))/Math.PI)+2;
                            return 'translate(' + dx + ',' + nv.utils.NaNtoZero(y(getY(d[0],d[1]))) + ')';
                        })
                        .remove();
                    titles.each(function(d) {
                        d3.select(this)
                            .classed('nv-label', true)
                            .classed('nv-label-' + d[1], false)
                            .classed('hover',false);
                    });
                    titles.watchTransition(renderWatch, 'scatter labels')
                        .text(function(d,i){
                            return d[0].label;})
                        .attr('transform', function(d) {
                            var dx = nv.utils.NaNtoZero(x(getX(d[0],d[1])))+ Math.sqrt(z(getSize(d[0],d[1]))/Math.PI)+2;
                            return 'translate(' + dx + ',' + nv.utils.NaNtoZero(y(getY(d[0],d[1]))) + ')'
                        });
                }

                // Delay updating the invisible interactive layer for smoother animation
                if( interactiveUpdateDelay )
                {
                    clearTimeout(timeoutID); // stop repeat calls to updateInteractiveLayer
                    timeoutID = setTimeout(updateInteractiveLayer, interactiveUpdateDelay );
                }
                else
                {
                    updateInteractiveLayer();
                }

                //store old scales for use in transitions on update
                x0 = x.copy();
                y0 = y.copy();
                z0 = z.copy();

                width0 = width;
                height0 = height;

            });
            renderWatch.renderEnd('scatter immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        // utility function calls provided by this chart
        chart._calls = new function() {
            this.clearHighlights = function () {
                nv.dom.write(function() {
                    if(container) {
                        container.selectAll(".nv-point.hover").classed("hover", false);
                    }
                });
                return null;
            };
            this.highlightPoint = function (seriesIndex, pointIndex, isHoverOver) {
                nv.dom.write(function() {
                    if(container) {
                        container.select('.nv-groups')
                            .selectAll(".nv-series-" + seriesIndex)
                            .selectAll(".nv-point-" + pointIndex)
                            .classed("hover", isHoverOver);
                    }
                });
            };
        };

        // trigger calls from events too
        dispatch.on('elementMouseover.point', function(d) {
            if (interactive) chart._calls.highlightPoint(d.seriesIndex,d.pointIndex,true);
        });

        dispatch.on('elementMouseout.point', function(d) {
            if (interactive) chart._calls.highlightPoint(d.seriesIndex,d.pointIndex,false);
        });

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:        {get: function(){return width;}, set: function(_){width=_;}},
            height:       {get: function(){return height;}, set: function(_){height=_;}},
            xScale:       {get: function(){return x;}, set: function(_){x=_;}},
            yScale:       {get: function(){return y;}, set: function(_){y=_;}},
            pointScale:   {get: function(){return z;}, set: function(_){z=_;}},
            xDomain:      {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain:      {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            pointDomain:  {get: function(){return sizeDomain;}, set: function(_){sizeDomain=_;}},
            xRange:       {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:       {get: function(){return yRange;}, set: function(_){yRange=_;}},
            pointRange:   {get: function(){return sizeRange;}, set: function(_){sizeRange=_;}},
            forceX:       {get: function(){return forceX;}, set: function(_){forceX=_;}},
            forceY:       {get: function(){return forceY;}, set: function(_){forceY=_;}},
            forcePoint:   {get: function(){return forceSize;}, set: function(_){forceSize=_;}},
            interactive:  {get: function(){return interactive;}, set: function(_){interactive=_;}},
            pointActive:  {get: function(){return pointActive;}, set: function(_){pointActive=_;}},
            padDataOuter: {get: function(){return padDataOuter;}, set: function(_){padDataOuter=_;}},
            padData:      {get: function(){return padData;}, set: function(_){padData=_;}},
            clipEdge:     {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},
            clipVoronoi:  {get: function(){return clipVoronoi;}, set: function(_){clipVoronoi=_;}},
            clipRadius:   {get: function(){return clipRadius;}, set: function(_){clipRadius=_;}},
            showVoronoi:   {get: function(){return showVoronoi;}, set: function(_){showVoronoi=_;}},
            id:           {get: function(){return id;}, set: function(_){id=_;}},
            interactiveUpdateDelay: {get:function(){return interactiveUpdateDelay;}, set: function(_){interactiveUpdateDelay=_;}},
            showLabels: {get: function(){return showLabels;}, set: function(_){ showLabels = _;}},
            pointBorderColor: {get: function(){return pointBorderColor;}, set: function(_){pointBorderColor=_;}},

            // simple functor options
            x:     {get: function(){return getX;}, set: function(_){getX = typeof _ === "function" ? _ : function(){return _;};}},
            y:     {get: function(){return getY;}, set: function(_){getY = typeof _ === "function" ? _ : function(){return _;};}},
            pointSize: {get: function(){return getSize;}, set: function(_){getSize = typeof _ === "function" ? _ : function(){return _;};}},
            pointShape: {get: function(){return getShape;}, set: function(_){getShape = typeof _ === "function" ? _ : function(){return _;};}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                }},
            color: {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            useVoronoi: {get: function(){return useVoronoi;}, set: function(_){
                    useVoronoi = _;
                    if (useVoronoi === false) {
                        clipVoronoi = false;
                    }
                }}
        });

        nv.utils.initOptions(chart);
        return chart;
    };

    nv.models.scatterChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var scatter      = nv.models.scatter()
            , xAxis        = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis        = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , legend       = nv.models.legend()
            , distX        = nv.models.distribution()
            , distY        = nv.models.distribution()
            , tooltip      = nv.models.tooltip()
        ;

        var margin       = {top: 30, right: 20, bottom: 50, left: 75}
            , marginTop = null
            , width        = null
            , height       = null
            , container    = null
            , color        = nv.utils.defaultColor()
            , x            = scatter.xScale()
            , y            = scatter.yScale()
            , showDistX    = false
            , showDistY    = false
            , showLegend   = true
            , showXAxis    = true
            , showYAxis    = true
            , legendPosition = "top"
            , rightAlignYAxis = false
            , state = nv.utils.state()
            , defaultState = null
            , dispatch = d3.dispatch('stateChange', 'changeState', 'renderEnd')
            , noData       = null
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear)
            , showLabels    = false
        ;

        scatter.xScale(x).yScale(y);
        xAxis.tickPadding(10);
        yAxis
            //.orient((rightAlignYAxis) ? 'right' : 'left')
            .tickPadding(10)
        ;
        distX.axis('x');
        distY.axis('y');
        tooltip
            .headerFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            })
            .valueFormatter(function(d, i) {
                return yAxis.tickFormat()(d, i);
            });

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var x0, y0
            , renderWatch = nv.utils.renderWatch(dispatch, duration);

        var stateGetter = function(data) {
            return function(){
                return {
                    active: data.map(function(d) { return !d.disabled })
                };
            }
        };

        var stateSetter = function(data) {
            return function(state) {
                if (state.active !== undefined)
                    data.forEach(function(series,i) {
                        series.disabled = !state.active[i];
                    });
            }
        };

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(scatter);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);
            if (showDistX) renderWatch.models(distX);
            if (showDistY) renderWatch.models(distY);

            selection.each(function(data) {
                var that = this;

                container = d3.select(this);
                nv.utils.initSVG(container);

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() {
                    if (duration === 0)
                        container.call(chart);
                    else
                        container.transition().duration(duration).call(chart);
                };
                chart.container = this;

                state
                    .setter(stateSetter(data), chart.update)
                    .getter(stateGetter(data))
                    .update();

                // DEPRECATED set state.disableddisabled
                state.disabled = data.map(function(d) { return !!d.disabled });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display noData message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container);
                    renderWatch.renderEnd('scatter immediate');
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                // Setup Scales
                x = scatter.xScale();
                y = scatter.yScale();
                data.forEach(function(aseries, i) {
                    aseries.seriesIndex = i;
                });

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-scatterChart').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-scatterChart nv-chart-' + scatter.id());

                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                // background for pointer events
                gEnter.append('rect').attr('class', 'nvd3 nv-background').style("pointer-events","none");

                var xAxisAppend=gEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-scatterChart').select('.nv-x');
                var yAxisAppend=gEnter.append('g').attr('class', 'nv-y nv-axis');
                yAxisAppend = container.selectAll('g.nv-wrap.nv-scatterChart').select('.nv-y');
                var scatterWrapAppend=gEnter.append('g').attr('class', 'nv-scatterWrap');
                scatterWrapAppend = container.selectAll('g.nv-wrap.nv-scatterChart').select('.nv-scatterWrap');
                var regressionLinesWrapAppend=gEnter.append('g').attr('class', 'nv-regressionLinesWrap');
                regressionLinesWrapAppend = container.selectAll('g.nv-wrap.nv-scatterChart').select('.nv-regressionLinesWrap');
                var distWrapAppend=gEnter.append('g').attr('class', 'nv-distWrap');
                distWrapAppend = container.selectAll('g.nv-wrap.nv-scatterChart').select('.nv-distWrap');
                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');

                if (rightAlignYAxis) {
                    yAxisAppend
                        .attr("transform", "translate(" + availableWidth + ",0)");
                }

                legendWrapAppend = container.selectAll('g.nv-wrap.nv-scatterChart').select('.nv-legendWrap');
                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    var legendWidth = availableWidth;
                    legend.width(legendWidth);

                    legendWrapAppend
                        .datum(data)
                        .call(legend);

                    if (!marginTop && legend.height() !== margin.top) {
                        margin.top = legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin);
                    }

                    legendWrapAppend
                        .attr('transform', 'translate(0' + ',' + (-margin.top) +')');
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');


                // Main Chart Component(s)
                scatter
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(data.map(function(d,i) {
                        d.color = d.color || color(d, i);
                        return d.color;
                    }).filter(function(d,i) { return !data[i].disabled }))
                    .showLabels(showLabels);

                scatterWrapAppend
                    .datum(data.filter(function(d) { return !d.disabled }))
                    .call(scatter);


                regressionLinesWrapAppend
                    .attr('clip-path', 'url(#nv-edge-clip-' + scatter.id() + ')');

                var regWrap = regressionLinesWrapAppend.selectAll('.nv-regLines')
                    .data(function (d) {
                        return d;
                    });

                var regLinesAppend=regWrap.enter().append('g').attr('class', 'nv-regLines');

                var regLine = regLinesAppend.selectAll('.nv-regLine')
                    .data(function (d) {
                        return [d]
                    });

                var lineAppend=regLine.enter()
                    .append('line').attr('class', 'nv-regLine')
                    .style('stroke-opacity', 0);

                // don't add lines unless we have slope and intercept to use
                lineAppend.filter(function(d) {
                    return d.intercept && d.slope;
                })
                    .watchTransition(renderWatch, 'scatterPlusLineChart: regline')
                    .attr('x1', x.range()[0])
                    .attr('x2', x.range()[1])
                    .attr('y1', function (d, i) {
                        return y(x.domain()[0] * d.slope + d.intercept)
                    })
                    .attr('y2', function (d, i) {
                        return y(x.domain()[1] * d.slope + d.intercept)
                    })
                    .style('stroke', function (d, i, j) {
                        return color(d, j)
                    })
                    .style('stroke-opacity', function (d, i) {
                        return (d.disabled || typeof d.slope === 'undefined' || typeof d.intercept === 'undefined') ? 0 : 1
                    });

                // Setup Axes
                if (showXAxis) {
                    xAxis
                        .scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner( -availableHeight);

                    xAxisAppend
                        .attr('transform', 'translate(0,' + y.range()[0] + ')')
                        .call(xAxis);
                }

                if (showYAxis) {
                    yAxis
                        .scale(y)
                        ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                    yAxis
                        .tickSizeInner( -availableWidth);

                    yAxisAppend
                        .call(yAxis);
                }

                // Setup Distribution
                distX
                    .getData(scatter.x())
                    .scale(x)
                    .width(availableWidth)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled }));
                var distributionXAppend=distWrapAppend.append('g')
                    .attr('class', 'nv-distributionX');
                distributionXAppend
                    .attr('transform', 'translate(0,' + y.range()[0] + ')')
                    .datum(data.filter(function(d) { return !d.disabled }))
                    .call(distX)
                    .style('opacity', function() { return showDistX ? '1' : '1e-6'; })
                    .watchTransition(renderWatch, 'scatterPlusLineChart')
                    .style('opacity', function() { return showDistX ? '1' : '1e-6'; })


                distY
                    .getData(scatter.y())
                    .scale(y)
                    .width(availableHeight)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled }));
                var distributionYAppend=distWrapAppend.append('g')
                    .attr('class', 'nv-distributionY');
                distributionYAppend
                    .attr('transform', 'translate(' + (rightAlignYAxis ? availableWidth : -distY.size() ) + ',0)')
                    .datum(data.filter(function(d) { return !d.disabled }))
                    .call(distY)
                    .style('opacity', function() { return showDistY ? '1' : '1e-6'; })
                    .watchTransition(renderWatch, 'scatterPlusLineChart')
                    .style('opacity', function() { return showDistY ? '1' : '1e-6'; })

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                legend.dispatch.on('stateChange', function(newState) {
                    for (var key in newState)
                        state[key] = newState[key];
                    dispatch.call('stateChange', that, newState);
                    chart.update();
                });

                // Update chart from a state object passed to event handler
                dispatch.on('changeState', function(e) {
                    if (typeof e.disabled !== 'undefined') {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });
                        state.disabled = e.disabled;
                    }
                    chart.update();
                });

                // mouseover needs availableHeight so we just keep scatter mouse events inside the chart block
                scatter.dispatch.on('elementMouseout.tooltip', function(evt) {
                    tooltip.hidden(true);
                    container.select('.nv-chart-' + scatter.id() + ' .nv-series-' + evt.seriesIndex + ' .nv-distx-' + evt.pointIndex)
                        .attr('y1', 0);
                    container.select('.nv-chart-' + scatter.id() + ' .nv-series-' + evt.seriesIndex + ' .nv-disty-' + evt.pointIndex)
                        .attr('x2', distY.size());
                });

                scatter.dispatch.on('elementMouseover.tooltip', function(evt) {
                    container.select('.nv-series-' + evt.seriesIndex + ' .nv-distx-' + evt.pointIndex)
                        .attr('y1', evt.relativePos[1] - availableHeight);
                    container.select('.nv-series-' + evt.seriesIndex + ' .nv-disty-' + evt.pointIndex)
                        .attr('x2', evt.relativePos[0] + distX.size());
                    tooltip.data(evt).hidden(false);
                });

                //store old scales for use in transitions on update
                x0 = x.copy();
                y0 = y.copy();

            });

            renderWatch.renderEnd('scatter with line immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.scatter = scatter;
        chart.legend = legend;
        chart.xAxis = xAxis;
        chart.yAxis = yAxis;
        chart.distX = distX;
        chart.distY = distY;
        chart.tooltip = tooltip;

        chart.options = nv.utils.optionsFunc.bind(chart);
        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            container:  {get: function(){return container;}, set: function(_){container=_;}},
            showDistX:  {get: function(){return showDistX;}, set: function(_){showDistX=_;}},
            showDistY:  {get: function(){return showDistY;}, set: function(_){showDistY=_;}},
            legendPosition: {get: function(){return legendPosition;}, set: function(_){legendPosition=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            showXAxis:  {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis:  {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            defaultState:     {get: function(){return defaultState;}, set: function(_){defaultState=_;}},
            noData:     {get: function(){return noData;}, set: function(_){noData=_;}},
            duration:   {get: function(){return duration;}, set: function(_){duration=_;
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                }},
            showLabels: {get: function(){return showLabels;}, set: function(_){showLabels=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    //@todo yAxis.orient( (_) ? 'right' : 'left');
                }},
            color: {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                    distX.color(color);
                    distY.color(color);
                }}
        });

        nv.utils.inheritOptions(chart, scatter);
        nv.utils.initOptions(chart);
        return chart;
    };

    nv.models.sparkline = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 2, right: 0, bottom: 2, left: 0}
            , width = 400
            , height = 32
            , container = null
            , animate = true
            , x = d3.scaleLinear()
            , y = d3.scaleLinear()
            , getX = function(d) { return d.x }
            , getY = function(d) { return d.y }
            , color = nv.utils.getColor(['#000'])
            , xDomain
            , yDomain
            , xRange
            , yRange
            , showMinMaxPoints = true
            , showCurrentPoint = true
            , dispatch = d3.dispatch('renderEnd')
        ;

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);

        function chart(selection) {
            renderWatch.reset();
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                container = d3.select(this);
                nv.utils.initSVG(container);

                // Setup Scales
                x   .domain(xDomain || d3.extent(data, getX ))
                    .range(xRange || [0, availableWidth]);

                y   .domain(yDomain || d3.extent(data, getY ))
                    .range(yRange || [availableHeight, 0]);

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-sparkline').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-sparkline');
                var gEnter = wrapEnter.append('g');
                var g = wrap.select('g');

                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

                var paths = wrapEnter.selectAll('path')
                    .data(function(d) { return [d] });
                paths.exit().remove();
                var pathsEnter=paths.enter().append('path');
                pathsEnter
                    .style('stroke', function(d,i) { return d.color || color(d, i) })
                    .attr('d', d3.line()
                        .x(function(d,i) { return x(getX(d,i)) })
                        .y(function(d,i) { return y(getY(d,i)) })
                    );
                pathsEnter.merge(paths);

                // TODO: Add CURRENT data point (Need Min, Mac, Current / Most recent)
                var points = wrapEnter.selectAll('circle.nv-point')
                    .data(function(data) {
                        var yValues = data.map(function(d, i) { return getY(d,i); });
                        function pointIndex(index) {
                            if (index != -1) {
                                var result = data[index];
                                result.pointIndex = index;
                                return result;
                            } else {
                                return null;
                            }
                        }
                        var maxPoint = pointIndex(yValues.lastIndexOf(y.domain()[1])),
                            minPoint = pointIndex(yValues.indexOf(y.domain()[0])),
                            currentPoint = pointIndex(yValues.length - 1);
                        return [(showMinMaxPoints ? minPoint : null), (showMinMaxPoints ? maxPoint : null), (showCurrentPoint ? currentPoint : null)].filter(function (d) {return d != null;});
                    });
                points.exit().remove();
                var pointsEnter=points.enter().append('circle');
                pointsEnter
                    .attr('cx', function(d,i) { return x(getX(d,d.pointIndex)) })
                    .attr('cy', function(d,i) { return y(getY(d,d.pointIndex)) })
                    .attr('r', 2)
                    .attr('class', function(d,i) {
                        return getX(d, d.pointIndex) == x.domain()[1] ? 'nv-point nv-currentValue' :
                            getY(d, d.pointIndex) == y.domain()[0] ? 'nv-point nv-minValue' : 'nv-point nv-maxValue'
                    });
                pointsEnter.merge(points);
            });

            renderWatch.renderEnd('sparkline immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:            {get: function(){return width;}, set: function(_){width=_;}},
            height:           {get: function(){return height;}, set: function(_){height=_;}},
            xDomain:          {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
            yDomain:          {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
            xRange:           {get: function(){return xRange;}, set: function(_){xRange=_;}},
            yRange:           {get: function(){return yRange;}, set: function(_){yRange=_;}},
            xScale:           {get: function(){return x;}, set: function(_){x=_;}},
            yScale:           {get: function(){return y;}, set: function(_){y=_;}},
            animate:          {get: function(){return animate;}, set: function(_){animate=_;}},
            showMinMaxPoints: {get: function(){return showMinMaxPoints;}, set: function(_){showMinMaxPoints=_;}},
            showCurrentPoint: {get: function(){return showCurrentPoint;}, set: function(_){showCurrentPoint=_;}},

            //functor options
            x: {get: function(){return getX;}, set: function(_){getX= typeof _ === "function" ? _ : function(){return _;};}},
            y: {get: function(){return getY;}, set: function(_){getY= typeof _ === "function" ? _ : function(){return _;};}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }}
        });

        chart.dispatch = dispatch;
        nv.utils.initOptions(chart);
        return chart;
    };

    nv.models.sparklinePlus = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var sparkline = nv.models.sparkline();

        var margin = {top: 15, right: 100, bottom: 10, left: 50}
            , width = null
            , height = null
            , x
            , y
            , index = []
            , paused = false
            , xTickFormat = d3.format(',r')
            , yTickFormat = d3.format(',.2f')
            , showLastValue = true
            , alignValue = true
            , rightAlignValue = false
            , noData = null
            , dispatch = d3.dispatch('renderEnd')
            , t = d3.transition()
            .duration(250)
            .ease(d3.easeLinear);

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(sparkline);
            selection.each(function(data) {
                var container = d3.select(this);
                nv.utils.initSVG(container);

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() { container.call(chart); };
                chart.container = this;

                // Display No Data message if there's nothing to show.
                if (!data || !data.length) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                var currentValue = sparkline.y()(data[data.length-1], data.length-1);

                // Setup Scales
                x = sparkline.xScale();
                y = sparkline.yScale();

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-sparklineplus').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-sparklineplus');
                var gEnter = wrapEnter.append('g');
                var g = wrap.select('g');

                var sparklineWrapAppend=gEnter.append('g').attr('class', 'nv-sparklineWrap');
                var valueWrapAppend=gEnter.append('g').attr('class', 'nv-valueWrap');
                var hoverAreaAppend=gEnter.append('g').attr('class', 'nv-hoverArea');

                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                wrapEnter.merge(wrap);

                // Main Chart Component(s)
                //var sparklineWrap = g.select('.nv-sparklineWrap');

                sparkline.width(availableWidth).height(availableHeight);
                var sp=sparklineWrapAppend.call(sparkline);
                sp.merge(sparklineWrapAppend);

                if (showLastValue) {
                    //var valueWrap = g.select('.nv-valueWrap');
                    var value = valueWrapAppend.selectAll('.nv-currentValue')
                        .data([currentValue]);

                    var valueEnter=value.enter().append('text').attr('class', 'nv-currentValue')
                        .attr('dx', rightAlignValue ? -8 : 8)
                        .attr('dy', '.9em')
                        .style('text-anchor', rightAlignValue ? 'end' : 'start');

                    valueEnter
                        .attr('x', availableWidth + (rightAlignValue ? margin.right : 0))
                        .attr('y', alignValue ? function (d) {
                            return y(d)
                        } : 0)
                        .style('fill', sparkline.color()(data[data.length - 1], data.length - 1))
                        .text(yTickFormat(currentValue));
                    valueEnter.merge(value);
                }

                var rect=hoverAreaAppend.append('rect')
                    .on('mousemove', sparklineHover)
                    .on('click', function() { paused = !paused })
                    .on('mouseout', function() { index = []; updateValueLine(); });

                rect
                    .attr('transform', function(d) { return 'translate(' + -margin.left + ',' + -margin.top + ')' })
                    .attr('width', availableWidth + margin.left + margin.right)
                    .attr('height', availableHeight + margin.top);
                rect.merge(hoverAreaAppend);
                //index is currently global (within the chart), may or may not keep it that way
                function updateValueLine() {
                    if (paused) return;

                    var hoverValue = hoverAreaAppend.selectAll('.nv-hoverValue').data(index);

                    hoverValue.exit()
                        .transition().duration(250)
                        .style('stroke-opacity', 0)
                        .style('fill-opacity', 0).remove();

                    var hoverEnter = hoverValue.enter()
                        .append('g').attr('class', 'nv-hoverValue')
                        .style('stroke-opacity', 0)
                        .style('fill-opacity', 0);

                    hoverValue
                        .attr('transform', function(d) { return 'translate(' + x(sparkline.x()(data[d],d)) + ',0)' })
                        .transition().duration(250)
                        .style('stroke-opacity', !index.length ? 0 : 1)
                        .style('fill-opacity', !index.length ? 0 : 1);

                    if (!index.length){
                        hoverValue.merge(hoverValue);
                        return;
                    }

                    hoverEnter.append('line')
                        .attr('x1', 0)
                        .attr('y1', -margin.top)
                        .attr('x2', 0)
                        .attr('y2', availableHeight);

                    hoverEnter.append('text').attr('class', 'nv-xValue')
                        .attr('x', -6)
                        .attr('y', -margin.top)
                        .attr('text-anchor', 'end')
                        .attr('dy', '.9em');

                    hoverAreaAppend.select('.nv-hoverValue .nv-xValue')
                        .text(xTickFormat(sparkline.x()(data[index[0]], index[0])));

                    hoverEnter.append('text').attr('class', 'nv-yValue')
                        .attr('x', 6)
                        .attr('y', -margin.top)
                        .attr('text-anchor', 'start')
                        .attr('dy', '.9em');

                    hoverAreaAppend.select('.nv-hoverValue .nv-yValue')
                        .text(yTickFormat(sparkline.y()(data[index[0]], index[0])));
//                hoverEnter.merge(hoverValue);
//                hoverEnter.merge(hoverValue);
                }

                function sparklineHover(event) {
                    if (paused) return;

                    var pos = d3.pointer(event)[0] - margin.left;

                    function getClosestIndex(data, x) {
                        var distance = Math.abs(sparkline.x()(data[0], 0) - x);
                        var closestIndex = 0;
                        for (var i = 0; i < data.length; i++){
                            if (Math.abs(sparkline.x()(data[i], i) - x) < distance) {
                                distance = Math.abs(sparkline.x()(data[i], i) - x);
                                closestIndex = i;
                            }
                        }
                        return closestIndex;
                    }

                    index = [getClosestIndex(data, Math.round(x.invert(pos)))];
                    updateValueLine();
                }

            });
            renderWatch.renderEnd('sparklinePlus immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.sparkline = sparkline;

        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:           {get: function(){return width;}, set: function(_){width=_;}},
            height:          {get: function(){return height;}, set: function(_){height=_;}},
            xTickFormat:     {get: function(){return xTickFormat;}, set: function(_){xTickFormat=_;}},
            yTickFormat:     {get: function(){return yTickFormat;}, set: function(_){yTickFormat=_;}},
            showLastValue:   {get: function(){return showLastValue;}, set: function(_){showLastValue=_;}},
            alignValue:      {get: function(){return alignValue;}, set: function(_){alignValue=_;}},
            rightAlignValue: {get: function(){return rightAlignValue;}, set: function(_){rightAlignValue=_;}},
            noData:          {get: function(){return noData;}, set: function(_){noData=_;}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }}
        });

        nv.utils.inheritOptions(chart, sparkline);
        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.stackedArea = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 960
            , height = 500
            , color = nv.utils.defaultColor() // a function that computes the color
            , id = Math.floor(Math.random() * 100000) //Create semi-unique ID incase user doesn't selet one
            , container = null
            , getX = function(d) { return d.x } // accessor to get the x value from a data point
            , getY = function(d) { return d.y } // accessor to get the y value from a data point
            , defined = function(d,i) { return !isNaN(getY(d,i)) && getY(d,i) !== null } // allows a line to be not continuous when it is not defined
            , style = 'stack'
            , offset = d3.stackOffsetNone
            , order = d3.stackOrderNone
            , interpolate = getInterpolationType(interpolate)  // controls the line interpolation
            , clipEdge = false // if true, masks lines within x and y scale
            , x //can be accessed via chart.xScale()
            , y //can be accessed via chart.yScale()
            , scatter = nv.models.scatter()
            , duration = 250
            , transformData = function(d, y0, y) { d.display = { y: y, y0: y0 }; }
            , areaY1 = function(d) { return y(d.display.y + d.display.y0) }
            , dispatch =  d3.dispatch('areaClick', 'areaMouseover', 'areaMouseout','renderEnd', 'elementClick', 'elementMouseover', 'elementMouseout')
        ;

        scatter
            .pointSize(2.2) // default size
            .pointDomain([2.2, 2.2]) // all the same size by default
        ;

        /************************************
         * offset:
         *   'wiggle' (stream)
         *   'zero' (stacked)
         *   'expand' (normalize to 100%)
         *   'silhouette' (simple centered)
         *
         * order:
         *   'inside-out' (stream)
         *   'default' (input order)
         ************************************/

        var renderWatch = nv.utils.renderWatch(dispatch, duration);

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(scatter);
            selection.each(function(data) {
                var availableWidth = width - margin.left - margin.right,
                    availableHeight = height - margin.top - margin.bottom;

                container = d3.select(this);
                nv.utils.initSVG(container);

                // Setup Scales
                x = scatter.xScale();
                y = scatter.yScale();

                var dataRaw = data;
                // Injecting point index into each point because d3.stack().out does not give index
                data.forEach(function(aseries, i) {
                    aseries.seriesIndex = i;
                    aseries.values = aseries.values.map(function(d, j) {
                        d.index = j;
                        d.seriesIndex = i;
                        return d;
                    });
                });

                var dataFiltered = data.filter(function(series) {
                    return !series.disabled;
                });

                var newData=[];
                dataFiltered[0].values.forEach(function(d){
                    newData.push({x: d[0]});
                });
                dataFiltered.forEach(function(d, y, y0) {
                    d.display = { y: y, y0: y0 };
                    d.values.forEach(function(d2){
                        newData[d2.index][d.key]=d2[1];
                    });
                    //console.log(d.display);
                });
                var keys = dataFiltered.map(a => a.key);

                data = d3.stack().keys(keys)
                    .order(order)
                    .offset(offset)
                    .value(function(d, key) {return d[key] })  //TODO: make values customizeable in EVERY model in this fashion
                    //                .x(getX)
                    //                .y(getY)
                    //                .out(transformData)
                    (newData);
                var scatterData=[]; //legacy data shape to pass to scatter
                data.forEach(function(aseries, i) {
                    aseries.seriesIndex = i;
                    aseries.x=Array.from(Array(aseries.length).keys())
                    //console.log(i+" "+aseries.length);
                    var values = [];
                    aseries.map(function(d, j) {
                        values.push({x: j, y: d[1]-d[0], y0: d[0], series: j, seriesIndex: i, index: j, display: {y: d[1]-d[0], y0: d[0]}});
                        return values;
                    });
                    scatterData.push({values: values, key: keys[i], seriesIndex: i});
                });
                data = scatterData;

                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-stackedarea').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-stackedarea');
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                var defsEnter = wrapEnter.append('defs');
                var gEnter = wrapEnter.append('g');
                var g = gEnter.select('g');

                var areaWrapAppend=gEnter.append('g').attr('class', 'nv-areaWrap');
                areaWrapAppend = container.selectAll('g.nv-wrap.nv-stackedarea').select('.nv-areaWrap');
                var scatterWrapAppend=gEnter.append('g').attr('class', 'nv-scatterWrap');
                scatterWrapAppend = container.selectAll('g.nv-wrap.nv-stackedarea').select('.nv-scatterWrap');
                //wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                // If the user has not specified forceY, make sure 0 is included in the domain
                // Otherwise, use user-specified values for forceY
                if (scatter.forceY().length == 0) {
                    scatter.forceY().push(0);
                }

                scatter
                    .width(availableWidth)
                    .height(availableHeight)
                    .x(getX)
                    .y(function(d) {
                        if (d.display !== undefined) { return d.display.y + d.display.y0; }
                    })
                    .color(scatterData.map(function(d,i) {
                        d.color = d.color || color(d, d.seriesIndex);
                        return d.color;
                    }));

                var scatterWrap = scatterWrapAppend
                    .datum(scatterData);

                scatterWrap.call(scatter);

                var rectAppend=defsEnter.append('clipPath')
                    .attr('id', 'nv-edge-clip-' + id)
                    .append('rect');

                rectAppend
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                if(clipEdge)gEnter.attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + id + ')' : '');

                var area = d3.area()
                    .defined(defined)
                    .x(function(d,i)  {
                        return x(getX(d,i)) })
                    .y0(function(d) {
                        return y(d.display.y0)
                    })
                    .y1(areaY1)
                    .curve(getInterpolationType(interpolate));

                var zeroArea = d3.area()
                    .defined(defined)
                    .x(function(d,i)  { return x(getX(d,i)) })
                    .y0(function(d) { return y(d.display.y0) })
                    .y1(function(d) { return y(d.display.y0) });

                var path = areaWrapAppend.selectAll('path.nv-area')
                    .data(function(d) { return d });

                path.exit().remove();
                var pathEnter=path.enter().append('path').attr('class', function(d,i) { return 'nv-area nv-area-' + i })
                    .attr('d', function(d,i){
                        return zeroArea(d.values, d.seriesIndex);
                    })
                    .on('mouseover', function(event, d,i) {
                        d3.select(this).classed('hover', true);
                        dispatch.call('areaMouseover', this, {
                            point: d,
                            series: d.key,
                            pos: [event.pageX, event.pageY],
                            seriesIndex: d.seriesIndex
                        });
                    })
                    .on('mouseout', function(event,d,i) {
                        d3.select(this).classed('hover', false);
                        dispatch.call('areaMouseout', this, {
                            point: d,
                            series: d.key,
                            pos: [event.pageX, event.pageY],
                            seriesIndex: d.seriesIndex
                        });
                    })
                    .on('click', function(event,d,i) {
                        d3.select(this).classed('hover', false);
                        dispatch.call('areaClick', this, {
                            point: d,
                            series: d.key,
                            pos: [event.pageX, event.pageY],
                            seriesIndex: d.seriesIndex
                        });
                    });
                pathEnter = pathEnter.merge(path);
                pathEnter.style('fill', function(d,i){
                    return d.color || color(d, d.seriesIndex)
                })
                    .style('stroke', function(event,d,i){ return d.color || color(d, d.seriesIndex) });
                pathEnter.watchTransition(renderWatch,'stackedArea path')
                    .attr('d', function(d,i){
                        return area(d.values, d.seriesIndex);
                    })


                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                scatter.dispatch.on('elementMouseover.area', function(e) {
                    g.select('.nv-chart-' + id + ' .nv-area-' + e.seriesIndex).classed('hover', true);
                });
                scatter.dispatch.on('elementMouseout.area', function(e) {
                    g.select('.nv-chart-' + id + ' .nv-area-' + e.seriesIndex).classed('hover', false);
                });

                //Special offset functions
                chart.d3_stackedOffset_stackPercent = function(stackData) {
                    var n = stackData.length,    //How many series
                        m = stackData[0].length,     //how many points per series
                        i,
                        j,
                        o,
                        y0 = [];

                    for (j = 0; j < m; ++j) { //Looping through all points
                        for (i = 0, o = 0; i < dataRaw.length; i++) { //looping through all series
                            o += getY(dataRaw[i].values[j]); //total y value of all series at a certian point in time.
                        }

                        if (o) for (i = 0; i < n; i++) { //(total y value of all series at point in time i) != 0
                            stackData[i][j][1] /= o;
                        } else { //(total y value of all series at point in time i) == 0
                            for (i = 0; i < n; i++) {
                                stackData[i][j][1] = 0;
                            }
                        }
                    }
                    for (j = 0; j < m; ++j) y0[j] = 0;
                    return y0;
                };

            });

            renderWatch.renderEnd('stackedArea immediate');
            return chart;
        }

        //============================================================
        // Global getters and setters
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.scatter = scatter;

        scatter.dispatch.on('elementClick', function(){ dispatch.apply('elementClick', this, arguments); });
        scatter.dispatch.on('elementMouseover', function(){ dispatch.apply('elementMouseover', this, arguments); });
        scatter.dispatch.on('elementMouseout', function(){ dispatch.apply('elementMouseout', this, arguments); });

        chart.interpolate = function(_) {
            if (!arguments.length) return interpolate;
            interpolate = _;
            return chart;
        };

        chart.duration = function(_) {
            if (!arguments.length) return duration;
            duration = _;
            renderWatch.reset(duration);
            scatter.duration(duration);
            return chart;
        };

        chart.dispatch = dispatch;
        chart.scatter = scatter;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            defined: {get: function(){return defined;}, set: function(_){defined=_;}},
            clipEdge: {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},
            offset:      {get: function(){return offset;}, set: function(_){offset=_;}},
            order:    {get: function(){return order;}, set: function(_){order=_;}},
            interpolate:    {get: function(){return interpolate;}, set: function(_){interpolate=_;}},

            // simple functor options
            x:     {get: function(){return getX;}, set: function(_){getX = typeof _ === "function" ? _ : function(){return _;};}},
            y:     {get: function(){return getY;}, set: function(_){getY = typeof _ === "function" ? _ : function(){return _;};}},

            areaY1:     {get: function(){return areaY1;}, set: function(_){ areaY1 = typeof _ === "function" ? _ : function(){return _;};}},
            transformData:     {get: function(){return transformData;}, set: function(_){ transformData = typeof _ === "function" ? _ : function(){return _;};}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                }},
            style: {get: function(){return style;}, set: function(_){
                    style = _;
                    switch (style) {
                        case 'stack':
                            chart.offset(d3.stackOffsetNone);
                            chart.order(d3.stackOrderNone);
                            break;
                        case 'stream':
                            chart.offset(d3.stackOffsetWiggle);
                            chart.order(d3.stackOrderInsideOut);
                            break;
                        case 'stream_center':
                            chart.offset(d3.stackOffsetSilhouette);
                            chart.order(d3.stackOrderNone);
                            break;
                        case 'expand':
                            chart.offset(d3.stackOffsetExpand);
                            chart.order(d3.stackOrderNone);
                            break;
                        case 'stack_percent':
                            chart.offset(chart.d3_stackedOffset_stackPercent);
                            chart.order(d3.stackOrderNone);
                            break;
                    }
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    scatter.duration(duration);
                }}
        });

        nv.utils.inheritOptions(chart, scatter);
        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.stackedAreaChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var stacked = nv.models.stackedArea()
            , xAxis = nv.models.axis(d3.axisBottom(d3.scaleLinear()), 'bottom')
            , yAxis = nv.models.axis(d3.axisLeft(d3.scaleLinear()), 'left')
            , legend = nv.models.legend()
            , controls = nv.models.legend()
            , interactiveLayer = nv.interactiveGuideline()
            , tooltip = nv.models.tooltip()
            , focus = nv.models.focus(nv.models.stackedArea())
        ;

        var margin = {top: 10, right: 25, bottom: 50, left: 60}
            , marginTop = null
            , width = null
            , height = null
            , color = nv.utils.defaultColor()
            , showControls = true
            , showLegend = true
            , legendPosition = 'top'
            , showXAxis = true
            , showYAxis = true
            , rightAlignYAxis = false
            , focusEnable = false
            , useInteractiveGuideline = false
            , showTotalInTooltip = true
            , totalLabel = 'TOTAL'
            , x //can be accessed via chart.xScale()
            , y //can be accessed via chart.yScale()
            , state = nv.utils.state()
            , defaultState = null
            , noData = null
            , dispatch = d3.dispatch('stateChange', 'changeState','renderEnd')
            , controlWidth = 250
            , controlOptions = ['Stacked','Stream','Expanded']
            , controlLabels = {}
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear);

        state.style = stacked.style();
        xAxis.tickPadding(7);
        //yAxis.orient((rightAlignYAxis) ? 'right' : 'left');

        tooltip
            .headerFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            })
            .valueFormatter(function(d, i) {
                return yAxis.tickFormat()(d, i);
            });

        interactiveLayer.tooltip
            .headerFormatter(function(d, i) {
                return xAxis.tickFormat()(d, i);
            })
            .valueFormatter(function(d, i) {
                return d == null ? "N/A" : yAxis.tickFormat()(d, i);
            });

        var oldYTickFormat = null,
            oldValueFormatter = null;

        controls.updateState(false);

        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);
        var style = stacked.style();

        var stateGetter = function(data) {
            return function(){
                return {
                    active: data.map(function(d) { return !d.disabled }),
                    style: stacked.style()
                };
            }
        };

        var stateSetter = function(data) {
            return function(state) {
                if (state.style !== undefined)
                    style = state.style;
                if (state.active !== undefined)
                    data.forEach(function(series,i) {
                        series.disabled = !state.active[i];
                    });
            }
        };

        var percentFormatter = d3.format('.0%');

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(stacked);
            if (showXAxis) renderWatch.models(xAxis);
            if (showYAxis) renderWatch.models(yAxis);

            selection.each(function(data) {
                var container = d3.select(this),
                    that = this;
                nv.utils.initSVG(container);

                var availableWidth = nv.utils.availableWidth(width, container, margin),
                    availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);

                chart.update = function() { container.transition().duration(duration).call(chart); };
                chart.container = this;

                state
                    .setter(stateSetter(data), chart.update)
                    .getter(stateGetter(data))
                    .update();

                // DEPRECATED set state.disabled
                state.disabled = data.map(function(d) { return !!d.disabled });

                if (!defaultState) {
                    var key;
                    defaultState = {};
                    for (key in state) {
                        if (state[key] instanceof Array)
                            defaultState[key] = state[key].slice(0);
                        else
                            defaultState[key] = state[key];
                    }
                }

                // Display No Data message if there's nothing to show.
                if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                    nv.utils.noData(chart, container)
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }
                // Setup Scales
                x = stacked.xScale();
                y = stacked.yScale();


                // Setup containers and skeleton of chart
                var wrap = container.selectAll('g.nv-wrap.nv-stackedAreaChart').data([data]);
                var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-stackedAreaChart');

                var gEnter = wrapEnter.append('g');
                var g = wrapEnter.select('g');

                var legendWrapAppend=gEnter.append('g').attr('class', 'nv-legendWrap');
                legendWrapAppend = container.selectAll('g.nv-wrap.nv-stackedAreaChart').select('.nv-legendWrap');
                var controlsWrapAppend=gEnter.append('g').attr('class', 'nv-controlsWrap');
                controlsWrapAppend = container.selectAll('g.nv-wrap.nv-stackedAreaChart').select('.nv-controlsWrap');
                var focusEnter = gEnter.append('g').attr('class', 'nv-focus');
                var rectAppend=focusEnter.append('g').attr('class', 'nv-background').append('rect');
                var xAxisAppend=focusEnter.append('g').attr('class', 'nv-x nv-axis');
                xAxisAppend = container.selectAll('g.nv-wrap.nv-stackedAreaChart').select('.nv-x');
                var yAxisAppend=focusEnter.append('g').attr('class', 'nv-y nv-axis');
                yAxisAppend = container.selectAll('g.nv-wrap.nv-stackedAreaChart').select('.nv-y');
                var stackedWrapAppend=focusEnter.append('g').attr('class', 'nv-stackedWrap');
                stackedWrapAppend = container.selectAll('g.nv-wrap.nv-stackedAreaChart').select('.nv-stackedWrap');
                var interactiveAppend=focusEnter.append('g').attr('class', 'nv-interactive');
                interactiveAppend = container.selectAll('g.nv-wrap.nv-stackedAreaChart').select('.nv-interactive');

                // g.select("rect").attr("width",availableWidth).attr("height",availableHeight);

                var contextEnter = gEnter.append('g').attr('class', 'nv-focusWrap');
                contextEnter = container.selectAll('g.nv-wrap.nv-stackedAreaChart').select('.nv-focusWrap');
                // Legend
                if (!showLegend) {
                    legendWrapAppend.selectAll('*').remove();
                } else {
                    var legendWidth = (showControls && legendPosition === 'top') ? availableWidth - controlWidth : availableWidth;

                    legend.width(legendWidth);
                    legendWrapAppend.datum(data).call(legend);

                    if (legendPosition === 'bottom') {
                        var xAxisHeight = xAxis.height();
                        margin.bottom = Math.max(legend.height() + xAxisHeight, margin.bottom);
                        availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);
                        var legendTop = availableHeight + xAxisHeight;
                        legendWrapAppend
                            .attr('transform', 'translate(0,' + legendTop +')');
                    } else if (legendPosition === 'top') {
                        if (!marginTop && margin.top != legend.height()) {
                            margin.top = legend.height();
                            availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);
                        }

                        legendWrapAppend
                            .attr('transform', 'translate(' + (availableWidth-legendWidth) + ',' + (-margin.top) +')');
                    }
                }
                wrapEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

                // Controls
                if (!showControls) {
                    controlsWrapAppend.selectAll('*').remove();
                } else {
                    var controlsData = [
                        {
                            key: controlLabels.stacked || 'Stacked',
                            metaKey: 'Stacked',
                            disabled: stacked.style() != 'stack',
                            style: 'stack'
                        },
                        {
                            key: controlLabels.stream || 'Stream',
                            metaKey: 'Stream',
                            disabled: stacked.style() != 'stream',
                            style: 'stream'
                        },
                        {
                            key: controlLabels.stream_center || 'Stream Center',
                            metaKey: 'Stream_Center',
                            disabled: stacked.style() != 'stream_center',
                            style: 'stream_center'
                        },
                        {
                            key: controlLabels.expanded || 'Expanded',
                            metaKey: 'Expanded',
                            disabled: stacked.style() != 'expand',
                            style: 'expand'
                        },
                        {
                            key: controlLabels.stack_percent || 'Stack %',
                            metaKey: 'Stack_Percent',
                            disabled: stacked.style() != 'stack_percent',
                            style: 'stack_percent'
                        }
                    ];

                    controlWidth = (controlOptions.length/3) * 260;
                    controlsData = controlsData.filter(function(d) {
                        return controlOptions.indexOf(d.metaKey) !== -1;
                    });

                    controls
                        .width( controlWidth )
                        .color(['#444', '#444', '#444']);

                    controlsWrapAppend
                        .datum(controlsData)
                        .call(controls);

                    var requiredTop = Math.max(controls.height(), showLegend && (legendPosition === 'top') ? legend.height() : 0);

                    if ( margin.top != requiredTop ) {
                        margin.top = requiredTop;
                        availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);
                    }

                    controlsWrapAppend
                        .attr('transform', 'translate(0,' + (-margin.top) +')');
                }


                if (rightAlignYAxis) {
                    yAxisAppend
                        .attr("transform", "translate(" + availableWidth + ",0)");
                }

                //Set up interactive layer
                if (useInteractiveGuideline) {
                    interactiveLayer
                        .width(availableWidth)
                        .height(availableHeight)
                        .margin({left: margin.left, top: margin.top})
                        .svgContainer(container)
                        .xScale(x);
                    interactiveAppend.call(interactiveLayer);
                }

                rectAppend
                    .attr('width', availableWidth)
                    .attr('height', availableHeight);

                stacked
                    .width(availableWidth)
                    .height(availableHeight)
                    .color(data.map(function(d,i) {
                        return d.color || color(d, i);
                    }).filter(function(d,i) { return !data[i].disabled; }));

                stackedWrapAppend
                    .datum(data.filter(function(d) { return !d.disabled; }));

                // Setup Axes
                if (showXAxis) {
                    xAxis.scale(x)
                        ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    xAxis
                        .tickSizeInner( -availableHeight);
                }

                if (showYAxis) {
                    var ticks;
                    if (stacked.offset() === d3.stackOffsetWiggle) {
                        ticks = 0;
                    }
                    else {
                        ticks = nv.utils.calcTicksY(availableHeight/36, data);
                    }
                    yAxis.scale(y)
                        ._ticks(ticks)
                    yAxis
                        .tickSizeInner(-availableWidth);
                }

                //============================================================
                // Update Axes
                //============================================================
                function updateXAxis() {
                    if(showXAxis) {
                        xAxisAppend
                            .attr('transform', 'translate(0,' + availableHeight + ')')
                            .transition().duration(duration)
                            .call(xAxis)
                        ;
                    }
                }

                function updateYAxis() {
                    if(showYAxis) {
                        if (stacked.style() === 'expand' || stacked.style() === 'stack_percent') {
                            var currentFormat = yAxis.tickFormat();

                            if ( !oldYTickFormat || currentFormat !== percentFormatter )
                                oldYTickFormat = currentFormat;

                            //Forces the yAxis to use percentage in 'expand' mode.
                            yAxis.tickFormat(percentFormatter);
                        }
                        else {
                            if (oldYTickFormat) {
                                yAxis.tickFormat(oldYTickFormat);
                                oldYTickFormat = null;
                            }
                        }

                        yAxisAppend
                            .transition()
                            .call(yAxis);
                    }
                }

                //============================================================
                // Update Focus
                //============================================================
                if(!focusEnable) {
                    stackedWrapAppend.transition().call(stacked);
                    updateXAxis();
                    updateYAxis();
                } else {
                    focus.width(availableWidth);
                    contextEnter
                        .attr('transform', 'translate(0,' + ( availableHeight + margin.bottom + focus.margin().top) + ')')
                        .datum(data.filter(function(d) { return !d.disabled; }))
                        .call(focus);
                    var extent = (d3.event==null || d3.event.selection === null) ? focus.xDomain() : focus.brush.selection();
                    if(extent !== null){
                        onBrush(extent);
                    }
                }

                //============================================================
                // Event Handling/Dispatching (in chart's scope)
                //------------------------------------------------------------

                stacked.dispatch.on('areaClick.toggle', function(e) {
                    if (data.filter(function(d) { return !d.disabled }).length === 1)
                        data.forEach(function(d) {
                            d.disabled = false;
                        });
                    else
                        data.forEach(function(d,i) {
                            d.disabled = (i != e.seriesIndex);
                        });

                    state.disabled = data.map(function(d) { return !!d.disabled });
                    dispatch.call('stateChange', this, state);

                    chart.update();
                });

                legend.dispatch.on('stateChange', function(newState) {
                    for (var key in newState)
                        state[key] = newState[key];
                    dispatch.call('stateChange', this, newState);
                    chart.update();
                });

                controls.dispatch.on('legendClick', function(e,d,i) {
                    if (!d.disabled) return;

                    controlsData = controlsData.map(function(s) {
                        s.disabled = true;
                        return s;
                    });
                    d.disabled = false;

                    stacked.style(d.style);


                    state.style = stacked.style();
                    dispatch.call('stateChange', this, state);

                    chart.update();
                });

                interactiveLayer.dispatch.on('elementMousemove', function(e) {
                    stacked.clearHighlights();
                    var singlePoint, pointIndex, pointXLocation, allData = [], valueSum = 0, allNullValues = true, atleastOnePoint = false;
                    data
                        .filter(function(series, i) {
                            series.seriesIndex = i;
                            return !series.disabled;
                        })
                        .forEach(function(series,i) {
                            pointIndex = nv.interactiveBisect(series.values, e.pointXValue, function(d, i) { return d[0]});
                            var point = series.values[pointIndex];
                            var pointYValue = chart.y()({x:point[0], y:point[1]}, pointIndex);
                            if (pointYValue != null && pointYValue > 0) {
                                stacked.highlightPoint(i, pointIndex, true);
                                atleastOnePoint = true;
                            }

                            // Draw at least one point if all values are zero.
                            if (i === (data.length - 1) && !atleastOnePoint) {
                                stacked.highlightPoint(i, pointIndex, true);
                            }
                            if (typeof point === 'undefined') return;
                            if (typeof singlePoint === 'undefined') singlePoint = point;
                            if (typeof pointXLocation === 'undefined') pointXLocation = chart.xScale()(chart.x()({x:point[0], y:point[1]},pointIndex));

                            //If we are in 'expand' mode, use the stacked percent value instead of raw value.
                            var tooltipValue = (stacked.style() == 'expand') ? point[1] : chart.y()({x:point[0], y:point[1]},pointIndex);
                            allData.push({
                                key: series.key,
                                value: +tooltipValue,
                                color: color(series,series.seriesIndex),
                                point: point
                            });

                            if (showTotalInTooltip && stacked.style() != 'expand' && tooltipValue != null) {
                                valueSum += +tooltipValue;
                                allNullValues = false;
                            };
                        });

                    allData.reverse();

                    //Highlight the tooltip entry based on which stack the mouse is closest to.
                    if (allData.length > 2) {
                        var yValue = chart.yScale().invert(e.mouseY);
                        var yDistMax = Infinity, indexToHighlight = null;
                        allData.forEach(function(series,i) {

                            //To handle situation where the stacked area chart is negative, we need to use absolute values
                            //when checking if the mouse Y value is within the stack area.
                            yValue = Math.abs(yValue);
                            var stackedY0 = Math.abs(series.point[0]);
                            var stackedY = Math.abs(series.point[1]);
                            if ( yValue >= stackedY0 && yValue <= (stackedY + stackedY0))
                            {
                                indexToHighlight = i;
                                return;
                            }
                        });
                        if (indexToHighlight != null)
                            allData[indexToHighlight].highlight = true;
                    }

                    //If we are not in 'expand' mode, add a 'Total' row to the tooltip.
                    if (showTotalInTooltip && stacked.style() != 'expand' && allData.length >= 2 && !allNullValues) {
                        allData.push({
                            key: totalLabel,
                            value: valueSum,
                            total: true
                        });
                    }

                    var xValue = chart.x()({x:singlePoint[0], y:singlePoint[1]},pointIndex);

                    var valueFormatter = interactiveLayer.tooltip.valueFormatter();
                    // Keeps track of the tooltip valueFormatter if the chart changes to expanded view
                    if (stacked.style() === 'expand' || stacked.style() === 'stack_percent') {
                        if ( !oldValueFormatter ) {
                            oldValueFormatter = valueFormatter;
                        }
                        //Forces the tooltip to use percentage in 'expand' mode.
                        valueFormatter = d3.format(".1%");
                    }
                    else {
                        if (oldValueFormatter) {
                            valueFormatter = oldValueFormatter;
                            oldValueFormatter = null;
                        }
                    }

                    interactiveLayer.tooltip
                        .valueFormatter(valueFormatter)
                        .data(
                            {
                                value: xValue,
                                series: allData
                            }
                        )();

                    interactiveLayer.renderGuideLine(pointXLocation);

                });

                interactiveLayer.dispatch.on("elementMouseout",function(e) {
                    stacked.clearHighlights();
                });

                /* Update `main' graph on brush update. */
                focus.dispatch.on("onBrush", function(extent) {
                    onBrush(extent);
                });

                // Update chart from a state object passed to event handler
                dispatch.on('changeState', function(e) {

                    if (typeof e.disabled !== 'undefined' && data.length === e.disabled.length) {
                        data.forEach(function(series,i) {
                            series.disabled = e.disabled[i];
                        });

                        state.disabled = e.disabled;
                    }

                    if (typeof e.style !== 'undefined') {
                        stacked.style(e.style);
                        style = e.style;
                    }

                    chart.update();
                });

                //============================================================
                // Functions
                //------------------------------------------------------------

                function onBrush(extent) {
                    // Update Main (Focus)
                    stackedWrapAppend
                        .datum(
                            data.filter(function(d) { return !d.disabled; })
                                .map(function(d,i) {
                                    return {
                                        key: d.key,
                                        area: d.area,
                                        classed: d.classed,
                                        values: d.values.filter(function(d,i) {
                                            return stacked.x()(d,i) >= extent[0] && stacked.x()(d,i) <= extent[1];
                                        }),
                                        disableTooltip: d.disableTooltip
                                    };
                                })
                        );
                    stackedWrapAppend.transition().duration(duration).call(stacked);

                    // Update Main (Focus) Axes
                    updateXAxis();
                    updateYAxis();
                }

            });

            renderWatch.renderEnd('stacked Area chart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        stacked.dispatch.on('elementMouseover.tooltip', function(evt) {
            evt.point['x'] = stacked.x()(evt.point);
            evt.point['y'] = stacked.y()(evt.point);
            tooltip.data(evt).hidden(false);
        });

        stacked.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true)
        });
        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.stacked = stacked;
        chart.legend = legend;
        chart.controls = controls;
        chart.xAxis = xAxis;
        chart.x2Axis = focus.xAxis;
        chart.yAxis = yAxis;
        chart.y2Axis = focus.yAxis;
        chart.interactiveLayer = interactiveLayer;
        chart.tooltip = tooltip;
        chart.focus = focus;

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
            legendPosition: {get: function(){return legendPosition;}, set: function(_){legendPosition=_;}},
            showXAxis:      {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
            showYAxis:    {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
            defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},
            noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
            showControls:    {get: function(){return showControls;}, set: function(_){showControls=_;}},
            controlLabels:    {get: function(){return controlLabels;}, set: function(_){controlLabels=_;}},
            controlOptions:    {get: function(){return controlOptions;}, set: function(_){controlOptions=_;}},
            showTotalInTooltip:      {get: function(){return showTotalInTooltip;}, set: function(_){showTotalInTooltip=_;}},
            totalLabel:      {get: function(){return totalLabel;}, set: function(_){totalLabel=_;}},
            focusEnable:    {get: function(){return focusEnable;}, set: function(_){focusEnable=_;}},
            focusHeight:     {get: function(){return focus.height();}, set: function(_){focus.height(_);}},
            brushExtent: {get: function(){return focus.brushExtent();}, set: function(_){focus.brushExtent(_);}},

            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    if (_.top !== undefined) {
                        margin.top = _.top;
                        marginTop = _.top;
                    }
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                }},
            focusMargin: {get: function(){return focus.margin}, set: function(_){
                    focus.margin.top    = _.top    !== undefined ? _.top    : focus.margin.top;
                    focus.margin.right  = _.right  !== undefined ? _.right  : focus.margin.right;
                    focus.margin.bottom = _.bottom !== undefined ? _.bottom : focus.margin.bottom;
                    focus.margin.left   = _.left   !== undefined ? _.left   : focus.margin.left;
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                    stacked.duration(duration);
                    xAxis.duration(duration);
                    yAxis.duration(duration);
                }},
            color:  {get: function(){return color;}, set: function(_){
                    color = nv.utils.getColor(_);
                    legend.color(color);
                    stacked.color(color);
                    focus.color(color);
                }},
            x: {get: function(){return stacked.x();}, set: function(_){
                    stacked.x(_);
                    focus.x(_);
                }},
            y: {get: function(){return stacked.y();}, set: function(_){
                    stacked.y(_);
                    focus.y(_);
                }},
            rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
                    rightAlignYAxis = _;
                    //@todo yAxis.orient( rightAlignYAxis ? 'right' : 'left');
                }},
            useInteractiveGuideline: {get: function(){return useInteractiveGuideline;}, set: function(_){
                    useInteractiveGuideline = !!_;
                    chart.interactive(!_);
                    chart.useVoronoi(!_);
                    stacked.scatter.interactive(!_);
                }}
        });

        nv.utils.inheritOptions(chart, stacked);
        nv.utils.initOptions(chart);

        return chart;
    };

    nv.models.stackedAreaWithFocusChart = function() {
        return nv.models.stackedAreaChart()
            .margin({ bottom: 30 })
            .focusEnable( true );
    };
// based on http://bl.ocks.org/kerryrodden/477c1bfb081b783f80ad
    nv.models.sunburst = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var margin = {top: 0, right: 0, bottom: 0, left: 0}
            , width = 600
            , height = 600
            , mode = "count"
            , modes = {count: function(d) { return 1; }, value: function(d) { return d.value || d.size }, size: function(d) { return d.value || d.size }}
            , id = Math.floor(Math.random() * 10000) //Create semi-unique ID in case user doesn't select one
            , container = null
            , color = nv.utils.defaultColor()
            , showLabels = false
            , labelFormat = function(d){if(mode === 'count'){return d.name + ' #' + d.value}else{return d.name + ' ' + (d.value || d.size)}}
            , labelThreshold = 0.02
            , sort = function(d1, d2){return d1.name > d2.name;}
            , key = function(d,i){
            if (d.parent !== undefined) {
                return d.name + '-' + d.parent.name + '-' + i;
            } else {
                return d.name;
            }
        }
            , groupColorByParent = true
            , duration = 500
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear)
            , dispatch = d3.dispatch('chartClick', 'elementClick', 'elementDblClick', 'elementMousemove', 'elementMouseover', 'elementMouseout', 'renderEnd');

        //============================================================
        // aux functions and setup
        //------------------------------------------------------------

        var x = d3.scaleLinear().range([0, 2 * Math.PI]);
        var y = d3.scaleSqrt();

        var partition = d3.partition();//@todo .sort(sort);

        var node, availableWidth, availableHeight, radius;
        var prevPositions = {};

        var arc = d3.arc()
            .startAngle(function(d) {return Math.max(0, Math.min(2 * Math.PI, x(d.x))) })
            .endAngle(function(d) {return Math.max(0, Math.min(2 * Math.PI, x(d.x + d.dx))) })
            .innerRadius(function(d) {return Math.max(0, y(d.y)) })
            .outerRadius(function(d) {return Math.max(0, y(d.y + d.dy)) });

        function rotationToAvoidUpsideDown(d) {
            var centerAngle = computeCenterAngle(d);
            if(centerAngle > 90){
                return 180;
            }
            else {
                return 0;
            }
        }

        function computeCenterAngle(d) {
            var startAngle = Math.max(0, Math.min(2 * Math.PI, x(d.x)));
            var endAngle = Math.max(0, Math.min(2 * Math.PI, x(d.x + d.dx)));
            var centerAngle = (((startAngle + endAngle) / 2) * (180 / Math.PI)) - 90;
            return centerAngle;
        }

        function computeNodePercentage(d) {
            var startAngle = Math.max(0, Math.min(2 * Math.PI, x(d.x)));
            var endAngle = Math.max(0, Math.min(2 * Math.PI, x(d.x + d.dx)));
            return (endAngle - startAngle) / (2 * Math.PI);
        }

        function labelThresholdMatched(d) {
            var startAngle = Math.max(0, Math.min(2 * Math.PI, x(d.x)));
            var endAngle = Math.max(0, Math.min(2 * Math.PI, x(d.x + d.dx)));

            var size = endAngle - startAngle;
            return size > labelThreshold;
        }

        // When zooming: interpolate the scales.
        function arcTweenZoom(e,i) {
            var xd = d3.interpolate(x.domain(), [node.x, node.x + node.dx]),
                yd = d3.interpolate(y.domain(), [node.y, 1]),
                yr = d3.interpolate(y.range(), [node.y ? 20 : 0, radius]);

            if (i === 0) {
                return function() {return arc(e);}
            }
            else {
                return function (t) {
                    x.domain(xd(t));
                    y.domain(yd(t)).range(yr(t));
                    return arc(e);
                }
            };
        }

        function arcTweenUpdate(d) {
            var ipo = d3.interpolate({x: d.x0, dx: d.x1-d.x0, y: d.y0, dy: d.y1-d.y0}, d);

            return function (t) {
                var b = ipo(t);

                d.x0 = b.x;
                d.x1 = b.x+b.dx;
                d.y0 = b.y;
                d.y1 = b.y+b.dy;

                return arc(b);
            };
        }

        function updatePrevPosition(node) {
            var k = key(node);
            if(! prevPositions[k]) prevPositions[k] = {};
            var pP = prevPositions[k];
            pP.dx = node.dx;
            pP.x = node.x;
            pP.dy = node.dy;
            pP.y = node.y;
        }

        function storeRetrievePrevPositions(nodes) {
            nodes.forEach(function(n){
                var k = key(n);
                var pP = prevPositions[k];
                //console.log(k,n,pP);
                if( pP ){
                    n.x1 = pP.x+pP.dx;
                    n.x0 = pP.x;
                    n.y1 = pP.y+pP.dy;
                    n.y0 = pP.y;
                }
                else {
                    n.x1 = n.x+n.dx;
                    n.x0 = n.x;
                    n.y1 = n.y+n.dy;
                    n.y0 = n.y;
                }
                updatePrevPosition(n);
            });
        }

        function zoomClick(d) {
            var labels = container.selectAll('text')
            var path = container.selectAll('path')

            // fade out all text elements
            labels.transition().attr("opacity",0);

            // to allow reference to the new center node
            node = d;

            path.transition().duration(duration)
                .attrTween("d", arcTweenZoom)
                .each('end', function(e) {
                    // partially taken from here: http://bl.ocks.org/metmajer/5480307
                    // check if the animated element's data e lies within the visible angle span given in d
                    if(e.x >= d.x && e.x < (d.x + d.dx) ){
                        if(e.depth >= d.depth){
                            // get a selection of the associated text element
                            var parentNode = d3.select(this.parentNode);
                            var arcText = parentNode.select('text');

                            // fade in the text element and recalculate positions
                            arcText.transition().duration(duration)
                                .text( function(e){return labelFormat(e) })
                                .attr("opacity", function(d){
                                    if(labelThresholdMatched(d)) {
                                        return 1;
                                    }
                                    else {
                                        return 0;
                                    }
                                })
                                .attr("transform", function() {
                                    var width = this.getBBox().width;
                                    if(e.depth === 0)
                                        return "translate(" + (width / 2 * - 1) + ",0)";
                                    else if(e.depth === d.depth){
                                        return "translate(" + (y(e.y) + 5) + ",0)";
                                    }
                                    else {
                                        var centerAngle = computeCenterAngle(e);
                                        var rotation = rotationToAvoidUpsideDown(e);
                                        if (rotation === 0) {
                                            return 'rotate('+ centerAngle +')translate(' + (y(e.y) + 5) + ',0)';
                                        }
                                        else {
                                            return 'rotate('+ centerAngle +')translate(' + (y(e.y) + width + 5) + ',0)rotate(' + rotation + ')';
                                        }
                                    }
                                });
                        }
                    }
                })
        }

        //============================================================
        // chart function
        //------------------------------------------------------------
        var renderWatch = nv.utils.renderWatch(dispatch);

        function chart(selection) {
            renderWatch.reset();

            selection.each(function(data) {
                container = d3.select(this);
                availableWidth = nv.utils.availableWidth(width, container, margin);
                availableHeight = nv.utils.availableHeight(height, container, margin);
                radius = Math.min(availableWidth, availableHeight) / 2;

                y.range([0, radius]);

                // Setup containers and skeleton of chart
                var wrap = container.select('g.nvd3.nv-wrap.nv-sunburst');
                if(!wrap[0] || !wrap[0][0] ) {
                    wrap = container.append('g')
                        .attr('class', 'nvd3 nv-wrap nv-sunburst nv-chart-' + id)
                        .attr('transform', 'translate(' + ((availableWidth / 2) + margin.left + margin.right) + ',' + ((availableHeight / 2) + margin.top + margin.bottom) + ')');
                } else {
                    wrap.attr('transform', 'translate(' + ((availableWidth / 2) + margin.left + margin.right) + ',' + ((availableHeight / 2) + margin.top + margin.bottom) + ')');
                }

                container.on('click', function (event,d, i) {
                    dispatch.call('chartClick', this, {
                        data: d,
                        index: d.index,
                        pos: event,
                        id: id
                    });
                });

                partition(modes[mode] || modes["count"]);

                //reverse the drawing order so that the labels of inner
                //arcs are drawn on top of the outer arcs.
                var nodes = partition.nodes(data[0]).reverse()

                storeRetrievePrevPositions(nodes);
                var cG = wrap.selectAll('.arc-container').data(nodes, key)

                //handle new datapoints
                var cGE = cG.enter()
                    .append("g")
                    .attr("class",'arc-container')

                var pathAppend=cGE.append("path")
                    .attr("d", arc)
                    .style("fill", function (d) {
                        if (d.color) {
                            return d.color;
                        }
                        else if (groupColorByParent) {
                            return color((d.children ? d : d.parent).name);
                        }
                        else {
                            return color(d.name);
                        }
                    })
                    .style("stroke", "#FFF")
                    .on("click", function(event,d,i){
                        zoomClick(d);
                        dispatch.call('elementClick', this, {
                            data: d,
                            index: d.index
                        })
                    })
                    .on('mouseover', function(event,d,i){
                        setCoordinates(event.pageX, event.pageY);
                        d3.select(this).classed('hover', true).style('opacity', 0.8);
                        dispatch.call('elementMouseover', this, {
                            data: d,
                            color: d3.select(this).style("fill"),
                            percent: computeNodePercentage(d)
                        });
                    })
                    .on('mouseout', function(event,d,i){
                        d3.select(this).classed('hover', false).style('opacity', 1);
                        dispatch.call('elementMouseout', this, {
                            data: d
                        });
                    })
                    .on('mousemove', function(event,d,i){
                        dispatch.call('elementMousemove', this, {
                            data: d
                        });
                    });

                ///Iterating via each and selecting based on the this
                ///makes it work ... a cG.selectAll('path') doesn't.
                ///Without iteration the data (in the element) didn't update.
                cG.each(function(d){
                    d3.select(this).select('path')
                        .transition().duration(duration)
                        .attrTween('d', arcTweenUpdate);
                });

                if(showLabels){
                    //remove labels first and add them back
                    cG.selectAll('text').remove();

                    //this way labels are on top of newly added arcs
                    cG.append('text')
                        .text( function(e){ return labelFormat(e)})
                        .transition().duration(duration)
                        .attr("opacity", function(d){
                            if(labelThresholdMatched(d)) {
                                return 1;
                            }
                            else {
                                return 0;
                            }
                        })
                        .attr("transform", function(d) {
                            var width = this.getBBox().width;
                            if(d.depth === 0){
                                return "rotate(0)translate(" + (width / 2 * -1) + ",0)";
                            }
                            else {
                                var centerAngle = computeCenterAngle(d);
                                var rotation = rotationToAvoidUpsideDown(d);
                                if (rotation === 0) {
                                    return 'rotate('+ centerAngle +')translate(' + (y(d.y) + 5) + ',0)';
                                }
                                else {
                                    return 'rotate('+ centerAngle +')translate(' + (y(d.y) + width + 5) + ',0)rotate(' + rotation + ')';
                                }
                            }
                        });
                }

                //zoom out to the center when the data is updated.
                zoomClick(nodes[nodes.length - 1])


                //remove unmatched elements ...
                cG.exit()
                    .transition().duration(duration)
                    .attr('opacity',0)
                    .each('end',function(d){
                        var k = key(d);
                        prevPositions[k] = undefined;
                    })
                    .remove();
            });


            renderWatch.renderEnd('sunburst immediate');
            return chart;
        }

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        chart.dispatch = dispatch;
        chart.options = nv.utils.optionsFunc.bind(chart);

        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            width:      {get: function(){return width;}, set: function(_){width=_;}},
            height:     {get: function(){return height;}, set: function(_){height=_;}},
            mode:       {get: function(){return mode;}, set: function(_){mode=_;}},
            id:         {get: function(){return id;}, set: function(_){id=_;}},
            duration:   {get: function(){return duration;}, set: function(_){duration=_;
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                }},
            groupColorByParent: {get: function(){return groupColorByParent;}, set: function(_){groupColorByParent=!!_;}},
            showLabels: {get: function(){return showLabels;}, set: function(_){showLabels=!!_}},
            labelFormat: {get: function(){return labelFormat;}, set: function(_){labelFormat=_}},
            labelThreshold: {get: function(){return labelThreshold;}, set: function(_){labelThreshold=_}},
            sort: {get: function(){return sort;}, set: function(_){sort=_}},
            key: {get: function(){return key;}, set: function(_){key=_}},
            // options that require extra logic in the setter
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    != undefined ? _.top    : margin.top;
                    margin.right  = _.right  != undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom != undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   != undefined ? _.left   : margin.left;
                }},
            color: {get: function(){return color;}, set: function(_){
                    color=nv.utils.getColor(_);
                }}
        });

        nv.utils.initOptions(chart);
        return chart;
    };
    nv.models.sunburstChart = function() {
        "use strict";

        //============================================================
        // Public Variables with Default Settings
        //------------------------------------------------------------

        var sunburst = nv.models.sunburst();
        var tooltip = nv.models.tooltip();

        var margin = {top: 30, right: 20, bottom: 20, left: 20}
            , width = null
            , height = null
            , color = nv.utils.defaultColor()
            , showTooltipPercent = false
            , id = Math.round(Math.random() * 100000)
            , defaultState = null
            , noData = null
            , duration = 250
            , t = d3.transition()
            .duration(duration)
            .ease(d3.easeLinear)
            , dispatch = d3.dispatch('stateChange', 'changeState','renderEnd');


        //============================================================
        // Private Variables
        //------------------------------------------------------------

        var renderWatch = nv.utils.renderWatch(dispatch);

        tooltip
            .duration(0)
            .headerEnabled(false)
            .valueFormatter(function(d){return d;});

        //============================================================
        // Chart function
        //------------------------------------------------------------

        function chart(selection) {
            renderWatch.reset();
            renderWatch.models(sunburst);

            selection.each(function(data) {
                var container = d3.select(this);

                nv.utils.initSVG(container);

                var availableWidth = nv.utils.availableWidth(width, container, margin);
                var availableHeight = nv.utils.availableHeight(height, container, margin);

                chart.update = function() {
                    if (duration === 0) {
                        container.call(chart);
                    } else {
                        container.transition().duration(duration).call(chart);
                    }
                };
                chart.container = container;

                // Display No Data message if there's nothing to show.
                if (!data || !data.length) {
                    nv.utils.noData(chart, container);
                    return chart;
                } else {
                    container.selectAll('.nv-noData').remove();
                }

                sunburst.width(availableWidth).height(availableHeight).margin(margin);
                container.call(sunburst);
            });

            renderWatch.renderEnd('sunburstChart immediate');
            return chart;
        }

        //============================================================
        // Event Handling/Dispatching (out of chart's scope)
        //------------------------------------------------------------

        sunburst.dispatch.on('elementMouseover.tooltip', function(evt) {
            evt.series = {
                key: evt.data.name,
                value: (evt.data.value || evt.data.size),
                color: evt.color,
                percent: evt.percent
            };
            if (!showTooltipPercent) {
                delete evt.percent;
                delete evt.series.percent;
            }
            tooltip.data(evt).hidden(false);
        });

        sunburst.dispatch.on('elementMouseout.tooltip', function(evt) {
            tooltip.hidden(true);
        });

        sunburst.dispatch.on('elementMousemove.tooltip', function(evt) {
            tooltip();
        });

        //============================================================
        // Expose Public Variables
        //------------------------------------------------------------

        // expose chart's sub-components
        chart.dispatch = dispatch;
        chart.sunburst = sunburst;
        chart.tooltip = tooltip;
        chart.options = nv.utils.optionsFunc.bind(chart);

        // use Object get/set functionality to map between vars and chart functions
        chart._options = Object.create({}, {
            // simple options, just get/set the necessary values
            noData:             {get: function(){return noData;},               set: function(_){noData=_;}},
            defaultState:       {get: function(){return defaultState;},         set: function(_){defaultState=_;}},
            showTooltipPercent: {get: function(){return showTooltipPercent;},   set: function(_){showTooltipPercent=_;}},

            // options that require extra logic in the setter
            color: {get: function(){return color;}, set: function(_){
                    color = _;
                    sunburst.color(color);
                }},
            duration: {get: function(){return duration;}, set: function(_){
                    duration = _;
                    renderWatch.reset(duration);
                    t = d3.transition()
                        .duration(duration)
                        .ease(d3.easeLinear);
                    sunburst.duration(duration);
                }},
            margin: {get: function(){return margin;}, set: function(_){
                    margin.top    = _.top    !== undefined ? _.top    : margin.top;
                    margin.right  = _.right  !== undefined ? _.right  : margin.right;
                    margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
                    margin.left   = _.left   !== undefined ? _.left   : margin.left;
                    sunburst.margin(margin);
                }}
        });
        nv.utils.inheritOptions(chart, sunburst);
        nv.utils.initOptions(chart);
        return chart;

    };

    nv.version = "1.8.12";
})();
//# sourceMappingURL=nv.d3.js.map
