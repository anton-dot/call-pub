const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const boardWrap = $('#boardWrap');
const boardCanvas = $('#boardCanvas');
const previewCanvas = $('#previewCanvas');
const objectLayer = $('#objectLayer');
const imageLayer = $('#imageLayer');
const textLayer = $('#textLayer');
const cursorLayer = $('#cursorLayer');
const ctx = boardCanvas.getContext('2d');
const pctx = previewCanvas.getContext('2d');
const statusDot = $('#statusDot');
const statusText = $('#statusText');
const roomBadge = $('#roomBadge');
const roomInput = $('#roomInput');
const displayNameInput = $('#displayNameInput');
const micSelect = $('#micSelect');
const cameraSelect = $('#cameraSelect');
const speakerSelect = $('#speakerSelect');
const participantsEl = $('#participants');
const streamsEl = $('#streams');
const emptyStreams = $('#emptyStreams');
const activityEl = $('#activity');
const toastEl = $('#toast');
const colorToggle = $('#colorToggle');
const colorPopover = $('#colorPopover');
const currentColor = $('#currentColor');
const sizeToggle = $('#sizeToggle');
const sizePopover = $('#sizePopover');
const currentSizeDot = $('#currentSizeDot');
const lineMenuBtn = $('#lineMenuBtn');
const linePopover = $('#linePopover');
const zoomValue = $('#zoomValue');
const micToggleBtn = $('#micToggleBtn');
const cameraToggleBtn = $('#cameraToggleBtn');
const micMenuBtn = $('#micMenuBtn');
const cameraMenuBtn = $('#cameraMenuBtn');
const speakerMenuBtn = $('#speakerMenuBtn');
const micPopover = $('#micPopover');
const cameraPopover = $('#cameraPopover');
const speakerPopover = $('#speakerPopover');
const streamViewer = $('#streamViewer');
const streamViewerTitle = $('#streamViewerTitle');
const streamViewerSlot = $('#streamViewerSlot');
const fullscreenStreamBtn = $('#fullscreenStreamBtn');
const closeStreamViewerBtn = $('#closeStreamViewerBtn');
const imageFileInput = $('#imageFileInput');
const objectContextMenu = $('#objectContextMenu');
const appLoader = $('#appLoader');

const colors = ['#111827', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0f766e', '#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#475569', '#ffffff'];
const urlParams = new URLSearchParams(window.location.search);
const minScale = 0.25;
const maxScale = 4;
const heartbeatMs = 5000;
const stalePeerMs = 16000;
const cursorThrottleMs = 45;
const cursorIdleMs = 9000;
const pointerPulseMs = 180;
const maxEmbeddedImageSide = 1600;

const app = {
    peer: null,
    roomId: urlParams.get('room') || '',
    ownId: '',
    hostingRoom: false,
    connections: new Map(),
    peerProfiles: new Map(),
    heartbeatTimer: null,
    reconnectTimer: null,
    remoteCursors: new Map(),
    cursorCleanupTimer: null,
    lastCursorSent: 0,
    displayNameBroadcastTimer: null,
    pointerActive: null,
    selectedObject: null,
    mediaCalls: new Map(),
    localMediaStream: null,
    screenStream: null,
    activeMediaKind: '',
    enlargedStream: null,
    displayName: localStorage.getItem('callpub.displayName') || `Guest ${Math.floor(1000 + Math.random() * 9000)}`,
    audioMuted: false,
    videoMuted: false,
    devices: {
        audioInput: localStorage.getItem('callpub.audioInput') || '',
        videoInput: localStorage.getItem('callpub.videoInput') || '',
        audioOutput: localStorage.getItem('callpub.audioOutput') || ''
    },
    boardEvents: [],
    shapeObjects: new Map(),
    shapeResizeObserver: null,
    shapeResizeTimers: new Map(),
    imageObjects: new Map(),
    imageResizeObserver: null,
    imageResizeTimers: new Map(),
    textObjects: new Map(),
    textResizeObserver: null,
    textResizeTimers: new Map(),
    tool: 'pen',
    lineStyle: 'plain',
    color: '#111827',
    size: 6,
    drawing: null,
    panning: null,
    spacePressed: false,
    dpr: 1,
    view: {
        x: 0,
        y: 0,
        scale: 1
    }
};

function setStatus(message, tone = 'pending') {
    statusText.textContent = message;
    statusDot.className = `status-dot ${tone === 'ok' ? 'ok' : tone === 'error' ? 'error' : ''}`;
}

function hideAppLoader() {
    appLoader?.classList.add('ready');
}

function refreshIcons() {
    if (!window.lucide?.createIcons) {
        document.body.classList.add('icons-fallback');
        return;
    }
    try {
        window.lucide.createIcons();
        document.body.classList.remove('icons-fallback');
    } catch {
        document.body.classList.add('icons-fallback');
    }
}

window.setTimeout(hideAppLoader, 5000);

function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    window.clearTimeout(toastEl._timer);
    toastEl._timer = window.setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function log(message) {
    const item = document.createElement('div');
    item.textContent = `${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}  ${message}`;
    activityEl.prepend(item);
    while (activityEl.children.length > 12) activityEl.lastElementChild.remove();
}

function safeId(value) {
    return String(value).replace(/[^a-z0-9_-]/gi, '_');
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result));
        reader.addEventListener('error', () => reject(reader.error));
        reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', reject);
        image.src = src;
    });
}

async function normalizeImageDataUrl(dataUrl) {
    const image = await loadImage(dataUrl);
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const scale = Math.min(1, maxEmbeddedImageSide / Math.max(width, height));
    if (scale >= 1) return {src: dataUrl, width, height};

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
        src: canvas.toDataURL('image/jpeg', 0.88),
        width: canvas.width,
        height: canvas.height
    };
}

function createId(prefix = 'id') {
    const browserCrypto = globalThis.crypto;
    if (browserCrypto?.randomUUID) return `${prefix}-${browserCrypto.randomUUID()}`;
    if (browserCrypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        browserCrypto.getRandomValues(bytes);
        return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createRoomId() {
    return `callpub-${createId('room').replace(/^room-/, '').replace(/-/g, '').slice(0, 10)}`;
}

function boardStorageKey(roomId = app.roomId) {
    return `callpub.board.${roomId || 'draft'}`;
}

function roomHostStorageKey(roomId = app.roomId) {
    return `callpub.host.${roomId || 'draft'}`;
}

function markRoomHost(roomId = app.roomId) {
    if (roomId) localStorage.setItem(roomHostStorageKey(roomId), '1');
}

function isKnownRoomHost(roomId = app.roomId) {
    return Boolean(roomId && localStorage.getItem(roomHostStorageKey(roomId)) === '1');
}

function saveBoardState(roomId = app.roomId) {
    if (!roomId) return;
    try {
        localStorage.setItem(boardStorageKey(roomId), JSON.stringify(app.boardEvents));
    } catch {
        toast('Board is too large for local browser storage');
    }
}

function loadBoardState(roomId = app.roomId) {
    if (!roomId) return false;
    try {
        const stored = localStorage.getItem(boardStorageKey(roomId));
        if (!stored) return false;
        const events = JSON.parse(stored);
        if (!Array.isArray(events)) return false;
        app.boardEvents = events;
        replayBoard();
        return true;
    } catch {
        return false;
    }
}

function roomUrl() {
    if (!app.roomId) return window.location.href;
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', app.roomId);
    return url.toString();
}

function updateRoomUi() {
    roomBadge.textContent = app.roomId ? app.roomId.slice(0, 10) : 'room';
    roomInput.value = app.roomId;
    displayNameInput.value = app.displayName;
    renderParticipants();
}

function peerName(peerId) {
    return app.peerProfiles.get(peerId)?.name || peerId;
}

function peerCursorColor(peerId) {
    const palette = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0f766e', '#dc2626', '#0891b2'];
    const hash = String(peerId).split('').reduce((total, char) => total + char.charCodeAt(0), 0);
    return palette[hash % palette.length];
}

function updatePeerProfile(peerId, patch = {}) {
    const current = app.peerProfiles.get(peerId) || {};
    app.peerProfiles.set(peerId, {...current, ...patch, lastSeen: Date.now()});
    const cursor = app.remoteCursors.get(peerId);
    if (cursor && patch.name) cursor.label.textContent = String(patch.name).slice(0, 32);
}

function touchPeer(peerId) {
    updatePeerProfile(peerId);
}

function updatePeerMediaLabels(peerId) {
    const name = peerName(peerId);
    $$(`[id^="remote-${safeId(peerId)}-"]`).forEach((tile) => {
        const label = tile.querySelector('.stream-label span');
        if (!label) return;
        label.textContent = tile.id.endsWith('-screen') ? `Screen: ${name}` : name;
    });
}

function renderParticipants() {
    const peers = [
        {id: app.ownId || 'local', label: app.displayName || 'You', role: app.roomId ? 'you' : 'creating'}
    ];
    app.connections.forEach((conn) => peers.push({id: conn.peer, label: peerName(conn.peer), role: conn.open ? 'online' : 'wait'}));

    participantsEl.innerHTML = '';
    peers.forEach((peer) => {
        const row = document.createElement('div');
        row.className = 'participant';
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = (peer.label || '?')[0].toUpperCase();
        const name = document.createElement('span');
        name.className = 'participant-name';
        name.title = peer.id;
        name.textContent = peer.label;
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = peer.role;
        row.append(avatar, name, badge);
        participantsEl.append(row);
    });
}

function broadcastProfile() {
    broadcast({type: 'profile', from: app.ownId, name: app.displayName});
}

function broadcast(payload, exceptPeer = '') {
    app.connections.forEach((conn) => {
        if (conn.open && conn.peer !== exceptPeer) conn.send(payload);
    });
}

function cleanupPeer(peerId, reason = 'left') {
    const streamTiles = $$(`[id^="remote-${safeId(peerId)}-"]`);
    const conn = app.connections.get(peerId);
    const knownPeer = Boolean(conn || app.peerProfiles.has(peerId) || streamTiles.length);
    if (!knownPeer) return;
    if (conn) {
        app.connections.delete(peerId);
        try {
            conn.close();
        } catch {
            // Already closed.
        }
    }
    streamTiles.forEach((tile) => tile.remove());
    if ($$('.stream-tile').length === 0) emptyStreams.classList.remove('hidden');
    app.mediaCalls.forEach((call, key) => {
        if (key.startsWith(`${peerId}:`)) {
            try {
                call.close();
            } catch {
                // Already closed.
            }
            app.mediaCalls.delete(key);
        }
    });
    app.peerProfiles.delete(peerId);
    removeRemoteCursor(peerId);
    log(reason === 'stale' ? `Removed inactive participant: ${peerId}` : `Participant left: ${peerId}`);
    renderParticipants();
    if (app.connections.size === 0) {
        if (app.hostingRoom) setStatus('Room ready, waiting for participants', 'ok');
        else {
            setStatus('Disconnected from room, reconnecting...', 'pending');
            scheduleRoomReconnect();
        }
    }
}

function scheduleRoomReconnect() {
    if (app.hostingRoom || app.reconnectTimer || !app.peer || !app.roomId) return;
    app.reconnectTimer = window.setTimeout(() => {
        app.reconnectTimer = null;
        if (app.hostingRoom || app.connections.size > 0 || !app.peer || app.peer.destroyed) return;
        const conn = app.peer.connect(app.roomId, {reliable: true});
        setupConnection(conn);
    }, 1800);
}

function startHeartbeat() {
    if (app.heartbeatTimer) return;
    app.heartbeatTimer = window.setInterval(() => {
        const now = Date.now();
        app.connections.forEach((conn, peerId) => {
            const lastSeen = app.peerProfiles.get(peerId)?.lastSeen || 0;
            if (lastSeen && now - lastSeen > stalePeerMs) {
                cleanupPeer(peerId, 'stale');
                return;
            }
            if (conn.open) {
                try {
                    conn.send({type: 'ping', at: now});
                } catch {
                    cleanupPeer(peerId, 'stale');
                }
            }
        });
    }, heartbeatMs);
}

function setupConnection(conn) {
    app.connections.set(conn.peer, conn);
    touchPeer(conn.peer);
    renderParticipants();

    conn.on('open', () => {
        touchPeer(conn.peer);
        setStatus(`Connected to ${peerName(conn.peer)}`, 'ok');
        log(`Participant joined: ${peerName(conn.peer)}`);
        renderParticipants();
        conn.send({type: 'hello', from: app.ownId, name: app.displayName, boardEvents: app.boardEvents});
    });

    conn.on('data', (data) => handleData(conn, data));
    conn.on('close', () => cleanupPeer(conn.peer));

    conn.on('error', () => {
        cleanupPeer(conn.peer, 'stale');
        setStatus('P2P connection error', 'error');
    });
}

function handleData(conn, data) {
    if (!data || typeof data !== 'object') return;
    touchPeer(conn.peer);

    if (data.type === 'ping') {
        if (conn.open) conn.send({type: 'pong', at: Date.now()});
        return;
    }

    if (data.type === 'pong') return;

    if (data.type === 'bye') {
        cleanupPeer(conn.peer);
        return;
    }

    if (data.type === 'hello') {
        if (data.name) {
            updatePeerProfile(conn.peer, {name: String(data.name).slice(0, 32)});
            renderParticipants();
            updatePeerMediaLabels(conn.peer);
        }
        if (Array.isArray(data.boardEvents) && data.boardEvents.length > app.boardEvents.length) {
            app.boardEvents = data.boardEvents;
            replayBoard();
            saveBoardState();
        } else {
            conn.send({type: 'board-state', boardEvents: app.boardEvents});
            conn.send({type: 'profile', from: app.ownId, name: app.displayName});
        }
        return;
    }

    if (data.type === 'profile') {
        if (data.name) updatePeerProfile(conn.peer, {name: String(data.name).slice(0, 32)});
        renderParticipants();
        updatePeerMediaLabels(conn.peer);
        return;
    }

    if (data.type === 'cursor') {
        updateRemoteCursor(conn.peer, data);
        broadcast(data, conn.peer);
        return;
    }

    if (data.type === 'pointer-pulse') {
        createPointerPulse({x: data.x, y: data.y}, data.name || peerName(conn.peer), data.color || peerCursorColor(conn.peer));
        broadcast(data, conn.peer);
        return;
    }

    if (data.type === 'board-event') {
        app.boardEvents.push(data.event);
        applyBoardEvent(data.event);
        saveBoardState();
        broadcast(data, conn.peer);
        return;
    }

    if (data.type === 'board-state') {
        app.boardEvents = Array.isArray(data.boardEvents) ? data.boardEvents : [];
        replayBoard();
        saveBoardState();
        return;
    }

    if (data.type === 'clear-board') {
        app.boardEvents = [];
        replayBoard();
        saveBoardState();
        broadcast(data, conn.peer);
    }
}

function initPeer() {
    if (!window.Peer) {
        setStatus('PeerJS failed to load. Check your connection.', 'error');
        hideAppLoader();
        return;
    }

    if (!app.roomId) {
        app.roomId = createRoomId();
        markRoomHost(app.roomId);
        window.history.replaceState({}, '', roomUrl());
    }

    let hostRetryTimer = 0;

    function scheduleHostRetry() {
        if (app.hostingRoom || hostRetryTimer) return;
        if (!isKnownRoomHost(app.roomId)) {
            scheduleRoomReconnect();
            return;
        }
        hostRetryTimer = window.setTimeout(() => {
            hostRetryTimer = 0;
            if (app.hostingRoom || app.connections.size > 0) return;
            setStatus('Reclaiming room...', 'pending');
            try {
                app.peer?.destroy();
            } catch {
                // The failed guest peer can be discarded.
            }
            becomeRoomHost();
        }, 2500);
    }

    function becomeRoomHost() {
        let opened = false;
        app.peer = new Peer(app.roomId);

        app.peer.on('open', (id) => {
            opened = true;
            app.ownId = id;
            app.hostingRoom = true;
            markRoomHost(app.roomId);
            updateRoomUi();
            loadBoardState(app.roomId);
            startHeartbeat();
            setStatus('Room ready, waiting for participants', 'ok');
            log(urlParams.get('room') ? 'Room restored' : 'Room created');
            hideAppLoader();
        });

        app.peer.on('connection', setupConnection);
        app.peer.on('call', handleIncomingCall);
        app.peer.on('error', (error) => {
            if (!opened && error.type === 'unavailable-id') {
                try {
                    app.peer.destroy();
                } catch {
                    // Failed room-host attempt can be discarded.
                }
                joinExistingRoom();
                return;
            }
            setStatus(error.type === 'peer-unavailable' ? 'Room not found' : 'PeerJS error', 'error');
            log(`PeerJS: ${error.type || error.message}`);
            hideAppLoader();
        });
    }

    function joinExistingRoom() {
        app.peer = new Peer();

        app.peer.on('open', (id) => {
            app.ownId = id;
            app.hostingRoom = false;
            updateRoomUi();
            loadBoardState(app.roomId);
            startHeartbeat();
            setStatus('Joining room...', 'pending');
            hideAppLoader();
            const conn = app.peer.connect(app.roomId, {reliable: true});
            let opened = false;
            conn.on('open', () => {
                opened = true;
            });
            conn.on('error', () => {
                if (!opened) scheduleHostRetry();
            });
            conn.on('close', () => {
                if (!opened) scheduleHostRetry();
            });
            window.setTimeout(() => {
                if (!opened && app.connections.get(conn.peer) === conn) scheduleHostRetry();
            }, 7000);
            setupConnection(conn);
        });

        app.peer.on('connection', setupConnection);
        app.peer.on('call', handleIncomingCall);
        app.peer.on('error', (error) => {
            setStatus(error.type === 'peer-unavailable' ? 'Room not found' : 'PeerJS error', 'error');
            log(`PeerJS: ${error.type || error.message}`);
            hideAppLoader();
        });
    }

    if (urlParams.get('room') && !isKnownRoomHost(app.roomId)) joinExistingRoom();
    else becomeRoomHost();
}

function setupColors() {
    const grid = $('#colorGrid');
    colors.forEach((color) => {
        const swatch = document.createElement('button');
        swatch.className = `swatch ${color === app.color ? 'active' : ''}`;
        swatch.type = 'button';
        swatch.title = color;
        swatch.style.background = color;
        swatch.addEventListener('click', () => {
            app.color = color;
            updateColorUi(swatch);
            if (app.tool === 'eraser') setTool('pen');
            closePopovers();
        });
        grid.append(swatch);
    });
    updateColorUi(grid.querySelector('.swatch.active'));
}

function updateColorUi(activeSwatch = null) {
    $$('.swatch').forEach((item) => item.classList.toggle('active', item === activeSwatch || item.title === app.color));
    currentColor.style.background = app.color;
}

function updateSizeUi() {
    $('#sizeValue').textContent = app.size;
    currentSizeDot.style.setProperty('--current-size', `${app.size}px`);
    $$('.size-preset').forEach((button) => button.classList.toggle('active', Number(button.dataset.size) === app.size));
}

function setPopover(popover, toggle, isOpen) {
    popover.classList.toggle('hidden', !isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
}

function closePopovers(except = null) {
    if (except !== colorPopover) setPopover(colorPopover, colorToggle, false);
    if (except !== sizePopover) setPopover(sizePopover, sizeToggle, false);
    if (except !== linePopover) setPopover(linePopover, lineMenuBtn, false);
    if (except !== micPopover) setPopover(micPopover, micMenuBtn, false);
    if (except !== cameraPopover) setPopover(cameraPopover, cameraMenuBtn, false);
    if (except !== speakerPopover) setPopover(speakerPopover, speakerMenuBtn, false);
}

function togglePopover(popover, toggle) {
    const willOpen = popover.classList.contains('hidden');
    closePopovers(popover);
    setPopover(popover, toggle, willOpen);
}

function setTool(tool) {
    if (tool !== 'pointer') stopPointerTool();
    app.tool = tool;
    $$('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    updateBoardCursor();
    if (tool === 'eraser') closePopovers();
}

function setLineStyle(style) {
    app.lineStyle = style;
    $$('.line-option').forEach((button) => button.classList.toggle('active', button.dataset.lineStyle === style));
    const icon = {
        plain: 'minus',
        end: 'arrow-right',
        start: 'arrow-left',
        both: 'move-horizontal'
    }[style] || 'minus';
    $('#lineToolBtn i').setAttribute('data-lucide', icon);
    refreshIcons();
    setTool('line');
    closePopovers();
}

function updateBoardCursor() {
    if (app.panning) {
        boardWrap.style.cursor = 'grabbing';
    } else if (app.tool === 'pan' || app.spacePressed) {
        boardWrap.style.cursor = 'grab';
    } else if (app.tool === 'text') {
        boardWrap.style.cursor = 'text';
    } else if (app.tool === 'pointer') {
        boardWrap.style.cursor = 'alias';
    } else {
        boardWrap.style.cursor = 'crosshair';
    }
}

function resizeCanvasToWrap(canvas, context) {
    const rect = boardWrap.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    app.dpr = dpr;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    syncCanvasTransform(context);
}

function resizeBoard() {
    resizeCanvasToWrap(boardCanvas, ctx);
    resizeCanvasToWrap(previewCanvas, pctx);
    replayBoard();
}

function syncCanvasTransform(context) {
    context.setTransform(
        app.dpr * app.view.scale,
        0,
        0,
        app.dpr * app.view.scale,
        app.dpr * app.view.x,
        app.dpr * app.view.y
    );
    context.lineCap = 'round';
    context.lineJoin = 'round';
}

function clearCanvas(context) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    syncCanvasTransform(context);
}

function replayBoard(target = ctx) {
    clearCanvas(target);
    if (target === ctx) {
        clearShapeObjects();
        clearImageObjects();
        clearTextObjects();
    }
    app.boardEvents.forEach((event) => {
        if (target === ctx) applyBoardEvent(event);
        else drawBoardEvent(target, event);
    });
}

function updateBoardBackground() {
    const gridSize = 28 * app.view.scale;
    boardWrap.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    boardWrap.style.backgroundPosition = `${app.view.x}px ${app.view.y}px`;
}

function updateZoomUi() {
    zoomValue.textContent = Math.round(app.view.scale * 100);
}

function updateViewport() {
    syncCanvasTransform(ctx);
    syncCanvasTransform(pctx);
    updateBoardBackground();
    updateZoomUi();
    clearCanvas(ctx);
    app.boardEvents.forEach((event) => {
        if (!isObjectEvent(event)) drawBoardEvent(ctx, event);
    });
    updateShapeObjectLayouts();
    updateImageObjectLayouts();
    updateTextObjectLayouts();
    updateRemoteCursorLayouts();
}

function ensureRemoteCursor(peerId) {
    let cursor = app.remoteCursors.get(peerId);
    if (cursor?.element) return cursor;

    const element = document.createElement('div');
    element.className = 'remote-cursor';
    element.id = `cursor-${safeId(peerId)}`;
    element.style.setProperty('--cursor-color', peerCursorColor(peerId));

    const pointer = document.createElement('span');
    pointer.className = 'remote-cursor-pointer';

    const label = document.createElement('span');
    label.className = 'remote-cursor-label';

    element.append(pointer, label);
    cursorLayer.append(element);

    cursor = {element, label, x: 0, y: 0, updatedAt: Date.now()};
    app.remoteCursors.set(peerId, cursor);
    return cursor;
}

function positionRemoteCursor(cursor) {
    cursor.element.style.transform = `translate(${cursor.x * app.view.scale + app.view.x}px, ${cursor.y * app.view.scale + app.view.y}px)`;
}

function updateRemoteCursorLayouts() {
    app.remoteCursors.forEach(positionRemoteCursor);
}

function removeRemoteCursor(peerId) {
    const cursor = app.remoteCursors.get(peerId);
    if (!cursor) return;
    cursor.element.remove();
    app.remoteCursors.delete(peerId);
}

function updateRemoteCursor(peerId, data) {
    if (data.visible === false) {
        removeRemoteCursor(peerId);
        return;
    }

    const x = Number(data.x);
    const y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (data.name) updatePeerProfile(peerId, {name: String(data.name).slice(0, 32)});

    const cursor = ensureRemoteCursor(peerId);
    cursor.x = x;
    cursor.y = y;
    cursor.updatedAt = Date.now();
    cursor.label.textContent = String(data.name || peerName(peerId)).slice(0, 32);
    cursor.element.dataset.tool = data.tool || '';
    positionRemoteCursor(cursor);
}

function startCursorCleanup() {
    if (app.cursorCleanupTimer) return;
    app.cursorCleanupTimer = window.setInterval(() => {
        const now = Date.now();
        app.remoteCursors.forEach((cursor, peerId) => {
            if (now - cursor.updatedAt > cursorIdleMs) removeRemoteCursor(peerId);
        });
    }, 1000);
}

function sendCursor(point, visible = true) {
    const now = Date.now();
    if (visible && now - app.lastCursorSent < cursorThrottleMs) return;
    app.lastCursorSent = now;
    broadcast({
        type: 'cursor',
        x: point?.x || 0,
        y: point?.y || 0,
        visible,
        name: app.displayName,
        tool: app.tool
    });
}

function createPointerPulse(point, name = app.displayName, color = app.color) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const pulse = document.createElement('div');
    pulse.className = 'pointer-pulse';
    pulse.style.left = `${x * app.view.scale + app.view.x}px`;
    pulse.style.top = `${y * app.view.scale + app.view.y}px`;
    pulse.style.setProperty('--pointer-color', color || app.color);
    pulse.title = name || '';

    for (let index = 0; index < 3; index += 1) {
        const ring = document.createElement('span');
        ring.style.setProperty('--ring-delay', `${index * 80}ms`);
        pulse.append(ring);
    }

    cursorLayer.append(pulse);
    window.setTimeout(() => pulse.remove(), 900);
}

function broadcastPointerPulse(point) {
    broadcast({
        type: 'pointer-pulse',
        x: point.x,
        y: point.y,
        color: app.color,
        name: app.displayName
    });
}

function emitPointerPulse(point, shouldBroadcast = true) {
    createPointerPulse(point, app.displayName, app.color);
    if (shouldBroadcast) broadcastPointerPulse(point);
}

function startPointerTool(event) {
    const point = pointFromEvent(event);
    sendCursor(point);
    emitPointerPulse(point);
    boardWrap.setPointerCapture(event.pointerId);
    app.pointerActive = {
        pointerId: event.pointerId,
        point,
        timer: window.setInterval(() => {
            if (!app.pointerActive) return;
            emitPointerPulse(app.pointerActive.point);
        }, pointerPulseMs)
    };
}

function updatePointerTool(event) {
    if (!app.pointerActive || app.pointerActive.pointerId !== event.pointerId) return false;
    const point = pointFromEvent(event);
    app.pointerActive.point = point;
    sendCursor(point);
    return true;
}

function stopPointerTool(event = null) {
    if (!app.pointerActive) return false;
    if (event && app.pointerActive.pointerId !== event.pointerId) return false;
    window.clearInterval(app.pointerActive.timer);
    app.pointerActive = null;
    return true;
}

function drawBoardEvent(context, event) {
    if (!event) return;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = event.color || app.color;
    context.fillStyle = event.color || app.color;
    context.lineWidth = event.size || app.size;

    if (event.kind === 'stroke') {
        const points = event.points || [];
        if (event.mode === 'eraser') context.globalCompositeOperation = 'destination-out';
        context.beginPath();
        points.forEach((point, index) => {
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
        });
        if (points.length === 1) {
            const point = points[0];
            context.lineTo(point.x + 0.1, point.y + 0.1);
        }
        context.stroke();
    }

    if (event.kind === 'line') {
        context.beginPath();
        context.moveTo(event.x1, event.y1);
        context.lineTo(event.x2, event.y2);
        context.stroke();
        drawArrowheadsOnContext(context, event.x1, event.y1, event.x2, event.y2, event.lineStyle || 'plain', event.size || app.size);
    }

    if (event.kind === 'rect') {
        context.strokeRect(event.x1, event.y1, event.x2 - event.x1, event.y2 - event.y1);
    }

    if (event.kind === 'circle') {
        if (event.r !== undefined) {
            context.beginPath();
            context.arc(event.x1, event.y1, event.r, 0, Math.PI * 2);
            context.stroke();
            context.restore();
            return;
        }
        const x = Math.min(event.x1, event.x2);
        const y = Math.min(event.y1, event.y2);
        const width = Math.abs(event.x2 - event.x1);
        const height = Math.abs(event.y2 - event.y1);
        context.beginPath();
        context.ellipse(x + width / 2, y + height / 2, Math.max(1, width / 2), Math.max(1, height / 2), 0, 0, Math.PI * 2);
        context.stroke();
    }

    if (event.kind === 'text') {
        context.font = `${event.size || 18}px Inter, system-ui, sans-serif`;
        context.textBaseline = 'top';
        String(event.text || '').split('\n').forEach((line, index) => {
            context.fillText(line, event.x, event.y + index * (event.size || 18) * 1.24);
        });
    }

    context.restore();
}

function drawTextObjectOnContext(context, object) {
    context.save();
    context.fillStyle = object.color || app.color;
    context.font = `${object.size || 18}px Inter, system-ui, sans-serif`;
    context.textBaseline = 'top';
    const lineHeight = (object.size || 18) * 1.24;
    const words = String(object.text || '').split(/(\s+)/);
    let line = '';
    let y = object.y;
    const maxWidth = Math.max(24, object.width - 8);

    words.forEach((word) => {
        if (word.includes('\n')) {
            word.split('\n').forEach((part, index) => {
                if (index > 0) {
                    context.fillText(line, object.x + 4, y + 4);
                    y += lineHeight;
                    line = '';
                }
                line += part;
            });
            return;
        }
        const next = line + word;
        if (line && context.measureText(next).width > maxWidth) {
            context.fillText(line, object.x + 4, y + 4);
            y += lineHeight;
            line = word.trimStart();
        } else {
            line = next;
        }
    });
    if (line) context.fillText(line, object.x + 4, y + 4);
    context.restore();
}

function drawShapeObjectOnContext(context, object) {
    context.save();
    context.strokeStyle = object.color || app.color;
    context.lineWidth = object.size || app.size;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (object.kind === 'line') {
        const start = object.lineStart || {x: 0, y: 0};
        const end = object.lineEnd || {x: object.width, y: object.height};
        context.beginPath();
        context.moveTo(object.x + start.x, object.y + start.y);
        context.lineTo(object.x + end.x, object.y + end.y);
        context.stroke();
        drawArrowheadsOnContext(context, object.x + start.x, object.y + start.y, object.x + end.x, object.y + end.y, object.lineStyle || 'plain', object.size || app.size);
    } else if (object.kind === 'rect') {
        context.strokeRect(object.x, object.y, object.width, object.height);
    } else if (object.kind === 'circle') {
        context.beginPath();
        context.ellipse(object.x + object.width / 2, object.y + object.height / 2, Math.max(1, object.width / 2), Math.max(1, object.height / 2), 0, 0, Math.PI * 2);
        context.stroke();
    }

    context.restore();
}

async function drawImageObjectOnContext(context, object) {
    if (!object.src) return;
    try {
        const image = await loadImage(object.src);
        context.drawImage(image, object.x, object.y, object.width, object.height);
    } catch {
        // Broken embedded images should not block PNG export.
    }
}

async function drawBoardObjectOnContext(context, item) {
    if (item.type === 'shape') drawShapeObjectOnContext(context, item.object);
    if (item.type === 'image') await drawImageObjectOnContext(context, item.object);
    if (item.type === 'text') drawTextObjectOnContext(context, item.object);
}

function arrowheadPoints(x1, y1, x2, y2, size) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = Math.max(10, size * 4);
    const spread = Math.PI / 7;
    return [
        {x: x2 - length * Math.cos(angle - spread), y: y2 - length * Math.sin(angle - spread)},
        {x: x2, y: y2},
        {x: x2 - length * Math.cos(angle + spread), y: y2 - length * Math.sin(angle + spread)}
    ];
}

function drawArrowheadsOnContext(context, x1, y1, x2, y2, style, size) {
    if (style === 'plain') return;
    const draw = (fromX, fromY, toX, toY) => {
        const points = arrowheadPoints(fromX, fromY, toX, toY, size);
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        context.lineTo(points[1].x, points[1].y);
        context.lineTo(points[2].x, points[2].y);
        context.stroke();
    };
    if (style === 'end' || style === 'both') draw(x1, y1, x2, y2);
    if (style === 'start' || style === 'both') draw(x2, y2, x1, y1);
}

function applyBoardEvent(event) {
    if (!event) return;
    if (isShapeKind(event.kind)) {
        createShapeObject(normalizeShapeEvent(event));
        return;
    }

    if (event.kind === 'shape-update') {
        updateShapeObject(event.id, event.patch || {});
        return;
    }

    if (event.kind === 'text') {
        createTextObject({
            id: event.id || createId('text'),
            x: event.x,
            y: event.y,
            width: event.width || 180,
            height: event.height || 44,
            text: event.text || '',
            color: event.color || app.color,
            size: event.size || 18
        });
        return;
    }

    if (event.kind === 'text-update') {
        updateTextObject(event.id, event.patch || {});
        return;
    }

    if (event.kind === 'image') {
        createImageObject({
            id: event.id || createId('image'),
            x: event.x,
            y: event.y,
            width: event.width || 220,
            height: event.height || 160,
            src: event.src,
            name: event.name || 'Image'
        });
        return;
    }

    if (event.kind === 'image-update') {
        updateImageObject(event.id, event.patch || {});
        return;
    }

    drawBoardEvent(ctx, event);
}

function isShapeKind(kind) {
    return kind === 'line' || kind === 'rect' || kind === 'circle';
}

function isObjectEvent(event) {
    return event.kind === 'text' || event.kind === 'text-update' || event.kind === 'image' || event.kind === 'image-update' || event.kind === 'shape-update' || isShapeKind(event.kind);
}

function allBoardObjects() {
    return [
        ...Array.from(app.shapeObjects.values()).map((object) => ({type: 'shape', object})),
        ...Array.from(app.imageObjects.values()).map((object) => ({type: 'image', object})),
        ...Array.from(app.textObjects.values()).map((object) => ({type: 'text', object}))
    ];
}

function nextObjectZ() {
    return allBoardObjects().reduce((max, item) => Math.max(max, item.object.z || 0), 0) + 1;
}

function objectUpdateKind(type) {
    return {
        shape: 'shape-update',
        image: 'image-update',
        text: 'text-update'
    }[type];
}

function objectMap(type) {
    return {
        shape: app.shapeObjects,
        image: app.imageObjects,
        text: app.textObjects
    }[type];
}

function getBoardObject(type, id) {
    const object = objectMap(type)?.get(id);
    return object ? {type, object} : null;
}

function bindObjectContextMenu(element, type, id) {
    element.dataset.objectType = type;
    element.dataset.objectId = id;
    element.addEventListener('contextmenu', (event) => openObjectContextMenu(event, type, id));
}

function openObjectContextMenu(event, type, id) {
    const target = getBoardObject(type, id);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    app.selectedObject = {type, id};
    closePopovers();
    const menuWidth = 178;
    const menuHeight = 148;
    const x = clamp(event.clientX, 8, window.innerWidth - menuWidth - 8);
    const y = clamp(event.clientY, 8, window.innerHeight - menuHeight - 8);
    objectContextMenu.style.left = `${x}px`;
    objectContextMenu.style.top = `${y}px`;
    objectContextMenu.classList.remove('hidden');
}

function closeObjectContextMenu() {
    objectContextMenu.classList.add('hidden');
    app.selectedObject = null;
}

function applyObjectZ(type, object, z) {
    object.z = z;
    if (type === 'shape') positionShapeElement(object);
    if (type === 'image') positionImageElement(object);
    if (type === 'text') positionTextElement(object);
}

function arrangeSelectedObject(action) {
    if (!app.selectedObject) return;
    const selected = getBoardObject(app.selectedObject.type, app.selectedObject.id);
    if (!selected) return closeObjectContextMenu();

    const ordered = allBoardObjects()
        .filter((item) => item.object.id)
        .sort((a, b) => (a.object.z || 0) - (b.object.z || 0));
    const fromIndex = ordered.findIndex((item) => item.type === selected.type && item.object.id === selected.object.id);
    if (fromIndex < 0) return closeObjectContextMenu();

    let toIndex = fromIndex;
    if (action === 'front') toIndex = ordered.length - 1;
    if (action === 'forward') toIndex = Math.min(ordered.length - 1, fromIndex + 1);
    if (action === 'backward') toIndex = Math.max(0, fromIndex - 1);
    if (action === 'back') toIndex = 0;
    if (toIndex === fromIndex) return closeObjectContextMenu();

    const [item] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, item);
    ordered.forEach((entry, index) => {
        const nextZ = index + 1;
        if (entry.object.z === nextZ) return;
        applyObjectZ(entry.type, entry.object, nextZ);
        commitBoardEvent({kind: objectUpdateKind(entry.type), id: entry.object.id, patch: {z: nextZ}});
    });
    closeObjectContextMenu();
}

function pointFromEvent(event) {
    const point = screenPointFromEvent(event);
    return screenToWorld(point.x, point.y);
}

function screenPointFromEvent(event) {
    const rect = boardWrap.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function screenToWorld(x, y) {
    return {
        x: (x - app.view.x) / app.view.scale,
        y: (y - app.view.y) / app.view.scale
    };
}

function zoomAt(screenX, screenY, nextScale) {
    const scale = clamp(nextScale, minScale, maxScale);
    const anchor = screenToWorld(screenX, screenY);
    app.view.scale = scale;
    app.view.x = screenX - anchor.x * scale;
    app.view.y = screenY - anchor.y * scale;
    updateViewport();
}

function zoomBy(factor) {
    const rect = boardWrap.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, app.view.scale * factor);
}

function resetView() {
    app.view.x = 0;
    app.view.y = 0;
    app.view.scale = 1;
    updateViewport();
}

function normalizeShapeEvent(event) {
    if (event.id && event.width !== undefined && event.height !== undefined) return {...event, z: event.z || nextObjectZ()};

    const x1 = event.x1 ?? 0;
    const y1 = event.y1 ?? 0;
    const x2 = event.x2 ?? (event.x1 + (event.w || 0));
    const y2 = event.y2 ?? (event.y1 + (event.h || 0));
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.max(16, Math.abs(x2 - x1));
    const height = Math.max(16, Math.abs(y2 - y1));
    return {
        id: event.id || createId('shape'),
        kind: event.kind,
        x,
        y,
        width,
        height,
        lineStart: event.kind === 'line' ? {x: x1 - x, y: y1 - y} : undefined,
        lineEnd: event.kind === 'line' ? {x: x2 - x, y: y2 - y} : undefined,
        lineStyle: event.kind === 'line' ? event.lineStyle || app.lineStyle : undefined,
        color: event.color || app.color,
        size: event.size || app.size,
        z: event.z || nextObjectZ()
    };
}

function clearShapeObjects() {
    if (app.shapeResizeObserver) app.shapeResizeObserver.disconnect();
    app.shapeResizeTimers.forEach((timer) => window.clearTimeout(timer));
    app.shapeResizeTimers.clear();
    app.shapeObjects.clear();
    $$('[data-shape-id]').forEach((element) => element.remove());
    app.shapeResizeObserver = null;
}

function updateShapeObjectLayouts() {
    app.shapeObjects.forEach((object) => positionShapeElement(object));
}

function positionShapeElement(object) {
    const element = document.querySelector(`[data-shape-id="${CSS.escape(object.id)}"]`);
    if (!element) return;
    element.style.left = `${object.x * app.view.scale + app.view.x}px`;
    element.style.top = `${object.y * app.view.scale + app.view.y}px`;
    element.style.width = `${Math.max(16, object.width * app.view.scale)}px`;
    element.style.height = `${Math.max(16, object.height * app.view.scale)}px`;
    element.style.zIndex = object.z || 1;
    renderShapeSvg(element, object);
}

function createShapeObject(object) {
    const normalized = normalizeShapeEvent(object);
    normalized.z = normalized.z || nextObjectZ();
    app.shapeObjects.set(normalized.id, normalized);
    let element = document.querySelector(`[data-shape-id="${CSS.escape(normalized.id)}"]`);
    if (!element) {
        element = document.createElement('div');
        element.className = 'shape-object';
        element.dataset.shapeId = normalized.id;
        element.tabIndex = 0;
        bindObjectContextMenu(element, 'shape', normalized.id);
        bindShapeObjectElement(element);
        objectLayer.append(element);
        ensureShapeResizeObserver().observe(element);
    }
    element.dataset.shapeKind = normalized.kind;
    positionShapeElement(normalized);
}

function renderShapeSvg(element, object) {
    const width = Math.max(16, object.width);
    const height = Math.max(16, object.height);
    const stroke = Math.max(1, object.size || app.size);
    const half = stroke / 2;
    const color = object.color || app.color;
    let shape = '';

    if (object.kind === 'line') {
        const start = object.lineStart || {x: 0, y: 0};
        const end = object.lineEnd || {x: width, y: height};
        shape = `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" />${arrowheadSvg(start.x, start.y, end.x, end.y, object.lineStyle || 'plain', stroke)}`;
    } else if (object.kind === 'rect') {
        shape = `<rect x="${half}" y="${half}" width="${Math.max(1, width - stroke)}" height="${Math.max(1, height - stroke)}" />`;
    } else if (object.kind === 'circle') {
        shape = `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${Math.max(1, width / 2 - half)}" ry="${Math.max(1, height / 2 - half)}" />`;
    }

    element.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><g fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
}

function arrowheadSvg(x1, y1, x2, y2, style, size) {
    if (style === 'plain') return '';
    const polyline = (fromX, fromY, toX, toY) => {
        const points = arrowheadPoints(fromX, fromY, toX, toY, size)
            .map((point) => `${point.x},${point.y}`)
            .join(' ');
        return `<polyline points="${points}" />`;
    };
    return [
        style === 'end' || style === 'both' ? polyline(x1, y1, x2, y2) : '',
        style === 'start' || style === 'both' ? polyline(x2, y2, x1, y1) : ''
    ].join('');
}

function ensureShapeResizeObserver() {
    if (app.shapeResizeObserver) return app.shapeResizeObserver;
    app.shapeResizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
            const element = entry.target;
            const object = app.shapeObjects.get(element.dataset.shapeId);
            if (!object) return;
            const width = element.offsetWidth / app.view.scale;
            const height = element.offsetHeight / app.view.scale;
            if (Math.abs(width - object.width) < 2 && Math.abs(height - object.height) < 2) return;
            const scaleX = object.width ? width / object.width : 1;
            const scaleY = object.height ? height / object.height : 1;
            if (object.kind === 'line') {
                object.lineStart = {
                    x: (object.lineStart?.x || 0) * scaleX,
                    y: (object.lineStart?.y || 0) * scaleY
                };
                object.lineEnd = {
                    x: (object.lineEnd?.x ?? object.width) * scaleX,
                    y: (object.lineEnd?.y ?? object.height) * scaleY
                };
            }
            object.width = Math.max(16, width);
            object.height = Math.max(16, height);
            renderShapeSvg(element, object);
            window.clearTimeout(app.shapeResizeTimers.get(object.id));
            app.shapeResizeTimers.set(object.id, window.setTimeout(() => {
                commitBoardEvent({kind: 'shape-update', id: object.id, patch: shapePatch(object)});
            }, 180));
        });
    });
    return app.shapeResizeObserver;
}

function shapePatch(object) {
    return {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        lineStart: object.lineStart,
        lineEnd: object.lineEnd,
        lineStyle: object.lineStyle,
        z: object.z
    };
}

function updateShapeObject(id, patch) {
    const current = app.shapeObjects.get(id);
    if (!current) return;
    Object.assign(current, patch);
    positionShapeElement(current);
}

function bindShapeObjectElement(element) {
    element.addEventListener('pointerdown', onShapeObjectPointerDown);
}

function onShapeObjectPointerDown(event) {
    if (app.tool === 'pointer' || app.tool === 'pan' || app.spacePressed || event.button === 1) return;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    if (event.clientX > rect.right - 16 && event.clientY > rect.bottom - 16) return;
    event.preventDefault();
    event.stopPropagation();
    const object = app.shapeObjects.get(element.dataset.shapeId);
    if (!object) return;
    element.setPointerCapture(event.pointerId);
    const start = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: object.x,
        y: object.y
    };
    let moved = false;

    const move = (moveEvent) => {
        if (moveEvent.pointerId !== start.pointerId) return;
        moved = true;
        object.x = start.x + (moveEvent.clientX - start.clientX) / app.view.scale;
        object.y = start.y + (moveEvent.clientY - start.clientY) / app.view.scale;
        positionShapeElement(object);
    };

    const up = (upEvent) => {
        if (upEvent.pointerId !== start.pointerId) return;
        element.releasePointerCapture(start.pointerId);
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        if (moved) commitBoardEvent({kind: 'shape-update', id: object.id, patch: shapePatch(object)});
    };

    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
}

function textObjectScreenRect(object) {
    return {
        left: object.x * app.view.scale + app.view.x,
        top: object.y * app.view.scale + app.view.y,
        width: object.width * app.view.scale,
        height: object.height * app.view.scale,
        fontSize: object.size * app.view.scale
    };
}

function clearTextObjects() {
    if (app.textResizeObserver) app.textResizeObserver.disconnect();
    app.textResizeTimers.forEach((timer) => window.clearTimeout(timer));
    app.textResizeTimers.clear();
    app.textObjects.clear();
    $$('[data-text-id]').forEach((element) => element.remove());
    app.textResizeObserver = null;
}

function clearImageObjects() {
    if (app.imageResizeObserver) app.imageResizeObserver.disconnect();
    app.imageResizeTimers.forEach((timer) => window.clearTimeout(timer));
    app.imageResizeTimers.clear();
    app.imageObjects.clear();
    $$('[data-image-id]').forEach((element) => element.remove());
    app.imageResizeObserver = null;
}

function updateImageObjectLayouts() {
    app.imageObjects.forEach((object) => positionImageElement(object));
}

function positionImageElement(object) {
    const element = document.querySelector(`[data-image-id="${CSS.escape(object.id)}"]`);
    if (!element) return;
    element.style.left = `${object.x * app.view.scale + app.view.x}px`;
    element.style.top = `${object.y * app.view.scale + app.view.y}px`;
    element.style.width = `${Math.max(48, object.width * app.view.scale)}px`;
    element.style.height = `${Math.max(48, object.height * app.view.scale)}px`;
    element.style.zIndex = object.z || 1;
}

function createImageObject(object) {
    object.z = object.z || nextObjectZ();
    app.imageObjects.set(object.id, object);
    let element = document.querySelector(`[data-image-id="${CSS.escape(object.id)}"]`);
    if (!element) {
        element = document.createElement('div');
        element.className = 'image-object';
        element.dataset.imageId = object.id;
        element.tabIndex = 0;
        const image = document.createElement('img');
        image.alt = object.name || 'Board image';
        element.append(image);
        bindObjectContextMenu(element, 'image', object.id);
        bindImageObjectElement(element);
        objectLayer.append(element);
        ensureImageResizeObserver().observe(element);
    }
    const image = element.querySelector('img');
    if (image.src !== object.src) image.src = object.src;
    image.alt = object.name || 'Board image';
    positionImageElement(object);
}

function ensureImageResizeObserver() {
    if (app.imageResizeObserver) return app.imageResizeObserver;
    app.imageResizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
            const element = entry.target;
            const object = app.imageObjects.get(element.dataset.imageId);
            if (!object) return;
            const width = element.offsetWidth / app.view.scale;
            const height = element.offsetHeight / app.view.scale;
            if (Math.abs(width - object.width) < 2 && Math.abs(height - object.height) < 2) return;
            object.width = Math.max(48, width);
            object.height = Math.max(48, height);
            window.clearTimeout(app.imageResizeTimers.get(object.id));
            app.imageResizeTimers.set(object.id, window.setTimeout(() => {
                commitBoardEvent({kind: 'image-update', id: object.id, patch: {width: object.width, height: object.height}});
            }, 180));
        });
    });
    return app.imageResizeObserver;
}

function updateImageObject(id, patch) {
    const current = app.imageObjects.get(id);
    if (!current) return;
    Object.assign(current, patch);
    positionImageElement(current);
}

function bindImageObjectElement(element) {
    element.addEventListener('pointerdown', onImageObjectPointerDown);
}

function onImageObjectPointerDown(event) {
    if (app.tool === 'pointer' || app.tool === 'pan' || app.spacePressed || event.button === 1) return;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    if (event.clientX > rect.right - 16 && event.clientY > rect.bottom - 16) return;
    event.preventDefault();
    event.stopPropagation();
    const object = app.imageObjects.get(element.dataset.imageId);
    if (!object) return;
    element.setPointerCapture(event.pointerId);
    const start = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: object.x,
        y: object.y
    };
    let moved = false;

    const move = (moveEvent) => {
        if (moveEvent.pointerId !== start.pointerId) return;
        moved = true;
        object.x = start.x + (moveEvent.clientX - start.clientX) / app.view.scale;
        object.y = start.y + (moveEvent.clientY - start.clientY) / app.view.scale;
        positionImageElement(object);
    };

    const up = (upEvent) => {
        if (upEvent.pointerId !== start.pointerId) return;
        element.releasePointerCapture(start.pointerId);
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        if (moved) commitBoardEvent({kind: 'image-update', id: object.id, patch: {x: object.x, y: object.y}});
    };

    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
}

function updateTextObjectLayouts() {
    app.textObjects.forEach((object) => positionTextElement(object));
}

function positionTextElement(object) {
    const element = document.querySelector(`[data-text-id="${CSS.escape(object.id)}"]`);
    if (!element) return;
    const rect = textObjectScreenRect(object);
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${Math.max(32, rect.width)}px`;
    element.style.height = `${Math.max(24, rect.height)}px`;
    element.style.fontSize = `${Math.max(10, rect.fontSize)}px`;
    element.style.color = object.color;
    element.style.zIndex = object.z || 1;
}

function createTextObject(object, {focus = false} = {}) {
    object.z = object.z || nextObjectZ();
    app.textObjects.set(object.id, object);
    let element = document.querySelector(`[data-text-id="${CSS.escape(object.id)}"]`);
    if (!element) {
        element = document.createElement('div');
        element.className = 'text-object';
        element.dataset.textId = object.id;
        element.tabIndex = 0;
        element.spellcheck = true;
        bindObjectContextMenu(element, 'text', object.id);
        bindTextObjectElement(element);
        objectLayer.append(element);
        ensureTextResizeObserver().observe(element);
    }
    element.textContent = object.text;
    positionTextElement(object);
    if (focus) startTextEditing(element);
}

function ensureTextResizeObserver() {
    if (app.textResizeObserver) return app.textResizeObserver;
    app.textResizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
            const element = entry.target;
            const object = app.textObjects.get(element.dataset.textId);
            if (!object || element.classList.contains('editing')) return;
            const width = element.offsetWidth / app.view.scale;
            const height = element.offsetHeight / app.view.scale;
            if (Math.abs(width - object.width) < 2 && Math.abs(height - object.height) < 2) return;
            object.width = Math.max(32, width);
            object.height = Math.max(24, height);
            window.clearTimeout(app.textResizeTimers.get(object.id));
            app.textResizeTimers.set(object.id, window.setTimeout(() => {
                commitBoardEvent({kind: 'text-update', id: object.id, patch: {width: object.width, height: object.height}});
            }, 180));
        });
    });
    return app.textResizeObserver;
}

function updateTextObject(id, patch, {local = false} = {}) {
    const current = app.textObjects.get(id);
    if (!current) return;
    Object.assign(current, patch);
    const element = document.querySelector(`[data-text-id="${CSS.escape(id)}"]`);
    if (element && patch.text !== undefined && element.textContent !== patch.text) {
        element.textContent = patch.text;
    }
    positionTextElement(current);
    if (local) commitBoardEvent({kind: 'text-update', id, patch});
}

function bindTextObjectElement(element) {
    element.addEventListener('pointerdown', onTextObjectPointerDown);
    element.addEventListener('dblclick', (event) => {
        if (app.tool === 'pointer') return;
        event.stopPropagation();
        startTextEditing(element);
    });
    element.addEventListener('blur', () => finishTextEditing(element));
    element.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            element.blur();
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            element.blur();
        }
    });
}

function startTextEditing(element) {
    element.contentEditable = 'true';
    element.classList.add('editing');
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function finishTextEditing(element) {
    if (element.contentEditable !== 'true') return;
    element.contentEditable = 'false';
    element.classList.remove('editing');
    const object = app.textObjects.get(element.dataset.textId);
    if (!object) return;
    const text = element.innerText.trim() || 'Text';
    if (text !== object.text) {
        updateTextObject(object.id, {text}, {local: true});
    }
}

function onTextObjectPointerDown(event) {
    if (app.tool === 'pointer' || app.tool === 'pan' || app.spacePressed || event.button === 1) return;
    const element = event.currentTarget;
    if (element.classList.contains('editing')) return;
    const rect = element.getBoundingClientRect();
    if (event.clientX > rect.right - 16 && event.clientY > rect.bottom - 16) return;
    event.preventDefault();
    event.stopPropagation();
    const object = app.textObjects.get(element.dataset.textId);
    if (!object) return;
    element.setPointerCapture(event.pointerId);
    const start = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height
    };
    let moved = false;

    const move = (moveEvent) => {
        if (moveEvent.pointerId !== start.pointerId) return;
        moved = true;
        object.x = start.x + (moveEvent.clientX - start.clientX) / app.view.scale;
        object.y = start.y + (moveEvent.clientY - start.clientY) / app.view.scale;
        positionTextElement(object);
    };

    const up = (upEvent) => {
        if (upEvent.pointerId !== start.pointerId) return;
        element.releasePointerCapture(start.pointerId);
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        const width = element.offsetWidth / app.view.scale;
        const height = element.offsetHeight / app.view.scale;
        const patch = {
            x: object.x,
            y: object.y,
            width: Math.max(32, width),
            height: Math.max(24, height)
        };
        Object.assign(object, patch);
        positionTextElement(object);
        if (moved || Math.abs(width - start.width) > 1 || Math.abs(height - start.height) > 1) {
            commitBoardEvent({kind: 'text-update', id: object.id, patch});
        }
    };

    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
}

function commitBoardEvent(event) {
    app.boardEvents.push(event);
    applyBoardEvent(event);
    saveBoardState();
    broadcast({type: 'board-event', event});
}

function previewShape(toPoint) {
    clearCanvas(pctx);
    const from = app.drawing.start;
    drawBoardEvent(pctx, {
        kind: app.tool,
        x1: from.x,
        y1: from.y,
        x2: toPoint.x,
        y2: toPoint.y,
        lineStyle: app.tool === 'line' ? app.lineStyle : undefined,
        color: app.color,
        size: app.size
    });
}

function openTextEditor(point, screenPoint) {
    const object = {
        id: createId('text'),
        x: point.x,
        y: point.y,
        width: 180,
        height: 48,
        text: 'Text',
        color: app.color,
        size: Math.max(16, app.size * 2),
        z: nextObjectZ()
    };
    app.boardEvents.push({kind: 'text', ...object});
    createTextObject(object, {focus: true});
    saveBoardState();
    broadcast({type: 'board-event', event: {kind: 'text', ...object}});
}

function boardCenterPoint() {
    const rect = boardWrap.getBoundingClientRect();
    return screenToWorld(rect.width / 2, rect.height / 2);
}

async function addImageFromFile(file, point = boardCenterPoint()) {
    if (!file?.type?.startsWith('image/')) return;
    try {
        const dataUrl = await readFileAsDataUrl(file);
        const image = await normalizeImageDataUrl(dataUrl);
        const maxWidth = 360;
        const maxHeight = 260;
        const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
        const width = Math.max(48, Math.round(image.width * scale));
        const height = Math.max(48, Math.round(image.height * scale));
        commitBoardEvent({
            kind: 'image',
            id: createId('image'),
            x: point.x - width / 2,
            y: point.y - height / 2,
            width,
            height,
            src: image.src,
            name: file.name || 'Image',
            z: nextObjectZ()
        });
        toast('Image added');
    } catch {
        toast('Could not add image');
    }
}

async function addImagesFromFiles(files, point = boardCenterPoint()) {
    const images = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    for (const [index, file] of images.entries()) {
        await addImageFromFile(file, {x: point.x + index * 24, y: point.y + index * 24});
    }
}

async function onPasteImage(event) {
    if (event.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    const imageItems = Array.from(event.clipboardData?.items || []).filter((item) => item.type.startsWith('image/'));
    if (!imageItems.length) return;
    event.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter(Boolean);
    await addImagesFromFiles(files);
}

function onImageFileChange(event) {
    addImagesFromFiles(event.target.files);
    event.target.value = '';
}

function onBoardDragOver(event) {
    if (!Array.from(event.dataTransfer?.items || []).some((item) => item.type.startsWith('image/'))) return;
    event.preventDefault();
}

function onBoardDrop(event) {
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    addImagesFromFiles(files, pointFromEvent(event));
}

function onPointerDown(event) {
    if (event.target.closest('.board-toolbar') || event.target.closest('.text-editor')) return;
    closePopovers();
    sendCursor(pointFromEvent(event));

    if (app.tool === 'pan' || app.spacePressed || event.button === 1) {
        event.preventDefault();
        boardWrap.setPointerCapture(event.pointerId);
        app.panning = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            viewX: app.view.x,
            viewY: app.view.y
        };
        updateBoardCursor();
        return;
    }

    if (app.tool !== 'pointer' && (event.target.closest('.text-object') || event.target.closest('.shape-object') || event.target.closest('.image-object'))) return;

    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    if (app.tool === 'pointer') {
        event.preventDefault();
        startPointerTool(event);
        return;
    }

    if (app.tool === 'text') {
        openTextEditor(point, screenPointFromEvent(event));
        return;
    }

    boardWrap.setPointerCapture(event.pointerId);
    app.drawing = {
        pointerId: event.pointerId,
        start: point,
        points: [point]
    };

    if (app.tool === 'pen' || app.tool === 'eraser') {
        drawBoardEvent(ctx, {kind: 'stroke', mode: app.tool, points: [point], color: app.color, size: app.size});
    }
}

function onPointerMove(event) {
    if (!event.target.closest('.board-toolbar')) sendCursor(pointFromEvent(event));

    if (app.panning && app.panning.pointerId === event.pointerId) {
        app.view.x = app.panning.viewX + event.clientX - app.panning.startX;
        app.view.y = app.panning.viewY + event.clientY - app.panning.startY;
        updateViewport();
        return;
    }

    if (updatePointerTool(event)) return;

    if (!app.drawing || app.drawing.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);

    if (app.tool === 'pen' || app.tool === 'eraser') {
        const previous = app.drawing.points[app.drawing.points.length - 1];
        app.drawing.points.push(point);
        drawBoardEvent(ctx, {kind: 'stroke', mode: app.tool, points: [previous, point], color: app.color, size: app.size});
    } else {
        previewShape(point);
    }
}

function onPointerLeave() {
    stopPointerTool();
    sendCursor({x: 0, y: 0}, false);
}

function onPointerUp(event) {
    sendCursor(pointFromEvent(event));

    if (stopPointerTool(event)) return;

    if (app.panning && app.panning.pointerId === event.pointerId) {
        app.panning = null;
        updateBoardCursor();
        return;
    }

    if (!app.drawing || app.drawing.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    const start = app.drawing.start;
    const points = app.drawing.points;
    app.drawing = null;
    clearCanvas(pctx);

    if (app.tool === 'pen' || app.tool === 'eraser') {
        const eventData = {kind: 'stroke', mode: app.tool, points, color: app.color, size: app.size};
        app.boardEvents.push(eventData);
        saveBoardState();
        broadcast({type: 'board-event', event: eventData});
        return;
    }

    if (Math.hypot(point.x - start.x, point.y - start.y) < 2) return;
    if (isShapeKind(app.tool)) {
        commitBoardEvent(normalizeShapeEvent({id: createId('shape'), kind: app.tool, x1: start.x, y1: start.y, x2: point.x, y2: point.y, lineStyle: app.tool === 'line' ? app.lineStyle : undefined, color: app.color, size: app.size}));
    }
}

async function copyRoomLink() {
    if (!app.roomId) return;
    const link = roomUrl();
    try {
        await navigator.clipboard.writeText(link);
        toast('Room invite link copied');
    } catch {
        const field = document.createElement('input');
        field.value = link;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.left = '-9999px';
        document.body.append(field);
        field.select();
        const copied = document.execCommand?.('copy');
        field.remove();
        if (copied) toast('Room invite link copied');
        else {
            roomInput.value = link;
            roomInput.select();
            toast('Copy the full invite link from the room field');
        }
    }
}

function joinRoom() {
    const value = roomInput.value.trim();
    if (!value) return toast('Enter a room ID');
    const roomId = (() => {
        try {
            return new URL(value).searchParams.get('room') || value;
        } catch {
            return value;
        }
    })();
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', roomId);
    window.location.href = url.toString();
}

function newRoom() {
    const nextRoomId = createRoomId();
    saveBoardState(nextRoomId);
    markRoomHost(nextRoomId);
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', nextRoomId);
    window.location.href = url.toString();
}

function newBoard() {
    clearBoard();
    toast('New blank board started');
}

function ensurePeers() {
    if (app.connections.size > 0) return true;
    toast('Invite someone before starting a call');
    return false;
}

function mediaConstraints(withVideo) {
    const audio = app.devices.audioInput ? {deviceId: {exact: app.devices.audioInput}} : true;
    const video = withVideo ? app.devices.videoInput ? {deviceId: {exact: app.devices.videoInput}} : true : false;
    return {audio, video};
}

async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    fillDeviceSelect(micSelect, devices.filter((device) => device.kind === 'audioinput'), app.devices.audioInput, 'Microphone');
    fillDeviceSelect(cameraSelect, devices.filter((device) => device.kind === 'videoinput'), app.devices.videoInput, 'Camera');
    fillDeviceSelect(speakerSelect, devices.filter((device) => device.kind === 'audiooutput'), app.devices.audioOutput, 'Speakers');
    speakerSelect.disabled = !('setSinkId' in HTMLMediaElement.prototype);
    speakerMenuBtn.disabled = speakerSelect.disabled;
    speakerMenuBtn.title = speakerSelect.disabled ? 'Speaker selection is not supported in this browser' : 'Choose speakers';
}

function fillDeviceSelect(select, devices, selectedId, fallbackLabel) {
    const current = selectedId || select.value;
    select.innerHTML = '';
    const defaultOption = new Option(`Default ${fallbackLabel.toLowerCase()}`, '');
    select.append(defaultOption);
    devices.forEach((device, index) => {
        select.append(new Option(device.label || `${fallbackLabel} ${index + 1}`, device.deviceId));
    });
    select.value = devices.some((device) => device.deviceId === current) ? current : '';
}

function applyLocalTrackState() {
    if (!app.localMediaStream) return;
    app.localMediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !app.audioMuted;
    });
    app.localMediaStream.getVideoTracks().forEach((track) => {
        track.enabled = !app.videoMuted;
    });
    updateCallButtons();
}

function updateCallButtons() {
    micToggleBtn.classList.toggle('muted', app.audioMuted);
    cameraToggleBtn.classList.toggle('off', app.videoMuted);
    micToggleBtn.title = app.audioMuted ? 'Unmute microphone' : 'Mute microphone';
    cameraToggleBtn.title = app.videoMuted ? 'Turn camera on' : 'Turn camera off';
    micToggleBtn.querySelector('i').setAttribute('data-lucide', app.audioMuted ? 'mic-off' : 'mic');
    cameraToggleBtn.querySelector('i').setAttribute('data-lucide', app.videoMuted ? 'video-off' : 'video');
    refreshIcons();
}

async function applySpeakerOutput() {
    const mediaElements = streamsEl.querySelectorAll('audio, video');
    await Promise.all(Array.from(mediaElements).map(async (element) => {
        if (!element.setSinkId) return;
        try {
            await element.setSinkId(app.devices.audioOutput || '');
        } catch {
            toast('Could not switch speakers');
        }
    }));
}

async function restartActiveMedia() {
    if (!app.activeMediaKind) return;
    await startLocalMedia(app.activeMediaKind === 'camera');
}

async function startLocalMedia(withVideo) {
    if (!ensurePeers()) return;
    try {
        stopLocalMedia();
        app.localMediaStream = await navigator.mediaDevices.getUserMedia(mediaConstraints(withVideo));
        app.activeMediaKind = withVideo ? 'camera' : 'audio';
        applyLocalTrackState();
        await refreshDevices();
        addStreamTile('local-media', app.localMediaStream, withVideo ? 'Your camera' : 'Your microphone', withVideo ? 'camera' : 'audio', true);
        callPeers(app.localMediaStream, withVideo ? 'camera' : 'audio');
        $('#audioBtn').classList.toggle('active', !withVideo);
        $('#videoBtn').classList.toggle('active', withVideo);
        log(withVideo ? 'Video call started' : 'Audio call started');
    } catch (error) {
        toast(error.name === 'NotAllowedError' ? 'Microphone or camera access was blocked' : 'Could not start the call');
    }
}

function stopLocalMedia() {
    if (app.localMediaStream) {
        app.localMediaStream.getTracks().forEach((track) => track.stop());
        app.localMediaStream = null;
    }
    app.activeMediaKind = '';
    closeCallsByKind(['camera', 'audio']);
    removeStreamTile('local-media');
    $('#audioBtn').classList.remove('active');
    $('#videoBtn').classList.remove('active');
    updateCallButtons();
}

async function toggleScreenShare() {
    if (app.screenStream) {
        stopScreenShare();
        return;
    }
    if (!ensurePeers()) return;

    try {
        app.screenStream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: true});
        addStreamTile('local-screen', app.screenStream, 'Your screen', 'screen', true);
        callPeers(app.screenStream, 'screen');
        $('#screenBtn').classList.add('active');
        app.screenStream.getVideoTracks()[0]?.addEventListener('ended', stopScreenShare, {once: true});
        log('Screen sharing started');
    } catch (error) {
        toast(error.name === 'NotAllowedError' ? 'Screen sharing was cancelled' : 'Could not share your screen');
    }
}

function stopScreenShare() {
    if (app.screenStream) {
        app.screenStream.getTracks().forEach((track) => track.stop());
        app.screenStream = null;
    }
    closeCallsByKind(['screen']);
    removeStreamTile('local-screen');
    $('#screenBtn').classList.remove('active');
    log('Screen sharing stopped');
}

function callPeers(stream, kind) {
    app.connections.forEach((conn) => {
        if (!conn.open) return;
        const call = app.peer.call(conn.peer, stream, {metadata: {kind, name: app.displayName}});
        bindMediaCall(call, kind);
    });
}

function handleIncomingCall(call) {
    const kind = call.metadata?.kind || 'camera';
    if (call.metadata?.name) {
        updatePeerProfile(call.peer, {name: String(call.metadata.name).slice(0, 32)});
        renderParticipants();
        updatePeerMediaLabels(call.peer);
    }
    const answerStream = kind === 'screen' ? new MediaStream() : app.localMediaStream || new MediaStream();
    call.answer(answerStream);
    bindMediaCall(call, kind);
    log(kind === 'screen' ? 'Incoming screen share' : 'Incoming call');
}

function bindMediaCall(call, kind) {
    const key = `${call.peer}:${kind}`;
    app.mediaCalls.set(key, call);
    call.on('stream', (stream) => {
        if (stream.getTracks().length === 0) return;
        addStreamTile(`remote-${safeId(call.peer)}-${kind}`, stream, kind === 'screen' ? `Screen: ${peerName(call.peer)}` : peerName(call.peer), kind);
    });
    call.on('close', () => {
        app.mediaCalls.delete(key);
        removeStreamTile(`remote-${safeId(call.peer)}-${kind}`);
    });
    call.on('error', () => {
        app.mediaCalls.delete(key);
        removeStreamTile(`remote-${safeId(call.peer)}-${kind}`);
    });
}

function closeCallsByKind(kinds) {
    app.mediaCalls.forEach((call, key) => {
        if (kinds.some((kind) => key.endsWith(`:${kind}`))) {
            call.close();
            app.mediaCalls.delete(key);
        }
    });
}

function streamTileLabel(tile) {
    return tile?.querySelector('.stream-label span')?.textContent || 'Stream';
}

function openStreamViewer(tile) {
    if (!tile || tile.classList.contains('audio-only')) return;
    if (app.enlargedStream?.tile === tile) return;
    closeStreamViewer();

    app.enlargedStream = {
        tile,
        parent: tile.parentElement,
        nextSibling: tile.nextElementSibling
    };
    streamViewerTitle.textContent = streamTileLabel(tile);
    streamViewerSlot.append(tile);
    tile.classList.add('expanded');
    streamViewer.classList.remove('hidden');
}

function closeStreamViewer({restore = true} = {}) {
    if (!app.enlargedStream) return;
    const {tile, parent, nextSibling} = app.enlargedStream;
    app.enlargedStream = null;

    tile?.classList.remove('expanded');
    if (restore && tile?.isConnected && parent?.isConnected) {
        if (nextSibling?.isConnected && nextSibling.parentElement === parent) parent.insertBefore(tile, nextSibling);
        else parent.append(tile);
    }
    streamViewer.classList.add('hidden');
    if (document.fullscreenElement === streamViewer) {
        document.exitFullscreen?.().catch?.(() => {});
    }
}

async function toggleStreamFullscreen() {
    if (!app.enlargedStream) return;
    try {
        if (document.fullscreenElement === streamViewer) {
            await document.exitFullscreen();
        } else if (streamViewer.requestFullscreen) {
            await streamViewer.requestFullscreen();
        }
    } catch {
        toast('Full screen is not available');
    }
}

function detachStreamTile(id) {
    const tile = document.getElementById(id);
    if (!tile) return null;
    if (app.enlargedStream?.tile === tile) closeStreamViewer({restore: false});
    return tile;
}

function addStreamTile(id, stream, label, kind, muted = false) {
    emptyStreams.classList.add('hidden');
    let tile = document.getElementById(id);
    if (!tile) {
        tile = document.createElement('article');
        tile.id = id;
        tile.className = `stream-tile ${kind === 'screen' ? 'screen' : ''}`;
        streamsEl.append(tile);
    }

    const hasVideo = stream.getVideoTracks().length > 0;
    tile.className = `stream-tile ${kind === 'screen' ? 'screen' : ''} ${hasVideo ? '' : 'audio-only'}`;
    tile.innerHTML = '';

    if (hasVideo) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = muted;
        video.srcObject = stream;
        tile.append(video);
        if (!muted) applySpeakerOutput();
    } else {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.muted = muted;
        audio.srcObject = stream;
        tile.append(audio);
        if (!muted) applySpeakerOutput();
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'audio-lines');
        icon.style.color = '#fff';
        icon.style.width = '34px';
        icon.style.height = '34px';
        tile.append(icon);
    }

    const caption = document.createElement('div');
    caption.className = 'stream-label';
    caption.innerHTML = `<i data-lucide="${kind === 'screen' ? 'screen-share' : hasVideo ? 'video' : 'mic'}" class="icon-small"></i><span>${label}</span>`;
    tile.append(caption);

    if (hasVideo) {
        const actions = document.createElement('div');
        actions.className = 'stream-actions';
        const expandBtn = document.createElement('button');
        expandBtn.className = 'btn stream-action-btn';
        expandBtn.type = 'button';
        expandBtn.title = 'Expand';
        expandBtn.innerHTML = '<i data-lucide="maximize-2" class="icon-small"></i>';
        expandBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            openStreamViewer(tile);
        });
        actions.append(expandBtn);
        tile.append(actions);
        tile.ondblclick = () => openStreamViewer(tile);
        if (app.enlargedStream?.tile === tile) {
            tile.classList.add('expanded');
            streamViewerTitle.textContent = label;
        }
    } else {
        tile.ondblclick = null;
    }

    refreshIcons();
}

function removeStreamTile(id) {
    detachStreamTile(id)?.remove();
    if ($$('.stream-tile').length === 0) emptyStreams.classList.remove('hidden');
}

function removePeerStreams(peerId) {
    $$(`[id^="remote-${safeId(peerId)}-"]`).forEach((tile) => {
        if (app.enlargedStream?.tile === tile) closeStreamViewer({restore: false});
        tile.remove();
    });
    if ($$('.stream-tile').length === 0) emptyStreams.classList.remove('hidden');
}

function hangUpAll() {
    stopScreenShare();
    stopLocalMedia();
    app.mediaCalls.forEach((call) => call.close());
    app.mediaCalls.clear();
    $$('[id^="remote-"]').forEach((tile) => {
        if (app.enlargedStream?.tile === tile) closeStreamViewer({restore: false});
        tile.remove();
    });
    if ($$('.stream-tile').length === 0) emptyStreams.classList.remove('hidden');
    log('Call ended');
}

function undoLast() {
    if (!app.boardEvents.length) return;
    app.boardEvents.pop();
    replayBoard();
    saveBoardState();
    broadcast({type: 'board-state', boardEvents: app.boardEvents});
}

function clearBoard() {
    app.boardEvents = [];
    replayBoard();
    saveBoardState();
    broadcast({type: 'clear-board'});
}

async function downloadBoard() {
    const rect = boardWrap.getBoundingClientRect();
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = boardCanvas.width;
    exportCanvas.height = boardCanvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.fillStyle = '#ffffff';
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportCtx.setTransform(
        app.dpr * app.view.scale,
        0,
        0,
        app.dpr * app.view.scale,
        app.dpr * app.view.x,
        app.dpr * app.view.y
    );
    app.boardEvents.forEach((event) => {
        if (!isObjectEvent(event)) drawBoardEvent(exportCtx, event);
    });
    const orderedObjects = allBoardObjects().sort((a, b) => (a.object.z || 0) - (b.object.z || 0));
    for (const item of orderedObjects) {
        await drawBoardObjectOnContext(exportCtx, item);
    }
    exportCtx.save();
    exportCtx.setTransform(1, 0, 0, 1, 0, 0);
    exportCtx.globalCompositeOperation = 'destination-over';
    exportCtx.fillStyle = '#ffffff';
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportCtx.restore();

    const link = document.createElement('a');
    link.download = `callpub-board-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}

function onWheel(event) {
    if (event.target.closest('.board-toolbar')) return;
    event.preventDefault();
    const point = screenPointFromEvent(event);
    const factor = Math.exp(-event.deltaY * 0.001);
    zoomAt(point.x, point.y, app.view.scale * factor);
}

function normalizeDisplayName(value) {
    return (value || '').trim().slice(0, 32) || 'Guest';
}

function saveDisplayName(value) {
    app.displayName = normalizeDisplayName(value);
    localStorage.setItem('callpub.displayName', app.displayName);
    renderParticipants();
}

function updateDisplayName(value, {broadcastNow = true} = {}) {
    saveDisplayName(value);
    if (!broadcastNow) return;
    window.clearTimeout(app.displayNameBroadcastTimer);
    broadcastProfile();
}

function queueDisplayNameUpdate(value) {
    saveDisplayName(value);
    window.clearTimeout(app.displayNameBroadcastTimer);
    app.displayNameBroadcastTimer = window.setTimeout(broadcastProfile, 300);
}

function toggleAudioMute() {
    app.audioMuted = !app.audioMuted;
    applyLocalTrackState();
}

function toggleCameraMute() {
    app.videoMuted = !app.videoMuted;
    applyLocalTrackState();
}

async function onDeviceChange(kind, value) {
    app.devices[kind] = value;
    localStorage.setItem(`callpub.${kind}`, value);
    if (kind === 'audioOutput') {
        await applySpeakerOutput();
        return;
    }
    await restartActiveMedia();
}

function bindUi() {
    $('#copyLinkBtn').addEventListener('click', copyRoomLink);
    $('#newRoomBtn').addEventListener('click', newRoom);
    $('#newBoardBtn').addEventListener('click', newBoard);
    $('#joinBtn').addEventListener('click', joinRoom);
    displayNameInput.value = app.displayName;
    displayNameInput.addEventListener('input', () => queueDisplayNameUpdate(displayNameInput.value));
    displayNameInput.addEventListener('change', () => updateDisplayName(displayNameInput.value));
    displayNameInput.addEventListener('blur', () => updateDisplayName(displayNameInput.value));
    micSelect.addEventListener('change', () => {
        onDeviceChange('audioInput', micSelect.value);
        closePopovers();
    });
    cameraSelect.addEventListener('change', () => {
        onDeviceChange('videoInput', cameraSelect.value);
        closePopovers();
    });
    speakerSelect.addEventListener('change', () => {
        onDeviceChange('audioOutput', speakerSelect.value);
        closePopovers();
    });
    roomInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') joinRoom();
    });

    $$('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
    lineMenuBtn.addEventListener('click', () => {
        setTool('line');
        togglePopover(linePopover, lineMenuBtn);
    });
    $$('.line-option').forEach((button) => button.addEventListener('click', () => setLineStyle(button.dataset.lineStyle)));
    colorToggle.addEventListener('click', () => togglePopover(colorPopover, colorToggle));
    sizeToggle.addEventListener('click', () => togglePopover(sizePopover, sizeToggle));
    micMenuBtn.addEventListener('click', () => togglePopover(micPopover, micMenuBtn));
    cameraMenuBtn.addEventListener('click', () => togglePopover(cameraPopover, cameraMenuBtn));
    speakerMenuBtn.addEventListener('click', () => {
        if (!speakerMenuBtn.disabled) togglePopover(speakerPopover, speakerMenuBtn);
    });
    $('#sizeRange').addEventListener('input', (event) => {
        app.size = Number(event.target.value);
        updateSizeUi();
    });
    $$('.size-preset').forEach((button) => {
        button.addEventListener('click', () => {
            app.size = Number(button.dataset.size);
            $('#sizeRange').value = app.size;
            updateSizeUi();
            closePopovers();
        });
    });
    document.addEventListener('pointerdown', (event) => {
        if (!event.target.closest('.popover-host')) closePopovers();
        if (!event.target.closest('.object-context-menu')) closeObjectContextMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closePopovers();
            closeObjectContextMenu();
        }
    });
    objectContextMenu.addEventListener('click', (event) => {
        const button = event.target.closest('[data-arrange]');
        if (!button) return;
        arrangeSelectedObject(button.dataset.arrange);
    });
    boardWrap.addEventListener('contextmenu', (event) => {
        if (!event.target.closest('[data-object-type]')) closeObjectContextMenu();
    });
    closeStreamViewerBtn.addEventListener('click', () => closeStreamViewer());
    fullscreenStreamBtn.addEventListener('click', toggleStreamFullscreen);
    streamViewer.addEventListener('click', (event) => {
        if (event.target === streamViewer || event.target === streamViewerSlot) closeStreamViewer();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !streamViewer.classList.contains('hidden')) closeStreamViewer();
    });
    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = document.fullscreenElement === streamViewer;
        fullscreenStreamBtn.title = isFullscreen ? 'Exit full screen' : 'Full screen';
        fullscreenStreamBtn.querySelector('i').setAttribute('data-lucide', isFullscreen ? 'minimize' : 'maximize');
        refreshIcons();
    });

    $('#undoBtn').addEventListener('click', undoLast);
    $('#clearBtn').addEventListener('click', clearBoard);
    $('#downloadBtn').addEventListener('click', downloadBoard);
    $('#addImageBtn').addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', onImageFileChange);
    $('#zoomOutBtn').addEventListener('click', () => zoomBy(0.8));
    $('#zoomInBtn').addEventListener('click', () => zoomBy(1.25));
    $('#zoomResetBtn').addEventListener('click', resetView);
    micToggleBtn.addEventListener('click', toggleAudioMute);
    cameraToggleBtn.addEventListener('click', toggleCameraMute);
    $('#audioBtn').addEventListener('click', () => startLocalMedia(false));
    $('#videoBtn').addEventListener('click', () => startLocalMedia(true));
    $('#screenBtn').addEventListener('click', toggleScreenShare);
    $('#hangupBtn').addEventListener('click', hangUpAll);

    boardWrap.addEventListener('pointerdown', onPointerDown);
    boardWrap.addEventListener('pointermove', onPointerMove);
    boardWrap.addEventListener('pointerup', onPointerUp);
    boardWrap.addEventListener('pointercancel', onPointerUp);
    boardWrap.addEventListener('pointerleave', onPointerLeave);
    boardWrap.addEventListener('wheel', onWheel, {passive: false});
    boardWrap.addEventListener('dragover', onBoardDragOver);
    boardWrap.addEventListener('drop', onBoardDrop);
    document.addEventListener('paste', onPasteImage);
    document.addEventListener('keydown', (event) => {
        if (event.code !== 'Space' || event.target.closest?.('input, textarea')) return;
        event.preventDefault();
        app.spacePressed = true;
        updateBoardCursor();
    });
    document.addEventListener('keyup', (event) => {
        if (event.code !== 'Space') return;
        app.spacePressed = false;
        updateBoardCursor();
    });
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    window.addEventListener('resize', resizeBoard);
    window.addEventListener('beforeunload', () => {
        updateDisplayName(displayNameInput.value, {broadcastNow: false});
        saveBoardState();
        broadcast({type: 'bye', from: app.ownId});
        app.peer?.destroy();
    });
}

bindUi();
setupColors();
updateSizeUi();
updateCallButtons();
refreshDevices();
resizeBoard();
updateBoardBackground();
updateZoomUi();
startCursorCleanup();
initPeer();
refreshIcons();
