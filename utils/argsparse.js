const { program } = require('commander');

function recordReplayArgs() {
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('--download <downloadPath>', 'Directory to save downloads. If not specified, will be saved under chrome_data dir')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-a --archive <Archive>', 'Archive list to record the page', 'test')
        .option('--manual', "Manual control for finishing loading the page")
        .option('-m --mutation', "Mutation wombat.js to return original results. Only used for replay on archive")
        .option('-i --interaction [numIntact]', "Interact with the page, if numIntact is specified, only interact with the first numIntact interactions")
        .option('-w --write', "Collect writes to the DOM")
        .option('-s --screenshot', "Collect screenshot")
        .option('-t --rendertree', "Collect render tree")
        .option('--remove', "Remove recordings after finishing loading the page")
        .option('--scroll', "Scroll to the bottom.")
        .option('-c --chrome_data <chrome_data>', "Directory of Chrome data")
        .option('--headless', "If run in headless mode")
        .option('-p --proxy <proxy>', "Proxy server to use. Note that is chrome is installed with extensions that controls proxy, this could not work.")
        .option('-e --exetrace', "Enable execution trace for both js run and network fetches")
        .option('--minimal', "Minimal mode for record and replay")
        .option('-o --override', "Override resources (used for proxy error injection currently)")
    return program
}

module.exports = {
    recordReplayArgs
}
