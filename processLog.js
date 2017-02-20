// usage: node processLog in.log > out.log

var fs = require("fs");

if (process.argv.length !== 3) {
  console.error("Please provide an input file.")
  process.exit(1);
}

var log = JSON.parse('[' + (fs.readFileSync(process.argv[2]) + '').replace(/\n+$/g, '').split('\n').join(',') + ']');
var semanticLog = [];
var pathCreators = {}; // Continually-updated mapping of who created which paths.

function semanticLogLine(time, teacher, classroom, group, user, action, data) {
  this.time = time;
  this.teacher = teacher;
  this.classroom = classroom;
  this.group = group;
  this.user = user;
  this.action = action;
  this.data = data;
}

semanticLogLine.prototype.toString = function() {
  var semanticAction;
  switch(this.action) {
    case "createdPath":
      semanticAction = "created a new path: "; break;
    case "addedPoint":
      semanticAction = "added a point: "; break;
    case "movedCursor":
      semanticAction = "moved their cursor: "; break;
    case "erasedScreen":
      semanticAction = "cleared the screen: "; break;
    case "undidPath":
      semanticAction = "undid the path: "; break;
    case "erasedPoints":
      semanticAction = "erased the points: "; break;
    case "movedPointer":
      semanticAction = "moved their pointer to: "; break;
  }
  return "[" + this.time + "] " + [this.teacher, this.classroom, this.group, this.user].join(".") + " " + semanticAction + JSON.stringify(this.data);
}

log.forEach(function(line) {
  var time = line.ts;

  line.deltas.forEach(function(delta) {
    var splitPath = delta.path.split(".");
    if (splitPath[0] !== "teachers" || splitPath[2] !== "classrooms" || splitPath[4] !== "groups" || splitPath[6] !== "states")
      return;

    var teacher = splitPath[1];
    var classroom = splitPath[3];
    var group = splitPath[5];
    var phase = splitPath[7];

    if (splitPath[8] === "paths") {
      if (typeof splitPath[9] === "undefined") {
        var changedPaths = Object.keys(delta.delta);
        changedPaths.forEach(function(path) {
          if (delta.delta[path][0] == 1 && delta.delta[path][1] == 1 && delta.delta[path][2].length > 0) {
            delta.delta[path][2].forEach(function(newPath) {
              newPath.path = path;
              semanticLog.push(new semanticLogLine(time, teacher, classroom, group, newPath.creator, "createdPath", newPath));
              pathCreators[teacher + '.' + classroom + '.' + group + '.' + path] = newPath.creator;
            })
          } else {
            // prepare path, ignore
          }
        })
      } else {
        var path = splitPath[9];
        var edit = delta.delta[Object.keys(delta.delta)[0]];
        if (edit[0] == 1 && edit[1] == 1) {
          var point = edit[2];
          point.path = path;
          if ("creator" in point) {
            semanticLog.push(new semanticLogLine(time, teacher, classroom, group, point.creator, "createdPath", point));
            pathCreators[teacher + '.' + classroom + '.' + group + '.' + path] = point.creator;
          } else
            semanticLog.push(new semanticLogLine(time, teacher, classroom, group,
              pathCreators[teacher + '.' + classroom + '.' + group + '.' + path], "addedPoint", point));
        }
      }
    } else if (splitPath[8] == "cursors") {
      var user = Object.keys(delta.delta)[0];
      semanticLog.push(new semanticLogLine(time, teacher, classroom, group, user, "movedCursor", 3000 - delta.delta[Object.keys(delta.delta)][2]));
    } else if (Object.keys(delta.delta)[0] == "paths") {
      if (Object.keys(delta.delta.paths).length > 1) {
        semanticLog.push(new semanticLogLine(time, teacher, classroom, group, null, "erasedScreen", ""));
      } else if (delta.delta.paths[Object.keys(delta.delta.paths)[0]][0] == 1) {
        var path = Object.keys(delta.delta.paths)[0];
        semanticLog.push(new semanticLogLine(time, teacher, classroom, group,
          pathCreators[teacher + '.' + classroom + '.' + group + '.' + path], "undidPath", parseInt(path)));
      } else {
        var path = Object.keys(delta.delta.paths)[0];
        var ptsErased = Object.keys(delta.delta.paths[path]).filter(function(point) { return point != 0; });

        semanticLog.push(new semanticLogLine(time, teacher, classroom, group, null, "erasedPoints", {path: path, points: ptsErased}));
      }
    } else if (splitPath[8] == "pointers") {
      var user = splitPath[9];
      semanticLog.push(new semanticLogLine(time, teacher, classroom, group, user, "movedPointer", {x: ("x" in delta.delta ? delta.delta.x[2] : "?"), y: ("y" in delta.delta ? delta.delta.y[2] : "?")}));
    }
  });
});

semanticLog.forEach(function(line) {
  console.log(line.toString());
})
