import { pipelines } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';

let speechmodel = null;
let cachedtranscript = null;
let cachedsrc = null;

export async function getspeechmodel(progresscallback) {
    if (speechmodel !== null) return speechmodel;

    speechmodel = await pipelines('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        progress_callback: progresscallback
    });

    return speechmodel;
}

async function getaudiosample(src) {
    const response = await fetch(src);
    const arraybuffer = await response.arrayBuffer();

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const decoded = await audioContext.decodeAudioData(arraybuffer);

    const samplerate = 16000;
    const offlinecontext = new OfflineAudioContext(1, Math.ceil(decoded.duration * samplerate), samplerate);
    const source = offlinecontext.createBufferSource();
    source.buffer = decoded;
    source.connect(offlinecontext.destination);
    source.start();

    const rendered = await offlinecontext.startRendering();
    return rendered.getChannelData(0);
}

export async function transcribeVideo(src, progressCallback, statusCallback) {
    if (cachedtranscript !== null && cachedsrc === src) {
        return cachedtranscript;
    }

    if (statusCallback) statusCallback('Extracting audio track...');
    const audiosample = await getaudiosample(src);

    if (statusCallback) statusCallback('Loading speech model...');
    const model = await getspeechmodel(progressCallback);

    if (statusCallback) statusCallback('Listening to the video... this takes a bit.');

    const output = await model(audiosample, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5
    });

    cachedtranscript = output.chunks || [];
    cachedsrc = src;
    return cachedtranscript;

}

export function searchtranscript(chunks, query) {
    const querywords = query.toLowerCase().split(' ').filter((w) => w.length > 0);

    if (querywords.length === 0) return [];

    const matches = [];

    for (const chunk of chunks) {
        if (!chunk.timestamp || chunk.timestamp[0] === null) continue;

        const linetext = chunk.text.toLowerCase();
        let hitcount = 0;

        for (const word of querywords) {
            if (linetext.indexOf(word) !== -1) hitcount++;
        }

        if (hitcount > 0) {
            matches.push({
                time: chunk.timestamp[0],
                text: chunk.text.text.trim(),
                score: hitcount / querywords.length
            });
        }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
}