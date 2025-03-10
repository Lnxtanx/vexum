// public/js/main.js

// We'll export these so homepage.html can call them after it gets username from Supabase
export function initHome(username) {
  myUsername = username;
  socket.emit("join-user", myUsername);
  // No longer need a manual "Join" button or "create-user" click handler.
  // The rest of your event listeners remain the same.
}

export async function startMyVideo() {
  try {
    // Request 4K video constraints. The browser will fall back if the camera doesn't support it.
    const constraints = {
      audio: true,
      video: {
        width: { ideal: 3840 },   // 4K width
        height: { ideal: 2160 },  // 4K height
        frameRate: { ideal: 30, max: 60 },
        facingMode: 'user'
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStream = stream;
    localVideo.srcObject = stream;

    // Optional: Check the actual resolution we got
    const settings = stream.getVideoTracks()[0].getSettings();
    console.log(`Actual resolution: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);
  } catch (error) {
    console.error("Error accessing camera/mic:", error);
  }
}

// =========== Variables / DOM references ===========
const allusersHtml = document.getElementById("allusers");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const endCallBtn = document.getElementById("end-call-btn");

const muteBtn = document.getElementById("mute-btn");
const startBtn = document.getElementById("start-btn");
const skipBtn = document.getElementById("skip-btn");

const socket = io();
let localStream;
let caller = [];
let allUsers = {};
let myUsername = "";

// ============ PeerConnection Singleton ============
const PeerConnection = (function () {
  let peerConnection;

  const createPeerConnection = () => {
    // Configure ICE servers + policies for improved connectivity
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
        // If you have a TURN server, add it here:
        // {
        //   urls: 'turn:YOUR_TURN_SERVER',
        //   username: 'USERNAME',
        //   credential: 'PASSWORD'
        // }
      ],
      iceTransportPolicy: 'all',    // Allow UDP (and TCP fallback)
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    peerConnection = new RTCPeerConnection(config);

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // On receiving remote stream
    peerConnection.ontrack = function (event) {
      remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = function (event) {
      if (event.candidate) {
        socket.emit("icecandidate", event.candidate);
      }
    };

    // High Bitrate / Frame Rate: Modify sender params after tracks are added
    peerConnection.getSenders().forEach(sender => {
      if (sender.track && sender.track.kind === 'video') {
        const params = sender.getParameters();

        if (!params.encodings) {
          params.encodings = [{}];
        }

        // Increase max bitrate to ~5 Mbps
        params.encodings[0].maxBitrate = 5_000_000; 
        // Increase max frame rate if needed
        params.encodings[0].maxFramerate = 60;
        
        // Apply updated params
        sender.setParameters(params);

        // Uncomment to force H.264 (depends on browser support)
        // preferCodec(peerConnection, 'H264');
      }
    });

    return peerConnection;
  };

  return {
    getInstance: () => {
      if (!peerConnection) {
        peerConnection = createPeerConnection();
      }
      return peerConnection;
    },
    reset: () => {
      if (peerConnection) peerConnection.close();
      peerConnection = null;
    }
  };
})();

/**
 * (Optional) Force a specific video codec like H.264
 * by re-writing the SDP before setting localDescription
 */
function preferCodec(pc, codec) {
  pc.createOffer().then(offer => {
    let sdp = offer.sdp;

    // A simple, naive approach to reorder the codec in SDP:
    const codecRegex = new RegExp(`(m=video .*\r\n)(.*?${codec}.*?)(\\r\\n)`, 's');
    sdp = sdp.replace(codecRegex, '$1$2$3');

    offer.sdp = sdp;
    pc.setLocalDescription(offer);
  });
}

// =========== Event Listeners ===========

// Mute / Unmute local audio
muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  audioTrack.enabled = !audioTrack.enabled;
  muteBtn.textContent = audioTrack.enabled ? "Mute" : "Unmute";
});

// Start Call with a random user
startBtn.addEventListener("click", () => {
  if (!myUsername) {
    alert("No username found (are you logged in?)");
    return;
  }

  // pick a random user (other than me)
  const otherUsers = Object.keys(allUsers).filter(u => u !== myUsername);
  if (otherUsers.length === 0) {
    alert("No other user to call!");
    return;
  }
  const randomUser = otherUsers[Math.floor(Math.random() * otherUsers.length)];
  startCall(randomUser);
});

// Skip: end current call, then attempt to call another random user
skipBtn.addEventListener("click", () => {
  endCall();

  const otherUsers = Object.keys(allUsers).filter(u => u !== myUsername);
  if (otherUsers.length <= 1) {
    alert("No other user to skip to!");
    return;
  }
  const randomUser = otherUsers[Math.floor(Math.random() * otherUsers.length)];
  startCall(randomUser);
});

// End call
endCallBtn.addEventListener("click", () => {
  socket.emit("call-ended", caller);
});

// =========== Socket Events ===========
socket.on("joined", users => {
  console.log("joined => ", users);
  allUsers = users;
  updateUsersList();
});

socket.on("offer", async ({ from, to, offer }) => {
  const pc = PeerConnection.getInstance();
  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  // Increase SDP bandwidth before setting local description
  answer.sdp = modifySDPBandwidth(answer.sdp, 5000); // 5 Mbps
  await pc.setLocalDescription(answer);

  socket.emit("answer", { from, to, answer: pc.localDescription });
  caller = [from, to];
});

socket.on("answer", async ({ from, to, answer }) => {
  const pc = PeerConnection.getInstance();
  await pc.setRemoteDescription(answer);
  // show end call button
  endCallBtn.style.display = 'block';
  socket.emit("end-call", { from, to });
  caller = [from, to];
});

socket.on("icecandidate", async candidate => {
  const pc = PeerConnection.getInstance();
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("end-call", ({ from, to }) => {
  endCallBtn.style.display = "block";
});

socket.on("call-ended", () => {
  endCall();
});

// =========== Call Methods ===========
function startCall(user) {
  if (!myUsername) {
    alert("No username found. Are you logged in?");
    return;
  }
  console.log("Starting call to:", user);

  // Reset old peer connection if any
  PeerConnection.reset();
  const pc = PeerConnection.getInstance();

  pc.createOffer()
    .then(offer => {
      // Force higher bandwidth in the SDP
      offer.sdp = modifySDPBandwidth(offer.sdp, 5000); // 5 Mbps
      return pc.setLocalDescription(offer).then(() => offer);
    })
    .then(offer => {
      socket.emit("offer", { from: myUsername, to: user, offer });
    })
    .catch(err => console.error(err));
}

function endCall() {
  const pc = PeerConnection.getInstance();
  if (pc) {
    pc.close();
    endCallBtn.style.display = 'none';
  }
  PeerConnection.reset();
  remoteVideo.srcObject = null;
  caller = [];
}

// =========== Update Users in the UI ===========
function updateUsersList() {
  allusersHtml.innerHTML = "";

  for (const user in allUsers) {
    const li = document.createElement("li");
    li.textContent = user;

    // Mark me as (You)
    if (user === myUsername) {
      li.textContent += " (You)";
    } else {
      // Add a call icon
      const button = document.createElement("button");
      button.classList.add("call-btn");
      button.addEventListener("click", () => startCall(user));

      const callIcon = document.createElement("i");
      callIcon.classList.add("fa", "fa-phone");
      callIcon.style.fontSize = "18px";

      button.appendChild(callIcon);
      li.appendChild(button);
    }

    allusersHtml.appendChild(li);
  }
}

/**
 * Increase SDP bandwidth by rewriting b=AS line.
 * @param {string} sdp Original SDP
 * @param {number} bandwidth in kbps
 */
function modifySDPBandwidth(sdp, bandwidth) {
  // We insert or replace b=AS lines in the SDP for video
  return sdp.replace(/b=AS:\d+\r\n/g, "") // Remove existing b=AS
            .replace(/(m=video.*\r\n)/g, `$1b=AS:${bandwidth}\r\n`);
}
