// Grab references to video, canvas, and canvas context
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusElement = document.getElementById('status');
const alertElement = document.createElement('p'); // Element to display alerts on screen
document.body.appendChild(alertElement);

let model;
let detecting = false;  // Set to false initially

// Load the COCO-SSD model
cocoSsd.load().then(loadedModel => {
    model = loadedModel;
    statusElement.textContent = "Status: Model loaded. Waiting for voice commands.";
    startWebcam();
    startVoiceRecognition();  // Start voice input system
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

// Example code for calculating distance using bounding box size
function calculateDistance(bbox) {
    const size = bbox[2] * bbox[3];  // Calculate size from width * height
    const distance = (1 / size) * 1000; // Example formula, refine it as per your data
    return distance.toFixed(2) + ' meters';
}

// Object detection function with 5-second delay
let lastDetectionTime = 0;
async function detectObjects() {
    if (!detecting) return;  // Return if not in detecting mode

    const currentTime = new Date().getTime();
    if (currentTime - lastDetectionTime < 5000) return;  // 5-second delay between detections

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const predictions = await model.detect(video);
    let personCount = 0;
    let messages = [];

    predictions.forEach(prediction => {
        const [x, y, width, height] = prediction.bbox;
        const text = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;

        // Draw bounding box
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Draw label
        ctx.font = '18px Arial';
        ctx.fillStyle = 'green';
        ctx.fillText(text, x, y > 10 ? y - 5 : y + 15);

        const distance = calculateDistance(prediction.bbox);
        messages.push(`There is a ${prediction.class} at ${distance} in front of you.`);

        if (prediction.class === 'person') {
            personCount++;
        }
    });

    if (personCount > 1) {
        messages.push(`There are ${personCount} people in front of you.`);
    }

    if (messages.length > 0) {
        alertUser(messages.join(' '));
    }

    lastDetectionTime = currentTime;
    requestAnimationFrame(detectObjects);
}

// Voice alert function with 5-second delay
let lastAlertTime = 0;
function alertUser(message) {
    const currentTime = new Date().getTime();
    if (currentTime - lastAlertTime > 5000) {
        const utterance = new SpeechSynthesisUtterance(message);
        window.speechSynthesis.speak(utterance);
        alertElement.textContent = message;  // Print alert on the screen
        lastAlertTime = currentTime;
    }
}

// Improved Tesseract.js OCR with image preprocessing
function recognizeText() {
    const canvasData = canvas.toDataURL('image/png');
    
    // Create an Image element to manipulate the canvas image
    const img = new Image();
    img.src = canvasData;
    
    img.onload = function() {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;

        tempCtx.drawImage(img, 0, 0);
        
        // Convert image to grayscale to improve text recognition
        let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        let data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            let avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg;
            data[i + 1] = avg;
            data[i + 2] = avg;
        }
        
        tempCtx.putImageData(imageData, 0, 0);

        Tesseract.recognize(
            tempCanvas.toDataURL(),
            'eng',
            {
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-'
            }
        ).then(({ data: { text } }) => {
            let recognizedText = text.trim();
            if (recognizedText) {
                alertUser("Recognized Text: " + recognizedText);
                document.getElementById('status').textContent = "Recognized Text: " + recognizedText;
            } else {
                alertUser("No readable text detected.");
            }
        }).catch(error => {
            console.error("Error recognizing text: ", error);
            alertUser("Error recognizing text.");
        });
    };
}

// Get current time in IST (UTC+05:30)
function getCurrentTimeIST() {
    const now = new Date();
    const options = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const time = now.toLocaleTimeString('en-IN', options);
    const message = "The current time is " + time;
    alertUser(message);  // Display time alert on the screen
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

        if (lastResult.includes("obstacle")) {
            detecting = true;
            detectObjects();
            statusElement.textContent = "Status: Detecting objects.";
        } else if (lastResult.includes("stop")) {
            detecting = false;
            statusElement.textContent = "Status: Waiting for voice command.";
            alertUser("Object detection stopped.");
        } else if (lastResult.includes("what is the time")) {
            getCurrentTimeIST();
        } else if (lastResult.includes("read the text")) {
            recognizeText();
        } else {
            alertUser("I didn't understand that command.");
        }
    };

    recognition.onerror = (event) => {
        console.error("Voice recognition error: ", event.error);
    };

    recognition.onend = () => {
        recognition.start();  // Restart recognition if it stops
    };

    recognition.start();  // Start voice recognition
}

// Set interval to recognize text every 10 seconds (optional, if needed for continuous monitoring)
setInterval(() => {
    if (!detecting) {
        recognizeText();
    }
}, 10000);
