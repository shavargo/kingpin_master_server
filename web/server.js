'use strict';

const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8080);
const MASTER_HOST = process.env.MASTER_HOST || '127.0.0.1';
const MASTER_PORT = Number(process.env.MASTER_PORT || 27900);
const PUBLIC_MASTER_HOST = process.env.PUBLIC_MASTER_HOST || 'master.shavargo.com';
const STATUS_TIMEOUT_MS = Number(process.env.STATUS_TIMEOUT_MS || 2500);
const LIST_TIMEOUT_MS = Number(process.env.LIST_TIMEOUT_MS || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendUdp(host, port, payload, timeoutMs) {
	return new Promise((resolve, reject) => {
		const socket = dgram.createSocket('udp4');
		const timer = setTimeout(() => {
			socket.close();
			reject(new Error('timeout'));
		}, timeoutMs);

		socket.on('error', (err) => {
			clearTimeout(timer);
			socket.close();
			reject(err);
		});

		socket.on('message', (msg) => {
			clearTimeout(timer);
			socket.close();
			resolve(msg);
		});

		socket.send(payload, port, host, (err) => {
			if (err) {
				clearTimeout(timer);
				socket.close();
				reject(err);
			}
		});
	});
}

function parseQuakeServerList(buf) {
	const header = Buffer.from('\xff\xff\xff\xffservers\n');
	let offset = 0;
	if (buf.length >= header.length && buf.subarray(0, header.length).equals(header)) {
		offset = header.length;
	}
	else {
		const idx = buf.indexOf(Buffer.from('servers\n'));
		if (idx >= 0) {
			offset = idx + 'servers\n'.length;
		}
	}

	const servers = [];
	for (let i = offset; i + 6 <= buf.length; i += 6) {
		const a = buf[i];
		const b = buf[i + 1];
		const c = buf[i + 2];
		const d = buf[i + 3];
		const port = (buf[i + 4] << 8) | buf[i + 5];
		if (port === 0) {
			continue;
		}
		servers.push({
			ip: `${a}.${b}.${c}.${d}`,
			port,
			address: `${a}.${b}.${c}.${d}:${port}`,
		});
	}
	return servers;
}

function parseInfoString(text) {
	const cleaned = text.replace(/^\xFF\xFF\xFF\xFFprint\n?/i, '').replace(/^\?{4}print\n?/i, '');
	const parts = cleaned.split('\\');
	const info = {};
	for (let i = 1; i + 1 < parts.length; i += 2) {
		const key = parts[i];
		const value = parts[i + 1];
		if (!key) {
			continue;
		}
		if (key.includes('\n') || value.includes('\n')) {
			const keyClean = key.split('\n')[0];
			const valueClean = value.split('\n')[0];
			if (keyClean) {
				info[keyClean] = valueClean;
			}
			break;
		}
		info[key] = value;
	}

	const playerLines = cleaned.split(/\r?\n/).slice(1).filter((line) => line.trim().length > 0);
	return { info, players: playerLines.length, playerLines };
}

function classifyServer(info, hostname) {
	const name = String(hostname || info.hostname || '').toLowerCase();
	const map = String(info.mapname || '').toLowerCase();
	const gamename = String(info.gamename || '').toLowerCase();
	const teamplay = info.teamplay === '1';
	const deathmatch = info.deathmatch === '1';

	if (name.includes('ctf') || map.includes('ctf') || gamename.includes('ctf') || info.ctf === '1') {
		return 'CTF';
	}
	if (name.includes('bagman') || name.includes('bag man') || map.startsWith('kpbm') || gamename.includes('bag')) {
		return 'Bagman';
	}
	if (teamplay) {
		return 'Team';
	}
	if (deathmatch || name.includes(' dm') || name.endsWith(' dm') || /\bdm\b/.test(name)) {
		return 'DM';
	}
	return 'Other';
}

async function fetchMasterList() {
	const payload = Buffer.concat([
		Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]),
		Buffer.from('query\n'),
	]);
	const buf = await sendUdp(MASTER_HOST, MASTER_PORT, payload, LIST_TIMEOUT_MS);
	return parseQuakeServerList(buf);
}

async function fetchServerStatus(server) {
	const payload = Buffer.concat([
		Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]),
		Buffer.from('status\n'),
	]);
	const started = Date.now();
	try {
		const buf = await sendUdp(server.ip, server.port, payload, STATUS_TIMEOUT_MS);
		const ping = Math.max(1, Date.now() - started);
		const text = buf.toString('latin1');
		const { info, players } = parseInfoString(text);
		const hostname = info.hostname || info.sv_hostname || info.name || '';
		const mapname = info.mapname || info.map || '';
		const gametype = classifyServer(info, hostname);
		return {
			...server,
			ok: true,
			hostname: hostname || server.address,
			map: mapname,
			gametype,
			players,
			maxclients: Number(info.maxclients || info.sv_maxclients || 0) || null,
			ping,
			deathmatch: info.deathmatch === '1',
			teamplay: info.teamplay === '1',
			version: info.version || '',
			gamename: info.gamename || '',
			raw: info,
		};
	}
	catch {
		return {
			...server,
			ok: false,
			hostname: server.address,
			map: '',
			gametype: 'Unknown',
			players: null,
			maxclients: null,
			ping: null,
			deathmatch: false,
			teamplay: false,
			version: '',
			gamename: '',
			raw: {},
		};
	}
}

async function buildSnapshot() {
	const listed = await fetchMasterList();
	const detailed = await Promise.all(listed.map((s) => fetchServerStatus(s)));
	detailed.sort((a, b) => {
		const pa = a.players == null ? -1 : a.players;
		const pb = b.players == null ? -1 : b.players;
		if (pb !== pa) {
			return pb - pa;
		}
		return String(a.hostname).localeCompare(String(b.hostname));
	});
	const playersOnline = detailed.reduce((sum, s) => sum + (s.players > 0 ? s.players : 0), 0);
	return {
		updatedAt: new Date().toISOString(),
		masterHost: PUBLIC_MASTER_HOST,
		master: `${MASTER_HOST}:${MASTER_PORT}`,
		count: detailed.length,
		playersOnline,
		servers: detailed,
	};
}

function contentType(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === '.html') {
		return 'text/html; charset=utf-8';
	}
	if (ext === '.css') {
		return 'text/css; charset=utf-8';
	}
	if (ext === '.js') {
		return 'application/javascript; charset=utf-8';
	}
	if (ext === '.svg') {
		return 'image/svg+xml';
	}
	return 'application/octet-stream';
}

function serveStatic(req, res, urlPath) {
	let rel = urlPath === '/' ? '/index.html' : urlPath;
	rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
	const filePath = path.join(PUBLIC_DIR, rel);
	if (!filePath.startsWith(PUBLIC_DIR)) {
		res.writeHead(403);
		res.end('Forbidden');
		return;
	}
	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(404);
			res.end('Not found');
			return;
		}
		res.writeHead(200, { 'Content-Type': contentType(filePath) });
		res.end(data);
	});
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

	if (req.method === 'GET' && url.pathname === '/api/servers') {
		try {
			const snapshot = await buildSnapshot();
			res.writeHead(200, {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store',
			});
			res.end(JSON.stringify(snapshot));
		}
		catch (err) {
			res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({
				error: 'Failed to query master',
				detail: String(err && err.message ? err.message : err),
			}));
		}
		return;
	}

	if (req.method === 'GET') {
		serveStatic(req, res, url.pathname);
		return;
	}

	res.writeHead(405);
	res.end('Method not allowed');
});

server.listen(PORT, '0.0.0.0', () => {
	console.log(`[web] listening on :${PORT} (master ${MASTER_HOST}:${MASTER_PORT})`);
});
