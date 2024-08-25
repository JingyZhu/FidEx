const { program } = require('commander');

function recordReplayArgs() {
    program
        .option('-d --dir <directory>', 'Directory to save page info', 'pageinfo/test')
        .option('--download <downloadPath>', 'Directory to save downloads', 'downloads')
        .option('-f --file <filename>', 'Filename prefix', 'dimension')
        .option('-a --archive <Archive>', 'Archive list to record the page', 'test')
        .option('-m, --manual', "Manual control for finishing loading the page")
        .option('-i, --interaction', "Interact with the page")
        .option('-w, --write', "Collect writes to the DOM")
        .option('-s, --screenshot', "Collect screenshot and other measurements")
        .option('--remove', "Remove recordings after finishing loading the page")
        .option('--scroll', "Scroll to the bottom.")
        .option('-c, --chrome_data <chrome_data>', "Directory of Chrome data")
        .option('--headless', "If run in headless mode")
        .option('-p --proxy <proxy>', "Proxy server to use. Note that is chrome is installed with extensions that controls proxy, this could not work.")
        .option('-e --exetrace', "Enable execution trace for both js run and network fetches")
    return program
}

module.exports = {
    recordReplayArgs
}
