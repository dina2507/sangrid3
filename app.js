// Grab references to video, canvas, and canvas context
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusElement = document.getElementById('status');
const alertElement = document.getElementById('alert');
const helpText = document.getElementById('helpText');
const sirenSound = document.getElementById('sirenSound'); // Siren audio element

let model;
let detecting = false;
let sosActive = false; // Variable to track if SOS mode is active

// Load the COCO-SSD model
cocoSsd.load().then(loadedModel => {
    model = loadedModel;
    statusElement.textContent = "Status: Model loaded. Waiting for voice commands.";
    startWebcam();
    startVoiceRecognition(); // Start voice input system
}).catch(error => {
    statusElement.textContent = "Error loading model.";
    console.error("Model loading error: ", error);
});

// Start the webcam automatically
function startWebcam() {
    navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        video.srcObject = stream;
        video.addEventListener('loadeddata', () => {
            statusElement.textContent = "Status: Webcam started. Waiting for voice command.";
        });
    })
    .catch(error => {
        statusElement.textContent = "Error accessing webcam.";
        console.error("Error accessing webcam: ", error);
    });
}

// Function to handle SOS alert
function triggerSOS() {
    if (!sosActive) {
        sosActive = true;
        sirenSound.play(); // Start alarm sound
        document.body.classList.add('sos-mode'); // Trigger screen flicker
        helpText.style.display = 'block'; // Show blinking HELP text
        alertUser('SOS mode activated.'); // Voice alert
    }
}

// Function to stop the SOS alert
function stopSOS() {
    if (sosActive) {
        sosActive = false;
        sirenSound.pause(); // Stop the alarm sound
        sirenSound.currentTime = 0; // Reset the sound for next use
        document.body.classList.remove('sos-mode'); // Stop screen flicker
        helpText.style.display = 'none'; // Hide blinking HELP text
        alertUser('SOS mode deactivated.'); // Voice alert
    }
}

// Voice alert function with 5-second delay
let lastAlertTime = 0;
function alertUser(message) {
    const currentTime = new Date().getTime();
    if (currentTime - lastAlertTime > 5000) {
        const utterance = new SpeechSynthesisUtterance(message);
        window.speechSynthesis.speak(utterance);
        alertElement.textContent = message;
        lastAlertTime = currentTime;
    }
}

// Voice recognition setup
function startVoiceRecognition() {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const lastResult = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
        console.log("Voice Command: ", lastResult);

        if (lastResult.includes("object")) {
            detecting = true;
            detectObjects();
            statusElement.textContent = "Status: Detecting objects.";
        } else if (lastResult.includes("stop")) {
            if (sosActive) {
                stopSOS(); // Stop SOS if active
            } else {
                detecting = false;
                statusElement.textContent = "Status: Waiting for voice command.";
                alertUser("Object detection stopped.");
            }
        } else if (lastResult.includes("what is the time")) {
            getCurrentTimeIST();
        } else if (lastResult.includes("read the text")) {
            recognizeText();
        } else if (lastResult.includes("help")) {
            triggerSOS(); // Trigger SOS mode on "help"
        } else {
            alertUser("I didn't understand that command.");
        }
    };

    recognition.onerror = (event) => {
        console.error("Voice recognition error: ", event.error);
    };

    recognition.onend = () => {
        recognition.start(); // Restart recognition if it stops
    };

    recognition.start(); // Start voice recognition
}

// Object detection function
function detectObjects() {
    if (!detecting) return;

    model.detect(video).then(predictions => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        predictions.forEach(prediction => {
            if (prediction.score > 0.6) {
                ctx.strokeStyle = 'green';
                ctx.lineWidth = 2;
                ctx.strokeRect(prediction.bbox[0], prediction.bbox[1], prediction.bbox[2], prediction.bbox[3]);
                ctx.fillStyle = 'green';
                ctx.fillText(prediction.class, prediction.bbox[0], prediction.bbox[1] - 10);
            }
        });

        if (detecting) {
            requestAnimationFrame(detectObjects); // Keep detecting in loop
        }
    }).catch(error => {
        console.error("Object detection error: ", error);
    });
}

// Get current time in IST format and announce it
function getCurrentTimeIST() {
    const now = new Date();
    const options = { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" };
    const timeInIST = new Intl.DateTimeFormat("en-US", options).format(now);
    alertUser("The time is " + timeInIST);
}

// Text recognition from the video feed using Tesseract.js
function recognizeText() {
    statusElement.textContent = "Status: Recognizing text...";

    // Convert video frame to image and run OCR on it
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/png');

    Tesseract.recognize(
        imageData,
        'eng',
        {
            logger: (m) => console.log(m) // Log progress
        }
    ).then(({ data: { text } }) => {
        alertUser("Recognized text: " + text);
        statusElement.textContent = "Status: Text recognized.";
    }).catch(error => {
        console.error("Text recognition error: ", error);
        statusElement.textContent = "Status: Error recognizing text.";
    });
}
