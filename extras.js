const searchbox = document.getElementById('searchbox');
const searchbutton = document.getElementById('searchbutton');
const quicktry = document.getElementById('quicktrybutton');

document.addEventListener('keydown', (e) => {
    if (e.key !== '/') return;

    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    e.preventDefault();
    searchbox.focus();
});

if (quicktry) {
    const chips = quicktry.querySelectorAll('.quicktry');

    chips.forEach((chip) => {
        chip.addEventListener('click', () => {
            if (searchbutton.disabled) return;
            searchbox.value = chip.textContent;
            searchbutton.click();
        });
    });

    const observer = new MutationObserver(() => {
        if (!searchbox.disabled) {
            quicktry.classList.remove('hidden');
        }
    });

    observer.observe(searchbox, { attributes: true, attributeFilter: ['disabled'] });
}