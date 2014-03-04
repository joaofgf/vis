/**
 * Created by Alex on 2/27/14.
 */



function DOMAxis (range,frame, constants) {
  this.frame = frame;
  this.range = range;
  this.constants = constants;
  this.duration = this.range.end - this.range.start; // in milliseconds
  this.minColumnWidth = 100;

  this._drawElements();
  this._update();
}

DOMAxis.prototype._drawElements = function () {
  this.mainBox = document.createElement("div");
  this.mainBox.className = "mainBox";
  this.mainBox.style.position = "absolute";
  this.mainBox.style.top = "-1px";
  this.mainBox.style.left = "-1px";
  this.mainBox.style.width = this.constants.width + "px";
  this.mainBox.style.height = this.constants.barHeight + "px";
  this.frame.appendChild(this.mainBox);

  this.leftText = document.createElement("div");
  this.leftText.innerHTML = moment(this.range.start);
  this.leftText.style.position = "absolute";
  this.leftText.style.display = "inline";
  this.leftText.style.left = "5px";
  this.mainBox.appendChild(this.leftText);

  this.rightText = document.createElement("div");
  this.rightText.innerHTML = moment(this.range.end);
  this.rightText.style.position = "absolute";
  this.rightText.style.display = "inline";
  this.mainBox.appendChild(this.rightText);


//  this.leftText = document.createElement("div");
//    .append("text")
//    .attr("x", 5)
//    .attr("y", 20)
//    .attr("font-size", 14)
//    .text(moment(this.range.start));
//
//  this.rightText = d3.select(this.svgId)
//    .append("text")
//    .attr("y", 20)
//    .attr("font-size", 14)
//    .text(moment(this.range.end));
//  this.rightText.attr("x", this.constants.width - 5 - this.rightText.node().getBBox().width);
//
  this.dateLabels = {};
  this.markerLines = {};
};

DOMAxis.prototype._createMarkerLine = function (index) {
  var line = document.createElement("div");
      line.className = "line";
      line.style.display = "inline";
      line.style.width = "1px";
      line.style.height = this.constants.height + "px";
      line.style.position = "absolute";
      line.style.padding = "0px";
      line.style.spacing = "0px";
  this.frame.appendChild(line);
  this.markerLines[index] = {DOM: line}
};

DOMAxis.prototype._createDateLabel = function (index) {
  var text = document.createElement("div");
      text.className = "text";
      text.style.display = "inline";
      text.style.position = "absolute";
      text.style.whiteSpace = "nowrap";
      text.style.top = "40px";
  this.frame.appendChild(text);
  this.dateLabels[index] = {DOM: text, active: false};
};

DOMAxis.prototype._update = function () {
  this.duration = this.range.end - this.range.start; // in milliseconds
  this.leftText.innerHTML = moment(this.range.start).format("DD-MM-YYYY HH:mm:ss");

  this.rightText.innerHTML = moment(this.range.end).format("DD-MM-YYYY");
  this.rightText.style.left = String(this.constants.width - 5 - this.rightText.offsetWidth) + "px";

  this.msPerPixel = this.duration / this.constants.width;
  this.columnDuration = this.minColumnWidth * this.msPerPixel;

  var milliSecondScale = [1, 10, 50, 100, 250, 500];
  var secondScale = [1, 5, 15, 30];
  var minuteScale = [1, 5, 15, 30];
  var hourScale = [1, 3, 6, 12];
  var dayScale = [1, 2, 3, 5, 10, 15];
  var monthScale = [1, 2, 3, 4, 5, 6];
  var yearScale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 75, 100, 150, 250, 500, 1000];
  var multipliers = [1, 1000, 60000, 3600000, 24 * 3600000, 30 * 24 * 3600000, 365 * 24 * 3600000];
  var scales = [milliSecondScale, secondScale, minuteScale, hourScale, dayScale, monthScale, yearScale];
  var formats = ["SSS", "mm:ss", "hh:mm:ss", "DD HH:mm", "DD-MM", "MM-YYYY", "YYYY"];
  var indices = this._getAppropriateScale(scales, multipliers);
  var scale = scales[indices[0]][indices[1]] * multipliers[indices[0]];

  var dateCorrection = (this.range.start.valueOf() % scale) + 3600000;

  for (var i = 0; i < 30; i++) {
    var date = this.range.start + i * scale - dateCorrection;
    if (((i + 1) * scale - dateCorrection) / this.msPerPixel > this.constants.width + 200) {
      if (this.dateLabels.hasOwnProperty(i)) {
        this.frame.removeChild(this.dateLabels[i].DOM);
        delete this.dateLabels[i]
      }
      if (this.markerLines.hasOwnProperty(i)) {
        this.frame.removeChild(this.markerLines[i].DOM)
        delete this.markerLines[i]
      }
    }
    else {
      if (!this.dateLabels.hasOwnProperty(i)) {
        this._createDateLabel(i);
      }
      if (!this.markerLines.hasOwnProperty(i)) {
        this._createMarkerLine(i);
      }

      this.dateLabels[i].DOM.innerHTML = moment(date).format(formats[indices[0]]);
      this.dateLabels[i].DOM.style.left = String(Math.round((i * scale - dateCorrection) / this.msPerPixel + 5)) + "px";

      this.markerLines[i].DOM.style.left = String(Math.round((i * scale - dateCorrection) / this.msPerPixel)) + "px";
    }
  }
};

DOMAxis.prototype._getAppropriateScale = function (scales, multipliers) {
  for (var i = 0; i < scales.length; i++) {
    for (var j = 0; j < scales[i].length; j++) {
      if (scales[i][j] * multipliers[i] > this.columnDuration) {
        return [i, j]
      }
    }
  }
  return false;
};


/**
 * @constructor DOMTimeline
 * Create a graph visualization, displaying nodes and edges.
 *
 * @param {Element} container   The DOM element in which the Graph will
 *                                  be created. Normally a div element.
 * @param {Object} items        An object containing parameters
 *                              {Array} nodes
 *                              {Array} edges
 * @param {Object} options      Options
 */
function DOMTimeline (container, items, options) {
  this.constants = {
    width: 1400,
    height: 400,
    barHeight: 60
  };

  var now = moment().hours(0).minutes(0).seconds(0).milliseconds(0);
  this.range = {
    start: now.clone().add('days', -3).valueOf(),
    end: now.clone().add('days', 4).valueOf()
  };

  this.items = {};
  this.sortedItems = [];
  this.activeItems = {};
  this.sortedActiveItems = [];

  this._createItems(items);

  this.container = container;
  this._createFrame();


  this.axis = new DOMAxis(this.range,this.frame,this.constants);

  var me = this;
  this.hammer = Hammer(this.frame, {
    prevent_default: true
  });
  this.hammer.on('tap',       me._onTap.bind(me) );
  this.hammer.on('doubletap', me._onDoubleTap.bind(me) );
  this.hammer.on('hold',      me._onHold.bind(me) );
  this.hammer.on('pinch',     me._onPinch.bind(me) );
  this.hammer.on('touch',     me._onTouch.bind(me) );
  this.hammer.on('dragstart', me._onDragStart.bind(me) );
  this.hammer.on('drag',      me._onDrag.bind(me) );
  this.hammer.on('dragend',   me._onDragEnd.bind(me) );
  this.hammer.on('release',   me._onRelease.bind(me) );
  this.hammer.on('mousewheel',me._onMouseWheel.bind(me) );
  this.hammer.on('DOMMouseScroll',me._onMouseWheel.bind(me) ); // for FF
  this.hammer.on('mousemove', me._onMouseMoveTitle.bind(me) );

  this._update();

}

DOMTimeline.prototype._createFrame = function() {
  this.frame = document.createElement("div");
  this.frame.style.width = this.constants.width + "px";
  this.frame.style.height = this.constants.height + "px";
  this.frame.style.position = "relative";
  this.frame.className = "mainFrame";
  this.container.appendChild(this.frame);
};

DOMTimeline.prototype._createItems = function (items) {
  for (var i = 0; i < items.length; i++) {
    this.items[items[i].id] = new Item(items[i], this.constants);
    this.sortedItems.push(this.items[items[i].id]);
  }
  this._sortItems(this.sortedItems);
};

DOMTimeline.prototype._sortItems = function (items) {
  items.sort(function (a, b) {
    return a.start - b.start
  });
};

DOMTimeline.prototype._getPointer = function (touch) {
  return {
    x: touch.pageX,
    y: touch.pageY
  };
};

DOMTimeline.prototype._onTap = function() {};
DOMTimeline.prototype._onDoubleTap = function() {};
DOMTimeline.prototype._onHold = function() {};
DOMTimeline.prototype._onPinch = function() {};
DOMTimeline.prototype._onTouch = function(event) {};
DOMTimeline.prototype._onDragStart = function(event) {
  this.initialDragPos = this._getPointer(event.gesture.center);
};
DOMTimeline.prototype._onDrag = function(event) {
  var pointer = this._getPointer(event.gesture.center);
  var diffX = pointer.x - this.initialDragPos.x;
//  var diffY = pointer.y - this.initialDragPos.y;

  this.initialDragPos = pointer;

  this.range.start -= diffX * this.axis.msPerPixel;
  this.range.end -= diffX * this.axis.msPerPixel;
  this._update();
};
DOMTimeline.prototype._onDragEnd = function() {};
DOMTimeline.prototype._onRelease = function() {};
DOMTimeline.prototype._onMouseWheel = function(event) {

  var delta = 0;
  if (event.wheelDelta) { /* IE/Opera. */
    delta = event.wheelDelta/120;
  }
  else if (event.detail) { /* Mozilla case. */
    // In Mozilla, sign of delta is different than in IE.
    // Also, delta is multiple of 3.
    delta = -event.detail/3;
  }
  if (delta) {
    var pointer = {x: event.x, y: event.y};
    var center = this.range.start + this.axis.duration * 0.5;
    var zoomSpeed = 0.1;
    var scrollSpeed = 0.1;

    this.range.start = center - 0.5*(this.axis.duration * (1 - delta*zoomSpeed));
    this.range.end = this.range.start + (this.axis.duration * (1 - delta*zoomSpeed));

    var diffX = delta*(pointer.x - 0.5*this.constants.width);
//  var diffY = pointer.y - this.initialDragPos.y;


    this.range.start -= diffX * this.axis.msPerPixel * scrollSpeed;
    this.range.end -= diffX * this.axis.msPerPixel * scrollSpeed;

    this._update();
  }
};
DOMTimeline.prototype._onMouseMoveTitle = function() {};

DOMTimeline.prototype._update = function() {
  this.axis._update();
  this._getActiveItems();
  this._updateItems();
};

DOMTimeline.prototype._getActiveItems = function() {
  // reset all currently active items to inactive
  for (var itemId in this.activeItems) {
    if (this.activeItems.hasOwnProperty(itemId)) {
      this.activeItems[itemId].active = false;
    }
  }

  this.sortedActiveItems = [];
  var rangeStart = this.range.start - 200 * this.axis.msPerPixel;
  var rangeEnd = (this.range.end + 200 * this.axis.msPerPixel);
  for (var itemId in this.items) {
    if (this.items.hasOwnProperty(itemId)) {
      if (this.items[itemId].start >= rangeStart && this.items[itemId].start < rangeEnd ||
          this.items[itemId].end   >= rangeStart && this.items[itemId].end   < rangeEnd) {
        if (this.items[itemId].active == false) {
          this.activeItems[itemId] = this.items[itemId];
        }
        this.activeItems[itemId].active = true;
        this.sortedActiveItems.push(this.activeItems[itemId]);
      }
    }
  }
  this._sortItems(this.sortedActiveItems);

  // cleanup
  for (var itemId in this.activeItems) {
    if (this.activeItems.hasOwnProperty(itemId)) {
      if (this.activeItems[itemId].active == false) {
        this.frame.removeChild(this.activeItems[itemId].DOM);
        this.activeItems[itemId].DOM = null;
        this.frame.removeChild(this.activeItems[itemId].line);
        this.activeItems[itemId].line = null;
        delete this.activeItems[itemId];
      }
    }
  }
};


DOMTimeline.prototype._updateItems = function() {
  for (var i = 0; i < this.sortedActiveItems.length; i++) {
    var item = this.sortedActiveItems[i];
    if (item.DOM == null) {
      item.DOM = document.createElement("div");
      item.DOM.className = "item";
      item.DOM.style.position = "absolute";
      item.DOM.style.display = "inline";
      item.DOM.innerHTML = "hello world";
      this.frame.appendChild(item.DOM);

      item.width = item.DOM.offsetWidth;
      item.DOM.style.width = item.width + "px";


      if (item.end == 0) {
        item.line = document.createElement("div");
        item.line.className = "itemLine";
        item.line.style.position = "absolute";
        item.line.style.width = "2px";
        item.line.style.top = this.constants.barHeight + "px"
        item.line.style.display = "inline";
        this.frame.appendChild(item.line);
      }
    }
    item.DOM.style.left = this._getXforItem(item) + "px";
    item.DOM.style.top = (this._getYforItem(item,i) + this.constants.barHeight) + "px";

    if (item.end == 0) {
      item.line.style.height = item.y + "px";
      item.line.style.left = item.timeX + "px";
    }
    else {
      item.getLength(this.axis.msPerPixel);
      item.DOM.style.width = item.width + "px";
    }
  }
};

DOMTimeline.prototype._getXforItem = function (item) {
  item.timeX = (item.start - this.range.start) / this.axis.msPerPixel;
  if (item.end == 0) {
    item.drawX = item.timeX - item.width * 0.5;
  }
  else {
    item.drawX = item.timeX;
  }
  return item.drawX;
};

DOMTimeline.prototype._getYforItem = function (item, index) {
  var bounds = 10;
  var startIndex = Math.max(0, index - bounds);
  item.level = 0;
  for (var i = startIndex; i < index; i++) {
    var item2 = this.sortedActiveItems[i];
    if (item.drawX <= (item2.drawX + item2.width + 5) && item2.level == item.level) {
      item.level += 1;
    }
  }
  item.y = 100 + 50 * item.level;
  return item.y;
};