## NVD3 - A reusable D3 charting library

Inspired by the work of Mike Bostock's [Towards Reusable Charts](http://bost.ocks.org/mike/chart/), and supported by a combined effort of [Novus](http://www.novus.com) and the NVD3 community.

[View Examples](http://nvd3-community.github.io/nvd3/) | [NEW Documentation!](http://nvd3-community.github.io/nvd3/examples/documentation.html) | Development build status: [![Build Status](https://travis-ci.org/novus/nvd3.svg?branch=master)](https://travis-ci.org/novus/nvd3)


## Usage
Simply add the `nv.d3` assets to your project and include them in your HTML.

```
<link href="nv.d3.min.css" rel="stylesheet">
<script src="nv.d3.min.js"></script>
```

*  `nv.d3.js` should appear after `d3.js` is included.
* Prefer minified assets (`.min`) for production.

### Dependencies

NVD3 is recommended to go with [d3.js](http://d3js.org/) version 7.8.5 and later as (https://github.com/d3/d3/releases/tag/v7.8.5) is the most recent d3 v3 release. 

**Minimum D3 version required: 7.8.5**

For a D3v4 Version, see the work in progress at the [nvd3 organization](http://github.com/nvd3/nvd3)

**Differences in D3 v3 and v7**

**1.Axes and Scales:**
While the core concepts of axes and scales remain similar, there are improvements and refinements in v7 for creating scales and axes, offering more control and customization options.
   * d3.scale.linear() = d3.scaleLinear()
   * d3.scale.ordinal() = d3.scaleOrdinal()
   * d3.svg.arc()= d3.arc()
   * d3.svg.axis.orient('bottom') = d3.axisBottom()
   * render_end = chartinstance.dispatch.on('renderEnd')
   * d3.event.pageX() = d3.pageX()
   * d3.time.format() = d3.timeFormat()
   * d3.time.Scale() = d3.scaleTime()
   * Changes in Mouse Event Callbacks:
     The arguments passed in mouse events callback functions changed from data, index => event, data, index.
        a.In D3 v3, the mouse event callback functions received data and index as the first and second arguments.
        b.In D3 v7, the order is changed, and the callback functions receive events as the first argument, followed by data and index.
          This change aligns with a more standard convention where the event object is the first parameter in callback functions.

**2.Immutability in D3 v7:**

a.D3 v7 introduces a more immutable approach to selections. In the new model, selections are immutable, meaning that methods called on selections do not modify the existing selection but instead return a new selection.

b.This immutability simplifies the understanding of code behavior, as it avoids unexpected side effects that might occur when methods modify the original selection.

c.In D3 v7, the selectAll method returns a new immutable selection.The attr and style methods are called on the selection, but they don't modify the original selection. Instead, they return a new selection with the specified attributes and styles.
      
#D3 v3

  var circles = d3.selectAll("circle");
  circles.attr("r", 10);
  circles.style("fill", "blue");

#D3 v7

  const circles = d3.selectAll("circle")
  .attr("r", 10)
  .style("fill", "blue");


## Supported Browsers
NVD3 runs best on WebKit based browsers.

* Google Chrome: latest version
* Opera 15+ (i.e. webkit version)
* Safari: latest version
* Firefox: latest version
* Internet Explorer: 10+

## Do we support D3 v4.x and above?

Yes, we do support till d3 version 7.8.5

## Changelog

**1.8.6** Changes:

* Community bugfixes

**1.8.5** Changes:

* Community bugfixes
* New force-directed graph

**1.8.4** Changes:

* Community bugfixes including tooltip fixes.

**1.8.3** Changes:

* Lots of community bugfixes
* Added force-directed chart

**1.8.2** Changes:

* Lots of community bugfixes and a few extra minor features

**1.8.1** Changes:

* Tooltips were refactored - If you have customized your tooltips, note that you may need to adjust your custom functions as the data passed has changed format.  See the new [tooltip options](https://nvd3-community.github.io/nvd3/examples/documentation.html#tooltip) for more details.
* Added boxplot charts | [example](https://nvd3-community.github.io/nvd3/examples/boxPlot.html)
* Added candlestick charts | [example](https://nvd3-community.github.io/nvd3/examples/candlestickChart.html)
* Added extra donut chart abilities | [examples](https://nvd3-community.github.io/nvd3/examples/monitoringChart.html)
* Added sunburst Charts | [example](https://nvd3-community.github.io/nvd3/examples/sunburst.html)
* Time Series | [example](https://nvd3-community.github.io/nvd3/examples/TimeSeries.html)
* Another legend format available | [example](https://nvd3-community.github.io/nvd3/examples/stackedAreaChart.html)
* Lots of bug fixes (see closed issues)
* (for all examples, see [here](https://nvd3-community.github.io/nvd3/))

**1.7.1** Changes:

* Fixed axis.staggerLabels bug.
* Fixed Karma unit tests.
* Fixed chart test pages.
* Merged in nvd3-community changes and development branch.

**1.7.0** Changes:

* Fixes around 20 small bugs.
* Fixed the notorious slowness of line charts and scatter plots on chrome
* Combined the scatterChart and scatterChartWithLines models
* Combined the linePlusBarChart and linePlusBarChartWithFocus models.
* renamed some of the options (see the new documentation for what options are available for each chart)
* Completed the migration of the option functions to an object format which allows the generation of
the documentation in an automated way.  Not everything has a description yet, but check it out!
* Added extra options to the donut charts based on features that will be in d3 3.5.  The donut example page
loads the latest d3 from their 3.5 branch so keep that in mind.
* Added an example of the parallelCoordinates chart.
* Fixed up the half-done OHLC bar chart, and made an example for it as well.

**1.6.0** Changes:

* includes about a dozen bug fixes and pull requests I fixed and merged in
from the issues/pulls from the original project.
* It also standardized all indention

---

# Current development focus
- Review outstanding pull requests and issues.
- Try to find an easy way to actually document usage and all chart options.
- Improve the testing framework.
- Setup continuous integration.

---

# Bugs

Found a bug?  Check out the latest from the `master` branch and make sure it's not already fixed first! If you don't see a related fix, please [open an issue](https://github.com/novus/nvd3/issues).

---

# Optional dependencies

Including [Fastdom](https://github.com/wilsonpage/fastdom) in your project can greatly increase the performance of the line chart (particularly in Firefox and Internet Explorer) by batching DOM read and write operations to avoid [layout thrashing](http://wilsonpage.co.uk/preventing-layout-thrashing/). NVD3 will take advantage of Fastdom if present.

---

# Contributing

If one of [the existing models](https://github.com/novus/nvd3/tree/master/src/models)
doesn't meet your needs, fork the project, implement the model and an example using it,
send us a pull request, for consideration for inclusion in the project.

If you'd like to contribute consistently, show me what you've got with some good pull requests and you may get added to the nvd3-community org!

### A few rules for pull requests

1. Please commit to the `master` branch
2. Do NOT check in anything under the `build` directory, it clutters up the commit and just gets overwritten later.
3. All new features must come with unit test coverage
4. Bug fixes should come with unit tests that prove their fix

If you want to test your changes using the example pages,
you'll have to run `grunt production` to build the items into the `build` directory.
You must do this before your changes show up in the examples, as they link to the build directory
in order to properly show off the finished product.
Please remember to NOT include the build files in your commit though,
only include the source files you changed!

### Tips for Testing
* Unit tests were written in Karma and Mocha. Follow instructions in **Building Latest** to get npm packages setup. This may not work on Windows machines.
* Run `bower install` to get bower dependencies.
* Run `grunt` to start the unit tests.
* Also visually inspect the HTML pages in the **examples/ and test/ folders**.  Make sure there are no glaring errors.
* Novus now uses Travis CI for continuous integration. Visit [our travis build page](https://travis-ci.org/novus/nvd3/) to see the latest status.

#### Meteor Tinytests
* Any Meteor-specific features can be tested from the command line using `tinytest` and [Spacejam](https://www.npmjs.com/package/spacejam)
* `spacejam` can be installed by running `npm install -g spacejam`.
* Tinytests can then be executed by running `spacejam test-packages ./` from this project's root.

---

## Building latest

1. First clone the repository and checkout the `master` branch
2. make sure `nodejs` is installed via your system's package manager.
3. Install `grunt`, `grunt-cli`, and `bower`:  `npm install -g grunt grunt-cli bower`

> have node download nvd3's required modules with:  `npm install`

> build with:  `grunt production`

You should now have a `build` directory with the js and css files within.

---
