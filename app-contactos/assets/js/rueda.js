// Variables globales
let currentContact = {
    name: '',
    company: '',
    position: '',
    phone: '',
    email: '',
    notes: ''
};

let recognition;
let isRecording = false;
let stream = null;
let capturedImage = null;
let qrScanner = null;

const notification = document.getElementById('notification');

// Utilidad para mostrar mensajes
function showMessage(message, type = 'success') {
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}

// Cambio de pestañas
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const selected = tab.getAttribute('data-tab');

        tabs.forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        tabContents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        document.getElementById(`${selected}-tab`).classList.add('active');

        if (selected === 'qr') {
            startQRScanner();
        } else {
            stopQRScanner();
        }

        if (selected === 'card') {
            initCardTab();
        } else {
            stopCamera();
        }
    });
});

// Guardar contacto desde el formulario manual
const contactForm = document.getElementById('contact-form');
contactForm.addEventListener('submit', e => {
    e.preventDefault();
    currentContact = {
        name: document.getElementById('name').value,
        company: document.getElementById('company').value,
        position: document.getElementById('position').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        notes: document.getElementById('notes').value
    };
    updateContactPreview();
    showMessage('Contacto guardado correctamente');
});

// Inicializar el escáner de QR
function startQRScanner() {
    const qrResult = document.getElementById('scan-result');
    if (!qrScanner) {
        qrScanner = new Html5Qrcode('qr-reader');
    }

    qrScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, decodedText => {
        qrResult.innerHTML = `<p>Contenido escaneado: ${decodedText}</p>`;
        try {
            if (decodedText.startsWith('BEGIN:VCARD')) {
                parseVCard(decodedText);
            } else {
                currentContact.notes = decodedText;
                updateContactPreview();
            }
        } catch (e) {
            console.error('Error parsing QR data:', e);
            currentContact.notes = decodedText;
            updateContactPreview();
        }
        stopQRScanner();
    }).catch(err => {
        console.log('Unable to start scanning: ', err);
        showMessage('No se pudo iniciar el escáner QR', 'error');
    });
}

function stopQRScanner() {
    if (qrScanner) {
        qrScanner.stop().then(() => {
            qrScanner.clear();
        }).catch(() => {});
    }
}

// Función para parsear vCard
function parseVCard(vcardData) {
    const lines = vcardData.split('\n');
    for (const line of lines) {
        if (line.startsWith('FN:')) {
            currentContact.name = line.substring(3);
        } else if (line.startsWith('ORG:')) {
            currentContact.company = line.substring(4);
        } else if (line.startsWith('TITLE:')) {
            currentContact.position = line.substring(6);
        } else if (line.startsWith('TEL;')) {
            const parts = line.split(':');
            if (parts[1]) currentContact.phone = parts[1];
        } else if (line.startsWith('EMAIL;')) {
            const parts = line.split(':');
            if (parts[1]) currentContact.email = parts[1];
        }
    }
    updateContactPreview();
    showMessage('Datos del QR importados correctamente');
}

// Inicializar la pestaña de tarjeta
const cardOption = document.getElementById('card-option');
const cameraSection = document.getElementById('camera-section');
const uploadSection = document.getElementById('upload-section');
const captureBtn = document.getElementById('capture-btn');
const cardUpload = document.getElementById('card-upload');
const processCardBtn = document.getElementById('process-card');
const saveFromCardBtn = document.getElementById('save-from-card');

function initCardTab() {
    if (cardOption.value === 'camera') {
        cameraSection.style.display = 'block';
        uploadSection.style.display = 'none';
        startCamera();
    } else {
        cameraSection.style.display = 'none';
        uploadSection.style.display = 'block';
        stopCamera();
    }
}

cardOption.addEventListener('change', () => {
    initCardTab();
});

captureBtn.addEventListener('click', captureImage);
cardUpload.addEventListener('change', handleImageUpload);
processCardBtn.addEventListener('click', processImageWithOCR);
saveFromCardBtn.addEventListener('click', saveInfoFromCard);

// Iniciar la cámara
async function startCamera() {
    try {
        stopCamera();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const video = document.getElementById('camera-preview');
        video.srcObject = stream;
    } catch (err) {
        console.error('Error al acceder a la cámara: ', err);
        showMessage('No se pudo acceder a la cámara', 'error');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

// Capturar imagen desde la cámara
function captureImage() {
    const video = document.getElementById('camera-preview');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedImage = canvas.toDataURL('image/png');
    const imgPreview = document.getElementById('image-preview');
    imgPreview.src = capturedImage;
    imgPreview.style.display = 'block';
    processCardBtn.style.display = 'block';
    stopCamera();
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        capturedImage = e.target.result;
        const imgPreview = document.getElementById('image-preview');
        imgPreview.src = capturedImage;
        imgPreview.style.display = 'block';
        processCardBtn.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

async function processImageWithOCR() {
    if (!capturedImage) {
        showMessage('Primero debes capturar o subir una imagen', 'error');
        return;
    }
    document.getElementById('ocr-loading').style.display = 'block';
    document.getElementById('ocr-result').style.display = 'none';
    try {
        const { data: { text } } = await Tesseract.recognize(capturedImage, 'spa+eng');
        document.getElementById('detected-text').textContent = text;
        document.getElementById('ocr-result').style.display = 'block';
        saveFromCardBtn.style.display = 'block';
        extractContactInfo(text);
    } catch (error) {
        console.error('Error en OCR:', error);
        showMessage('Error al procesar la imagen', 'error');
    } finally {
        document.getElementById('ocr-loading').style.display = 'none';
    }
}

function extractContactInfo(text) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const phoneRegex = /\+?\d[\d\s-]{7,14}/;
    const emailMatch = text.match(emailRegex);
    if (emailMatch) currentContact.email = emailMatch[0];
    const phoneMatch = text.match(phoneRegex);
    if (phoneMatch) currentContact.phone = phoneMatch[0];
    currentContact.notes = `Información extraída de tarjeta:\n${text}`;
    updateContactPreview();
}

function saveInfoFromCard() {
    updateContactPreview();
    showMessage('Información de la tarjeta guardada correctamente');
}

// Configuración de reconocimiento de voz
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';

    recognition.onresult = event => {
        const transcript = Array.from(event.results).map(result => result[0].transcript).join('');
        document.getElementById('voice-notes').value = transcript;
    };

    recognition.onerror = event => {
        console.error('Error en reconocimiento de voz:', event.error);
        showMessage('Error en reconocimiento de voz', 'error');
    };

    document.getElementById('start-recording').addEventListener('click', () => {
        recognition.start();
        isRecording = true;
        document.getElementById('start-recording').disabled = true;
        document.getElementById('stop-recording').disabled = false;
        document.getElementById('voice-notes').placeholder = 'Escuchando...';
    });

    document.getElementById('stop-recording').addEventListener('click', () => {
        recognition.stop();
        isRecording = false;
        document.getElementById('start-recording').disabled = false;
        document.getElementById('stop-recording').disabled = true;
        document.getElementById('save-voice-notes').disabled = false;
        document.getElementById('voice-notes').placeholder = 'Haz clic en el botón y comienza a hablar...';
    });

    document.getElementById('save-voice-notes').addEventListener('click', () => {
        currentContact.notes = document.getElementById('voice-notes').value;
        updateContactPreview();
        showMessage('Notas de voz guardadas correctamente');
    });
} else {
    document.getElementById('audio-tab').innerHTML = '<p>El reconocimiento de voz no es compatible con tu navegador.</p>';
}

// Actualizar la vista previa del contacto
function updateContactPreview() {
    const preview = document.getElementById('contact-preview-content');
    let html = '';
    if (currentContact.name) html += `<p><strong>Nombre:</strong> ${currentContact.name}</p>`;
    if (currentContact.company) html += `<p><strong>Empresa:</strong> ${currentContact.company}</p>`;
    if (currentContact.position) html += `<p><strong>Cargo:</strong> ${currentContact.position}</p>`;
    if (currentContact.phone) html += `<p><strong>Teléfono:</strong> ${currentContact.phone}</p>`;
    if (currentContact.email) html += `<p><strong>Email:</strong> ${currentContact.email}</p>`;
    if (currentContact.notes) html += `<p><strong>Notas:</strong> ${currentContact.notes}</p>`;
    preview.innerHTML = html || 'No hay información capturada aún';
}

// Enviar por WhatsApp
const whatsappBtn = document.getElementById('send-whatsapp');
whatsappBtn.addEventListener('click', e => {
    e.preventDefault();
    let message = 'Nuevo contacto de Rueda de Negocios:%0A%0A';
    if (currentContact.name) message += `*Nombre:* ${currentContact.name}%0A`;
    if (currentContact.company) message += `*Empresa:* ${currentContact.company}%0A`;
    if (currentContact.position) message += `*Cargo:* ${currentContact.position}%0A`;
    if (currentContact.phone) message += `*Teléfono:* ${currentContact.phone}%0A`;
    if (currentContact.email) message += `*Email:* ${currentContact.email}%0A`;
    if (currentContact.notes) message += `*Notas:* ${currentContact.notes}%0A`;
    const whatsappUrl = `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank');
});