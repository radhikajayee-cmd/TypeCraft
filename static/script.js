/**
 * KeyPulse - Monkeytype-Style Typing Speed Analyzer
 * Frontend Logic (Hidden input, caret highlighting, real-time calculations)
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Using user specific IDs
    const textDisplay = document.getElementById("text-display");
    const inputField = document.getElementById("input-field");
    const timerEl = document.getElementById("timer");
    const wpmEl = document.getElementById("wpm");
    const accuracyEl = document.getElementById("accuracy");
    const mistakesEl = document.getElementById("mistakes");

    // UI containers and restart trigger
    const typingAreaContainer = document.getElementById('typing-area-container');
    const focusOverlay = document.getElementById('focus-overlay');
    const btnRestart = document.getElementById('btn-restart');
    const themeToggle = document.getElementById('theme-toggle');
    const difficultyPills = document.querySelectorAll('.pill');

    // Leaderboard elements
    const leaderboardBody = document.getElementById('leaderboard-body');
    const scoreSubmitForm = document.getElementById('score-submit-form');
    const usernameInput = document.getElementById('username-input');
    const btnSubmitScore = document.getElementById('btn-submit-score');
    const submitFeedback = document.getElementById('submit-feedback');

    // Modal elements for performance summaries
    const resultsModal = document.getElementById('results-modal');
    const modalWpm = document.getElementById('modal-wpm');
    const modalAccuracy = document.getElementById('modal-accuracy');
    const modalMistakes = document.getElementById('modal-mistakes');
    const modalRating = document.getElementById('modal-rating');
    const btnModalClose = document.getElementById('btn-modal-close');
    const btnModalRestart = document.getElementById('btn-modal-restart');

    // Typing State Variables
    const TEST_DURATION = 60; // 60-second typing test
    let timer = TEST_DURATION;
    let timeStarted = false;
    let isTestActive = false;
    
    // Live counts for the current active paragraph
    let correctChars = 0;
    let mistakes = 0;
    let totalTyped = 0;
    let interval;
    
    // Session accumulators (to support typing across multiple paragraphs within the 60s test)
    let sessionCorrect = 0;
    let sessionTotalTyped = 0;
    let sessionMistakes = 0;
    
    let targetText = "";
    let currentDifficulty = 'easy';
    let scoreSubmitted = false;

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================
    function init() {
        setupTheme();
        loadLeaderboard();
        loadNewParagraph();

        // Click and Keyboard Listeners
        typingAreaContainer.addEventListener('click', focusInput);
        inputField.addEventListener('input', handleTyping);
        inputField.addEventListener('blur', handleBlur);
        inputField.addEventListener('focus', handleFocus);
        
        // Listen to keydown globally to capture the very first key and refocus input
        document.addEventListener('keydown', (e) => {
            if (resultsModal.classList.contains('open') || e.ctrlKey || e.altKey || e.metaKey) return;
            if (document.activeElement === inputField || document.activeElement === usernameInput) return;

            // Only handle printable characters and backspace/enter
            const key = e.key;
            const printable = key.length === 1;
            const allowed = printable || key === 'Backspace' || key === 'Enter' || key === ' ';
            if (!allowed) return;

            e.preventDefault();
            focusInput();

            // If printable, manually insert the first character so it's not lost
            if (printable) {
                inputField.value += key;
                handleTyping();
            } else if (key === 'Backspace') {
                inputField.value = inputField.value.slice(0, -1);
                handleTyping();
            }
        });

        // Restart buttons
        btnRestart.addEventListener('click', restartTest);
        btnModalRestart.addEventListener('click', () => {
            closeModal();
            restartTest();
        });
        btnModalClose.addEventListener('click', closeModal);

        // Difficulty pills toggler
        difficultyPills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                difficultyPills.forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                currentDifficulty = e.target.dataset.difficulty;
                restartTest();
            });
        });

        // Theme switch
        themeToggle.addEventListener('click', toggleTheme);

        // Leaderboard Submit
        scoreSubmitForm.addEventListener('submit', handleScoreSubmit);

        // Escape key to quickly restart test
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Escape') {
                restartTest();
            }
        });
    }

    // ==========================================================================
    // FOCUS AND OVERLAY CONTROLS
    // ==========================================================================
    function focusInput() {
        if (timer > 0) {
            inputField.focus();
        }
    }

    function handleFocus() {
        focusOverlay.style.opacity = '0';
        setTimeout(() => {
            if (inputField === document.activeElement) {
                focusOverlay.style.display = 'none';
            }
        }, 150);
    }

    function handleBlur() {
        // Only show overlay if test is not finished
        if (timer > 0) {
            focusOverlay.style.display = 'flex';
            setTimeout(() => {
                focusOverlay.style.opacity = '1';
            }, 50);
        }
    }

    // ==========================================================================
    // BACKEND API PARAGRAPH LOADING
    // ==========================================================================
    async function loadNewParagraph() {
        textDisplay.innerHTML = `
            <div class="spinner-container">
                <i class="fa-solid fa-circle-notch fa-spin spinner"></i>
                <p>Loading paragraph...</p>
            </div>
        `;
        
        try {
            const response = await fetch(`/api/paragraphs?difficulty=${currentDifficulty}`);
            if (!response.ok) throw new Error("Failed to load paragraph.");
            
            const data = await response.json();
            targetText = data.text;
            
            // Format paragraph: render each letter inside its own span
            textDisplay.innerHTML = '';
            targetText.split('').forEach((char, index) => {
                const span = document.createElement('span');
                span.classList.add('char');
                // First letter gets the active yellow highlight initially
                if (index === 0) {
                    span.classList.add('active');
                }
                span.innerText = char;
                textDisplay.appendChild(span);
            });
            
            // Clear input box
            inputField.value = '';
            
            // Focus typing area unless modal is open
            if (!resultsModal.classList.contains('open')) {
                focusInput();
            }
            
        } catch (error) {
            console.error(error);
            textDisplay.innerHTML = `<p class="text-error text-center">Failed to fetch typing test paragraph. Please restart.</p>`;
        }
    }

    // ==========================================================================
    // KEYBOARD INPUT & GRAPHIC HIGHLIGHTS
    // ==========================================================================
    function handleTyping() {
        if (timer <= 0) return;

        // Auto start timer on first keypress
        if (!timeStarted) {
            startTimer();
            timeStarted = true;
            isTestActive = true;
        }

        const enteredText = inputField.value;
        const characters = textDisplay.querySelectorAll("span");

        correctChars = 0;
        mistakes = 0;

        characters.forEach((char, index) => {
            const typedChar = enteredText[index];
            
            // Remove active blinking cursor from other nodes
            char.classList.remove("active");

            // Character not yet typed
            if (typedChar == null) {
                char.classList.remove("correct", "incorrect");
                
                // Active letter turns yellow
                if (index === enteredText.length) {
                    char.classList.add("active");
                }
            }
            // Typed correctly (turns white)
            else if (typedChar === char.innerText) {
                char.classList.add("correct");
                char.classList.remove("incorrect");
                correctChars++;
            }
            // Typed incorrectly (turns red)
            else {
                char.classList.add("incorrect");
                char.classList.remove("correct");
                mistakes++;
            }
        });

        totalTyped = enteredText.length;
        updateStats();

        // If user finishes typing the entire paragraph, save score state and load next paragraph
        if (enteredText.length === targetText.length) {
            sessionCorrect += correctChars;
            sessionTotalTyped += totalTyped;
            sessionMistakes += mistakes;
            
            loadNewParagraph();
        }
    }

    // ==========================================================================
    // DYNAMIC METRICS CALCULATIONS
    // ==========================================================================
    function updateStats() {
        const totalSessionCorrect = sessionCorrect + correctChars;
        const totalSessionTyped = sessionTotalTyped + totalTyped;
        const totalSessionMistakes = sessionMistakes + mistakes;

        // Calculate WPM: Standard calculation assumes 5 characters = 1 word
        const wordsTyped = totalSessionCorrect / 5;
        const timeElapsedFactor = (TEST_DURATION - timer) / 60;
        const wpm = Math.round(wordsTyped / (timeElapsedFactor > 0 ? timeElapsedFactor : 0.01));

        // Calculate Accuracy Percentage
        const accuracy = totalSessionTyped > 0
            ? Math.round((totalSessionCorrect / totalSessionTyped) * 100)
            : 100;

        // Render live stats on the screen
        wpmEl.innerText = wpm > 0 ? wpm : 0;
        accuracyEl.innerText = accuracy + "%";
        mistakesEl.innerText = totalSessionMistakes;
    }

    // ==========================================================================
    // TIME SYSTEM
    // ==========================================================================
    function startTimer() {
        interval = setInterval(() => {
            timer--;
            timerEl.innerText = timer;

            // Pulse timer color when less than 10s left
            if (timer <= 10) {
                timerEl.parentElement.classList.add('animate-pulse');
            }

            // Keep stats updating live
            updateStats();

            if (timer === 0) {
                clearInterval(interval);
                inputField.disabled = true;
                isTestActive = false;

                // Trigger standard alert as requested
                setTimeout(() => {
                    alert(`Test Finished!\nWPM: ${wpmEl.innerText}\nAccuracy: ${accuracyEl.innerText}`);
                    
                    // Show details modal and open scores upload
                    showResultsModal();
                }, 50);
            }
        }, 1000);
    }

    function restartTest() {
        clearInterval(interval);
        
        // Reset states
        timer = TEST_DURATION;
        timeStarted = false;
        isTestActive = false;
        
        correctChars = 0;
        mistakes = 0;
        totalTyped = 0;
        
        sessionCorrect = 0;
        sessionTotalTyped = 0;
        sessionMistakes = 0;
        scoreSubmitted = false;

        // Reset UI labels
        timerEl.innerText = timer;
        timerEl.parentElement.classList.remove('animate-pulse');
        wpmEl.innerText = "0";
        accuracyEl.innerText = "100%";
        mistakesEl.innerText = "0";

        // Reset input box
        inputField.disabled = false;
        inputField.value = "";

        // Reset score form controls
        btnSubmitScore.disabled = false;
        btnSubmitScore.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Submit';
        submitFeedback.innerText = '';
        submitFeedback.className = 'submit-feedback';
        usernameInput.value = '';

        // Load new paragraph
        loadNewParagraph();
        focusInput();
    }

    // ==========================================================================
    // RESULTS SCREEN MODAL
    // ==========================================================================
    function showResultsModal() {
        const finalWpm = parseInt(wpmEl.innerText);
        const finalAccuracy = accuracyEl.innerText;
        const finalMistakes = parseInt(mistakesEl.innerText);

        modalWpm.innerText = finalWpm;
        modalAccuracy.innerText = finalAccuracy;
        modalMistakes.innerText = finalMistakes;

        // Rating titles based on speed
        let rating = 'Bronze';
        let ratingColor = '#d97706';
        if (finalWpm >= 60) {
            rating = 'Falcon (Elite)';
            ratingColor = '#eab308'; // Glowing Gold-Yellow
        } else if (finalWpm >= 40) {
            rating = 'Cheetah (Pro)';
            ratingColor = '#6366f1'; // Indigo
        } else if (finalWpm >= 20) {
            rating = 'Rabbit (Average)';
            ratingColor = '#3b82f6'; // Blue
        } else {
            rating = 'Turtle (Novice)';
            ratingColor = '#ef4444'; // Red
        }

        modalRating.innerText = rating;
        modalRating.style.color = ratingColor;

        // Display results modal overlay
        resultsModal.classList.add('open');
    }

    function closeModal() {
        resultsModal.classList.remove('open');
        focusInput();
    }

    // ==========================================================================
    // LEADERBOARD API COMMUNICATOR
    // ==========================================================================
    async function loadLeaderboard() {
        try {
            const response = await fetch('/api/scores');
            if (!response.ok) throw new Error("Leaderboard API error.");

            const scores = await response.json();

            if (scores.length === 0) {
                leaderboardBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4">No high scores saved yet! Be the first!</td>
                    </tr>
                `;
                return;
            }

            leaderboardBody.innerHTML = '';
            scores.forEach((score, index) => {
                const tr = document.createElement('tr');

                let rankClass = 'rank-other';
                if (index === 0) rankClass = 'rank-1';
                else if (index === 1) rankClass = 'rank-2';
                else if (index === 2) rankClass = 'rank-3';

                tr.innerHTML = `
                    <td><span class="rank-badge ${rankClass}">${index + 1}</span></td>
                    <td><strong>${escapeHTML(score.username)}</strong></td>
                    <td>${score.wpm}</td>
                    <td>${score.accuracy}%</td>
                    <td>${score.mistakes}</td>
                    <td><span class="diff-badge ${score.difficulty}">${score.difficulty}</span></td>
                `;
                leaderboardBody.appendChild(tr);
            });
        } catch (error) {
            console.error(error);
            leaderboardBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-error"><i class="fa-solid fa-triangle-exclamation"></i> Error loading rankings leaderboard.</td>
                </tr>
            `;
        }
    }

    async function handleScoreSubmit(e) {
        e.preventDefault();

        if (scoreSubmitted) return;

        const username = usernameInput.value.trim();
        if (!username) return;

        btnSubmitScore.disabled = true;
        btnSubmitScore.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        const scoreData = {
            username: username,
            wpm: parseInt(modalWpm.innerText),
            accuracy: parseFloat(modalAccuracy.innerText),
            mistakes: parseInt(modalMistakes.innerText),
            difficulty: currentDifficulty
        };

        try {
            const response = await fetch('/api/scores', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(scoreData)
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                scoreSubmitted = true;
                submitFeedback.innerText = 'Score saved successfully!';
                submitFeedback.className = 'submit-feedback success';
                btnSubmitScore.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
                loadLeaderboard();
            } else {
                throw new Error(result.message || 'Error saving score.');
            }
        } catch (error) {
            console.error(error);
            btnSubmitScore.disabled = false;
            btnSubmitScore.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Submit';
            submitFeedback.innerText = 'Failed to submit score. Try again.';
            submitFeedback.className = 'submit-feedback error';
        }
    }

    // XSS mitigation
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // ==========================================================================
    // THEMES
    // ==========================================================================
    function setupTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark-theme';
        document.body.className = savedTheme;
    }

    function toggleTheme() {
        if (document.body.classList.contains('dark-theme')) {
            document.body.className = 'light-theme';
            localStorage.setItem('theme', 'light-theme');
        } else {
            document.body.className = 'dark-theme';
            localStorage.setItem('theme', 'dark-theme');
        }
    }

    // Initialize application script hooks
    init();
});
