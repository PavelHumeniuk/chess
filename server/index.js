const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const STATS_FILE = path.join(__dirname, 'stats.json');

function getStats() {
    try {
        return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    } catch {
        return { puzzles: {} };
    }
}

function saveStats(data) {
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
}

// Spaced Repetition Logic (SM-2 simplified)
function updateSRS(puzzleId, isSuccess) {
    const data = getStats();
    if (!data.puzzles[puzzleId]) {
        data.puzzles[puzzleId] = {
            attempts: 0,
            success: 0,
            interval: 1, // days
            ease: 2.5,
            nextDue: new Date().toISOString()
        };
    }

    const p = data.puzzles[puzzleId];
    p.attempts += 1;
    if (isSuccess) {
        p.success += 1;
        // Increase interval
        p.interval = Math.ceil(p.interval * p.ease);
        // Slowly increase ease for consistent success
        p.ease = Math.min(3.0, p.ease + 0.1);
    } else {
        // Reset interval on fail
        p.interval = 1;
        // Decrease ease
        p.ease = Math.max(1.3, p.ease - 0.2);
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + p.interval);
    p.nextDue = nextDate.toISOString();

    saveStats(data);
}


const app = express();
const port = process.env.PORT || 3001;

// Stockfish binary path (environment variable or default)
const STOCKFISH_PATH = process.env.STOCKFISH_PATH || 'stockfish';

app.use(cors());
app.use(bodyParser.json());

// Serve static files from the React app in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    console.log(`Serving static files from: ${distPath}`);
}

function askStockfish(commands) {
    return new Promise((resolve, reject) => {
        const stockfish = spawn(STOCKFISH_PATH);
        let output = '';

        stockfish.stdout.on('data', (data) => {
            output += data.toString();
            // If we found 'bestmove', the engine finished its task
            if (output.includes('bestmove')) {
                stockfish.stdin.write('quit\n');
            }
        });

        stockfish.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        stockfish.on('close', (code) => {
            resolve(output);
        });

        commands.forEach(cmd => {
            stockfish.stdin.write(`${cmd}\n`);
        });
        // We always need a go command to finish and get a bestmove
        if (!commands.some(c => c.startsWith('go'))) {
            stockfish.stdin.write('go depth 10\n');
        }
    });
}

function parseEval(output) {
    const lines = output.split('\n');
    let mate = null;
    let score = 0;
    
    for (let i = lines.length - 1; i >= 0; i--) {
        const mateMatch = lines[i].match(/score mate (-?\d+)/);
        if (mateMatch) {
            mate = parseInt(mateMatch[1]);
            score = mate > 0 ? 10000 : -10000;
            break;
        }
        const match = lines[i].match(/score cp (-?\d+)/);
        if (match) {
            score = parseInt(match[1]);
            break;
        }
    }
    return { score, mate };
}

function parseBestMove(output) {
    const match = output.match(/bestmove\s+(\S+)/);
    return match ? match[1] : null;
}

app.post('/eval', async (req, res) => {
    const { fen } = req.body;
    if (!fen) return res.status(400).json({ error: 'FEN is required' });

    try {
        const output = await askStockfish([
            'uci',
            `position fen ${fen}`,
            'go depth 12'
        ]);
        const { score, mate } = parseEval(output);
        res.json({ score, mate });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Stockfish error' });
    }
});

const puzzles = require('./puzzles.json');
const polgarData = require('./polgar_puzzles.json');
const endgames = require('./endgames.json');

app.get('/puzzle/random', (req, res) => {
    const randomIndex = Math.floor(Math.random() * puzzles.length);
    res.json(puzzles[randomIndex]);
});

app.get('/puzzle/endgame', (req, res) => {
    const randomIndex = Math.floor(Math.random() * endgames.length);
    res.json(endgames[randomIndex]);
});

app.get('/puzzle/polgar', (req, res) => {
    const { type } = req.query;
    let filtered = polgarData.problems;
    const statsData = getStats();
    const seenIds = new Set(Object.keys(statsData.puzzles));
    
    if (type === 'Review Due') {
        const now = new Date();
        const dueIds = Object.keys(statsData.puzzles).filter(id => {
            const p = statsData.puzzles[id];
            return new Date(p.nextDue) <= now;
        });
        
        if (dueIds.length === 0) {
            return res.status(404).json({ error: 'No puzzles due for review!' });
        }
        
        filtered = filtered.filter(p => dueIds.includes(`polgar-${p.problemid}`));
    } else if (type) {
        filtered = filtered.filter(p => p.type.toLowerCase().includes(type.toLowerCase()));
        // Exclude puzzles already in storage (seen)
        filtered = filtered.filter(p => !seenIds.has(`polgar-${p.problemid}`));
    }
    
    if (filtered.length === 0) {
        return res.status(404).json({ error: type === 'Review Due' ? 'No reviews due!' : 'No new puzzles found! Everything mastered?' });
    }

    const randomIndex = Math.floor(Math.random() * filtered.length);
    const p = filtered[randomIndex];
    res.json({
        id: `polgar-${p.problemid}`,
        fen: p.fen,
        moves: [], 
        solution: p.moves.split(';').map(m => m.replace('-', '')),
        rating: 1500,
        themes: [p.type, 'polgar'],
        categoryRemaining: filtered.length,
        categoryTotal: polgarData.problems.filter(prob => type === 'Review Due' ? true : prob.type.toLowerCase().includes(type.toLowerCase())).length
    });
});

app.post('/bestmove', async (req, res) => {
    const { fen, depth = 12, skillLevel = 20 } = req.body;
    if (!fen) return res.status(400).json({ error: 'FEN is required' });

    try {
        const output = await askStockfish([
            'uci',
            `setoption name Skill Level value ${skillLevel}`,
            `position fen ${fen}`,
            `go depth ${depth}`
        ]);
        const bestmove = parseBestMove(output);
        res.json({ bestmove });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Stockfish error' });
    }
});



app.get('/puzzle/stats', (req, res) => {
    const data = getStats();
    const stats = Object.values(data.puzzles);
    const totalAttempts = stats.reduce((sum, p) => sum + p.attempts, 0);
    const totalSuccess = stats.reduce((sum, p) => sum + p.success, 0);

    // Calculate forecast for next 7 days
    const forecast = {};
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(now.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        forecast[dateStr] = stats.filter(p => {
            const dueDate = new Date(p.nextDue).toISOString().split('T')[0];
            return dueDate === dateStr;
        }).length;
    }
    
    res.json({
        totalPuzzlesTouched: stats.length,
        totalAttempts,
        successRate: totalAttempts === 0 ? 0 : (totalSuccess / totalAttempts * 100).toFixed(1),
        dueReviewCount: stats.filter(p => new Date(p.nextDue) <= new Date()).length,
        forecast
    });
});

app.post('/puzzle/result', (req, res) => {
    const { id, success } = req.body;
    updateSRS(id, success);
    res.json({ ok: true });
});

app.listen(port, () => {
    console.log(`Stockfish backend listening at http://localhost:${port}`);
});
