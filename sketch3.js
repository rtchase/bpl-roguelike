let canvasSize;
const noiseScale = 0.02;
const POINT_CIRCLE_DIAMETER = 30;
const ICONS_PER_ROW = 7;

let startPoint;
let endPoint;
let graph = createGraph();

let activePoints = new Map();
let activeLinks = [];
const dateGenerated = Date.now();

const iconDescriptions = [
  ["😈", "Boss (All paths end here)"],
  ["💰", "Start: Team Collection (See BPL website)"],
  ["💀", "No chance to poison on any skill"],
  ["🧯", "No chance to ignite for non-crits on any skill"],
  ["🧟", "4L+ skills must be permanent or temporary minions"],
  ["🛡️", "No shield equipped"],
  ["🧙", "4L+ skills cannot have spell tag"],
  ["🪓", "4L+ skills cannot have attack tag"],
  ["🔞", "4L+ skills <= lvl 18"],
  ["🔥", "4L+ skills tooltip has no fire damage"],
  ["❄️", "4L+ skills tooltip has no cold damage"],
  ["⚡", "4L+ skills tooltip has no lightning damage"],
  ["☣️", "4L+ skills tooltip has no chaos damage"],
  ["🔨", "4L+ skills tooltip has no physical damage"],
  ["🔮", "Spell Suppression chance = 0 (inc flask)"],
  ["🏃", "No movement speed on any equipped items (inc flask)"],
  ["🥾", "No Evasion Rating (inc flask)"],
  ["🧲", "No Armor (inc flask)"],
  ["🔴", "No Energy Shield"],
  ["🥤", "No Flasks"],
  ["💔", "No Life Flask"],
  ["🚧", "No Spell Block"],
  ["🦂", "No Perm Auras/Heralds"],
  ["🔪", "Normal rarity mainhand weapon (not disabled)"],
  ["🚪", "Delete 5 portals before the fight"],
  ["🟩", "No Green Gems"],
  ["🟦", "No Blue Gems"],
  ["🟥", "No Red Gems"],
  ["🖤", "All Max Res <= 75"],
  ["🤕", "Life Regen <= 0"],
  ["🌔", "Chaos Inoculation Allocated"],
  ["😩", "No 5L+ skills (inc item provided supports)"],
  ["🟡", "No chance to avoid any elemental ailments"],
  ["🟨", "No immunity to any elemental ailments"],
  ["⭐", "No reduced duration of any elemental ailments"],
  ["💛", "No reduced effect of any elemental ailments"],
  ["🔵", "No Eldritch Battery"],
  ["🩸", "No chance to bleed on any skill"],
  ["🎯", "No Hexes"],
  ["2", "Only 2 Skill Keybinds (all others walk or unbound)"],
  ["🐢", "No guard skills or fortify"],
  ["♿", "No skills with movement tag"],
  ["⚔️", "Deal all hit damage directly (no trap, mine, totem, minion)"],
  ["✨", "Enchant on all possible items (boots, gloves, helm, belt)"],
  ["🩹", "No passive points allocated after lvl 90"],
  ["✋", "No Main Hand Weapon"],
  ["✳️", "Dexterity less than 40"],
  ["⏬", "Intelligence less than 40"],
  ["🅾️", "Strength less than 40"],
  ["☮️", "4L+ Skills crit chance = gem base crit chance"],
];

const icons = iconDescriptions.slice(2).map((id) => id[0]);
const iconDescriptionLookup = new Map(
  iconDescriptions.map((id) => [id[0], id[1]])
);

class ActivePoint {
  constructor(location, icon) {
    this.location = location; // [x, y]
    this.icon = icon; // emoji
  }
}

class ActiveLink {
  constuctor(points) {
    this.points = points; // [startPoint, activePoint2, ..., endpoint]
  }
}

function setup() {
  canvasSize = min(500, windowWidth);
  let canvas = createCanvas(canvasSize, canvasSize);
  canvas.parent("canvas");
  canvas.mouseOver(() => loop());
  canvas.mouseOut(() => noLoop());
  colorMode(HSB);
  noLoop();

  // Poisson Disk Sampling - create a field of points seperated by distance min to max
  // will not always generate a new point per try as solution space fills, resulting in a variable length of points
  let pdsObj = new PoissonDiskSampling(
    {
      shape: [canvasSize * 0.9, canvasSize * 0.9],
      minDistance: 80,
      maxDistance: 120,
      tries: 20,
    },
    random
  );
  startPoint = [canvasSize * 0.45, canvasSize * 0.9];
  endPoint = [canvasSize * 0.45, 0];
  pdsObj.addPoint(startPoint);
  pdsObj.addPoint(endPoint);
  let points = pdsObj.fill().filter((p) => {
    return (
      dist(...p, canvasSize * 0.45, canvasSize * 0.45) <= canvasSize * 0.45
    );
  });

  // Delaunay - takes the field of points and creates a weighted graph
  let delaunay = Delaunator.from(points).triangles;
  let triangles = [];
  for (let i = 0; i < delaunay.length; i += 3) {
    triangles.push([
      points[delaunay[i]],
      points[delaunay[i + 1]],
      points[delaunay[i + 2]],
    ]);
  }
  for (let t of triangles) {
    graph.addLink(t[0], t[1], {
      weight: dist(...t[0], ...t[1]),
    });
    graph.addLink(t[1], t[2], {
      weight: dist(...t[1], ...t[2]),
    });
    graph.addLink(t[2], t[0], {
      weight: dist(...t[2], ...t[0]),
    });
  }

  // aStar - find unique traversal solutions for our graph
  // store these paths and points ready for rendering
  for (let i = 0; i < canvasSize / 50; i++) {
    const pathFinder = ngraphPath.aStar(graph, {
      distance(fromNode, toNode, link) {
        return link.data.weight;
      },
    });
    const foundPath = pathFinder.find(startPoint, endPoint);
    if (foundPath.length === 0) {
      break;
    }

    //Store the path, while pushing any new nodes into the set with a random icon
    activeLinks.push(foundPath.map((obj) => obj.id));
    foundPath.forEach((fp) => {
      if (!activePoints.has(fp.id)) {
        const randomIconIdx = Math.floor(Math.random() * icons.length);
        let randomIcon = icons.splice(randomIconIdx, 1)[0];

        if (fp.id == startPoint) {
          randomIcon = "💰";
        }
        if (fp.id == endPoint) {
          randomIcon = "😈";
        }
        activePoints.set(fp.id, new ActivePoint(fp.id, randomIcon));
      }
    });

    // select a random node from the path that is not the start or end
    // and remove it from the graph entirely (preventing future paths containing this node)
    const idx = floor(random(1, foundPath.length - 1));
    graph.removeNode(foundPath[idx].id);
  }

  //order the points by y value and recreate the map
  activePoints = new Map(
    [...activePoints].sort((a, b) =>
      a[1].location[1] < b[1].location[1] ? 1 : -1
    )
  );
}

function draw() {
  const canvasTranslation = canvasSize * 0.05; //offset all drawings on canvas
  noStroke();
  fill(40, 50, 60);
  rect(0, 0, canvasSize, canvasSize);
  push();
  strokeWeight(10);
  stroke(40, 80, 20);
  fill(0, 0);
  square(0, 0, canvasSize);
  pop();

  push();
  translate(canvasTranslation, canvasTranslation);

  // draw arrows connecting each node
  activeLinks.forEach((al) => {
    for (let j = 1; j < al.length; j++) {
      arrow(...al[j], ...al[j - 1]);
    }
  });

  // Points
  stroke(0);
  pointcounter = 0;
  let tooltipIcon = "";
  let tooltipRectYStart;
  let tooltipTextY;

  for (const p of activePoints.values()) {
    pointcounter++;
    textSize(16);
    textAlign(CENTER, CENTER);
    fill(0, 0, 100);
    circle(...p.location, POINT_CIRCLE_DIAMETER);
    fill(40, 80, POINT_CIRCLE_DIAMETER);
    if (pointcounter != 1 && pointcounter != activePoints.length) {
      text(
        pointcounter - 1,
        p.location[0],
        p.location[1] - POINT_CIRCLE_DIAMETER
      );
    }
    text(p.icon, p.location[0], p.location[1]);

    if (
      mouseX - canvasTranslation > p.location[0] - POINT_CIRCLE_DIAMETER / 2 &&
      mouseX - canvasTranslation < p.location[0] + POINT_CIRCLE_DIAMETER / 2 &&
      mouseY - canvasTranslation > p.location[1] - POINT_CIRCLE_DIAMETER / 2 &&
      mouseY - canvasTranslation < p.location[1] + POINT_CIRCLE_DIAMETER / 2
    ) {
      // set tooltip vars, draw later so is on top of all other nodes/paths
      tooltipRectYStart = p.location[1] + POINT_CIRCLE_DIAMETER / 2;
      tooltipTextY = p.location[1] + POINT_CIRCLE_DIAMETER;
      tooltipIcon = p.icon;
      if (mouseY > canvasSize / 2) {
        //switch tooltip location to be above icon if mouse is around bottom of canvas
        tooltipRectYStart = p.location[1] - POINT_CIRCLE_DIAMETER * 1.5;
        tooltipTextY = p.location[1] - POINT_CIRCLE_DIAMETER;
      }
    }
  }

  //display tooltip
  if (tooltipIcon != "") {
    rect(
      0,
      tooltipRectYStart,
      canvasSize - canvasTranslation * 2,
      POINT_CIRCLE_DIAMETER
    );
    textSize(14);
    textAlign(LEFT);
    fill(255);
    text(
      `${tooltipIcon} - ${iconDescriptionLookup.get(tooltipIcon)}`,
      5,
      tooltipTextY
    );
  }

  pop();
  noStroke();
  fill(40, 50, 60, 0.3);
  rect(0, 0, canvasSize, canvasSize);
}

function arrow(x1, y1, x2, y2, arrowSize = 6) {
  stroke(40, 80, 20);
  fill(40, 80, 20);
  let vec = createVector(x2 - x1, y2 - y1);
  const len = vec.mag();
  vec.mult((len - 10) / len);
  push();
  translate(x1, y1);
  dottedLine(0, 0, vec.x, vec.y);
  rotate(vec.heading());
  translate(vec.mag() - arrowSize - POINT_CIRCLE_DIAMETER / 4, 0);
  triangle(0, arrowSize / 2, 0, -arrowSize / 2, arrowSize, 0);
  pop();
}

function dottedLine(x1, y1, x2, y2, fragment = 5) {
  let vec = createVector(x2 - x1, y2 - y1);
  const len = vec.mag();
  push();
  translate(x1, y1);
  for (let i = floor((len * 0.5) / fragment); i >= 0; i--) {
    if (i == 0 && floor(len / fragment) % 2 == 0) {
      vec.normalize().mult(len % fragment);
    } else {
      vec.normalize().mult(fragment);
    }
    line(0, 0, vec.x, vec.y);
    vec.mult(2);
    translate(vec.x, vec.y);
  }
  pop();
}

function exportMapToJSON() {
  const exportObject = {
    activePoints: [...activePoints],
    activeLinks: activeLinks,
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(exportObject, null, 2)], {
      type: "text/plain",
    })
  );
  a.setAttribute("download", `BPL-BossMap-${dateGenerated}.json`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  document.getElementById("exportToJson").setAttribute("disabled", true);
}

function importMapFromJSON() {
  var input = document.createElement("input");
  input.type = "file";

  input.onchange = (e) => {
    var reader = new FileReader();
    reader.onload = (e) => {
      clear();
      document.getElementById("exportToJson").setAttribute("disabled", true);

      const importObject = JSON.parse(e.target.result);
      activeLinks = importObject.activeLinks;
      activePoints = new Map(
        importObject.activePoints.map((ap) => {
          return [ap[0], ap[1]];
        })
      );

      draw();
    };
    reader.readAsText(e.target.files[0]);
  };
  input.click();
}

document.getElementById("exportToJson").addEventListener("click", (e) => {
  if (!e.target.getAttribute("disabled")) {
    exportMapToJSON();
  }
  e.preventDefault();
});

document.getElementById("importFromJson").addEventListener("click", (e) => {
  importMapFromJSON();
  e.preventDefault();
});

window.onload = function (e) {
  const table = document.getElementById("tooltipsTable");
  let i = 0;
  while (i < iconDescriptions.length) {
    var row = document.createElement("tr");
    for (var j = 0; j < ICONS_PER_ROW; j++) {
      if (i >= iconDescriptions.length) {
        break;
      }
      var cell = document.createElement("td");
      var innerHTML = `
        <div class="tooltip">${iconDescriptions[i][0]}
        <span class="tooltiptext">${iconDescriptions[i][1]}</span>
        </div>
      `;
      cell.innerHTML = innerHTML;
      row.appendChild(cell);
      i++;
    }
    table.appendChild(row);
  }
};
