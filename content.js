let debounceTimer = null;
let isExtracting = false;

// SETTINGS MANAGEMENT: Sync popup <-> content script for settings
let extensionSettings = {
    depth: 15,
    highlightColor: 'rgba(0, 191, 255, 0.7)',
    extensionEnabled: true,
    moveSide: 'white',
    engineSource: 'chesscom'
};

// On load, sync settings from chrome.storage
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['depth', 'highlightColor', 'extensionEnabled', 'moveSide', 'engineSource'], (data) => {
        if (data.depth !== undefined) extensionSettings.depth = parseInt(data.depth);
        if (data.highlightColor !== undefined) extensionSettings.highlightColor = data.highlightColor;
        if (typeof data.extensionEnabled === 'boolean') extensionSettings.extensionEnabled = data.extensionEnabled;
        if (data.moveSide !== undefined) extensionSettings.moveSide = data.moveSide;
        if (data.engineSource !== undefined) extensionSettings.engineSource = data.engineSource;
    });
}

// Listen for messages from popup.js
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'UPDATE_SETTINGS') {
            if (msg.depth !== undefined) extensionSettings.depth = parseInt(msg.depth);
            if (msg.highlightColor !== undefined) extensionSettings.highlightColor = msg.highlightColor;
            if (typeof msg.extensionEnabled === 'boolean') extensionSettings.extensionEnabled = msg.extensionEnabled;
            if (msg.moveSide !== undefined) extensionSettings.moveSide = msg.moveSide;
            if (msg.engineSource !== undefined) extensionSettings.engineSource = msg.engineSource;
            sendResponse({ status: 'ok' });
            if (msg.triggerBestMove) {
                extractFEN();
            }
        }
        if (msg.type === 'GET_SETTINGS') {
            sendResponse(extensionSettings);
        }
    });
}

function createChessComStockfishWorker(callback) {
    // Use chess.com's internal Stockfish worker
    const chessComPath = '/bundles/app/js/vendor/jschessengine/stockfish.asm.1abfa10c.js';
    try {
        const worker = new Worker(chessComPath);
        worker.onmessage = function(event) {
            if (typeof event.data === 'string' && event.data.startsWith('bestmove')) {
                const bestMove = event.data.split(' ')[1];
                if (bestMove && bestMove.length === 4) {
                    drawArrow(bestMove.slice(0,2), bestMove.slice(2,4));
                    console.log(`Best move from 'chess.com' engine: ${bestMove.slice(0,2)} → ${bestMove.slice(2,4)}`);
                }
            }
        };
        window.__copilotChessComStockfishWorker = worker;
        if (callback) callback();
    } catch (err) {
        console.error('Failed to create chess.com Stockfish worker:', err);
        if (callback) callback(err);
    }
}

function getBestMoveFromStockfishApi(fen) {
    // Use chess.com's internal Stockfish worker if on chess.com and user selected chesscom
    if (extensionSettings.engineSource === 'chesscom' && window.location.hostname.endsWith('chess.com')) {
        if (!window.__copilotChessComStockfishWorker) {
            createChessComStockfishWorker(() => getBestMoveFromStockfishApi(fen));
            return;
        }
        window.__copilotChessComStockfishWorker.postMessage('uci');
        window.__copilotChessComStockfishWorker.postMessage(`position fen ${fen}`);
        window.__copilotChessComStockfishWorker.postMessage(`go depth ${extensionSettings.depth}`);
        return;
    }
    // Use online Stockfish API for all other cases
    fetch(`https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${extensionSettings.depth}`)
        .then(res => res.json())
        .then(result => {
            const move = result?.bestmove;
            if (move?.length >= 13) {
                const from = move.slice(9, 11), to = move.slice(11, 13);
                drawArrow(from, to);
                console.log(`Best move from stockfish.online API: ${from} → ${to}`);
            }
        })
        .catch(console.error);
}

function waitFor(fn, retries = 20, delay = 300) {
    return new Promise((resolve, reject) => {
        (function attempt(r) {
            const res = fn();
            if (res) return resolve(res);
            if (r <= 0) return reject('❌ Element not found.');
            setTimeout(() => attempt(r - 1), delay);
        })(retries);
    });
}

async function extractFEN() {
    if (isExtracting) return; isExtracting = true;
    try {
        const pieceMap = {p:'p',n:'n',b:'b',r:'r',q:'q',k:'k',P:'P',N:'N',B:'B',R:'R',Q:'Q',K:'K'};
        const buildBoardArray = () => {
            const board = Array.from({length:8},()=>Array(8).fill(''));
            document.querySelectorAll('.piece').forEach(piece => {
                const c = piece.className.split(' '),
                    pc = c.find(x=>/^[bw][kqrbnp]$/.test(x)),
                    sq = c.find(x=>/^square-\d+$/.test(x));
                if(pc&&sq){
                    const pos = sq.split('-')[1];
                    const file = parseInt(pos[0],10)-1, rank = parseInt(pos[1],10)-1;
                    board[rank][file]=pc[0]==='w'?pieceMap[pc[1].toUpperCase()]:pieceMap[pc[1]];
                }
            });
            return board;
        };
        const boardToFEN = b => b.slice().reverse().map(row=>{
            let fen='',e=0;row.forEach(cell=>{if(!cell)e++;else{if(e)fen+=e,e=0;fen+=cell}});if(e)fen+=e;return fen;
        }).join('/');
        const moveList = document.querySelectorAll('.move-list .vertical-move-list .move');
        const color = moveList.length % 2 === 0 ? 'w' : 'b';
        const board = buildBoardArray(), fenPosition = boardToFEN(board);
        const moveSide = extensionSettings.moveSide || 'white';
        let turnColor = color;
        let whiteClock = document.querySelector('.clock-component.clock-bottom.clock-white.clock-player-turn')
            || document.querySelector('.clock-component.clock-top.clock-white.clock-player-turn');
        let blackClock = document.querySelector('.clock-component.clock-bottom.clock-black.clock-player-turn')
            || document.querySelector('.clock-component.clock-top.clock-black.clock-player-turn');
        if (whiteClock) turnColor = 'w'; else if (blackClock) turnColor = 'b';
        const getMoveForColor = (fen, color) => {
            const fenParts = fen.split(' '); fenParts[1] = color; getBestMoveFromStockfishApi(fenParts.join(' '));
        };
        if (moveSide === 'both') getMoveForColor(`${fenPosition} ${turnColor} KQkq - 0 1`, turnColor);
        else if (moveSide === 'white') getMoveForColor(`${fenPosition} w KQkq - 0 1`, 'w');
        else if (moveSide === 'black') getMoveForColor(`${fenPosition} b KQkq - 0 1`, 'b');
    } catch (err) { console.error(err); }
    finally { isExtracting = false; }
}

function watchForMoves() {
    if (!extensionSettings.extensionEnabled) return;
    if (window.__copilotMoveObserver) window.__copilotMoveObserver.disconnect();
    const moveList = document.querySelector('.move-list.chessboard-pkg-move-list-component');
    if (!moveList) return setTimeout(watchForMoves, 100);
    const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(extractFEN, 500);
    });
    observer.observe(moveList, { childList: true, subtree: true });
    window.__copilotMoveObserver = observer;
    const boardContainer = document.querySelector('.board')?.parentElement;
    if (boardContainer) {
        if (window.__copilotBoardObserver) window.__copilotBoardObserver.disconnect();
        const boardObserver = new MutationObserver(() => setTimeout(watchForMoves, 100));
        boardObserver.observe(boardContainer, { childList: true, subtree: true });
        window.__copilotBoardObserver = boardObserver;
    }
    console.log('👀 Watching for moves...');
}

// Listen for enable/disable changes and re-run or disconnect observers
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'UPDATE_SETTINGS' && typeof msg.extensionEnabled === 'boolean') {
            if (msg.extensionEnabled) {
                watchForMoves();
                extractFEN(); // Immediately show best move when enabling
            } else {
                if (window.__copilotMoveObserver) window.__copilotMoveObserver.disconnect();
                if (window.__copilotBoardObserver) window.__copilotBoardObserver.disconnect();
                document.querySelectorAll('.copilot-highlight').forEach(el => el.remove());
                const arrowLayer = document.querySelector('svg.arrows');
                if (arrowLayer) arrowLayer.innerHTML = '';
            }
        }
    });
}

function drawArrow(from, to) {
    const arrowLayer = document.querySelector('svg.arrows');
    if (!arrowLayer) return;
    arrowLayer.innerHTML = '';
    const [fx, fy] = squareToCoords(from), [tx, ty] = squareToCoords(to);
    const dx = tx - fx, dy = ty - fy, len = Math.sqrt(dx*dx + dy*dy);
    const bodyWidth = 3.5, headLength = 10, bodyLength = len - headLength;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const pts = [
        [fx + px * bodyWidth / 2, fy + py * bodyWidth / 2],
        [fx - px * bodyWidth / 2, fy - py * bodyWidth / 2],
        [fx + ux * bodyLength - px * bodyWidth / 2, fy + uy * bodyLength - py * bodyWidth / 2],
        [fx + ux * bodyLength + px * bodyWidth / 2, fy + uy * bodyLength + py * bodyWidth / 2]
    ];
    const body = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    body.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    body.setAttribute('fill', extensionSettings.highlightColor);
    arrowLayer.appendChild(body);
    const tipX = fx + ux * len, tipY = fy + uy * len;
    const baseLeftX = fx + ux * bodyLength + px * bodyWidth * 1.5, baseLeftY = fy + uy * bodyLength + py * bodyWidth * 1.5;
    const baseRightX = fx + ux * bodyLength - px * bodyWidth * 1.5, baseRightY = fy + uy * bodyLength - py * bodyWidth * 1.5;
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    head.setAttribute('points', `${tipX},${tipY} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`);
    head.setAttribute('fill', extensionSettings.highlightColor);
    arrowLayer.appendChild(head);
}

function squareToCoords(square) {
    const file = square[0].toLowerCase().charCodeAt(0) - 97, rank = 8 - parseInt(square[1]);
    return [(file + 0.5) * 12.5, (rank + 0.5) * 12.5];
}

watchForMoves();