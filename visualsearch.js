import { pipeline } from 'https://cdm.jsdelivr.net/npm/@huggingface/transformers@3.0.0';

let clipmodel = null;

export async function getclipmodel(progresscallback) {
    if (clipmodel !== null) return clipmodel;

    clipmodel = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
        progress_callback: progresscallback
    });

    return clipmodel;
}


export function grabFrames(videoEl, canvas, ctx, step) {
    return new Promise((resolve) => {
        const framelist = [];
        videoEl.muted = true;

        const capture = (time) => {
            try {
                ctx.drawImage(videoEl, 0, 0, 224, 224);
                frameList.push({ time, img: canvas.toDataURL('image/jpeg', 0.8) });
            } catch (err) {
                console.warn('Skipping a frame, canvas got tainted:', err);
            }
        };

        capture(0);

        if (step >= videoEl.duration) {
            resolve(framelist);
            return;
        }

        let time = step;

        videoEl.onseeked = () => {
            capture(time);
            time += step;

            if (time < videoEl.duration) {
                videoEl.currentTime = time;
            } else {
                resolve(framelist)
            }
        };

        videoEl.currentTime = time;
    });
}


export async function searchFrames(framelist, query, onProgress) {
    const scored = [];

    for (let i = 0; i < framelist.length; i++) {
        const frame = framelist[i];
        const output = await clipmodel(frame.img, [query, 'something else']);
        const match = output.find((o) => o.label === query);


        scored.push({ time: frame.time, img: frame.img, score: match ? match.score : 0 });

        if (onProgress && i % 5 === 0) {
            onProgress(Math.round((i / framelist.length) * 100));
        }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
}