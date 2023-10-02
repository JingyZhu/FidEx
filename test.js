window.addEventListener("message", function (a) {
    var c = a.ports[0];
    a = a.data;
    var b = a.callbackName.split("."), d = window;
    "window" === b[0] && b.shift();
    for (var g = 0; g < b.length - 1; g++)
        d[b[g]] = {}, d = d[b[g]]; 
    d[b[b.length - 1]] = function (n) { 
        c.postMessage(JSON.stringify(n)) 
    };
    b = document.createElement("script");
    a = m(a.url); b.src = a instanceof k && a.constructor === k ? a.g : "type_error:TrustedResourceUrl";
    document.body.appendChild(b)
}, !0);
