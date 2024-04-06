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

function testReverterLines() {
    let code = `
input_uri = input_uri.replace(/\\//g,"\\\\\\/");
output_uri = output_uri.replace(/\\//g,"\\\\\\/");  
content = WB_wombat_runEval2((_______eval_arg, isGlobal) => { var ge = eval; return isGlobal ? ge(_______eval_arg) : eval(_______eval_arg); }).eval(this, (function() { return arguments })(),"content.replace(/"+input_uri+"/,'"+output_uri+"')");
`
    let revert = new reverter.Reverter(code);
    console.log(revert.revertLines({line: 4, column: 96}, 'ReferenceError: content is not defined'));

    code = `
val = Page_Validators[i];
if (typeof(val.evaluationfunction) == "string") {
    WB_wombat_runEval2((_______eval_arg, isGlobal) => { var ge = eval; return isGlobal ? ge(_______eval_arg) : eval(_______eval_arg); }).eval(this, (function() { return arguments })(),"val.evaluationfunction = " + val.evaluationfunction + ";");
}
WB_wombat_runEval2((_______eval_arg, isGlobal) => { var ge = eval; return isGlobal ? ge(_______eval_arg) : eval(_______eval_arg); }).eval(this, (function() { return arguments })(),"val.evaluationfunction = " + val.evaluationfunction + ";");
    `
    revert = new reverter.Reverter(code);
    console.log(revert.revertLines({line: 4, column: 91}, 'ReferenceError: val is not defined'));

    code = `
if ( element ) {
    element = element.jquery || element.nodeType ?
        $( element ) :
        ;_____WB$wombat$check$this$function_____(this).document.find( element ).eq( 0 );
}
`
    revert = new reverter.Reverter(code, {parse: false});
    console.log(revert.revertLines({line: 5, column: 9}, 'SyntaxError: Unexpected token ;'));
}

function testAbilitytoParse() {
    const code = fs.readFileSync('test/js_revert/failToParse.js', 'utf-8');
    const revert = new reverter.Reverter(code);
}

function testAbilityToFindStatements() {
    let code = fs.readFileSync('test/js_revert/failToFindStatements.js', 'utf-8');
    let revert = new reverter.Reverter(code);
    let startLoc = {line: 205, column: 19};
    let startIdx = revert._loc2idx(startLoc);
    revert._findStatements(startIdx);
    console.log("Pass previous failToFindState 1")

    code = fs.readFileSync('test/js_revert/failToFindStatements2.js', 'utf-8');
    revert = new reverter.Reverter(code);
    startLoc = {line: 174, column: 7164};
    startIdx = revert._loc2idx(startLoc);
    revert._findStatements(startIdx);
    console.log("Pass previous failToFindState 2")
}

function testRevertWombatWrapScriptTextJsProxy() {
    let revert = new reverter.Reverter("");
    let updates = revert.revertWombatWrapScriptTextJsProxy();
    // * Should console log something instead of the empty object.
    console.log(updates);
}
// testReverterTryCatch();
// testReverterLines();
// testAbilitytoParse();
// testAbilityToFindStatements()
testRevertWombatWrapScriptTextJsProxy()