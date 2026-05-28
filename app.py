import os
import json
import random
from flask import Flask, render_template, jsonify, request, session

# Initialize Flask application
app = Flask(__name__)
# Secret key is required to use sessions in Flask
app.secret_key = 'typing_speed_analyzer_secret_key_12345'

# Global in-memory list to store top leaderboard scores (reset when server restarts)
# This is simple and effective for a college project demonstration.
LEADERBOARD = [
    {"username": "SpeedyCoder", "wpm": 85, "accuracy": 98, "mistakes": 2, "difficulty": "medium"},
    {"username": "KeyboardCat", "wpm": 65, "accuracy": 95, "mistakes": 4, "difficulty": "easy"},
    {"username": "TypingPro", "wpm": 78, "accuracy": 96, "mistakes": 3, "difficulty": "hard"}
]

# Helper function to load paragraphs from the JSON file
def load_paragraphs():
    try:
        # Construct absolute path to paragraphs.json in the project root
        json_path = os.path.join(os.path.dirname(__file__), 'paragraphs.json')
        with open(json_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    except Exception as e:
        print(f"Error loading paragraphs.json: {e}")
        # Fallback paragraphs in case the JSON file is missing or corrupted
        return [
            {
                "id": 1,
                "difficulty": "easy",
                "text": "The quick brown fox jumps over the lazy dog. Typing regularly can help improve your typing flow."
            },
            {
                "id": 2,
                "difficulty": "medium",
                "text": "Python is a powerful, high-level programming language. It is widely used in data science, web development, and automation."
            },
            {
                "id": 3,
                "difficulty": "hard",
                "text": "Asynchronous communication allows modern web architectures to execute computations independently, enhancing interface responsiveness."
            }
        ]

# Route to render the main dashboard
@app.route('/')
def index():
    return render_template('index.html')

# API Route to get a random paragraph
# Supports filtering by difficulty via query parameter: /api/paragraphs?difficulty=medium
@app.route('/api/paragraphs', methods=['GET'])
def get_paragraphs():
    paragraphs = load_paragraphs()
    difficulty = request.args.get('difficulty', '').lower()
    
    # Filter paragraphs by difficulty if specified
    if difficulty in ['easy', 'medium', 'hard']:
        filtered_paragraphs = [p for p in paragraphs if p['difficulty'] == difficulty]
        # Fall back to all paragraphs if filtering yields no results
        if filtered_paragraphs:
            paragraphs = filtered_paragraphs
            
    # Select a random paragraph from the available list
    random_paragraph = random.choice(paragraphs)
    return jsonify(random_paragraph)

# API Route to get the leaderboard
@app.route('/api/scores', methods=['GET'])
def get_scores():
    # Return the leaderboard sorted by WPM (highest first), then by accuracy (highest first)
    sorted_leaderboard = sorted(LEADERBOARD, key=lambda x: (-x['wpm'], -x['accuracy']))
    # Limit to top 5 scores
    return jsonify(sorted_leaderboard[:5])

# API Route to submit a new score
@app.route('/api/scores', methods=['POST'])
def submit_score():
    try:
        data = request.get_json()
        
        # Extract and validate incoming score details
        username = data.get('username', '').strip() or 'Anonymous'
        wpm = int(data.get('wpm', 0))
        accuracy = float(data.get('accuracy', 0))
        mistakes = int(data.get('mistakes', 0))
        difficulty = data.get('difficulty', 'medium')
        
        # Create score entry
        new_score = {
            "username": username[:15], # Limit username to 15 characters
            "wpm": wpm,
            "accuracy": round(accuracy, 1),
            "mistakes": mistakes,
            "difficulty": difficulty
        }
        
        # Append to global in-memory leaderboard
        LEADERBOARD.append(new_score)
        
        # Sort and return updated top 5
        sorted_leaderboard = sorted(LEADERBOARD, key=lambda x: (-x['wpm'], -x['accuracy']))
        return jsonify({
            "status": "success",
            "message": "Score saved successfully!",
            "leaderboard": sorted_leaderboard[:5]
        }), 201
        
    except (ValueError, TypeError, KeyError) as e:
        return jsonify({"status": "error", "message": "Invalid data format submitted."}), 400

# Start the Flask web application
if __name__ == '__main__':
    # Run in debug mode for easy development. 
    # Port 5000 is default for Flask
    app.run(debug=True, host='127.0.0.1', port=5000)
