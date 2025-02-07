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
          width: { ideal: 3840 },     // 4K width
          height: { ideal: 2160 },    // 4K height
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
      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      };
      peerConnection = new RTCPeerConnection(config);
  
      // add local tracks
      if (localStream) {
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream);
        });
      }
  
      // remote stream
      peerConnection.ontrack = function (event) {
        remoteVideo.srcObject = event.streams[0];
      };
  
      // handle ice candidates
      peerConnection.onicecandidate = function (event) {
        if (event.candidate) {
          socket.emit("icecandidate", event.candidate);
        }
      };
  
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
        callIcon.style.color = "green";
        callIcon.style.fontSize = "18px";
  
        button.appendChild(callIcon);
        li.appendChild(button);
      }
  
      allusersHtml.appendChild(li);
    }
  }
  