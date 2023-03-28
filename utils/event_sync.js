const fs = require('fs')
const readline = require('readline')

function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
}

async function waitForReady() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve, reject) => {
        rl.question("ready? ", (answer) => {
          resolve(answer);
        });
    });
}

async function waitFile (filename) {
    return new Promise(async (resolve, reject) => {
        if (!fs.existsSync(filename)) {
            await delay(500);    
            await waitFile(filename);
            resolve();
        }else{
          resolve();
        }

    })   
}

module.exports = {
    waitFile,
    waitForReady
}