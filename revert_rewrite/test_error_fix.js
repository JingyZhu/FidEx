const errorFix = require('./error-fix');
const reverter = require('./reverter');
const fs = require('fs');

async function testPageRecorderFidelityCheck() {
    const pageRecorder = new errorFix.PageRecorder(null, null);
    const check = await pageRecorder.fidelityCheck('writes/test', 'initial', 'exception_2');
    console.log("Check", check);
}

// ! Examples for testing
const examples = {
    potential_fidelity_syntax_error: "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118022223/https://ircalc.usps.com/",
    fidelity_uncaught_exception: "https://web.archive.org/web/20080915214854/sali.house.gov/",
    fidelity_uncaught_exception: "http://pistons.eecs.umich.edu:8080/eot-1k/20240129135149/https://eta.lbl.gov/",
    potential_fidelity_syntax_error: "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118025017/http:/suicideprevention.nv.gov/"
}

function testReverterVar() {
    const code = fs.readFileSync('test/override.html', 'utf-8');
    let loc = {line: 255, column: 1};
    let variables = [
        {name: 'C', type: 'document'},
        {name: 'window', type: 'window'}
    ]
    const revert = new reverter.Reverter(code);
    newCode = revert.revertVariable(loc, variables, 1)
    console.log(newCode);
}

function testReverterAddId() {
    let revert = new reverterReverter("");
    let url = 'http://web.archive.org/web/20080915214854if_/sali.house.gov/';
    console.log(revert._addId(url));
    url = 'http://localhost:8080/test/20080915214854/https://google.com/';
    console.log(revert._addId(url));
    url = 'https://pistons.eecs.umich.edu/test/20080915214854js_/https://google.com';
    console.log(revert._addId(url));
}

function testReverterAddHostname() {
    let revert = new reverter.Reverter("");
    let url = 'http://web.archive.org/web/20080915214854if_///_layout/test.css';
    console.log(revert._addHostname(url, 'example.com'));
    url = 'http://localhost:8080/test/20080915214854/http:/google.com/';
    console.log(revert._addHostname(url, 'example.com'));
    url = 'https://pistons.eecs.umich.edu/test/20080915214854js_//google.com';
    console.log(revert._addHostname(url, 'example.com'));
    url = 'http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118094106js_/http:///_layouts/1033/init.js?rev=BJDmyeIV5jS04CPkRq4Ldg%3D%3D';
    console.log(revert._addHostname(url, 'bve.ky.gov'));
}

function testReverterTryCatch() {
    let code = `
(async () => {
    let a = 1;
    let b = a.call();
})()
`
    let revert = new reverter.Reverter(code);
    console.log(revert.revertWithTryCatch({line: 4, column: 9}));

    code = `
function test() {
    if (object.length > 0) 
        throw Error('Test')
    let a = 0;
}`
    revert = new reverter.Reverter(code);
    console.log(revert.revertWithTryCatch({line: 4, column: 9}));

    code = `
function test() {
    let a = 0;
    return a, b=a, b;
}`
    revert = new reverter.Reverter(code);
    console.log(revert.revertWithTryCatch({line: 4, column: 15}));
}

testReverterTryCatch();