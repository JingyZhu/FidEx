// Test file for JSParse.js. For each pos in liveweb js, locate the corresponding pos in archive js.
const jsparse = require('./js-parse');
const fs = require('fs');

function generateTestCases() {
    // List all js files in examples/
    const files = fs.readdirSync('examples');
    const jsFiles = files.filter(f => f.endsWith('_url.js'));
    // Choose a random file
    const fileName = jsFiles[Math.floor(Math.random() * jsFiles.length)].slice(0, -7);
    // Choose a random pos
    const file = fs.readFileSync(`examples/${fileName}_url.js`, 'utf8');
    let numLines = file.split('\n').length;
    let cols = [];
    for (let i = 0; i < numLines; i++) {
        cols.push(file.split('\n')[i].length);
    }
    const row = Math.floor(Math.random() * numLines);
    const col = Math.floor(Math.random() * cols[row]);
    const rowCol = [row, col];
    return {
        fileName: fileName,
        rowCol: rowCol
    }
}

function compare(fileName, rowCol) {
    file = fs.readFileSync(`examples/${fileName}_url.js`, 'utf8');
    const pos = jsparse.rowCol2Pos(file, rowCol);
    let JSP = new jsparse.JSTextParser(file);
    let astLive = JSP.getASTNode();
    const paths = astLive.findPath(pos);
    const live_pos = paths[paths.length-1].node;
    const live_text = JSP.text.slice(live_pos.pos, live_pos.end);

    file = fs.readFileSync(`examples/${fileName}_archive.js`, 'utf8');
    JSP = new jsparse.JSTextParser(file);
    astArchive = JSP.getASTNode();
    astArchive = astArchive.filterWayback();
    const wb_pos = astArchive.findPos(paths);
    const wb_text = JSP.text.slice(wb_pos.pos, wb_pos.end);
    return [live_text, wb_text];
}

const testcase = generateTestCases();
console.log(testcase);
const result = compare(testcase.fileName, testcase.rowCol);
console.log(result[0] == result[1]);