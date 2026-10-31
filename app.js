import { getclipmodel, grabFrames, searchFrames } from './visualsearch.js';
import { getspeechmodel, transcribevideo, searchtranscript } from './audiosearch.js';
import { parseQuery } from './searchmode.js';

const fileinput = document.getElementById('fileinput');
const samplebutton = document.getElementById('samplebutton');
const player = document.getElementById('player');
const uploadlabel = document.getElementById('uploadlabel');
const searchbox = document.getElementById('searchbox');
const searchbutton = document.getElementById('searchbutton');
const status = document.getElementById('status');
const results = document.getElementById('results');
const resultcount = document.getElementById('resultcount');
const downloadbox = document.getElementById('downloadbox');
const downloadtext = document.getElementById('downloadtext');
const downloadbar = document.getElementById('downloadbar');
const mobilewarning = document.getElementById('mobilewarning');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let frames = [];
let currentsrc = null;
let videoready = false;

let visionmodelloaded = false;
let audiomodelloaded = false;

if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768) {
    mobilewarning.classList.remove('hidden');
}

function tryenablesearch() {
    if (visionmodelloaded && audiomodelloaded && videoready) {
        searchbox.disabled = false;
        searchbutton.disabled = false;
    }
}

async function preloadmodels() {
    downloadbox.classList.remove('hidden');
    downloadtext.textContent = 'Downloading AI models (this happens once)...';

    const onprogress = (p) => {
        if (p.status === 'progress') downloadbar.style.width = Math.round(p.progress || 0) + '%';
    };

    await Promise.all([
        getclipmodel(onprogress).then(() => { visionmodelloaded = true; tryenablesearch(); }),
        getspeechmodel(onprogress).then(() => { audiomodelloaded = true; tryenablesearch(); })
    ]);
    downloadbox.classList.add('hidden');
}

preloadmodels();

//file upload

fileinput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadvideo(URL.createObjectURL(file));
});

samplebutton.addEventListener('click', () => loadvideo('sample.mp4'));

async function loadvideo(src) {
    const temp = document.createElement('video');
    temp.src = src;
    temp.muted = true;
    temp.playsInline = true;
    status.textContent = 'Loading video..';

    temp.onerror = () => {
        status.textContent = "Couldn't load that video.";
    };

    temp.onloadeddata = async () => {
        if (temp.duration > 3600) {
            alert('That video is over an hour long, try something shorter.');
            status.textContent = '';
            return;
        }

        currentsrc = src;
        player.src = src;
        player.classList.remove('hidden');
        uploadlabel.classList.add('hidden');
        samplebutton.classList.add('hidden');

        const step = temp.duration > 1800 ? 10 : (temp.duration > 600 ? 5 : 2);

        status.textContent = 'Reading frames...';
        frames = await grabFrames(temp, canvas, ctx, step);

        videoready = true;
        status.textContent = `Grabbed ${frames.length} frames. Type something to search!`;
        tryenablesearch();
    };
}

searchbutton.addEventListener('click', runSearch);
searchbox.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') runSearch();
});

async function runSearch() {
    if (!videoready) return;

    const { mode, text: query } = parseQuery(searchbox.value.trim());
    if (!query) return;

    searchbutton.disabled = true;
    searchbox.disabled = true;
    results.innerHTML = '';

    const Visual = mode === 'visual' || mode === 'both';
    const Vocal = mode === 'vocal' || mode === 'both';
    const runningboth = Visual && Vocal;

    status.textContent = runningboth
        ? `Looking for "${query}" - checking frames and audio at the same time...`
        : `Looking for "${query}"..`;

    let visualresults = [];
    let audioresults = [];
    const jobs = [];

    //running parallel

    if (Visual) {
        jobs.push(
            searchFrames(frames, query, (pct) => {
                status.textContent = runningboth
                    ? `Scanning frames (${pct}%), listening...`
                    : `scanning frames... ${pct}%`;
            }).then((r) => { visualresults = r; })
        );
    }

    if (Vocal) {
        jobs.push(getvocalmatches(query).then((r) => { audioresults = r; }));
    }

    await Promise.all(jobs);

    const combined = coordinate(visualresults, audioresults);
    showresults(combined);

    searchbutton.disabled = false;
    searchbox.disabled = false;
    status.textContent = `Done. ${combined.length} match${combined.length === 1 ? '' : 'es'} for "${query}"`;
}

async function getvocalmatches(query) {
    if (!currentsrc) return [];

    try {
        const chunks = await transcribevideo(currentsrc, null, (msg) => { status.textContent = msg; });
        return searchtranscript(chunks, query);
    } catch (err) {
        console.error(err);
        return [];
    }
}

const Agreement_window = 3;

function coordinate(visualresults, audioresults) {
    const claimed = new Set();
    const merged = [];

    visualresults.forEach((v) => {
        let closestIdx = -1;
        let closestGap = Agreement_window;

        audioresults.forEach((a, i) => {
            if (claimed.has(i)) return;
            const gap = Math.abs(a.time - v.time);
            if (gap <= closestGap) {
                closestGap = gap;
                closestIdx = i;
            }
        });

        if (closestIdx === -1) {
            merged.push({ kind: 'eye', time: v.time, img: v.img, score: v.score });
        } else {
            claimed.add(closestIdx);
            const a = audioresults[closestIdx];
            merged.push({
                kind: 'both',
                time: v.time,
                img: v.img,
                text: a.text,
                score: Math.min(1, (v.score + a.score) / 2 + 0.15)
            });
        }
    });

    audioresults.forEach((a, i) => {
        if (!claimed.has(i)) merged.push({ kind: 'ear', time: a.time, text: a.text, score: a.score });
    });

    return merged.sort((a, b) => b.score - a.score);
}

function formatTime(t) {
    const min = Math.floor(t / 60);
    const sec = Math.floor(t % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
}

function showresults(list) {
    results.innerHTML = '';
    resultcount.textContent = `${list.length} match${list.length === 1 ? '' : 'es'}`;

    if (list.length === 0) {
        results.innerHTML = '<p class="small">No matches found. try describing it differently.</p>';
        return;
    }

    list.forEach((item) => {
        const pct = Math.round(item.score * 100);
        const timelabel = formatTime(item.time);

        const btn = document.createElement('button');
        btn.className = 'result';
        btn.type = 'button';
        btn.onclick = () => {
            player.currentTime = item.time;
            player.play();
        };

        const thumb = item.img
            ? `<img src="${item.img}" alt="frame at ${timelabel}" />`
            : `<div class="noimg">no img</div>`;

        const tagclass = item.kind === 'both' ? 'tag-both' : item.kind === 'eye' ? 'tag-eye' : 'tag-ear';
        const taglabel = item.kind === 'both' ? 'BOTH' : item.kind === 'eye' ? 'EYE' : 'EAR';
        const line = item.text ? `<div class="line">"${item.text}"</div>` : '';

        btn.innerHTML = `
            ${thumb}
            <div class="body">
                <div class="row">
                    <span><span class="${tagclass}">${taglabel}</span> ${timelabel}</span>
                    <span class="pct">${pct}% match</span>
                </div>
                ${line}
                <div class="meter"><span style="width:${pct}%"></span></div>
            </div>
        `;

        results.appendChild(btn);
    });
}