/**
 * Created by Alex on 2/6/14.
 */


var physicsMixin = {

  /**
   * Toggling barnes Hut calculation on and off.
   *
   * @private
   */
  _toggleBarnesHut : function() {
    this.constants.physics.barnesHut.enabled = !this.constants.physics.barnesHut.enabled;
    this._loadSelectedForceSolver();
    this.moving = true;
    this.start();
  },



  /**
   * This loads the node force solver based on the barnes hut or repulsion algorithm
   *
   * @private
   */
  _loadSelectedForceSolver : function() {
    // this overloads the this._calculateNodeForces
    if (this.constants.physics.barnesHut.enabled == true) {
      this._clearMixin(repulsionMixin);
      this._clearMixin(hierarchalRepulsionMixin);

      this.constants.physics.centralGravity = this.constants.physics.barnesHut.centralGravity;
      this.constants.physics.springLength   = this.constants.physics.barnesHut.springLength;
      this.constants.physics.springConstant = this.constants.physics.barnesHut.springConstant;
      this.constants.physics.damping        = this.constants.physics.barnesHut.damping;

      this._loadMixin(barnesHutMixin);
    }
    else if (this.constants.physics.hierarchicalRepulsion.enabled == true) {
      this._clearMixin(barnesHutMixin);
      this._clearMixin(repulsionMixin);

      this.constants.physics.centralGravity = this.constants.physics.hierarchicalRepulsion.centralGravity;
      this.constants.physics.springLength   = this.constants.physics.hierarchicalRepulsion.springLength;
      this.constants.physics.springConstant = this.constants.physics.hierarchicalRepulsion.springConstant;
      this.constants.physics.damping        = this.constants.physics.hierarchicalRepulsion.damping;

      this._loadMixin(hierarchalRepulsionMixin);
    }
    else {
      this._clearMixin(barnesHutMixin);
      this._clearMixin(hierarchalRepulsionMixin);
      this.barnesHutTree = undefined;

      this.constants.physics.centralGravity = this.constants.physics.repulsion.centralGravity;
      this.constants.physics.springLength   = this.constants.physics.repulsion.springLength;
      this.constants.physics.springConstant = this.constants.physics.repulsion.springConstant;
      this.constants.physics.damping        = this.constants.physics.repulsion.damping;

      this._loadMixin(repulsionMixin);
    }
  },

  /**
   * Before calculating the forces, we check if we need to cluster to keep up performance and we check
   * if there is more than one node. If it is just one node, we dont calculate anything.
   *
   * @private
   */
  _initializeForceCalculation : function() {
    // stop calculation if there is only one node
    if (this.nodeIndices.length == 1) {
      this.nodes[this.nodeIndices[0]]._setForce(0,0);
    }
    else {
      // if there are too many nodes on screen, we cluster without repositioning
      if (this.nodeIndices.length > this.constants.clustering.clusterThreshold && this.constants.clustering.enabled == true) {
        this.clusterToFit(this.constants.clustering.reduceToNodes, false);
      }

      // we now start the force calculation
      this._calculateForces();
    }
  },


  /**
   * Calculate the external forces acting on the nodes
   * Forces are caused by: edges, repulsing forces between nodes, gravity
   * @private
   */
  _calculateForces : function() {
    // Gravity is required to keep separated groups from floating off
    // the forces are reset to zero in this loop by using _setForce instead
    // of _addForce

    this._calculateGravitationalForces();
    this._calculateNodeForces();


    if (this.constants.smoothCurves == true) {
      this._calculateSpringForcesWithSupport();
    }
    else {
      this._calculateSpringForces();
    }
  },


  /**
   * Smooth curves are created by adding invisible nodes in the center of the edges. These nodes are also
   * handled in the calculateForces function. We then use a quadratic curve with the center node as control.
   * This function joins the datanodes and invisible (called support) nodes into one object.
   * We do this so we do not contaminate this.nodes with the support nodes.
   *
   * @private
   */
  _updateCalculationNodes : function() {
    if (this.constants.smoothCurves == true) {
      this.calculationNodes = {};
      this.calculationNodeIndices = [];

      for (var nodeId in this.nodes) {
        if (this.nodes.hasOwnProperty(nodeId)) {
          this.calculationNodes[nodeId] = this.nodes[nodeId];
        }
      }
      var supportNodes = this.sectors['support']['nodes'];
      for (var supportNodeId in supportNodes) {
        if (supportNodes.hasOwnProperty(supportNodeId)) {
          if (this.edges.hasOwnProperty(supportNodes[supportNodeId].parentEdgeId)) {
            this.calculationNodes[supportNodeId] = supportNodes[supportNodeId];
          }
          else {
            supportNodes[supportNodeId]._setForce(0,0);
          }
        }
      }

      for (var idx in this.calculationNodes) {
        if (this.calculationNodes.hasOwnProperty(idx)) {
          this.calculationNodeIndices.push(idx);
        }
      }
    }
    else {
      this.calculationNodes = this.nodes;
      this.calculationNodeIndices = this.nodeIndices;
    }
  },


  /**
   * this function applies the central gravity effect to keep groups from floating off
   *
   * @private
   */
  _calculateGravitationalForces : function() {
    var dx, dy, distance, node, i;
    var nodes = this.calculationNodes;
    var gravity = this.constants.physics.centralGravity;
    var gravityForce = 0;

    for (i = 0; i < this.calculationNodeIndices.length; i++) {
      node = nodes[this.calculationNodeIndices[i]];
      node.damping = this.constants.physics.damping; // possibly add function to alter damping properties of clusters.
      // gravity does not apply when we are in a pocket sector
      if (this._sector() == "default" && gravity != 0) {
        dx = -node.x;
        dy = -node.y;
        distance = Math.sqrt(dx*dx + dy*dy);
        gravityForce = gravity / distance;

        node.fx = dx * gravityForce;
        node.fy = dy * gravityForce;
      }
      else {
        node.fx = 0;
        node.fy = 0;
      }
    }
  },


  /**
   * this function calculates the effects of the springs in the case of unsmooth curves.
   *
   * @private
   */
  _calculateSpringForces : function() {
    var edgeLength, edge, edgeId;
    var dx, dy, fx, fy, springForce, length;
    var edges = this.edges;

    // forces caused by the edges, modelled as springs
    for (edgeId in edges) {
      if (edges.hasOwnProperty(edgeId)) {
        edge = edges[edgeId];
        if (edge.connected) {
          // only calculate forces if nodes are in the same sector
          if (this.nodes.hasOwnProperty(edge.toId) && this.nodes.hasOwnProperty(edge.fromId)) {
            edgeLength = edge.customLength ? edge.length : this.constants.physics.springLength;
            // this implies that the edges between big clusters are longer
            edgeLength += (edge.to.clusterSize + edge.from.clusterSize - 2) * this.constants.clustering.edgeGrowth;

            dx = (edge.from.x - edge.to.x);
            dy = (edge.from.y - edge.to.y);
            length =  Math.sqrt(dx * dx + dy * dy);

            if (length == 0) {
              length = 0.01;
            }

            springForce = this.constants.physics.springConstant * (edgeLength - length) / length;

            fx = dx * springForce;
            fy = dy * springForce;

            edge.from.fx += fx;
            edge.from.fy += fy;
            edge.to.fx -= fx;
            edge.to.fy -= fy;
          }
        }
      }
    }
  },


  /**
   * This function calculates the springforces on the nodes, accounting for the support nodes.
   *
   * @private
   */
  _calculateSpringForcesWithSupport : function() {
    var edgeLength, edge, edgeId, combinedClusterSize;
    var edges = this.edges;

    // forces caused by the edges, modelled as springs
    for (edgeId in edges) {
      if (edges.hasOwnProperty(edgeId)) {
        edge = edges[edgeId];
        if (edge.connected) {
          // only calculate forces if nodes are in the same sector
          if (this.nodes.hasOwnProperty(edge.toId) && this.nodes.hasOwnProperty(edge.fromId)) {
            if (edge.via != null) {
              var node1 = edge.to;
              var node2 = edge.via;
              var node3 = edge.from;

              edgeLength = edge.customLength ? edge.length : this.constants.physics.springLength;

              combinedClusterSize = node1.clusterSize + node3.clusterSize - 2;

              // this implies that the edges between big clusters are longer
              edgeLength += combinedClusterSize * this.constants.clustering.edgeGrowth;
              this._calculateSpringForce(node1,node2,0.5*edgeLength);
              this._calculateSpringForce(node2,node3,0.5*edgeLength);
            }
          }
        }
      }
    }
  },


  /**
   * This is the code actually performing the calculation for the function above. It is split out to avoid repetition.
   *
   * @param node1
   * @param node2
   * @param edgeLength
   * @private
   */
  _calculateSpringForce : function(node1,node2,edgeLength) {
    var dx, dy, fx, fy, springForce, length;

    dx = (node1.x - node2.x);
    dy = (node1.y - node2.y);
    length =  Math.sqrt(dx * dx + dy * dy);

    springForce = this.constants.physics.springConstant * (edgeLength - length) / length;

    if (length == 0) {
      length = 0.01;
    }

    fx = dx * springForce;
    fy = dy * springForce;

    node1.fx += fx;
    node1.fy += fy;
    node2.fx -= fx;
    node2.fy -= fy;
  },


  /**
   * Load the HTML for the physics config and bind it
   * @private
   */
  _loadPhysicsConfiguration : function() {
    if (this.physicsConfiguration === undefined) {
      var hierarchicalLayoutDirections = ["LR","RL","UD","DU"];
      this.physicsConfiguration = document.createElement('div');
      this.physicsConfiguration.className = "PhysicsConfiguration";
      this.physicsConfiguration.innerHTML = '' +
        '<table><tr><td><b>Simulation Mode:</b></td></tr>' +
        '<tr>' +
        '<td width="120px"><input type="radio" name="graph_physicsMethod" id="graph_physicsMethod1" value="BH" checked="checked">Barnes Hut</td>' +
        '<td width="120px"><input type="radio" name="graph_physicsMethod" id="graph_physicsMethod2" value="R">Repulsion</td>'+
        '<td width="120px"><input type="radio" name="graph_physicsMethod" id="graph_physicsMethod3" value="H">Hierarchical</td>' +
        '</tr>'+
        '</table>' +
        '<table id="graph_BH_table" style="display:none">'+
        '<tr><td><b>Barnes Hut</b></td></tr>'+
        '<tr>'+
        '<td width="150px">gravitationalConstant</td><td>0</td><td><input type="range" min="500" max="20000" value="' + (-1* this.constants.physics.barnesHut.gravitationalConstant) + '" step="25" style="width:300px" id="graph_BH_gc"></td><td  width="50px">-20000</td><td><input value="' + (-1* this.constants.physics.barnesHut.gravitationalConstant) + '" id="graph_BH_gc_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">centralGravity</td><td>0</td><td><input type="range" min="0" max="3"  value="' + this.constants.physics.barnesHut.centralGravity + '" step="0.05"  style="width:300px" id="graph_BH_cg"></td><td>3</td><td><input value="' + this.constants.physics.barnesHut.centralGravity + '" id="graph_BH_cg_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">springLength</td><td>0</td><td><input type="range" min="0" max="500" value="' + this.constants.physics.barnesHut.springLength + '" step="1" style="width:300px" id="graph_BH_sl"></td><td>500</td><td><input value="' + this.constants.physics.barnesHut.springLength + '" id="graph_BH_sl_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">springConstant</td><td>0</td><td><input type="range" min="0" max="0.5" value="' + this.constants.physics.barnesHut.springConstant + '" step="0.001" style="width:300px" id="graph_BH_sc"></td><td>0.5</td><td><input value="' + this.constants.physics.barnesHut.springConstant + '" id="graph_BH_sc_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">damping</td><td>0</td><td><input type="range" min="0" max="0.3" value="' + this.constants.physics.barnesHut.damping + '" step="0.005" style="width:300px" id="graph_BH_damp"></td><td>0.3</td><td><input value="' + this.constants.physics.barnesHut.damping + '" id="graph_BH_damp_value" style="width:60px"></td>'+
        '</tr>'+
        '</table>'+
        '<table id="graph_R_table" style="display:none">'+
        '<tr><td><b>Repulsion</b></td></tr>'+
        '<tr>'+
        '<td width="150px">nodeDistance</td><td>0</td><td><input type="range" min="0" max="300" value="' + this.constants.physics.repulsion.nodeDistance + '" step="1" style="width:300px" id="graph_R_nd"></td><td width="50px">300</td><td><input value="' + this.constants.physics.repulsion.nodeDistance + '" id="graph_R_nd_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">centralGravity</td><td>0</td><td><input type="range" min="0" max="3"  value="' + this.constants.physics.repulsion.centralGravity + '" step="0.05"  style="width:300px" id="graph_R_cg"></td><td>3</td><td><input value="' + this.constants.physics.repulsion.centralGravity + '" id="graph_R_cg_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">springLength</td><td>0</td><td><input type="range" min="0" max="500" value="' + this.constants.physics.repulsion.springLength + '" step="1" style="width:300px" id="graph_R_sl"></td><td>500</td><td><input value="' + this.constants.physics.repulsion.springLength + '" id="graph_R_sl_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">springConstant</td><td>0</td><td><input type="range" min="0" max="0.5" value="' + this.constants.physics.repulsion.springConstant + '" step="0.001" style="width:300px" id="graph_R_sc"></td><td>0.5</td><td><input value="' + this.constants.physics.repulsion.springConstant + '" id="graph_R_sc_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">damping</td><td>0</td><td><input type="range" min="0" max="0.3" value="' + this.constants.physics.repulsion.damping + '" step="0.005" style="width:300px" id="graph_R_damp"></td><td>0.3</td><td><input value="' + this.constants.physics.repulsion.damping + '" id="graph_R_damp_value" style="width:60px"></td>'+
        '</tr>'+
        '</table>'+
        '<table id="graph_H_table" style="display:none">'+
        '<tr><td width="150"><b>Hierarchical</b></td></tr>'+
        '<tr>'+
        '<td width="150px">nodeDistance</td><td>0</td><td><input type="range" min="0" max="300" value="' + this.constants.physics.hierarchicalRepulsion.nodeDistance + '" step="1" style="width:300px" id="graph_H_nd"></td><td width="50px">300</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.nodeDistance + '" id="graph_H_nd_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">centralGravity</td><td>0</td><td><input type="range" min="0" max="3"  value="' + this.constants.physics.hierarchicalRepulsion.centralGravity + '" step="0.05"  style="width:300px" id="graph_H_cg"></td><td>3</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.centralGravity + '" id="graph_H_cg_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">springLength</td><td>0</td><td><input type="range" min="0" max="500" value="' + this.constants.physics.hierarchicalRepulsion.springLength + '" step="1" style="width:300px" id="graph_H_sl"></td><td>500</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.springLength + '" id="graph_H_sl_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">springConstant</td><td>0</td><td><input type="range" min="0" max="0.5" value="' + this.constants.physics.hierarchicalRepulsion.springConstant + '" step="0.001" style="width:300px" id="graph_H_sc"></td><td>0.5</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.springConstant + '" id="graph_H_sc_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">damping</td><td>0</td><td><input type="range" min="0" max="0.3" value="' + this.constants.physics.hierarchicalRepulsion.damping + '" step="0.005" style="width:300px" id="graph_H_damp"></td><td>0.3</td><td><input value="' + this.constants.physics.hierarchicalRepulsion.damping + '" id="graph_H_damp_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">direction</td><td>1</td><td><input type="range" min="0" max="3" value="' + hierarchicalLayoutDirections.indexOf(this.constants.hierarchicalLayout.direction) + '" step="1" style="width:300px" id="graph_H_direction"></td><td>4</td><td><input value="' + this.constants.hierarchicalLayout.direction + '" id="graph_H_direction_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">levelSeparation</td><td>1</td><td><input type="range" min="0" max="500" value="' + this.constants.hierarchicalLayout.levelSeparation + '" step="1" style="width:300px" id="graph_H_levsep"></td><td>500</td><td><input value="' + this.constants.hierarchicalLayout.levelSeparation + '" id="graph_H_levsep_value" style="width:60px"></td>'+
        '</tr>'+
        '<tr>'+
        '<td width="150px">nodeSpacing</td><td>1</td><td><input type="range" min="0" max="500" value="' + this.constants.hierarchicalLayout.nodeSpacing + '" step="1" style="width:300px" id="graph_H_nspac"></td><td>500</td><td><input value="' + this.constants.hierarchicalLayout.nodeSpacing + '" id="graph_H_nspac_value" style="width:60px"></td>'+
        '</tr>'+
        '</table>'
      this.containerElement.parentElement.insertBefore(this.physicsConfiguration,this.containerElement);



      var rangeElement;
      rangeElement = document.getElementById('graph_BH_gc');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_BH_gc',-1,"physics_barnesHut_gravitationalConstant");
      rangeElement = document.getElementById('graph_BH_cg');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_BH_cg',1,"physics_centralGravity");
      rangeElement = document.getElementById('graph_BH_sc');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_BH_sc',1,"physics_springConstant");
      rangeElement = document.getElementById('graph_BH_sl');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_BH_sl',1,"physics_springLength");
      rangeElement = document.getElementById('graph_BH_damp');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_BH_damp',1,"physics_damping");


      rangeElement = document.getElementById('graph_R_nd');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_R_nd',1,"physics_repulsion_nodeDistance");
      rangeElement = document.getElementById('graph_R_cg');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_R_cg',1,"physics_centralGravity");
      rangeElement = document.getElementById('graph_R_sc');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_R_sc',1,"physics_springConstant");
      rangeElement = document.getElementById('graph_R_sl');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_R_sl',1,"physics_springLength");
      rangeElement = document.getElementById('graph_R_damp');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_R_damp',1,"physics_damping");

      rangeElement = document.getElementById('graph_H_nd');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_H_nd',1,"physics_hierarchicalRepulsion_nodeDistance");
      rangeElement = document.getElementById('graph_H_cg');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_H_cg',1,"physics_centralGravity");
      rangeElement = document.getElementById('graph_H_sc');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_H_sc',1,"physics_springConstant");
      rangeElement = document.getElementById('graph_H_sl');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_H_sl',1,"physics_springLength");
      rangeElement = document.getElementById('graph_H_damp');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_H_damp',1,"physics_damping");
      rangeElement = document.getElementById('graph_H_direction');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_H_direction',hierarchicalLayoutDirections,"hierarchicalLayout_direction");
      rangeElement = document.getElementById('graph_H_levsep');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_H_levsep',1,"hierarchicalLayout_levelSeparation");
      rangeElement = document.getElementById('graph_H_nspac');
      rangeElement.onchange = showValueOfRange.bind(this,'graph_H_nspac',1,"hierarchicalLayout_nodeSpacing");

      var radioButton1 = document.getElementById("graph_physicsMethod1");
      var radioButton2 = document.getElementById("graph_physicsMethod2");
      var radioButton3 = document.getElementById("graph_physicsMethod3");

      radioButton2.checked = true;
      if (this.constants.physics.barnesHut.enabled) {
        radioButton1.checked = true;
      }
      if (this.constants.hierarchicalLayout.enabled) {
        radioButton3.checked = true;
      }

      switchConfigurations.apply(this);

      radioButton1.onchange = switchConfigurations.bind(this);
      radioButton2.onchange = switchConfigurations.bind(this);
      radioButton3.onchange = switchConfigurations.bind(this);
    }
  },

  _overWriteGraphConstants : function(constantsVariableName, value) {
    var nameArray = constantsVariableName.split("_");
    if (nameArray.length == 1) {
      this.constants[nameArray[0]] = value;
    }
    else if (nameArray.length == 2) {
      this.constants[nameArray[0]][nameArray[1]] = value;
    }
    else if (nameArray.length == 3) {
      this.constants[nameArray[0]][nameArray[1]][nameArray[2]] = value;
    }
  }
}


function switchConfigurations () {
  var ids = ["graph_BH_table","graph_R_table","graph_H_table"]
  var radioButton = document.querySelector('input[name="graph_physicsMethod"]:checked').value;
  var tableId = "graph_" + radioButton + "_table";
  var table = document.getElementById(tableId);
  table.style.display = "block";
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] != tableId) {
      table = document.getElementById(ids[i]);
      table.style.display = "none";
    }
  }
  this._restoreNodes();
  if (radioButton == "R") {
    this.constants.hierarchicalLayout.enabled = false;
    this.constants.physics.hierarchicalRepulsion.enabeled = false;
    this.constants.physics.barnesHut.enabled = false;
  }
  else if (radioButton == "H") {
    this.constants.hierarchicalLayout.enabled = true;
    this.constants.physics.hierarchicalRepulsion.enabeled = true;
    this.constants.physics.barnesHut.enabled = false;
    this._setupHierarchicalLayout();
  }
  else {
    this.constants.hierarchicalLayout.enabled = false;
    this.constants.physics.hierarchicalRepulsion.enabeled = false;
    this.constants.physics.barnesHut.enabled = true;
  }
  this._loadSelectedForceSolver();
  this.moving = true;
  this.start();
}

function showValueOfRange (id,map,constantsVariableName) {
  var valueId = id + "_value";
  var rangeValue = document.getElementById(id).value;

  if (map instanceof Array) {
    document.getElementById(valueId).value = map[parseInt(rangeValue)];
    this._overWriteGraphConstants(constantsVariableName,map[parseInt(rangeValue)]);
  }
  else {
    document.getElementById(valueId).value = parseInt(map) * parseFloat(rangeValue);
    this._overWriteGraphConstants(constantsVariableName, parseInt(map) * parseFloat(rangeValue));
  }

  if (constantsVariableName == "hierarchicalLayout_direction" ||
    constantsVariableName == "hierarchicalLayout_levelSeparation" ||
    constantsVariableName == "hierarchicalLayout_nodeSpacing") {
    this._setupHierarchicalLayout();
  }
  this.moving = true;
  this.start();
};

