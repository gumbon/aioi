(function () {
    var body = document.querySelector('.article-body');
    if (!body) return;
    var headings = body.querySelectorAll('h2, h3');
    if (headings.length < 3) return;
    var items = '';
    headings.forEach(function (h) {
        var id = h.textContent.trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60);
        h.id = id;
        var cls = h.tagName === 'H2' ? 'toc-h2' : 'toc-h3';
        items += '<li class="' + cls + '"><a href="#' + id + '">' + h.textContent.trim() + '</a></li>';
    });
    var toc = '<nav class="toc-box toc-collapsed" aria-label="Table of Contents">'
        + '<button class="toc-heading" aria-expanded="false" onclick="var n=this.parentElement;var open=n.classList.toggle(\'toc-collapsed\');this.setAttribute(\'aria-expanded\',!open)">'
        + '<i class="bi bi-list-ul"></i> Table of Contents'
        + '<i class="bi bi-chevron-down toc-chevron"></i>'
        + '</button>'
        + '<ul class="toc-list">' + items + '</ul></nav>';
    headings[0].insertAdjacentHTML('beforebegin', toc);
})();
