'use strict';

const REFRESH_MS = 30000;

const rowsEl = document.getElementById('rows');
const summaryEl = document.getElementById('summary');
const sectionLabelEl = document.getElementById('sectionLabel');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refresh');

let snapshot = null;

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function render() {
	if (!snapshot) {
		return;
	}

	const list = snapshot.servers;
	const host = snapshot.masterHost || 'master.shavargo.com';
	const ago = Math.max(0, Math.round((Date.now() - new Date(snapshot.updatedAt).getTime()) / 1000));

	summaryEl.innerHTML = [
		`<strong>${snapshot.count}</strong> Kingpin servers on this mirror`,
		` (<strong>${escapeHtml(host)}</strong>)`,
		` · <strong>${snapshot.playersOnline || 0}</strong> players online`,
		` · <strong>${ago}</strong> secs ago`,
	].join('');

	sectionLabelEl.textContent = `Kingpin (${snapshot.count}):`;

	if (list.length === 0) {
		rowsEl.innerHTML = '<tr><td colspan="5" class="empty">No servers registered on this mirror yet.</td></tr>';
		return;
	}

	rowsEl.innerHTML = list.map((server) => {
		const players = server.players == null
			? '—'
			: `${server.players}${server.maxclients ? ` <span class="max">/ ${server.maxclients}</span>` : ''}`;
		const ping = server.ping == null ? '—' : String(server.ping);
		const nameClass = server.ok ? 'name' : 'name offline';
		return `
			<tr>
				<td class="${nameClass}">${escapeHtml(server.hostname)}</td>
				<td class="map">${escapeHtml(server.map || '—')}</td>
				<td class="players">${players}</td>
				<td class="ping">${ping}</td>
				<td class="addr">${escapeHtml(server.address)}</td>
			</tr>
		`;
	}).join('');
}

async function load() {
	try {
		const res = await fetch('/api/servers', { cache: 'no-store' });
		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.detail || data.error || res.statusText);
		}
		snapshot = data;
		statusEl.hidden = true;
		statusEl.textContent = '';
		render();
	}
	catch (err) {
		statusEl.hidden = false;
		statusEl.textContent = `Could not load servers: ${err.message || err}`;
	}
}

refreshBtn.addEventListener('click', () => {
	load();
});

setInterval(() => {
	if (snapshot) {
		render();
	}
}, 1000);

load();
setInterval(load, REFRESH_MS);
