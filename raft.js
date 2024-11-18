const canvas = document.getElementById("canvas");
const logDiv = document.getElementById("log");
const ctx = canvas.getContext("2d");
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

let nodes = [];
let f = 2; // Default fault tolerance
let n = 2 * f + 1; // Total nodes needed
let currentTime = 0;
let currentTerm = 0;
let quorum = [];

function setFaultTolerance(faults) {
    f = faults;
    n = 2 * f + 1;
    reset();
}

// Add global clock variables
let clockInterval = null;
let clockTime = 0;

function startClock() {
    if (!clockInterval) {
        clockInterval = setInterval(() => {
            clockTime += 1;
            updateClockDisplay();
            drawNodes();
        }, 1000);
    }
}

function stopClock() {
    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }
}

function updateClockDisplay() {
    // Update clock display in the status area
    const clockDisplay = document.getElementById('clockDisplay');
    if (clockDisplay) {
        clockDisplay.textContent = clockTime;
    }

    const termCtr = document.getElementById('termCounter');
    if (termCtr) {
        termCtr.textContent = currentTerm;
    }
}

function setupNodes() {
    nodes = [];
    currentTerm = 0;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 3;

    for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n;
        nodes.push({
            id: i,
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
            state: "follower",
            term: 0,
            active: true,
            partitioned: false,
            lastKnownTerm: 0 // Track the last term the node participated in
        });
    }
    logEvent(`System initialized: f=${f} (can tolerate ${f} failures)`);
    logEvent(`Total nodes n=${n}, quorum size=${Math.floor(n/2) + 1}`);
}

function drawNodes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw quorum connections
    if (quorum.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(76, 175, 80, 0.3)";
        ctx.lineWidth = 5;
        for (let i = 0; i < quorum.length; i++) {
            for (let j = i + 1; j < quorum.length; j++) {
                const node1 = nodes.find(n => n.id === quorum[i]);
                const node2 = nodes.find(n => n.id === quorum[j]);
                if (node1 && node2) {
                    ctx.moveTo(node1.x, node1.y);
                    ctx.lineTo(node2.x, node2.y);
                }
            }
        }
        ctx.stroke();
    }

    // Draw nodes
    nodes.forEach((node) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);
        ctx.closePath();
        
        // Node color based on state and health
        let fillColor;
        if (!node.active) {
            fillColor = "#ff5252"; // Red for failed nodes
        } else if (node.partitioned) {
            fillColor = "#ffcc80"; // Light orange for partitioned nodes
        } else {
            fillColor = getStateColor(node.state);
        }
        
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = quorum.includes(node.id) ? "#4caf50" : "#555";
        ctx.lineWidth = quorum.includes(node.id) ? 3 : 1;
        ctx.stroke();
        
        // Draw node ID and term - using lastKnownTerm for inactive/partitioned nodes
        ctx.fillStyle = (!node.active || node.partitioned) ? "#000" : "#fff";
        ctx.textAlign = "center";
        ctx.font = "16px Arial";
        const displayTerm = (!node.active || node.partitioned) ? node.lastKnownTerm : node.term;
        ctx.fillText(`${node.id} (T=${displayTerm})`, node.x, node.y + 5);
    });

    // Update system state display to show both clock and term
    ctx.fillStyle = "#000";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Clock: t=${clockTime}`, 10, 20);
    ctx.fillText(`Current Term: ${currentTerm}`, 10, 40);
    ctx.fillText(`Fault Tolerance (f): ${f}`, 10, 60);
    ctx.fillText(`Total Nodes (n=2f+1): ${n}`, 10, 80);
    ctx.fillText(`Quorum Required: ${Math.floor(n/2) + 1}`, 10, 100);
}

function getStateColor(state) {
    switch (state) {
        case "leader": return "#4caf50";
        case "candidate": return "#ffc107";
        default: return "#2196f3";
    }
}

function logEvent(event) {
    const timestamp = (currentTime / 1000).toFixed(1);
    logDiv.innerHTML += `<div>${timestamp}s: ${event}</div>`;
    logDiv.scrollTop = logDiv.scrollHeight;
}

function electLeader() {
    currentTerm++;
    
    const activeNodes = nodes.filter(n => n.active && !n.partitioned);
    const requiredQuorum = Math.floor(n/2) + 1;
    
    if (activeNodes.length < requiredQuorum) {
        logEvent(`t=${clockTime}: Term ${currentTerm}: NO LEADER POSSIBLE`);
        logEvent(`t=${clockTime}: Active nodes (${activeNodes.length}) < Required quorum (${requiredQuorum})`);
        quorum = [];
        activeNodes.forEach(n => {
            n.state = "follower";
            n.term = currentTerm; // Update term even on failed election
        });
        drawNodes();
        return;
    }

    // Reset states and terms of only active nodes
    activeNodes.forEach(n => {
        n.state = "follower";
        n.term = currentTerm; // Update all active nodes to current term
    });
    quorum = [];

    // Choose random candidate from active nodes
    const candidateIndex = Math.floor(Math.random() * activeNodes.length);
    const candidate = activeNodes[candidateIndex];
    candidate.state = "candidate";
    
    logEvent(`t=${clockTime}: Term ${currentTerm}: Node ${candidate.id} became candidate`);
    
    // Collect votes from active nodes
    quorum = [candidate.id];
    activeNodes.forEach(node => {
        if (node.id !== candidate.id && Math.random() > 0.3) {
            quorum.push(node.id);
        }
    });

    logEvent(`t=${clockTime}: Votes received: ${quorum.join(", ")}`);
    
    if (quorum.length >= requiredQuorum) {
        candidate.state = "leader";
        logEvent(`t=${clockTime}: Node ${candidate.id} elected as leader (${quorum.length}/${activeNodes.length} votes)`);
        
        // After successful election, delay clearing quorum lines
        setTimeout(() => {
            quorum = [];
            drawNodes();
        }, 1000); // Clear after 1 second
    } else {
        // Election failed
        candidate.state = "follower";
        quorum = [];
        logEvent(`t=${clockTime}: Election failed. Votes: ${quorum.length}, Required: ${requiredQuorum}`);
    }
    
    drawNodes();
}

// Update fixPartition to handle terms correctly
function fixPartition() {
    const partitionedNodes = nodes.filter(node => node.partitioned);
    if (partitionedNodes.length === 0) {
        logEvent("No network partition to fix");
        return;
    }
    
    // Log recovery for each partitioned node
    partitionedNodes.forEach(node => {
        const oldTimestamp = node.lastKnownTerm;
        node.partitioned = false;
        node.term = currentTerm; // Set to current term immediately
        logEvent(`Node ${node.id} rejoining -- Applying updates from Term=${oldTimestamp} to Term=${currentTerm}`);
    });
    
    // If there's a current leader, add recovered nodes to quorum temporarily
    const currentLeader = nodes.find(n => n.state === "leader" && n.active && !n.partitioned);
    if (currentLeader && quorum.length > 0) {
        partitionedNodes.forEach(node => {
            quorum.push(node.id);
        });
        logEvent(`Nodes ${partitionedNodes.map(n => n.id).join(', ')} joined quorum under leader ${currentLeader.id}`);
        
        // Clear quorum lines after a delay
        setTimeout(() => {
            quorum = [];
            drawNodes();
        }, 1000);
    }
    
    drawNodes();
}

// Update recoverNode to handle terms correctly
function recoverNode(specificNodeId = null) {
    const deadNodes = nodes.filter(node => !node.active && !node.partitioned);
    if (deadNodes.length === 0) {
        logEvent("No dead nodes to recover");
        return;
    }

    if (specificNodeId === null) {
        const recoveryOptions = document.getElementById('recoveryOptions');
        recoveryOptions.innerHTML = '';
        deadNodes.forEach(node => {
            const button = document.createElement('button');
            button.innerHTML = `Recover Node ${node.id} (t=${node.lastKnownTerm})`;
            button.onclick = () => recoverNode(node.id);
            recoveryOptions.appendChild(button);
        });
        recoveryOptions.style.display = 'block';
        return;
    }

    const nodeToRecover = nodes.find(n => n.id === specificNodeId);
    if (nodeToRecover) {
        const oldTimestamp = nodeToRecover.lastKnownTerm;
        nodeToRecover.active = true;
        nodeToRecover.term = currentTerm; // Set to current term immediately
        
        logEvent(`Node ${nodeToRecover.id} recovering -- Applying updates from T=${oldTimestamp} to T=${currentTerm}`);
        
        const currentLeader = nodes.find(n => n.state === "leader" && n.active && !n.partitioned);
        if (currentLeader && quorum.length > 0) {
            quorum.push(nodeToRecover.id);
            logEvent(`Node ${nodeToRecover.id} joined quorum under leader ${currentLeader.id}`);
            
            // Clear quorum lines after a delay
            setTimeout(() => {
                quorum = [];
                drawNodes();
            }, 1000);
        }
        
        document.getElementById('recoveryOptions').style.display = 'none';
        drawNodes();
    }
}

function reset() {
    stopClock();
    clockTime = 0;
    currentTerm = 0;
    quorum = [];
    setupNodes();
    drawNodes();
    logDiv.innerHTML = "";
    startClock();
}


function simulateLeaderFailure() {
    const leader = nodes.find(node => node.state === "leader" && node.active);
    if (leader) {
        leader.active = false;
        leader.state = "follower";
        leader.lastKnownTerm = leader.term; // Store the last term before failure
        quorum = [];
        logEvent(`Leader Node ${leader.id} failed at term ${leader.lastKnownTerm}`);
        electLeader();
    } else {
        logEvent("No active leader to fail");
    }
}

function simulateNetworkPartition() {
    const activeNodes = nodes.filter(n => n.active);
    const partitionSize = Math.floor(activeNodes.length / 2);
    
    // Reset previous partition
    nodes.forEach(n => {
        if (n.partitioned) {
            n.lastKnownTerm = n.term; // Store last known term before unpartitioning
        }
        n.partitioned = false;
    });
    
    // Partition half of the active nodes
    for (let i = 0; i < partitionSize; i++) {
        activeNodes[i].partitioned = true;
        activeNodes[i].lastKnownTerm = activeNodes[i].term; // Store last known term
    }
    
    quorum = [];
    logEvent(`Network partitioned. ${partitionSize} nodes isolated`);
    
    // Reset current leader and force new election
    const leader = nodes.find(n => n.state === "leader");
    if (leader) {
        leader.state = "follower";
    }
    electLeader();
}

function simulateNonLeaderFailure() {
    const nonLeader = nodes.find(node => node.state !== "leader" && node.active && !node.partitioned);
    if (nonLeader) {
        nonLeader.active = false;
        nonLeader.lastKnownTerm = nonLeader.term; // Store the last term before failure
        quorum = [];
        logEvent(`Non-leader Node ${nonLeader.id} failed at term ${nonLeader.lastKnownTerm}`);
        electLeader();
    } else {
        logEvent("No active non-leader to fail");
    }
}

function reset() {
    currentTime = 0;
    currentTerm = 0;
    quorum = [];
    setupNodes();
    drawNodes();
    logDiv.innerHTML = "";
}

window.onload = () => {
    setupNodes();
    drawNodes();
    startClock();
};