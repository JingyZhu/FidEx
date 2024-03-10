const exceptionHandle = require('./exception-handle');
const reverter = require('./reverter');
const fs = require('fs');

async function testPageRecorderFidelityCheck() {
    const pageRecorder = new exceptionHandle.PageRecorder(null, null);
    const check = await pageRecorder.fidelityCheck('writes/test', 'initial', 'exception_2');
    console.log("Check", check);
}

// ! Examples for testing
const examples = {
    potential_fidelity_syntax_error: "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118022223/https://ircalc.usps.com/",
    fidelity_uncaught_exception: "https://web.archive.org/web/20080915214854/sali.house.gov/",
    fidelity_uncaught_exception: "http://localhost:8080/exec_match/20240129135149/https://eta.lbl.gov/",
    potential_fidelity_syntax_error: "http://pistons.eecs.umich.edu:8080/eot_crawled_200/20161118025017/http:/suicideprevention.nv.gov/"
}

function testReverterVar() {
    const code = fs.readFileSync('test/overrided.js', 'utf-8');
    let loc = {line: 103, column: 2336};
    let variables = [
        {name: 'C', type: 'document'},
        {name: 'window', type: 'window'}
    ]
    const revert = new reverter.Reverter(code);
    newCode = revert.revertVariable(loc, variables, 1)
    console.log(newCode);
}

// testPageRecorderFidelityCheck()
testReverterVar()