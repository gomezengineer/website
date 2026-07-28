/**
 * 1. VARIABLES GLOBALES Y ESTADOS DE LA APLICACIÓN
 */
let examData = []; 
let activeQueue = []; 
let currentQuestion = null;
let selectedKeys = new Set();
let isMultipleChoice = false;
let state = 'answering'; // 'answering' | 'reviewing' | 'readonly'

let timerInterval = null;
let elapsedTime = 0; 

// NUEVO: Mapa para recordar qué letra visual se asignó a qué llave original
let currentDisplayMapping = {}; 

let stats = {
    totalUnique: 0,
    correctOnFirstTry: 0,
    totalIncorrectAnswers: 0,
    questionMetrics: {} 
};

/**
 * 2. REFERENCIAS AL DOM
 */
const DOM = {
    quizContainer: document.getElementById('quiz-container'),
    resultContainer: document.getElementById('result-container'),
    categoryBadge: document.getElementById('category-badge'),
    questionId: document.getElementById('question-id'),
    timerDisplay: document.getElementById('timer-display'),
    queueCounter: document.getElementById('queue-counter'),
    resetBtn: document.getElementById('reset-btn'),
    questionContent: document.getElementById('question-content'),
    instruction: document.getElementById('instruction'),
    optionsContainer: document.getElementById('options-container'),
    feedbackContainer: document.getElementById('feedback-container'),
    feedbackTitle: document.getElementById('feedback-title'),
    explanationText: document.getElementById('explanation-text'),
    actionBtn: document.getElementById('action-btn'),
    finalStats: document.getElementById('final-stats')
};

/**
 * 3. FUNCIONES DE UTILIDAD
 */
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function formatTime(totalSeconds) {
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function startTimer() {
    timerInterval = setInterval(() => {
        elapsedTime++;
        DOM.timerDisplay.textContent = `⏱ ${formatTime(elapsedTime)}`;
        saveState();
    }, 1000);
}

function saveState(isReviewing = false) {
    if (state === 'readonly') return;

    const stateObj = {
        activeQueue,
        currentQuestion: isReviewing ? null : currentQuestion, 
        stats,
        elapsedTime
    };
    localStorage.setItem('quiz_app_state', JSON.stringify(stateObj));
}

/**
 * 4. LÓGICA PRINCIPAL Y FLUJO ASÍNCRONO
 */
async function initApp() {
    try {
        const response = await fetch('data-con-101.json'); 
        if (!response.ok) throw new Error('Network response was not ok');
        examData = await response.json();
        
        const urlParams = new URLSearchParams(window.location.search);
        
        // NUEVO: Verificamos si la URL tiene el parámetro '?respuestas'
        if (urlParams.has('respuestas')) {
            renderAllAnswers();
            return; 
        }

        const queryId = urlParams.get('q');

        if (queryId) {
            renderReadOnlyQuestion(queryId);
            return; 
        }

        stats.totalUnique = examData.length;
        const savedData = localStorage.getItem('quiz_app_state');
        
        if (savedData) {
            const parsed = JSON.parse(savedData);
            activeQueue = parsed.activeQueue;
            currentQuestion = parsed.currentQuestion;
            stats = parsed.stats;
            elapsedTime = parsed.elapsedTime || 0;
            
            DOM.timerDisplay.textContent = `⏱ ${formatTime(elapsedTime)}`;
            DOM.actionBtn.addEventListener('click', handleAction);
            
            if (currentQuestion) {
                renderCurrentQuestion();
            } else {
                loadRandomQuestion();
            }
        } else {
            examData.forEach(q => {
                activeQueue.push(q);
                stats.questionMetrics[q.id] = { attempts: 0, errors: 0 };
            });
            DOM.actionBtn.addEventListener('click', handleAction);
            loadRandomQuestion();
        }
        
        startTimer();

    } catch (error) {
        console.error("Error al cargar las preguntas:", error);
        DOM.questionContent.innerHTML = `<p class="question-text" style="color: var(--incorrect)">Error cargando <b>el archivo JSON</b>.</p>`;
    }
}

DOM.resetBtn.addEventListener('click', () => {
    if(confirm('¿Estás seguro de que deseas reiniciar el examen? Se perderá todo tu progreso y tiempo actual.')) {
        clearInterval(timerInterval); 
        localStorage.removeItem('quiz_app_state'); 
        window.location.href = window.location.pathname; 
    }
});

// --- MODO DE SOLO LECTURA ---
function renderReadOnlyQuestion(id) {
    state = 'readonly';
    const question = examData.find(q => q.id == id);

    if (!question) {
        DOM.questionContent.innerHTML = `<p class="question-text" style="color: var(--incorrect)">No se encontró la pregunta con el ID: ${escapeHTML(id)}</p>`;
        DOM.actionBtn.textContent = 'Volver al Examen';
        DOM.actionBtn.disabled = false;
        DOM.actionBtn.onclick = () => window.location.href = window.location.pathname;
        return;
    }

    DOM.categoryBadge.textContent = question.categoria + " (Modo Lectura)";
    DOM.questionId.textContent = `ID: ${question.id}`;
    DOM.queueCounter.textContent = "Sesión Pausada";
    DOM.timerDisplay.style.display = 'none'; 
    DOM.instruction.textContent = "💡 Estás en modo consulta. Esto no afecta tus estadísticas ni tu progreso actual.";

    let contentHTML = '';
    
    let textoPregunta = escapeHTML(question.pregunta);
    textoPregunta = textoPregunta.replace(/`([^`]+)`/g, '<code style="background: #1e293b; color: #f8fafc; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">$1</code>');
    contentHTML += `<p class="question-text">${textoPregunta.replace(/\n/g, '<br>')}</p>`;

    if (question.codigo) {
        const lineasDeCodigo = question.codigo
            .split('\n')
            .map(linea => `<span class="code-line">${escapeHTML(linea)}</span>`)
            .join('');
            
        contentHTML += `<pre class="code-block"><code>${lineasDeCodigo}</code></pre>`;
    }
    DOM.questionContent.innerHTML = contentHTML;

    DOM.optionsContainer.innerHTML = '';
    const correctKeys = question.respuesta.split(' ').filter(Boolean);
    currentDisplayMapping = {}; // Reiniciamos el mapa

    Object.entries(question.opciones).forEach(([key, value], index) => {
        const displayLetter = String.fromCharCode(65 + index); 
        currentDisplayMapping[key] = displayLetter; // Guardamos qué letra le tocó a esta llave
        
        const optEl = document.createElement('div');
        optEl.className = 'option disabled'; 
        optEl.dataset.key = key; 
        
        let formattedValue = escapeHTML(value);
        if (value.includes('\n')) {
            formattedValue = `<pre style="margin: 0.5rem 0 0 0; background: transparent; padding: 0; color: inherit; font-family: ui-monospace, monospace; white-space: pre-wrap;">${formattedValue}</pre>`;
        }
        
        formattedValue = formattedValue.replace(/`([^`]+)`/g, '<code style="background: #f1f5f9; color: var(--text-main); padding: 2px 4px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 0.9em;">$1</code>');

        optEl.innerHTML = `<strong>${displayLetter})</strong> ${formattedValue}`;
        
        if (correctKeys.includes(key)) {
            optEl.classList.add('correct');
        }
        DOM.optionsContainer.appendChild(optEl);
    });

    DOM.feedbackContainer.className = `feedback success`;
    
    // Obtenemos las letras mostradas en pantalla que eran correctas
    const correctDisplayLetters = correctKeys.map(k => currentDisplayMapping[k]).sort().join(' ');
    DOM.feedbackTitle.textContent = `Respuesta correcta: ${correctDisplayLetters}`;
    
    let explicacionFormateada = question.explicacion ? escapeHTML(question.explicacion).replace(/`([^`]+)`/g, '<code style="background: #dcfce7; color: #166534; padding: 2px 4px; border-radius: 4px; font-size: 0.9em;">$1</code>') : '';
    
    DOM.explanationText.innerHTML = explicacionFormateada 
        ? `<strong>Explicación:</strong><br>${explicacionFormateada.replace(/\n/g, '<br>')}` 
        : '';

    DOM.actionBtn.textContent = 'Volver al Examen';
    DOM.actionBtn.disabled = false;
    DOM.actionBtn.onclick = () => {
        window.location.href = window.location.pathname; 
    };
}

function loadRandomQuestion() {
    if (activeQueue.length === 0) {
        finishExam();
        return;
    }

    const randomIndex = Math.floor(Math.random() * activeQueue.length);
    currentQuestion = activeQueue.splice(randomIndex, 1)[0];
    
    renderCurrentQuestion();
    saveState();
}

function renderCurrentQuestion() {
    state = 'answering';
    selectedKeys.clear();
    DOM.feedbackContainer.className = 'feedback hidden';
    DOM.optionsContainer.innerHTML = '';
    DOM.actionBtn.textContent = 'Comprobar Respuesta';
    DOM.actionBtn.disabled = true;

    isMultipleChoice = currentQuestion.respuesta.includes(' ');

    DOM.categoryBadge.textContent = currentQuestion.categoria;
    DOM.questionId.textContent = `ID: ${currentQuestion.id}`; 
    DOM.queueCounter.textContent = `Preguntas en cola: ${activeQueue.length + 1}`;
    DOM.instruction.textContent = isMultipleChoice 
        ? "💡 Selecciona TODAS las respuestas correctas." 
        : "💡 Selecciona UNA única respuesta.";

    let contentHTML = '';
    
    let textoPregunta = escapeHTML(currentQuestion.pregunta);
    textoPregunta = textoPregunta.replace(/`([^`]+)`/g, '<code style="background: #1e293b; color: #f8fafc; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">$1</code>');
    contentHTML += `<p class="question-text">${textoPregunta.replace(/\n/g, '<br>')}</p>`;

    if (currentQuestion.codigo) {
        const lineasDeCodigo = currentQuestion.codigo
            .split('\n')
            .map(linea => `<span class="code-line">${escapeHTML(linea)}</span>`)
            .join('');
            
        contentHTML += `<pre class="code-block"><code>${lineasDeCodigo}</code></pre>`;
    }

    DOM.questionContent.innerHTML = contentHTML;

    let opcionesArray = Object.entries(currentQuestion.opciones);
    shuffleArray(opcionesArray);
    currentDisplayMapping = {}; // Reiniciamos el mapa

    opcionesArray.forEach(([key, value], index) => {
        const displayLetter = String.fromCharCode(65 + index); 
        currentDisplayMapping[key] = displayLetter; // Guardamos qué letra le tocó a esta llave
        
        const optEl = document.createElement('div');
        optEl.className = 'option';
        optEl.dataset.key = key; 
        
        let formattedValue = escapeHTML(value);
        if (value.includes('\n')) {
            formattedValue = `<pre style="margin: 0.5rem 0 0 0; background: transparent; padding: 0; color: inherit; font-family: ui-monospace, monospace; white-space: pre-wrap;">${formattedValue}</pre>`;
        }
        
        formattedValue = formattedValue.replace(/`([^`]+)`/g, '<code style="background: #f1f5f9; color: var(--text-main); padding: 2px 4px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 0.9em;">$1</code>');

        optEl.innerHTML = `<strong>${displayLetter})</strong> ${formattedValue}`;
        optEl.addEventListener('click', () => toggleOption(optEl, key));
        DOM.optionsContainer.appendChild(optEl);
    });
}

function toggleOption(element, key) {
    if (state !== 'answering') return; 

    if (isMultipleChoice) {
        if (selectedKeys.has(key)) {
            selectedKeys.delete(key);
            element.classList.remove('selected');
        } else {
            selectedKeys.add(key);
            element.classList.add('selected');
        }
    } else {
        selectedKeys.clear();
        document.querySelectorAll('.option').forEach(el => el.classList.remove('selected'));
        selectedKeys.add(key);
        element.classList.add('selected');
    }

    DOM.actionBtn.disabled = selectedKeys.size === 0;
}

function handleAction() {
    if (state === 'answering') {
        checkAnswer();
    } else {
        loadRandomQuestion();
    }
}

function checkAnswer() {
    state = 'reviewing';
    stats.questionMetrics[currentQuestion.id].attempts++;

    const correctKeys = currentQuestion.respuesta.split(' ').filter(Boolean);
    const userKeys = Array.from(selectedKeys);

    const isCorrect = correctKeys.length === userKeys.length && 
                      userKeys.every(k => correctKeys.includes(k));

    document.querySelectorAll('.option').forEach(node => {
        node.classList.add('disabled');
        const key = node.dataset.key;
        
        if (correctKeys.includes(key)) {
            node.classList.add('correct');
        }
        if (userKeys.includes(key) && !correctKeys.includes(key)) {
            node.classList.add('incorrect');
        }
    });

    if (isCorrect) {
        if (stats.questionMetrics[currentQuestion.id].attempts === 1) {
            stats.correctOnFirstTry++;
        }
        showFeedback(true, "¡Correcto!");
    } else {
        stats.totalIncorrectAnswers++;
        stats.questionMetrics[currentQuestion.id].errors++;
        activeQueue.push(currentQuestion);
        showFeedback(false, "Incorrecto");
    }

    DOM.actionBtn.textContent = 'Siguiente Pregunta';
    saveState(true); 
}

function showFeedback(isSuccess, title) {
    DOM.feedbackContainer.className = `feedback ${isSuccess ? 'success' : 'error'}`;
    
    // Convertimos las llaves correctas a las letras mostradas actualmente en pantalla
    const correctKeys = currentQuestion.respuesta.split(' ').filter(Boolean);
    const correctDisplayLetters = correctKeys.map(k => currentDisplayMapping[k]).sort().join(' ');
    
    // Ahora el feedback habla de las letras que el usuario realmente vio
    DOM.feedbackTitle.textContent = `${title} (Respuesta correcta: ${correctDisplayLetters})`;
    
    let explicacionFormateada = currentQuestion.explicacion ? escapeHTML(currentQuestion.explicacion).replace(/`([^`]+)`/g, '<code style="background: ' + (isSuccess ? '#dcfce7' : '#fee2e2') + '; color: ' + (isSuccess ? '#166534' : '#991b1b') + '; padding: 2px 4px; border-radius: 4px; font-size: 0.9em;">$1</code>') : '';

    DOM.explanationText.innerHTML = explicacionFormateada 
        ? `<strong>Explicación:</strong><br>${explicacionFormateada.replace(/\n/g, '<br>')}` 
        : '';
}

function finishExam() {
    clearInterval(timerInterval);
    localStorage.removeItem('quiz_app_state');

    DOM.quizContainer.classList.add('hidden');
    DOM.resultContainer.classList.remove('hidden');

    const multipleAttemptsCount = stats.totalUnique - stats.correctOnFirstTry;

    const hardestQuestionsHTML = Object.entries(stats.questionMetrics)
        .filter(([_, data]) => data.errors > 0)
        .sort((a, b) => b[1].errors - a[1].errors)
        .map(([id, data]) => {
            const q = examData.find(q => q.id == id);
            const cat = q ? escapeHTML(q.categoria) : 'Categoría Desconocida';
            return `<li>[ID: ${id}] ${cat} - Errores: <strong>${data.errors}</strong></li>`;
        }).join('');

    DOM.finalStats.innerHTML = `
        <p><strong>Score / Preguntas superadas:</strong> ${stats.totalUnique} / ${stats.totalUnique}</p>
        <p><strong>Acertadas al primer intento:</strong> ${stats.correctOnFirstTry}</p>
        <p><strong>Necesitaron múltiples intentos:</strong> ${multipleAttemptsCount}</p>
        <p><strong>Total de fallos durante la sesión:</strong> ${stats.totalIncorrectAnswers}</p>
        <p><strong>Tiempo total utilizado:</strong> ${formatTime(elapsedTime)}</p>
        
        <h3 style="margin-top: 2rem;">Preguntas más difíciles:</h3>
        <ul class="hardest-list">
            ${hardestQuestionsHTML || '<li style="color:var(--correct);">¡Excelente! No hubo errores.</li>'}
        </ul>
    `;
}

// --- MODO LISTADO DE RESPUESTAS ---
function renderAllAnswers() {
    state = 'readonly';
    
    // Limpiamos todo el contenedor principal para que no haya botones ni cabeceras
    DOM.quizContainer.innerHTML = '';
    DOM.quizContainer.style.display = 'flex';
    DOM.quizContainer.style.flexDirection = 'column';
    DOM.quizContainer.style.gap = '1rem';

    examData.forEach(question => {
        // Obtenemos las llaves correctas (ej: ["A", "D", "E"])
        const correctKeys = question.respuesta.split(' ').filter(Boolean);
        
        // Mapeamos las llaves al texto real de la opción
        const correctTexts = correctKeys.map(key => question.opciones[key]);
        
        // Creamos el elemento para mostrarlo en pantalla
        const item = document.createElement('div');
        item.style.padding = '0.5rem';
        item.style.borderBottom = '1px solid #e2e8f0';
        item.style.color = 'var(--text-main)';
        item.style.fontWeight = '500';
        
        // Unimos los textos con ' / '
        item.textContent = correctTexts.join(' / ');
        
        DOM.quizContainer.appendChild(item);
    });
}

// Arrancar la app
initApp();