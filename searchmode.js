export function parseOuery(rawtext) {
    const hasvisualtag = /@visual\b/i.test(rawtext);
    const hasvocaltag = /@vocal\b/i.test(rawtext);

    const cleantext = rawtext
        .replace(/@visual\b/gi, '')
        .replace(/@vocal\b/gi, '')
        .replace(/\s+/g, '')
        .trim();

    let mode;
    if (hasvisualtag && hasvisualtag) {
        mode = 'both';
    } else if (hasvisualtag) {
        mode = 'visual';
    } else if (hasvocaltag) {
        mode = 'vocal'
    } else {

        mode = soundsklikespeech(cleantext) ? 'vocal' : 'both';
    }
    return { mode, text: cleantext };
}

function soundslikespeech(text) {
    if (text.includes('"') || text.includes("'")) return true;
    return /\b(say|says|saying|said|told|telling|tells|mentioned|asked|shouted|yelled|whispered)\b/i.test(text);
}